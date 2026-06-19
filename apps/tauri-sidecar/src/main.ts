import { execFile } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  createStore,
  parseAntiRsiConfig,
  type AntiRsiConfig,
} from "@antirsi/core";
import { startApiServer } from "@antirsi/server";
import { AntiRsiEngine } from "./lib/antirsi-engine";

const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 56321;
const CONFIG_FILENAME = "antirsi-config.json";
const WATCHED_PROCESSES = ["zoom.us"];
const PROCESS_POLL_INTERVAL_MS = 2500;

type Options = {
  port: number;
  userDataDir: string;
};

const parseOptions = (): Options => {
  const args = process.argv.slice(2);
  let port = Number(process.env["ANTIRSI_API_PORT"] ?? DEFAULT_PORT);
  let userDataDir =
    process.env["ANTIRSI_USER_DATA_DIR"] ??
    join(homedir(), "Library", "Application Support", "Anti RSI");

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--port" && args[index + 1]) {
      port = Number(args[index + 1]);
      index += 1;
    } else if (arg === "--user-data-dir" && args[index + 1]) {
      userDataDir = args[index + 1];
      index += 1;
    }
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid API port: ${port}`);
  }

  return { port, userDataDir };
};

const log = (message: string, detail?: unknown): void => {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.error(`[antirsi-sidecar] ${message}${suffix}`);
};

const getConfigPath = (userDataDir: string): string =>
  join(userDataDir, CONFIG_FILENAME);

const loadConfig = async (
  userDataDir: string,
): Promise<AntiRsiConfig | null> => {
  try {
    const raw = await readFile(getConfigPath(userDataDir), "utf8");
    return parseAntiRsiConfig(JSON.parse(raw));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return null;
      }
    }
    log("Config load failed", error instanceof Error ? error.message : error);
    return null;
  }
};

const saveConfig = async (
  userDataDir: string,
  config: AntiRsiConfig,
): Promise<void> => {
  await mkdir(userDataDir, { recursive: true });
  const configPath = getConfigPath(userDataDir);
  const tempPath = `${configPath}.tmp`;

  try {
    await writeFile(
      tempPath,
      JSON.stringify(parseAntiRsiConfig(config), null, 2),
      "utf8",
    );
    await rename(tempPath, configPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    log("Config save failed", error instanceof Error ? error.message : error);
  }
};

const getMacIdleTimeSeconds = async (): Promise<number> => {
  if (process.platform !== "darwin") {
    return 0;
  }

  try {
    const { stdout } = await execFileAsync("ioreg", ["-c", "IOHIDSystem"]);
    const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(stdout);
    if (!match) {
      return 0;
    }
    return Math.floor(Number(match[1]) / 1_000_000_000);
  } catch {
    return 0;
  }
};

const createCachedIdleProvider = (): (() => number) => {
  let idleSeconds = 0;
  let polling = false;

  const poll = async (): Promise<void> => {
    if (polling) {
      return;
    }
    polling = true;
    try {
      idleSeconds = await getMacIdleTimeSeconds();
    } finally {
      polling = false;
    }
  };

  void poll();
  setInterval(() => void poll(), 1000).unref();

  return () => idleSeconds;
};

const isProcessRunning = async (name: string): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", name]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
};

const pollWatchedProcesses = async (): Promise<string[]> => {
  const running: string[] = [];
  for (const processName of WATCHED_PROCESSES) {
    if (await isProcessRunning(processName)) {
      running.push(processName);
    }
  }
  return running;
};

const sameList = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index]);

async function main(): Promise<void> {
  const options = parseOptions();
  const store = createStore();
  const persistedConfig = await loadConfig(options.userDataDir);
  if (persistedConfig) {
    store.dispatch({ type: "SET_CONFIG", config: persistedConfig });
  }

  const antiRsiEngine = new AntiRsiEngine(store, createCachedIdleProvider());
  const apiServer = await startApiServer({ store, port: options.port });
  let lastProcesses: string[] = [];
  let lastStatusBroadcastAt = 0;

  antiRsiEngine.onConfigChange(({ config }) => {
    apiServer.broadcast({ type: "config-changed", config });
    void saveConfig(options.userDataDir, config);
  });

  antiRsiEngine.onEvent(({ event, snapshot }) => {
    if (event.type === "paused") {
      apiServer.broadcast({ type: "timers-paused", snapshot });
      return;
    }
    if (event.type === "resumed") {
      apiServer.broadcast({ type: "timers-resumed", snapshot });
      return;
    }

    const now = Date.now();
    if (event.type === "status-update") {
      if (now - lastStatusBroadcastAt < 5000) {
        return;
      }
      lastStatusBroadcastAt = now;
    } else if (event.type === "timings-reset") {
      lastStatusBroadcastAt = now;
    }

    apiServer.broadcast({ type: "antirsi", event, snapshot });
  });

  setInterval(() => {
    void pollWatchedProcesses()
      .then((processes) => {
        if (sameList(lastProcesses, processes)) {
          return;
        }
        lastProcesses = processes;
        antiRsiEngine.setProcesses(processes);
        if (processes.length > 0) {
          antiRsiEngine.addInhibitor("process:zoom");
        } else {
          antiRsiEngine.removeInhibitor("process:zoom");
        }
        apiServer.broadcast({ type: "processes-updated", list: processes });
      })
      .catch((error) => {
        log(
          "Process polling failed",
          error instanceof Error ? error.message : error,
        );
      });
  }, PROCESS_POLL_INTERVAL_MS).unref();

  antiRsiEngine.start();
  console.log(`ANTIRSI_API_BASE_URL=${apiServer.url.href}`);
}

void main().catch((error) => {
  log("Fatal error", error instanceof Error ? error.stack : error);
  process.exit(1);
});
