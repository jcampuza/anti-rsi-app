import { type MainEvent, type SnapshotEventMeta } from "@antirsi/contracts";
import { AntiRsiApi } from "@antirsi/contracts/http-api";
import {
  selectConfig,
  selectProcesses,
  selectSnapshot,
  type Action,
  type Store,
} from "@antirsi/core";
import { Context, Effect, Layer, Queue, Stream } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { performance } from "node:perf_hooks";

import { LOOPBACK_ORIGIN_PATTERN } from "./constants";

export interface ApiServerDeps {
  store: Store;
}

export class ApiStore extends Context.Service<ApiStore, ApiServerDeps>()(
  "@antirsi/tauri-sidecar/server/ApiStore",
) {}

type SnapshotMainEvent = Extract<
  MainEvent,
  { type: "init" | "antirsi" | "timers-paused" | "timers-resumed" }
>;

interface ApiEventBusService {
  readonly broadcast: (event: MainEvent) => Effect.Effect<void>;
  readonly events: () => Effect.Effect<Stream.Stream<MainEvent>>;
}

export class ApiEventBus extends Context.Service<
  ApiEventBus,
  ApiEventBusService
>()("@antirsi/tauri-sidecar/server/ApiEventBus") {}

const makeApiEventBus = Effect.gen(function* () {
  const deps = yield* ApiStore;
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

  const broadcast = Effect.fn("ApiEventBus.broadcast")((event: MainEvent) =>
    Effect.sync(() => {
      const eventWithFreshMeta = "snapshot" in event ? withMeta(event) : event;
      for (const queue of subscribers) {
        Queue.offerUnsafe(queue, eventWithFreshMeta);
      }
    }),
  );

  const events = Effect.fn("ApiEventBus.events")(function* () {
    const queue = yield* Queue.unbounded<MainEvent>();
    subscribers.add(queue);

    return Stream.make(buildInitEvent()).pipe(
      Stream.concat(Stream.fromQueue(queue)),
      Stream.ensuring(
        Effect.sync(() => {
          subscribers.delete(queue);
        }).pipe(Effect.andThen(Effect.logDebug("SSE client disconnected"))),
      ),
    );
  });

  return ApiEventBus.of({ broadcast, events });
});

export const ApiEventBusLayer = Layer.effect(ApiEventBus)(makeApiEventBus);

export const ApiHandlersLayer = HttpApiBuilder.group(
  AntiRsiApi,
  "root",
  (handlers) =>
    Effect.gen(function* () {
      const deps = yield* ApiStore;
      const eventBus = yield* ApiEventBus;
      const snapshot = Effect.fn("ApiHandlers.snapshot")(() =>
        Effect.sync(() => selectSnapshot(deps.store.getState())),
      );
      const config = Effect.fn("ApiHandlers.config")(() =>
        Effect.sync(() => selectConfig(deps.store.getState())),
      );
      const processes = Effect.fn("ApiHandlers.processes")(() =>
        Effect.sync(() => selectProcesses(deps.store.getState())),
      );
      const command = Effect.fn("ApiHandlers.command")((payload: Action) =>
        Effect.logDebug("Dispatching API command", {
          commandType: payload.type,
        }).pipe(
          Effect.andThen(
            Effect.sync(() => {
              deps.store.dispatch(payload);
            }),
          ),
        ),
      );

      return handlers
        .handle("snapshot", snapshot)
        .handle("config", config)
        .handle("processes", processes)
        .handle("command", ({ payload }) => command(payload))
        .handle("events", () =>
          Effect.logDebug("SSE client connected").pipe(
            Effect.andThen(eventBus.events()),
          ),
        );
    }),
);

export const ApiRoutesLayer = HttpApiBuilder.layer(AntiRsiApi).pipe(
  Layer.provide(ApiHandlersLayer),
);

export const ApiCorsLayer = HttpRouter.middleware(
  HttpMiddleware.cors({
    allowedOrigins: (origin) => LOOPBACK_ORIGIN_PATTERN.test(origin),
    allowedMethods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
  { global: true },
);

export const ApiAppLayer = Layer.mergeAll(ApiRoutesLayer, ApiCorsLayer);
