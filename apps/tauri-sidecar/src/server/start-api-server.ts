import { NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer, Logger, References, Scope } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";
import { AntiRsiRuntime } from "../lib/antirsi-runtime";

import { LOOPBACK_HOST } from "./constants";
import { ApiEventBusLayer, makeApiAppLayer } from "./create-api-app";

export interface ApiServerDeps {
  port?: number;
  /**
   * Shared secret required on every request when set (as `Authorization:
   * Bearer <token>` or `?token=<token>`). Unset means dev mode: no auth is
   * enforced.
   */
  apiToken?: string | null;
}

export interface ApiServerHandle {
  readonly url: URL;
}

export const fileLoggerLayer = (logFilePath: string) =>
  Logger.layer(
    [Logger.formatJson.pipe(Logger.toFile(logFilePath, { flag: "a" }))],
    { mergeWithExisting: false },
  ).pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.merge(Layer.succeed(References.MinimumLogLevel)("Info")),
  );

export const startApiServerEffect = (
  deps: ApiServerDeps,
): Effect.Effect<ApiServerHandle, unknown, AntiRsiRuntime | Scope.Scope> =>
  Effect.gen(function* () {
    const server = createServer();
    const antiRsiRuntime = yield* AntiRsiRuntime;

    const serverLayer = HttpRouter.serve(
      makeApiAppLayer(deps.apiToken ?? null),
      {
        disableLogger: true,
        disableListenLog: true,
      },
    ).pipe(
      Layer.provideMerge(ApiEventBusLayer),
      Layer.provide(Layer.succeed(AntiRsiRuntime)(antiRsiRuntime)),
      Layer.provide(
        NodeHttpServer.layer(() => server, {
          host: LOOPBACK_HOST,
          port: deps.port ?? 0,
        }),
      ),
    );

    yield* Layer.build(serverLayer);
    yield* Effect.addFinalizer(() => Effect.logInfo("API server stopping"));

    const address = server.address();
    if (typeof address === "string" || address === null) {
      return yield* Effect.fail(
        new Error("API server did not bind to a TCP address"),
      );
    }

    const url = new URL(`http://${LOOPBACK_HOST}:${address.port}/`);
    yield* Effect.logInfo("API server started", {
      port: address.port,
      url: url.href,
    });

    return { url };
  });
