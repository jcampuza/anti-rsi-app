import { homedir } from "node:os";
import { join } from "node:path";
import { createStore } from "@antirsi/core";
import { Effect } from "effect";
import { AntiRsiEngine } from "./lib/antirsi-engine";
import { loadConfig } from "./lib/config-store";
import { createCachedIdleProvider } from "./lib/idle-provider";
import { configureLogger, log, logInfo } from "./lib/logger";
import { startSidecarOrchestration } from "./lib/orchestration";
import { startApiServerEffect } from "./server";

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

const startSidecar = Effect.gen(function* () {
  const options = parseOptions();
  const logFilePath = configureLogger(options.userDataDir);
  const store = createStore();
  const persistedConfig = yield* Effect.tryPromise({
    try: () => loadConfig(options.userDataDir),
    catch: (error) => error,
  });
  if (persistedConfig) {
    store.dispatch({ type: "SET_CONFIG", config: persistedConfig });
  }

  const antiRsiEngine = new AntiRsiEngine(store, createCachedIdleProvider());
  const apiServer = yield* startApiServerEffect({
    store,
    port: options.port,
    logFilePath,
  });
  startSidecarOrchestration({
    antiRsiEngine,
    apiServer,
    userDataDir: options.userDataDir,
  });

  antiRsiEngine.start();
  logInfo("Sidecar started", {
    apiBaseUrl: apiServer.url.href,
    port: options.port,
  });
  console.log(`ANTIRSI_API_BASE_URL=${apiServer.url.href}`);
});

void Effect.runPromise(startSidecar).catch((error) => {
  log("Fatal error", error instanceof Error ? error.stack : error);
  process.exit(1);
});
