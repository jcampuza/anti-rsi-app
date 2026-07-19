import {
  createInitialState,
  deriveEvents,
  reducer,
  selectConfig,
  selectIsPaused,
  selectProcesses,
  selectSnapshot,
  type Action,
  type AntiRsiConfig,
  type AntiRsiEvent,
  type AntiRsiSnapshot,
  type StoreState,
} from "@antirsi/core";
import {
  Clock,
  Context,
  Effect,
  Layer,
  PubSub,
  Ref,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import { IdleProvider } from "./idle-provider";

/**
 * Minimum spacing between steady-state `status-update` snapshot broadcasts. The
 * engine still ticks every `tickIntervalMs`; this only limits how often the
 * "nothing changed but the counters advanced" snapshot is pushed to SSE clients
 * (the UI interpolates between them). Break/warning/pause/config transitions
 * bypass this and broadcast immediately.
 */
const STATUS_BROADCAST_INTERVAL_MS = 1_000;

export type RuntimeEngineEvent = {
  readonly type: "engine-event";
  readonly event: AntiRsiEvent;
  readonly snapshot: AntiRsiSnapshot;
};

export type RuntimeConfigChangedEvent = {
  readonly type: "config-changed";
  readonly config: AntiRsiConfig;
};

export type RuntimeProcessesChangedEvent = {
  readonly type: "processes-changed";
  readonly processes: string[];
};

export type AntiRsiRuntimeEvent =
  RuntimeEngineEvent | RuntimeConfigChangedEvent | RuntimeProcessesChangedEvent;

type Transition = {
  readonly prevState: StoreState;
  readonly nextState: StoreState;
  readonly action: Action;
};

export type AntiRsiRuntimeService = {
  readonly snapshot: Effect.Effect<AntiRsiSnapshot>;
  readonly config: Effect.Effect<AntiRsiConfig>;
  readonly processes: Effect.Effect<string[]>;
  readonly dispatch: (action: Action) => Effect.Effect<void>;
  readonly setProcesses: (processes: string[]) => Effect.Effect<void>;
  readonly addInhibitor: (sourceId: string) => Effect.Effect<void>;
  readonly removeInhibitor: (sourceId: string) => Effect.Effect<void>;
  readonly events: Stream.Stream<AntiRsiRuntimeEvent>;
  readonly subscribeEvents: Effect.Effect<
    PubSub.Subscription<AntiRsiRuntimeEvent>,
    never,
    Scope.Scope
  >;
};

export class AntiRsiRuntime extends Context.Service<
  AntiRsiRuntime,
  AntiRsiRuntimeService
>()("@antirsi/tauri-sidecar/AntiRsiRuntime") {}

const breakConfigsEqual = (
  a: AntiRsiConfig["mini"],
  b: AntiRsiConfig["mini"],
): boolean =>
  a.intervalSeconds === b.intervalSeconds &&
  a.durationSeconds === b.durationSeconds;

const workConfigsEqual = (
  a: AntiRsiConfig["work"],
  b: AntiRsiConfig["work"],
): boolean =>
  a.enabled === b.enabled &&
  a.intervalSeconds === b.intervalSeconds &&
  a.durationSeconds === b.durationSeconds &&
  a.postponeSeconds === b.postponeSeconds;

const configsEqual = (left: AntiRsiConfig, right: AntiRsiConfig): boolean =>
  breakConfigsEqual(left.mini, right.mini) &&
  workConfigsEqual(left.work, right.work) &&
  left.tickIntervalMs === right.tickIntervalMs &&
  left.naturalBreakContinuationWindowSeconds ===
    right.naturalBreakContinuationWindowSeconds &&
  left.breakWarningLeadSeconds === right.breakWarningLeadSeconds &&
  left.waitForActivityPauseBeforeBreak ===
    right.waitForActivityPauseBeforeBreak &&
  left.breakStartGraceSeconds === right.breakStartGraceSeconds &&
  left.maxBreakStartDelaySeconds === right.maxBreakStartDelaySeconds;

const processesEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index]);

/**
 * Computes the tick loop's dt, clamped against long stalls between ticks
 * (e.g. laptop suspend/resume) so a single TICK can't report an elapsed time
 * large enough to blow straight past a break interval. `previousTickMs` is
 * `null` on the very first tick, which always reports dt 0 (there is no
 * prior tick to measure from). Exported as a pure function for direct
 * testing, since simulating a genuine multi-tick stall under `TestClock` is
 * not possible: `TestClock` faithfully replays every scheduled sleep in a
 * time jump, so it cannot model a frozen process missing intermediate
 * timers the way a real OS suspend/resume does.
 */
export const computeClampedDtSeconds = (
  nowMs: number,
  previousTickMs: number | null,
  tickIntervalMs: number,
): number => {
  const rawDtSeconds = Math.max(0, (nowMs - (previousTickMs ?? nowMs)) / 1000);
  const maxDtSeconds = (3 * tickIntervalMs) / 1000;
  return Math.min(rawDtSeconds, maxDtSeconds);
};

export const makeAntiRsiRuntimeLayer = (
  initialConfig?: Partial<StoreState["config"]>,
): Layer.Layer<AntiRsiRuntime, never, IdleProvider> =>
  Layer.effect(
    AntiRsiRuntime,
    Effect.gen(function* () {
      const idleProvider = yield* IdleProvider;
      const stateRef = yield* Ref.make(createInitialState(initialConfig));
      const lastTickMs = yield* Ref.make<number | null>(null);
      const lastStatusPublishedAt = yield* Ref.make(0);
      const events = yield* PubSub.sliding<AntiRsiRuntimeEvent>(64);
      const dispatchLock = yield* Semaphore.make(1);

      const publish = (event: AntiRsiRuntimeEvent): Effect.Effect<void> =>
        PubSub.publish(events, event).pipe(Effect.asVoid);

      const handleTransition = Effect.fn("AntiRsiRuntime.handleTransition")(
        function* ({ prevState, nextState, action }: Transition) {
          const prevConfig = selectConfig(prevState);
          const nextConfig = selectConfig(nextState);
          if (!configsEqual(prevConfig, nextConfig)) {
            yield* publish({ type: "config-changed", config: nextConfig });
          }

          const prevProcesses = selectProcesses(prevState);
          const nextProcesses = selectProcesses(nextState);
          if (!processesEqual(prevProcesses, nextProcesses)) {
            yield* publish({
              type: "processes-changed",
              processes: nextProcesses,
            });
          }

          const { events: derivedEvents } = deriveEvents(
            prevState,
            nextState,
            action,
          );
          if (derivedEvents.length === 0) {
            return;
          }

          const snapshot = selectSnapshot(nextState);
          yield* Effect.forEach(
            derivedEvents,
            (event) =>
              Effect.gen(function* () {
                const now = yield* Clock.currentTimeMillis;
                if (event.type === "status-update") {
                  const previous = yield* Ref.get(lastStatusPublishedAt);
                  if (now - previous < STATUS_BROADCAST_INTERVAL_MS) {
                    return;
                  }
                  yield* Ref.set(lastStatusPublishedAt, now);
                }
                if (event.type === "timings-reset") {
                  yield* Ref.set(lastStatusPublishedAt, now);
                }
                yield* publish({ type: "engine-event", event, snapshot });
              }),
            { discard: true },
          );
        },
      );

      const dispatch = Effect.fn("AntiRsiRuntime.dispatch")(
        function* (action: Action) {
          const transition = yield* Ref.modify(stateRef, (prevState) => {
            const nextState = reducer(prevState, action);
            if (nextState === prevState) {
              return [null, prevState] as const;
            }
            return [{ prevState, nextState, action }, nextState] as const;
          });
          if (transition === null) {
            return;
          }
          yield* handleTransition(transition);
        },
        dispatchLock.withPermits(1),
      );

      const tickLoop = Effect.gen(function* () {
        const config = selectConfig(yield* Ref.get(stateRef));
        // Note: if tickIntervalMs is decreased via SET_CONFIG, the shorter
        // interval only takes effect starting with the *next* sleep — the
        // in-flight sleep below already captured the previous (longer)
        // duration and will not be interrupted/reconfigured mid-flight.
        yield* Effect.sleep(config.tickIntervalMs);

        if (selectIsPaused(yield* Ref.get(stateRef))) {
          yield* Ref.set(lastTickMs, null);
          return;
        }

        const now = yield* Clock.currentTimeMillis;
        const previous = yield* Ref.get(lastTickMs);
        yield* Ref.set(lastTickMs, now);
        const idleSeconds = yield* idleProvider.getSystemIdleTime;
        // Clamp dt so a suspend/resume (or other long stall between ticks)
        // can't be reported as a single huge delta that blows straight past
        // break intervals in one TICK. Cap at 3x the tick interval — enough
        // slack for normal scheduling jitter, not enough to skip a break.
        const dtSeconds = computeClampedDtSeconds(
          now,
          previous,
          config.tickIntervalMs,
        );
        yield* dispatch({
          type: "TICK",
          idleSeconds,
          dtSeconds,
        });
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("Anti RSI runtime tick failed", { cause }),
        ),
        Effect.forever,
        Effect.forkScoped,
      );

      yield* tickLoop;

      const now = yield* Clock.currentTimeMillis;
      const initialRuntimeConfig = selectConfig(yield* Ref.get(stateRef));
      yield* Ref.set(lastStatusPublishedAt, now);
      yield* publish({ type: "config-changed", config: initialRuntimeConfig });
      yield* publish({
        type: "engine-event",
        event: { type: "status-update" },
        snapshot: selectSnapshot(yield* Ref.get(stateRef)),
      });

      return AntiRsiRuntime.of({
        snapshot: Ref.get(stateRef).pipe(Effect.map(selectSnapshot)),
        config: Ref.get(stateRef).pipe(Effect.map(selectConfig)),
        processes: Ref.get(stateRef).pipe(Effect.map(selectProcesses)),
        dispatch,
        setProcesses: (processes) =>
          dispatch({ type: "SET_PROCESSES", processes }),
        addInhibitor: (sourceId) =>
          dispatch({ type: "ADD_INHIBITOR", id: sourceId }),
        removeInhibitor: (sourceId) =>
          dispatch({ type: "REMOVE_INHIBITOR", id: sourceId }),
        events: Stream.fromPubSub(events),
        subscribeEvents: PubSub.subscribe(events),
      });
    }),
  );
