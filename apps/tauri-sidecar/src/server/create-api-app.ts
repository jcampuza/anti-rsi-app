import { type MainEvent, type SnapshotEventMeta } from "@antirsi/contracts";
import { AntiRsiApi } from "@antirsi/contracts/http-api";
import type { AntiRsiEvent, AntiRsiSnapshot, Action } from "@antirsi/core";
import { timingSafeEqual } from "node:crypto";
import { Context, Effect, Layer, Stream } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
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
  readonly events: () => Stream.Stream<MainEvent>;
}

export class ApiEventBus extends Context.Service<
  ApiEventBus,
  ApiEventBusService
>()("@antirsi/tauri-sidecar/server/ApiEventBus") {}

const makeApiEventBus = Effect.gen(function* () {
  const runtime = yield* AntiRsiRuntime;

  const makeClientStream = Effect.gen(function* () {
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

    const subscription = yield* runtime.subscribeEvents;
    const initEvent = withMeta({
      type: "init",
      config: yield* runtime.config,
      snapshot: yield* runtime.snapshot,
      processes: yield* runtime.processes,
    });

    return Stream.make(initEvent).pipe(
      Stream.concat(
        Stream.fromSubscription(subscription).pipe(
          Stream.map(toSseEvent),
          Stream.filter((event): event is MainEvent => event !== null),
        ),
      ),
      Stream.ensuring(Effect.logDebug("SSE client disconnected")),
    );
  });

  const events = (): Stream.Stream<MainEvent> => Stream.unwrap(makeClientStream);

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
            Effect.as(eventBus.events()),
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
    // `b3` and `traceparent` are W3C / B3 trace-context headers that Effect's
    // HttpClient injects automatically for distributed-trace propagation
    // (TracerPropagationEnabled defaults to true). They must be allow-listed or
    // the browser's CORS preflight rejects every request.
    allowedHeaders: ["Content-Type", "Authorization", "b3", "traceparent"],
  }),
  { global: true },
);

/**
 * Constant-time comparison of two possibly-different-length strings. Avoids
 * leaking token length/prefix information via response timing.
 */
const timingSafeStringEqual = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Still run a comparison of equal-length buffers so the early return
    // above (length mismatch) is the only length-dependent branch, matching
    // the common approach for this kind of check.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
};

const BEARER_PREFIX = "Bearer ";

/**
 * Enforces the `ANTIRSI_API_TOKEN` shared secret (set by the Tauri parent
 * when spawning the sidecar) on every request. The token may be presented as
 * `Authorization: Bearer <token>` or as a `?token=<token>` query parameter —
 * the query form exists because browser `EventSource` cannot set headers, so
 * the SSE endpoint relies on it. When `ANTIRSI_API_TOKEN` is unset (dev
 * mode), no auth is enforced and all requests pass through.
 */
const makeAuthMiddleware = (expectedToken: string | null) =>
  HttpMiddleware.make(<E, R>(
    httpApp: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  ) =>
    Effect.withFiber<HttpServerResponse.HttpServerResponse, E, R>((fiber) => {
      if (expectedToken === null) {
        return httpApp;
      }

      const request = Context.getUnsafe(
        fiber.context,
        HttpServerRequest.HttpServerRequest,
      );

      const authHeader = request.headers["authorization"];
      const headerToken = authHeader?.startsWith(BEARER_PREFIX)
        ? authHeader.slice(BEARER_PREFIX.length)
        : null;

      const url = new URL(request.originalUrl, "http://internal.invalid");
      const queryToken = url.searchParams.get("token");

      const providedToken = headerToken ?? queryToken;
      const isAuthorized =
        providedToken !== null &&
        timingSafeStringEqual(providedToken, expectedToken);

      if (!isAuthorized) {
        return Effect.succeed(
          HttpServerResponse.empty({ status: 401 }),
        ) as Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>;
      }

      return httpApp;
    }),
  );

export const makeApiAuthLayer = (apiToken: string | null) =>
  HttpRouter.middleware(makeAuthMiddleware(apiToken), { global: true });

export const makeApiAppLayer = (apiToken: string | null) =>
  Layer.mergeAll(ApiRoutesLayer, ApiCorsLayer, makeApiAuthLayer(apiToken));
