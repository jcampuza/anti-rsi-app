import { type MainEvent, type SnapshotEventMeta } from "@antirsi/contracts";
import { AntiRsiApi } from "@antirsi/contracts/http-api";
import {
  selectConfig,
  selectProcesses,
  selectSnapshot,
  type Store,
} from "@antirsi/core";
import { Effect, Layer, Queue, Stream } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { performance } from "node:perf_hooks";

import { LOOPBACK_ORIGIN_PATTERN } from "./constants";

export interface ApiServerDeps {
  store: Store;
}

type SnapshotMainEvent = Extract<
  MainEvent,
  { type: "init" | "antirsi" | "timers-paused" | "timers-resumed" }
>;

export const makeApiApp = (deps: ApiServerDeps) =>
  Effect.sync(() => {
    let sequence = 0;
    const subscribers = new Set<Queue.Queue<MainEvent>>();

    const nextMeta = (): SnapshotEventMeta => ({
      sequence: ++sequence,
      serverMonotonicMs: performance.now(),
    });

    const withMeta = <T extends SnapshotMainEvent>(event: T): T =>
      ({ ...event, meta: nextMeta() }) as T;

    const buildInitEvent = (): MainEvent =>
      withMeta({
        type: "init",
        config: selectConfig(deps.store.getState()),
        snapshot: selectSnapshot(deps.store.getState()),
        processes: selectProcesses(deps.store.getState()),
      });

    const broadcast = (event: MainEvent): void => {
      const eventWithFreshMeta = "snapshot" in event ? withMeta(event) : event;
      for (const queue of subscribers) {
        Queue.offerUnsafe(queue, eventWithFreshMeta);
      }
    };

    const handlers = HttpApiBuilder.group(AntiRsiApi, "root", (handlers) =>
      handlers
        .handle("snapshot", () =>
          Effect.sync(() => selectSnapshot(deps.store.getState())),
        )
        .handle("config", () =>
          Effect.sync(() => selectConfig(deps.store.getState())),
        )
        .handle("processes", () =>
          Effect.sync(() => selectProcesses(deps.store.getState())),
        )
        .handle("command", ({ payload }) =>
          Effect.sync(() => {
            deps.store.dispatch(payload);
          }),
        )
        .handle("events", () =>
          Effect.gen(function* () {
            const queue = yield* Queue.unbounded<MainEvent>();
            subscribers.add(queue);

            return Stream.make(buildInitEvent()).pipe(
              Stream.concat(Stream.fromQueue(queue)),
              Stream.ensuring(
                Effect.sync(() => {
                  subscribers.delete(queue);
                }),
              ),
            );
          }),
        ),
    );

    const routes = HttpApiBuilder.layer(AntiRsiApi).pipe(
      Layer.provide(handlers),
    );

    const cors = HttpRouter.middleware(
      HttpMiddleware.cors({
        allowedOrigins: (origin) => LOOPBACK_ORIGIN_PATTERN.test(origin),
        allowedMethods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
      }),
      { global: true },
    );

    return { layer: Layer.mergeAll(routes, cors), broadcast };
  });

export const createApiApp = (deps: ApiServerDeps): ApiApp =>
  Effect.runSync(makeApiApp(deps));

export type ApiApp = Effect.Success<ReturnType<typeof makeApiApp>>;
