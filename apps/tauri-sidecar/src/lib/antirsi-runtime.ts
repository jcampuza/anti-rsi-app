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
import { Clock, Context, Effect, Layer, PubSub, Ref, Stream } from "effect";
import { IdleProvider } from "./idle-provider";

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
      const events = yield* PubSub.unbounded<AntiRsiRuntimeEvent>();

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
                  if (now - previous < 5000) {
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

      const dispatch = Effect.fn("AntiRsiRuntime.dispatch")(function* (
        action: Action,
      ) {
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
      });

      const tickLoop = Effect.gen(function* () {
        while (true) {
          const config = selectConfig(yield* Ref.get(stateRef));
          yield* Effect.sleep(config.tickIntervalMs);

          if (selectIsPaused(yield* Ref.get(stateRef))) {
            yield* Ref.set(lastTickMs, null);
            continue;
          }

          const now = yield* Clock.currentTimeMillis;
          const previous = yield* Ref.get(lastTickMs);
          yield* Ref.set(lastTickMs, now);
          const idleSeconds = yield* idleProvider.getSystemIdleTime;
          yield* dispatch({
            type: "TICK",
            idleSeconds,
            dtSeconds: Math.max(0, (now - (previous ?? now)) / 1000),
          });
        }
      }).pipe(
        Effect.catch((error) =>
          Effect.logError("Anti RSI runtime tick loop failed", { error }),
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
      });
    }),
  );
