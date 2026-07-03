import { NodeHttpServer } from "@effect/platform-node";
import type { MainEvent } from "@antirsi/contracts";
import type { Store } from "@antirsi/core";
import { Effect, Fiber, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";

import { LOOPBACK_HOST } from "./constants";
import { makeApiApp } from "./create-api-app";

export interface ApiServerDeps {
  store: Store;
  port?: number;
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

export const startApiServerEffect = (deps: ApiServerDeps) =>
  Effect.gen(function* () {
    const { layer, broadcast } = yield* makeApiApp(deps);
    const server = createServer();

    const serverLayer = HttpRouter.serve(layer, {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provide(
        NodeHttpServer.layer(() => server, {
          host: LOOPBACK_HOST,
          port: deps.port ?? 0,
        }),
      ),
    );

    const fiber = yield* Effect.sync(() =>
      Effect.runFork(Layer.launch(serverLayer)),
    );

    yield* waitForServerReady(server).pipe(
      Effect.catch((error) =>
        Fiber.interrupt(fiber).pipe(Effect.flatMap(() => Effect.fail(error))),
      ),
    );

    const address = server.address();
    if (typeof address === "string" || address === null) {
      yield* Fiber.interrupt(fiber);
      return yield* Effect.fail(
        new Error("API server did not bind to a TCP address"),
      );
    }

    return {
      url: new URL(`http://${LOOPBACK_HOST}:${address.port}/`),
      close: () =>
        Effect.runPromise(Fiber.interrupt(fiber)).then(() => undefined),
      broadcast,
    };
  });

export function startApiServer(deps: ApiServerDeps): Promise<ApiServerHandle> {
  return Effect.runPromise(startApiServerEffect(deps));
}
