import { NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import type { MainEvent } from "@antirsi/contracts";
import type { Store } from "@antirsi/core";
import {
  Context,
  Effect,
  Layer,
  Logger,
  ManagedRuntime,
  References,
} from "effect";
import { HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";

import { LOOPBACK_HOST } from "./constants";
import {
  ApiAppLayer,
  ApiEventBus,
  ApiEventBusLayer,
  ApiStore,
} from "./create-api-app";

export interface ApiServerDeps {
  store: Store;
  port?: number;
  logFilePath?: string;
}

export interface ApiServerHandle {
  readonly url: URL;
  readonly close: () => Promise<void>;
  broadcast: (event: MainEvent) => void;
}

const waitForServerReady = (server: ReturnType<typeof createServer>) =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          server.off("error", onError);
          server.off("listening", onListening);
          signal.removeEventListener("abort", onAbort);
        };

        const resolveWhenRequestHandlerMounted = () => {
          if (server.listenerCount("request") > 0) {
            cleanup();
            resolve();
            return;
          }
          setTimeout(resolveWhenRequestHandlerMounted, 0);
        };

        const onAbort = () => {
          cleanup();
          reject(signal.reason);
        };

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        const onListening = () => {
          resolveWhenRequestHandlerMounted();
        };

        signal.addEventListener("abort", onAbort, { once: true });
        server.on("error", onError);

        if (server.listening) {
          resolveWhenRequestHandlerMounted();
          return;
        }

        server.on("listening", onListening);
      }),
    catch: (error) => error,
  });

const fileLoggerLayer = (logFilePath: string) =>
  Logger.layer(
    [Logger.formatJson.pipe(Logger.toFile(logFilePath, { flag: "a" }))],
    { mergeWithExisting: false },
  ).pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.merge(Layer.succeed(References.MinimumLogLevel)("Info")),
  );

export const startApiServerEffect = (deps: ApiServerDeps) =>
  Effect.gen(function* () {
    const server = createServer();

    const apiStoreLayer = Layer.succeed(ApiStore)({ store: deps.store });
    const loggerLayer = deps.logFilePath
      ? fileLoggerLayer(deps.logFilePath)
      : Layer.empty;
    const serverLayer = HttpRouter.serve(ApiAppLayer, {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provideMerge(ApiEventBusLayer),
      Layer.provideMerge(loggerLayer),
      Layer.provide(apiStoreLayer),
      Layer.provide(
        NodeHttpServer.layer(() => server, {
          host: LOOPBACK_HOST,
          port: deps.port ?? 0,
        }),
      ),
    );

    const runtime = ManagedRuntime.make(serverLayer);
    const disposeRuntime = Effect.promise(() => runtime.dispose());
    const context = yield* Effect.catch(runtime.contextEffect, (error) =>
      disposeRuntime.pipe(Effect.flatMap(() => Effect.fail(error))),
    );
    const eventBus = Context.get(context, ApiEventBus);

    yield* waitForServerReady(server).pipe(
      Effect.catch((error) =>
        disposeRuntime.pipe(Effect.flatMap(() => Effect.fail(error))),
      ),
    );

    const address = server.address();
    if (typeof address === "string" || address === null) {
      yield* disposeRuntime;
      return yield* Effect.fail(
        new Error("API server did not bind to a TCP address"),
      );
    }

    const url = new URL(`http://${LOOPBACK_HOST}:${address.port}/`);
    yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.logInfo("API server started", {
          port: address.port,
          url: url.href,
        }),
      ),
    );

    return {
      url,
      close: () =>
        runtime
          .runPromise(Effect.logInfo("API server stopping"))
          .then(() => runtime.dispose())
          .then(() => undefined),
      broadcast: (event: MainEvent) => {
        Effect.runSync(eventBus.broadcast(event));
      },
    };
  });

export function startApiServer(deps: ApiServerDeps): Promise<ApiServerHandle> {
  return Effect.runPromise(startApiServerEffect(deps));
}
