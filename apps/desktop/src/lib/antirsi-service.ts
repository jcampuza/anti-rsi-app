import { powerMonitor } from "electron";
import { performance } from "node:perf_hooks";
import {
  deriveEvents,
  selectConfig,
  selectIsPaused,
  selectProcesses,
  type AntiRsiConfig,
  type AntiRsiEvent,
  type AntiRsiSnapshot,
  selectSnapshot,
  type Action,
  type Store,
  type StoreState,
} from "@antirsi/core";
import { Emitter } from "./emitter";

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
    right.naturalBreakContinuationWindowSeconds;

export class AntiRsiEngine {
  private readonly eventEmitter = new Emitter<AntiRsiEventPayload>();
  private readonly configEmitter = new Emitter<ConfigChangedPayload>();
  private readonly processesEmitter = new Emitter<ProcessesChangedPayload>();

  private lastTickTimestamp: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private started = false;

  constructor(private readonly store: Store) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    let previousState = this.store.getState();
    this.unsubscribeStore = this.store.subscribe((nextState, action) => {
      const prevState = previousState;
      previousState = nextState;
      this.handleStateTransition(prevState, nextState, action);
    });

    const initialConfig = selectConfig(this.store.getState());
    this.configEmitter.publish({ config: initialConfig });
    const initialSnapshot = this.getSnapshot();
    this.eventEmitter.publish({ event: { type: "status-update" }, snapshot: initialSnapshot });

    this.restartTimer();
  }

  dispose(): void {
    this.stopTimer();
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.started = false;
  }

  onEvent(listener: (payload: AntiRsiEventPayload) => void): () => void {
    return this.eventEmitter.subscribe(listener);
  }

  onConfigChange(listener: (payload: ConfigChangedPayload) => void): () => void {
    return this.configEmitter.subscribe(listener);
  }

  onProcessesChange(listener: (payload: ProcessesChangedPayload) => void): () => void {
    return this.processesEmitter.subscribe(listener);
  }

  getSnapshot(): AntiRsiSnapshot {
    return selectSnapshot(this.store.getState());
  }

  getConfig(): AntiRsiConfig {
    return selectConfig(this.store.getState());
  }

  dispatch(action: Action): void {
    this.store.dispatch(action);
  }

  setProcesses(processes: string[]): void {
    this.dispatch({ type: "SET_PROCESSES", processes });
  }

  skipWorkBreak(): void {
    if (selectIsPaused(this.store.getState())) {
      return;
    }
    this.dispatch({ type: "END_WORK_BREAK" });
  }

  skipMicroBreak(): void {
    if (selectIsPaused(this.store.getState())) {
      return;
    }
    this.dispatch({ type: "END_MINI_BREAK" });
  }

  pause(): void {
    this.dispatch({ type: "SET_USER_PAUSED", value: true });
    this.syncTimerWithPause(true);
  }

  resume(): void {
    this.dispatch({ type: "SET_USER_PAUSED", value: false });
    this.syncTimerWithPause(selectIsPaused(this.store.getState()));
  }

  addInhibitor(sourceId: string): void {
    this.dispatch({ type: "ADD_INHIBITOR", id: sourceId });
    this.syncTimerWithPause(selectIsPaused(this.store.getState()));
  }

  removeInhibitor(sourceId: string): void {
    this.dispatch({ type: "REMOVE_INHIBITOR", id: sourceId });
    this.syncTimerWithPause(selectIsPaused(this.store.getState()));
  }

  private handleTick(): void {
    if (selectIsPaused(this.store.getState())) {
      return;
    }
    const now = performance.now();
    const dtSeconds = Math.max(0, (now - (this.lastTickTimestamp ?? now)) / 1000);
    this.lastTickTimestamp = now;
    const idleSeconds = powerMonitor.getSystemIdleTime();
    this.dispatch({ type: "TICK", idleSeconds, dtSeconds });
  }

  private stopTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastTickTimestamp = null;
  }

  private restartTimer(): void {
    this.stopTimer();

    if (selectIsPaused(this.store.getState())) {
      return;
    }

    const { tickIntervalMs } = selectConfig(this.store.getState());
    this.lastTickTimestamp = performance.now();
    this.intervalId = setInterval(() => {
      this.handleTick();
    }, tickIntervalMs);
  }

  private syncTimerWithPause(paused: boolean): void {
    if (paused) {
      this.stopTimer();
      return;
    }
    this.restartTimer();
  }

  private emit(event: AntiRsiEvent, snapshot: AntiRsiSnapshot): void {
    this.eventEmitter.publish({ event, snapshot });
  }

  private handleStateTransition(
    prevState: StoreState,
    nextState: StoreState,
    action: Action,
  ): void {
    const prevPaused = selectIsPaused(prevState);
    const nextPaused = selectIsPaused(nextState);

    if (prevPaused !== nextPaused) {
      this.syncTimerWithPause(nextPaused);
    }

    const prevConfig = selectConfig(prevState);
    const nextConfig = selectConfig(nextState);
    const configChanged = !configsEqual(prevConfig, nextConfig);

    if (configChanged) {
      this.configEmitter.publish({ config: nextConfig });
      if (
        prevConfig.tickIntervalMs !== nextConfig.tickIntervalMs &&
        !nextPaused
      ) {
        this.restartTimer();
      }
    }

    const prevProcesses = selectProcesses(prevState);
    const nextProcesses = selectProcesses(nextState);
    const processesChanged =
      prevProcesses.length !== nextProcesses.length ||
      !prevProcesses.every((p, i) => p === nextProcesses[i]);

    if (processesChanged) {
      this.processesEmitter.publish({ processes: nextProcesses });
    }

    const { events } = deriveEvents(prevState, nextState, action);
    if (events.length === 0) {
      return;
    }
    const snapshot = selectSnapshot(nextState);
    for (const event of events) {
      this.emit(event, snapshot);
    }
  }
}
