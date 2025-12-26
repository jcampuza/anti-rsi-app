import { powerMonitor } from 'electron';
import { performance } from 'node:perf_hooks';
import { Effect, PubSub, Duration, Fiber, Ref } from 'effect';
import {
  type AntiRsiConfig,
  type AntiRsiEvent,
  type AntiRsiSnapshot,
} from '../../common/antirsi-core';
import { type Action } from '../../common/store/actions';
import { deriveEvents } from '../../common/store/events';
import {
  selectConfig,
  selectIsPaused,
  selectProcesses,
  selectSnapshot,
} from '../../common/store/selectors';
import { type StoreState } from '../../common/store/state';
import { StoreTag } from '../../common/store/store';

export type AntiRsiEventPayload = {
  event: AntiRsiEvent;
  snapshot: AntiRsiSnapshot;
};

export type ConfigChangedPayload = {
  config: AntiRsiConfig;
};

export type ProcessesChangedPayload = {
  processes: string[];
};

const breakConfigsEqual = (a: AntiRsiConfig['mini'], b: AntiRsiConfig['mini']): boolean =>
  a.intervalSeconds === b.intervalSeconds && a.durationSeconds === b.durationSeconds;

const workConfigsEqual = (a: AntiRsiConfig['work'], b: AntiRsiConfig['work']): boolean =>
  a.intervalSeconds === b.intervalSeconds &&
  a.durationSeconds === b.durationSeconds &&
  a.postponeSeconds === b.postponeSeconds;

const configsEqual = (left: AntiRsiConfig, right: AntiRsiConfig): boolean =>
  breakConfigsEqual(left.mini, right.mini) &&
  workConfigsEqual(left.work, right.work) &&
  left.tickIntervalMs === right.tickIntervalMs &&
  left.naturalBreakContinuationWindowSeconds === right.naturalBreakContinuationWindowSeconds;

export class AntiRsiEngine extends Effect.Service<AntiRsiEngine>()('AntiRsiEngine', {
  scoped: Effect.gen(function* () {
    const store = yield* StoreTag;

    // PubSub for events
    const eventPubSub = yield* PubSub.unbounded<AntiRsiEventPayload>();
    const configPubSub = yield* PubSub.unbounded<ConfigChangedPayload>();
    const processesPubSub = yield* PubSub.unbounded<ProcessesChangedPayload>();

    // Refs for mutable state
    const lastTickTimestampRef = yield* Ref.make<number | null>(null);
    const timerFiberRef = yield* Ref.make<Fiber.RuntimeFiber<void, never> | null>(null);

    // Helper to get the current snapshot
    const getSnapshot = (): AntiRsiSnapshot => selectSnapshot(store.getState());

    // Helper to dispatch an action
    const dispatch = (action: Action): void => {
      store.dispatch(action);
    };

    // Emit an event to all subscribers
    const emit = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot): Effect.Effect<void> =>
      PubSub.publish(eventPubSub, { event, snapshot });

    // Handle a single tick
    const handleTick = Effect.gen(function* () {
      if (selectIsPaused(store.getState())) {
        return;
      }
      const now = performance.now();
      const lastTimestamp = yield* Ref.get(lastTickTimestampRef);
      const dtSeconds = Math.max(0, (now - (lastTimestamp ?? now)) / 1000);
      yield* Ref.set(lastTickTimestampRef, now);
      const idleSeconds = powerMonitor.getSystemIdleTime();
      dispatch({ type: 'TICK', idleSeconds, dtSeconds });
    });

    // Create a tick loop effect
    const createTickLoop = (intervalMs: number): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        yield* Ref.set(lastTickTimestampRef, performance.now());
        yield* Effect.forever(
          Effect.gen(function* () {
            yield* Effect.sleep(Duration.millis(intervalMs));
            yield* handleTick;
          }),
        );
      });

    // Start or restart the timer
    const restartTimer = Effect.gen(function* () {
      // Stop existing timer if any
      const existingFiber = yield* Ref.get(timerFiberRef);
      if (existingFiber) {
        yield* Fiber.interrupt(existingFiber);
      }

      if (selectIsPaused(store.getState())) {
        yield* Ref.set(lastTickTimestampRef, null);
        yield* Ref.set(timerFiberRef, null);
        return;
      }

      const { tickIntervalMs } = selectConfig(store.getState());
      const fiber = yield* Effect.forkDaemon(createTickLoop(tickIntervalMs));
      yield* Ref.set(timerFiberRef, fiber);
    });

    // Sync timer with pause state
    const syncTimerWithPause = (paused: boolean): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (paused) {
          const existingFiber = yield* Ref.get(timerFiberRef);
          if (existingFiber) {
            yield* Fiber.interrupt(existingFiber);
            yield* Ref.set(timerFiberRef, null);
          }
          yield* Ref.set(lastTickTimestampRef, null);
          return;
        }
        yield* restartTimer;
      });

    // Handle state transitions from the store
    const handleStateTransition = (
      prevState: StoreState,
      nextState: StoreState,
      action: Action,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const prevPaused = selectIsPaused(prevState);
        const nextPaused = selectIsPaused(nextState);

        if (prevPaused !== nextPaused) {
          yield* syncTimerWithPause(nextPaused);
        }

        const prevConfig = selectConfig(prevState);
        const nextConfig = selectConfig(nextState);
        const configChanged = !configsEqual(prevConfig, nextConfig);

        if (configChanged) {
          yield* PubSub.publish(configPubSub, { config: nextConfig });
          if (prevConfig.tickIntervalMs !== nextConfig.tickIntervalMs && !nextPaused) {
            yield* restartTimer;
          }
        }

        const prevProcesses = selectProcesses(prevState);
        const nextProcesses = selectProcesses(nextState);
        const processesChanged =
          prevProcesses.length !== nextProcesses.length ||
          !prevProcesses.every((p, i) => p === nextProcesses[i]);

        if (processesChanged) {
          yield* PubSub.publish(processesPubSub, { processes: nextProcesses });
        }

        const { events } = deriveEvents(prevState, nextState, action);
        if (events.length === 0) {
          return;
        }
        const snapshot = selectSnapshot(nextState);
        for (const event of events) {
          yield* emit(event, snapshot);
        }
      });

    // Subscribe to store changes
    let previousState = store.getState();
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        store.subscribe((nextState, action) => {
          const prevState = previousState;
          previousState = nextState;
          // Run the state transition handler synchronously
          Effect.runFork(handleStateTransition(prevState, nextState, action));
        }),
      ),
      (unsubscribe) => Effect.sync(() => unsubscribe()),
    );

    // Emit initial config and status
    const initialConfig = selectConfig(store.getState());
    yield* PubSub.publish(configPubSub, { config: initialConfig });
    const initialSnapshot = getSnapshot();
    yield* emit({ type: 'status-update' }, initialSnapshot);

    // Start the timer
    yield* restartTimer;

    // Cleanup timer on scope finalization
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const fiber = yield* Ref.get(timerFiberRef);
        if (fiber) {
          yield* Fiber.interrupt(fiber);
        }
      }),
    );

    // Service interface
    return {
      // Event streams
      events: eventPubSub,
      configChanges: configPubSub,
      processesChanges: processesPubSub,

      // Snapshot access
      snapshot: Effect.sync(() => getSnapshot()),

      // Synchronous snapshot access for overlay manager close handler
      getSnapshot,

      // Actions
      dispatch: (action: Action): Effect.Effect<void> =>
        Effect.sync(() => {
          dispatch(action);
        }),

      setProcesses: (processes: string[]): void => {
        dispatch({ type: 'SET_PROCESSES', processes });
      },

      skipWorkBreak: (): void => {
        if (selectIsPaused(store.getState())) {
          return;
        }
        dispatch({ type: 'END_WORK_BREAK' });
      },

      skipMicroBreak: (): void => {
        if (selectIsPaused(store.getState())) {
          return;
        }
        dispatch({ type: 'END_MINI_BREAK' });
      },

      pause: (): Effect.Effect<void> =>
        Effect.gen(function* () {
          dispatch({ type: 'SET_USER_PAUSED', value: true });
          yield* syncTimerWithPause(true);
        }),

      resume: (): Effect.Effect<void> =>
        Effect.gen(function* () {
          dispatch({ type: 'SET_USER_PAUSED', value: false });
          yield* syncTimerWithPause(selectIsPaused(store.getState()));
        }),

      addInhibitor: (sourceId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          dispatch({ type: 'ADD_INHIBITOR', id: sourceId });
          yield* syncTimerWithPause(selectIsPaused(store.getState()));
        }),

      removeInhibitor: (sourceId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          dispatch({ type: 'REMOVE_INHIBITOR', id: sourceId });
          yield* syncTimerWithPause(selectIsPaused(store.getState()));
        }),
    } as const;
  }),
}) {}
