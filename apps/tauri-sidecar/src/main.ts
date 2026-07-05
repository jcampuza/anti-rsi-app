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

const RuntimeLayer = Layer.mergeAll(
  SidecarOptionsLayer,
  ConfigStoreLayer.pipe(Layer.provide(NodeServices.layer)),
  IdleProviderLayer.pipe(Layer.provide(NodeServices.layer)),
  ProcessServiceLayer.pipe(Layer.provide(NodeServices.layer)),
  NodeServices.layer,
);

const startParentProcessWatchdog = (
  parentPid: number | null,
): Effect.Effect<void> => {
  if (parentPid === null) {
    return Effect.void;
  }

  return Effect.gen(function* () {
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
        yield* Effect.logWarning("Parent process exited; stopping sidecar", {
          parentPid,
        });
        yield* Effect.sync(() => process.exit(0));
      }
      yield* Effect.sleep(1_000);
    }
  });
};

const startSidecar = Effect.gen(function* () {
  const options = yield* SidecarOptionsService;
  yield* startParentProcessWatchdog(options.parentPid).pipe(Effect.forkScoped);
  const configStore = yield* ConfigStore;
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(options.userDataDir, { recursive: true });
  const logFilePath = getLogFilePath(options.userDataDir);
  yield* Effect.logInfo("Sidecar logger initialized", { logFilePath });
  const persistedConfig = yield* configStore.load(options.userDataDir);
  const runtimeLayer = makeAntiRsiRuntimeLayer(persistedConfig ?? undefined);
  const runtimeContext = yield* Layer.build(runtimeLayer);
  const runtime = Context.get(runtimeContext, AntiRsiRuntime);
  const apiServer = yield* startApiServerEffect({
    port: options.port,
    logFilePath,
  }).pipe(Effect.provideService(AntiRsiRuntime, runtime));
  yield* Effect.addFinalizer(() => Effect.promise(() => apiServer.close()));

  yield* startSidecarOrchestration({
    userDataDir: options.userDataDir,
  }).pipe(Effect.provideService(AntiRsiRuntime, runtime));
  yield* Effect.logInfo("Sidecar started", {
    apiBaseUrl: apiServer.url.href,
    port: Number(apiServer.url.port),
  });
  console.log(`ANTIRSI_API_BASE_URL=${apiServer.url.href}`);

  return yield* Effect.never;
});

startSidecar.pipe(
  Effect.scoped,
  Effect.provide(RuntimeLayer),
  NodeRuntime.runMain({ disableErrorReporting: false }),
);
