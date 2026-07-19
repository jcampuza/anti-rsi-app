import { API_ROUTES } from "@antirsi/contracts";
import type { MainEvent, SnapshotEventMeta } from "@antirsi/contracts";
import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core";
import { Duration, Effect, Schedule } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { Api } from "~/lib/api";
import { resolveApiAuthToken, resolveApiBaseUrl } from "~/lib/api-base-url";

/** Live client state, mirrored from the sidecar snapshot/config/processes. */
export interface AntiRsiState {
  snapshot: AntiRsiSnapshot | undefined;
  snapshotMeta: SnapshotEventMeta | undefined;
  snapshotReceivedAt: number;
  config: AntiRsiConfig | undefined;
  processes: string[];
}

export const initialAntiRsiState: AntiRsiState = {
  snapshot: undefined,
  snapshotMeta: undefined,
  snapshotReceivedAt: 0,
  config: undefined,
  processes: [],
};

export const isAntiRsiBootstrapReady = (
  state: Pick<AntiRsiState, "snapshot" | "config">,
): boolean => state.snapshot !== undefined && state.config !== undefined;

/**
 * Pure reducer folding a sidecar {@link MainEvent} into the live state.
 *
 * Sequence gating (drop events whose `sequence` is not newer than the current
 * one) preserves the exact dedup/ordering semantics of the former
 * `applyMainEvent`, which reconciled the bootstrap fetch (meta `undefined`)
 * against the SSE stream.
 */
export const reduceMainEvent = (
  state: AntiRsiState,
  payload: MainEvent,
): AntiRsiState => {
  if ("snapshot" in payload) {
    const currentMeta = state.snapshotMeta;
    const nextMeta =
      payload.meta ??
      ({
        sequence: (currentMeta?.sequence ?? 0) + 1,
        serverMonotonicMs: performance.now(),
      } satisfies SnapshotEventMeta);

    if (currentMeta && nextMeta.sequence <= currentMeta.sequence) {
      return state;
    }

    const base: AntiRsiState = {
      ...state,
      snapshot: payload.snapshot,
      snapshotMeta: nextMeta,
      snapshotReceivedAt: performance.now(),
    };

    switch (payload.type) {
      case "init":
        return { ...base, config: payload.config, processes: payload.processes };
      case "antirsi":
      case "timers-paused":
      case "timers-resumed":
        return base;
    }
  }

  switch (payload.type) {
    case "config-changed":
      return { ...state, config: payload.config };
    case "processes-updated":
      return { ...state, processes: payload.list };
    default:
      return state;
  }
};

/** Root writable state atom, driven by {@link sseDriverAtom} and the bootstrap seed. */
export const appStateAtom = Atom.make(initialAntiRsiState);

/**
 * Sequence used to seed {@link appStateAtom} from the one-shot bootstrap
 * fetch, before the SSE stream's own `init` event arrives. Server-assigned
 * sequences restart at 1 per connection, so the seed must sit strictly below
 * any real sequence the server can produce — otherwise a same-numbered `init`
 * would tie and be dropped by the `<=` dedup check in {@link reduceMainEvent}.
 */
export const BOOTSTRAP_SEED_SEQUENCE = 0;

/** Live connection status of the SSE stream, surfaced for a UI indicator. */
export type ConnectionStatus = "connecting" | "open" | "error";

export const connectionStatusAtom = Atom.make<ConnectionStatus>("connecting");

/** True once the first snapshot + config have arrived (from bootstrap or SSE). */
export const bootstrapReadyAtom = Atom.map(appStateAtom, isAntiRsiBootstrapReady);

const requireSnapshot = (state: AntiRsiState): AntiRsiSnapshot => {
  if (state.snapshot === undefined) {
    throw new Error("Invariant: snapshot is undefined after AntiRSI bootstrap");
  }
  return state.snapshot;
};

const requireConfig = (state: AntiRsiState): AntiRsiConfig => {
  if (state.config === undefined) {
    throw new Error("Invariant: config is undefined after AntiRSI bootstrap");
  }
  return state.config;
};

/** Live read atoms — safe to read only under the bootstrap gate (children of a ready scope). */
export const snapshotAtom = Atom.map(appStateAtom, requireSnapshot);
export const configAtom = Atom.map(appStateAtom, requireConfig);
export const processesAtom = Atom.map(appStateAtom, (s) => s.processes);
export const snapshotReceivedAtAtom = Atom.map(
  appStateAtom,
  (s) => s.snapshotReceivedAt,
);

const BOOTSTRAP_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000] as const;

const bootstrapSchedule = Schedule.recurs(BOOTSTRAP_RETRY_DELAYS_MS.length).pipe(
  Schedule.addDelay(({ output: attempt }) =>
    Effect.succeed(
      Duration.millis(
        BOOTSTRAP_RETRY_DELAYS_MS[attempt] ??
          BOOTSTRAP_RETRY_DELAYS_MS.at(-1) ??
          0,
      ),
    ),
  ),
);

/**
 * One-shot bootstrap fetch of snapshot/config/processes with backoff. Consumed
 * for the loading/error gate; its success seeds {@link appStateAtom} for a fast
 * first paint before the SSE stream takes over.
 */
export const bootstrapAtom = Api.runtime.atom(
  Effect.gen(function* () {
    const client = yield* Api;
    const [snapshot, config, processes] = yield* Effect.all(
      [client.root.snapshot(), client.root.config(), client.root.processes()],
      { concurrency: "unbounded" },
    );
    return { snapshot, config, processes };
  }).pipe(Effect.retry(bootstrapSchedule)),
);

/**
 * Long-lived SSE driver: subscribes to `client.root.events()` (a decoded
 * `Stream<MainEvent>`) and folds each event into {@link appStateAtom}. Retries
 * with a fixed delay to reconnect after transient interruptions (e.g. sidecar
 * restart or system sleep), matching the old `EventSource` reconnect behavior.
 */
/**
 * Long-lived SSE driver. Uses a native `EventSource` — not Effect's HttpClient
 * `StreamSse` — wrapped in an atom so consumers keep the atom API. The browser's
 * EventSource maintains a single stable connection and auto-reconnects after
 * transient interruptions (system sleep, sidecar restart); the server sends a
 * fresh `init` snapshot on each new connection. Events fold through
 * {@link reduceMainEvent} into {@link appStateAtom}.
 *
 * This deliberately avoids `client.root.events()`: consuming the Effect
 * `StreamSse` crashed on scope teardown (an Effect beta bug in
 * `scopeCloseFinalizers` → `exitAsVoidAll`), which the retry loop turned into a
 * reconnect storm — leaking connections and stalling UI updates. The generated
 * client is still used for the request/response endpoints (see {@link Api}).
 */
export const sseDriverAtom = Atom.make((get) => {
  const registry = get.registry;
  const url = new URL(API_ROUTES.EVENTS, resolveApiBaseUrl());
  const token = resolveApiAuthToken();
  if (token) {
    url.searchParams.set("token", token);
  }
  const source = new EventSource(url.href);

  registry.set(connectionStatusAtom, "connecting");

  source.onopen = () => {
    registry.set(connectionStatusAtom, "open");
  };

  source.onerror = () => {
    // EventSource auto-reconnects unless readyState is CLOSED (permanently
    // dead); either way surface "error" so the UI can show a reconnecting
    // indicator and consumers can freeze forward interpolation.
    registry.set(connectionStatusAtom, "error");
  };

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as MainEvent;
      registry.set(
        appStateAtom,
        reduceMainEvent(registry.get(appStateAtom), payload),
      );
    } catch {
      // Ignore malformed SSE payloads; EventSource keeps the stream open.
    }
  };

  get.addFinalizer(() => {
    source.close();
    registry.set(connectionStatusAtom, "error");
  });
});
