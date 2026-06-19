import { homedir } from "node:os";
import { join } from "node:path";
import { createStore } from "@antirsi/core";
import { startApiServer } from "@antirsi/server";
import { AntiRsiEngine } from "./lib/antirsi-engine";
import { loadConfig } from "./lib/config-store";
import { createCachedIdleProvider } from "./lib/idle-provider";
import { log } from "./lib/logger";
import { startSidecarOrchestration } from "./lib/orchestration";

const DEFAULT_PORT = 56321;

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
    const nextArg = args[index + 1];
    if (arg === "--port" && nextArg) {
      port = Number(nextArg);
      index += 1;
    } else if (arg === "--user-data-dir" && nextArg) {
      userDataDir = nextArg;
      index += 1;
    }
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid API port: ${port}`);
  }

  return { port, userDataDir };
};

async function main(): Promise<void> {
  const options = parseOptions();
  const store = createStore();
  const persistedConfig = await loadConfig(options.userDataDir);
  if (persistedConfig) {
    store.dispatch({ type: "SET_CONFIG", config: persistedConfig });
  }

  const antiRsiEngine = new AntiRsiEngine(store, createCachedIdleProvider());
  const apiServer = await startApiServer({ store, port: options.port });
  startSidecarOrchestration({
    antiRsiEngine,
    apiServer,
    userDataDir: options.userDataDir,
  });

  antiRsiEngine.start();
  console.log(`ANTIRSI_API_BASE_URL=${apiServer.url.href}`);
}

void main().catch((error) => {
  log("Fatal error", error instanceof Error ? error.stack : error);
  process.exit(1);
});
