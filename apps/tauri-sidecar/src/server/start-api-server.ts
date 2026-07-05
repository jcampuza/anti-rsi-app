import { NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import { Effect, Exit, Layer, Logger, References, Scope } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";
import { AntiRsiRuntime } from "../lib/antirsi-runtime";

import { LOOPBACK_HOST } from "./constants";
import { ApiAppLayer, ApiEventBusLayer } from "./create-api-app";

export interface ApiServerDeps {
  port?: number;
  logFilePath?: string;
}

export interface ApiServerHandle {
  readonly url: URL;
  readonly close: () => Promise<void>;
}

const fileLoggerLayer = (logFilePath: string) =>
  Logger.layer(
    [Logger.formatJson.pipe(Logger.toFile(logFilePath, { flag: "a" }))],
    { mergeWithExisting: false },
  ).pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.merge(Layer.succeed(References.MinimumLogLevel)("Info")),
  );

const closeScope = (scope: Scope.Closeable): Effect.Effect<void> =>
  Scope.close(scope, Exit.void).pipe(Effect.ignore);

export const startApiServerEffect = (
  deps: ApiServerDeps,
): Effect.Effect<ApiServerHandle, unknown, AntiRsiRuntime> =>
  Effect.gen(function* () {
    const server = createServer();
    const antiRsiRuntime = yield* AntiRsiRuntime;

    const loggerLayer = deps.logFilePath
      ? fileLoggerLayer(deps.logFilePath)
      : Layer.empty;
    const serverLayer = HttpRouter.serve(ApiAppLayer, {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provideMerge(ApiEventBusLayer),
      Layer.provideMerge(loggerLayer),
      Layer.provide(Layer.succeed(AntiRsiRuntime)(antiRsiRuntime)),
      Layer.provide(
        NodeHttpServer.layer(() => server, {
          host: LOOPBACK_HOST,
          port: deps.port ?? 0,
        }),
      ),
    );

    const scope = Scope.makeUnsafe();
    const memoMap = Layer.makeMemoMapUnsafe();
    yield* Layer.buildWithMemoMap(serverLayer, memoMap, scope).pipe(
      Effect.catch((error) =>
        closeScope(scope).pipe(Effect.flatMap(() => Effect.fail(error))),
      ),
    );

    const address = server.address();
    if (typeof address === "string" || address === null) {
      yield* closeScope(scope);
      return yield* Effect.fail(
        new Error("API server did not bind to a TCP address"),
      );
    }

    const url = new URL(`http://${LOOPBACK_HOST}:${address.port}/`);
    const logLifecycle = (
      message: string,
      annotations?: Record<string, unknown>,
    ): Effect.Effect<void, unknown> =>
      deps.logFilePath
        ? Effect.logInfo(message, annotations).pipe(
            Effect.provide(fileLoggerLayer(deps.logFilePath)),
          )
        : Effect.logInfo(message, annotations);

    yield* logLifecycle("API server started", {
      port: address.port,
      url: url.href,
    });

    return {
      url,
      close: () =>
        Effect.runPromise(
          logLifecycle("API server stopping").pipe(
            Effect.andThen(closeScope(scope)),
          ),
        ),
    };
  });
