import { type MainEvent, type SnapshotEventMeta } from "@antirsi/contracts";
import { AntiRsiApi } from "@antirsi/contracts/http-api";
import type { AntiRsiEvent, AntiRsiSnapshot, Action } from "@antirsi/core";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { performance } from "node:perf_hooks";
import {
  AntiRsiRuntime,
  type AntiRsiRuntimeEvent,
} from "../lib/antirsi-runtime";

import { LOOPBACK_ORIGIN_PATTERN } from "./constants";

type SnapshotMainEvent = Extract<
  MainEvent,
  { type: "init" | "antirsi" | "timers-paused" | "timers-resumed" }
>;

interface ApiEventBusService {
  readonly events: () => Effect.Effect<Stream.Stream<MainEvent>>;
}

export class ApiEventBus extends Context.Service<
  ApiEventBus,
  ApiEventBusService
>()("@antirsi/tauri-sidecar/server/ApiEventBus") {}

const makeApiEventBus = Effect.gen(function* () {
  const runtime = yield* AntiRsiRuntime;
  let sequence = 0;

  const nextMeta = (): SnapshotEventMeta => ({
    sequence: ++sequence,
    serverMonotonicMs: performance.now(),
  });

  const withMeta = <T extends SnapshotMainEvent>(event: T): T =>
    ({ ...event, meta: nextMeta() }) as T;

  const toMainEvent = (
    event: AntiRsiEvent,
    snapshot: AntiRsiSnapshot,
  ): MainEvent => {
    if (event.type === "paused") {
      return withMeta({ type: "timers-paused", snapshot });
    }
    if (event.type === "resumed") {
      return withMeta({ type: "timers-resumed", snapshot });
    }
    return withMeta({ type: "antirsi", event, snapshot });
  };

  const toSseEvent = (event: AntiRsiRuntimeEvent): MainEvent | null => {
    switch (event.type) {
      case "config-changed":
        return { type: "config-changed", config: event.config };
      case "processes-changed":
        return { type: "processes-updated", list: event.processes };
      case "engine-event":
        return toMainEvent(event.event, event.snapshot);
    }
  };

  const buildInitEvent = Effect.fn("ApiEventBus.buildInitEvent")(function* () {
    return withMeta({
      type: "init",
      config: yield* runtime.config,
      snapshot: yield* runtime.snapshot,
      processes: yield* runtime.processes,
    });
  });

  const events = Effect.fn("ApiEventBus.events")(function* () {
    const initEvent = yield* buildInitEvent();
    return Stream.make(initEvent).pipe(
      Stream.concat(
        runtime.events.pipe(
          Stream.map(toSseEvent),
          Stream.filter((event): event is MainEvent => event !== null),
        ),
      ),
      Stream.ensuring(Effect.logDebug("SSE client disconnected")),
    );
  });

  return ApiEventBus.of({ events });
});

export const ApiEventBusLayer = Layer.effect(ApiEventBus)(makeApiEventBus);

export const ApiHandlersLayer = HttpApiBuilder.group(
  AntiRsiApi,
  "root",
  (handlers) =>
    Effect.gen(function* () {
      const runtime = yield* AntiRsiRuntime;
      const eventBus = yield* ApiEventBus;
      const command = Effect.fn("ApiHandlers.command")((payload: Action) =>
        Effect.logDebug("Dispatching API command", {
          commandType: payload.type,
        }).pipe(Effect.andThen(runtime.dispatch(payload))),
      );

      return handlers
        .handle("snapshot", () => runtime.snapshot)
        .handle("config", () => runtime.config)
        .handle("processes", () => runtime.processes)
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
