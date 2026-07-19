import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Context, Effect, FileSystem, Layer } from "effect";
import { AntiRsiRuntime, makeAntiRsiRuntimeLayer } from "./lib/antirsi-runtime";
import { ConfigStore, ConfigStoreLayer } from "./lib/config-store";
import { IdleProviderLayer } from "./lib/idle-provider";
import { getLogFilePath } from "./lib/logger";
import { startSidecarOrchestration } from "./lib/orchestration";
import { ProcessServiceLayer } from "./lib/process-service";
import {
  SidecarOptionsLayer,
  SidecarOptionsService,
} from "./lib/sidecar-options";
import { startApiServerEffect } from "./server";
import { fileLoggerLayer } from "./server/start-api-server";

const BaseLayer = Layer.mergeAll(
  SidecarOptionsLayer.pipe(Layer.provide(NodeServices.layer)),
  ConfigStoreLayer.pipe(Layer.provide(NodeServices.layer)),
  IdleProviderLayer.pipe(Layer.provide(NodeServices.layer)),
  ProcessServiceLayer.pipe(Layer.provide(NodeServices.layer)),
  NodeServices.layer,
);

const SidecarLoggerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const options = yield* SidecarOptionsService;
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(options.userDataDir, { recursive: true });
    return fileLoggerLayer(getLogFilePath(options.userDataDir));
  }),
).pipe(Layer.provide(BaseLayer));

const RuntimeLayer = Layer.mergeAll(BaseLayer, SidecarLoggerLayer);

/**
 * Polls `process.kill(parentPid, 0)` every second to detect the Tauri parent
 * exiting. This is a fallback: on PID reuse (the OS recycles the parent's PID
 * for an unrelated process after it exits) this poll can never observe the
 * exit and would run forever. Used unconditionally when stdin is a TTY
 * (manual `bun run` dev invocations, where there is no parent pipe to watch),
 * and raced alongside stdin-EOF detection otherwise.
 */
const waitForParentPidExit = (parentPid: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    while (true) {
      const parentAlive = yield* Effect.sync(() => {
        try {
          process.kill(parentPid, 0);
          return true;
        } catch {
          return false;
        }
      });
      if (!parentAlive) {
        return yield* Effect.logWarning(
          "Parent process exited; stopping sidecar (PID poll)",
          { parentPid },
        );
      }
      yield* Effect.sleep(1_000);
    }
  });

/**
 * The Tauri parent holds the write end of this process's stdin pipe. When
 * the parent dies, that pipe closes and stdin observes EOF ('end'/'close'),
 * which is immediate and immune to PID reuse — unlike polling
 * `process.kill(parentPid, 0)`, which can false-negative if the OS recycles
 * the parent's PID for an unrelated process.
 */
const waitForStdinEnd: Effect.Effect<void> = Effect.callback<void>((resume) => {
  const onEnd = (): void => {
    resume(
      Effect.logWarning("Parent stdin closed; stopping sidecar (stdin EOF)"),
    );
  };
  process.stdin.once("end", onEnd);
  process.stdin.once("close", onEnd);
  process.stdin.resume();
  return Effect.sync(() => {
    process.stdin.removeListener("end", onEnd);
    process.stdin.removeListener("close", onEnd);
  });
});

const waitForParentExit = (parentPid: number | null): Effect.Effect<void> => {
  if (parentPid === null) {
    return Effect.never;
  }

  // stdin is only a TTY for manual dev runs (e.g. `bun run src/main.ts` from
  // a terminal), where there is no parent process holding the stdin pipe to
  // watch for EOF — fall back to PID polling alone in that case.
  if (process.stdin.isTTY) {
    return waitForParentPidExit(parentPid);
  }

  return Effect.race(waitForStdinEnd, waitForParentPidExit(parentPid));
};

const startSidecar = Effect.gen(function* () {
  const options = yield* SidecarOptionsService;
  const configStore = yield* ConfigStore;
  const logFilePath = getLogFilePath(options.userDataDir);
  yield* Effect.logInfo("Sidecar logger initialized", { logFilePath });
  const persistedConfig = yield* configStore.load(options.userDataDir);
  const runtimeLayer = makeAntiRsiRuntimeLayer(persistedConfig ?? undefined);
  const runtimeContext = yield* Layer.build(runtimeLayer);
  const runtime = Context.get(runtimeContext, AntiRsiRuntime);
  const apiServer = yield* startApiServerEffect({
    port: options.port,
    apiToken: options.apiToken,
  }).pipe(Effect.provideService(AntiRsiRuntime, runtime));

  yield* startSidecarOrchestration({
    userDataDir: options.userDataDir,
  }).pipe(Effect.provideService(AntiRsiRuntime, runtime));
  yield* Effect.logInfo("Sidecar started", {
    apiBaseUrl: apiServer.url.href,
    port: Number(apiServer.url.port),
  });
  console.log(`ANTIRSI_API_BASE_URL=${apiServer.url.href}`);

  return yield* waitForParentExit(options.parentPid);
});

startSidecar.pipe(
  Effect.scoped,
  Effect.provide(RuntimeLayer),
  NodeRuntime.runMain({ disableErrorReporting: false }),
);
