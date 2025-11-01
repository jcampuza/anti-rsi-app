import { powerMonitor } from "electron"
import { performance } from "node:perf_hooks"
import {
  type AntiRsiConfig,
  type AntiRsiEvent,
  type AntiRsiEventListener,
  type AntiRsiSnapshot,
  defaultConfig,
} from "../../common/antirsi-core"
import { type Action } from "../../common/store/actions"
import { deriveEvents } from "../../common/store/events"
import {
  selectConfig,
  selectIsPaused,
  selectProcesses,
  selectSnapshot,
} from "../../common/store/selectors"
import { type StoreState } from "../../common/store/state"
import { type Store } from "../../common/store/store"
import { ConfigStore } from "./config-store"

export type AntiRsiServiceCallbacks = {
  onEvent: (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void
  onConfigChanged?: (config: AntiRsiConfig) => void
  onProcessesChanged?: (processes: string[]) => void
}

const breakConfigsEqual = (a: AntiRsiConfig["mini"], b: AntiRsiConfig["mini"]): boolean =>
  a.intervalSeconds === b.intervalSeconds && a.durationSeconds === b.durationSeconds

const workConfigsEqual = (a: AntiRsiConfig["work"], b: AntiRsiConfig["work"]): boolean =>
  a.intervalSeconds === b.intervalSeconds &&
  a.durationSeconds === b.durationSeconds &&
  a.postponeSeconds === b.postponeSeconds

const configsEqual = (left: AntiRsiConfig, right: AntiRsiConfig): boolean =>
  breakConfigsEqual(left.mini, right.mini) &&
  workConfigsEqual(left.work, right.work) &&
  left.tickIntervalMs === right.tickIntervalMs &&
  left.naturalBreakContinuationWindowSeconds === right.naturalBreakContinuationWindowSeconds

export class AntiRsiService {
  private readonly store: Store
  private readonly callbacks: AntiRsiServiceCallbacks
  private readonly configStore: ConfigStore
  private readonly listeners = new Set<AntiRsiEventListener>()
  private timer: NodeJS.Timeout | undefined
  private lastTickTimestamp: number | null = null
  private unsubscribeStore: (() => void) | null = null

  constructor(options: {
    callbacks: AntiRsiServiceCallbacks
    configStore: ConfigStore
    store: Store
  }) {
    this.callbacks = options.callbacks
    this.configStore = options.configStore
    this.store = options.store

    let previousState = this.store.getState()

    this.unsubscribeStore = this.store.subscribe((nextState, action) => {
      const prevState = previousState
      previousState = nextState
      this.handleStateTransition(prevState, nextState, action)
    })

    const initialConfig = selectConfig(previousState)
    this.callbacks.onConfigChanged?.(initialConfig)
    const initialSnapshot = selectSnapshot(previousState)
    this.emit(initialSnapshot, { type: "status-update" })
  }

  start(): void {
    this.restartTimer()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.lastTickTimestamp = null
  }

  getSnapshot(): AntiRsiSnapshot {
    return selectSnapshot(this.store.getState())
  }

  getConfig(): AntiRsiConfig {
    return selectConfig(this.store.getState())
  }

  getProcesses(): string[] {
    return selectProcesses(this.store.getState())
  }

  getStore(): Store {
    return this.store
  }

  setProcesses(processes: string[]): void {
    this.dispatch({ type: "SET_PROCESSES", processes })
  }

  async setConfig(config: Partial<AntiRsiConfig>): Promise<void> {
    const before = selectConfig(this.store.getState())
    this.dispatch({ type: "SET_CONFIG", config })
    const after = selectConfig(this.store.getState())

    if (!configsEqual(before, after)) {
      await this.configStore.save(after)
    }
  }

  async resetConfigToDefaults(): Promise<void> {
    const defaults = defaultConfig()
    const before = selectConfig(this.store.getState())
    this.dispatch({ type: "RESET_CONFIG" })
    const after = selectConfig(this.store.getState())
    if (!configsEqual(before, after)) {
      await this.configStore.save(defaults)
    }
  }

  triggerWorkBreak(): void {
    if (selectIsPaused(this.store.getState())) {
      return
    }
    this.dispatch({ type: "START_WORK_BREAK", naturalContinuation: false })
  }

  triggerMicroPause(): void {
    if (selectIsPaused(this.store.getState())) {
      return
    }
    this.dispatch({ type: "START_MINI_BREAK" })
  }

  postponeWorkBreak(): void {
    if (selectIsPaused(this.store.getState())) {
      return
    }
    this.dispatch({ type: "POSTPONE_WORK_BREAK" })
  }

  skipWorkBreak(): void {
    if (selectIsPaused(this.store.getState())) {
      return
    }
    this.dispatch({ type: "END_WORK_BREAK" })
  }

  skipMicroBreak(): void {
    if (selectIsPaused(this.store.getState())) {
      return
    }
    this.dispatch({ type: "END_MINI_BREAK" })
  }

  pause(): void {
    this.dispatch({ type: "SET_USER_PAUSED", value: true })
    this.syncTimerWithPause(true)
  }

  resume(): void {
    this.dispatch({ type: "SET_USER_PAUSED", value: false })
    this.syncTimerWithPause(selectIsPaused(this.store.getState()))
  }

  resetTimings(): void {
    this.dispatch({ type: "SET_USER_PAUSED", value: false })
    this.dispatch({ type: "RESET_TIMINGS" })
    this.restartTimer()
  }

  isPaused(): boolean {
    return selectIsPaused(this.store.getState())
  }

  addInhibitor(sourceId: string): void {
    this.dispatch({ type: "ADD_INHIBITOR", id: sourceId })
    this.syncTimerWithPause(selectIsPaused(this.store.getState()))
  }

  removeInhibitor(sourceId: string): void {
    this.dispatch({ type: "REMOVE_INHIBITOR", id: sourceId })
    this.syncTimerWithPause(selectIsPaused(this.store.getState()))
  }

  subscribe(listener: AntiRsiEventListener): () => void {
    this.listeners.add(listener)
    listener({ type: "status-update" }, this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispatch(action: Action): void {
    this.store.dispatch(action)
  }

  private handleStateTransition(
    prevState: StoreState,
    nextState: StoreState,
    action: Action,
  ): void {
    const prevPaused = selectIsPaused(prevState)
    const nextPaused = selectIsPaused(nextState)

    if (prevPaused !== nextPaused) {
      this.syncTimerWithPause(nextPaused)
    }

    const prevConfig = selectConfig(prevState)
    const nextConfig = selectConfig(nextState)
    const configChanged = !configsEqual(prevConfig, nextConfig)

    if (configChanged) {
      this.callbacks.onConfigChanged?.(nextConfig)
      if (prevConfig.tickIntervalMs !== nextConfig.tickIntervalMs && !nextPaused) {
        this.restartTimer()
      }
    }

    const prevProcesses = selectProcesses(prevState)
    const nextProcesses = selectProcesses(nextState)
    const processesChanged =
      prevProcesses.length !== nextProcesses.length ||
      !prevProcesses.every((p, i) => p === nextProcesses[i])

    if (processesChanged) {
      this.callbacks.onProcessesChanged?.(nextProcesses)
    }

    const { events } = deriveEvents(prevState, nextState, action)
    if (events.length === 0) {
      return
    }
    const snapshot = selectSnapshot(nextState)
    for (const event of events) {
      this.emit(snapshot, event)
    }
  }

  private emit(snapshot: AntiRsiSnapshot, event: AntiRsiEvent): void {
    this.callbacks.onEvent(event, snapshot)
    this.listeners.forEach((listener) => listener(event, snapshot))
  }

  private syncTimerWithPause(paused: boolean): void {
    if (paused) {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = undefined
      }
      this.lastTickTimestamp = null
      return
    }
    this.restartTimer()
  }

  private restartTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }

    if (selectIsPaused(this.store.getState())) {
      this.lastTickTimestamp = null
      return
    }

    const { tickIntervalMs } = selectConfig(this.store.getState())
    this.lastTickTimestamp = performance.now()
    this.timer = setInterval(() => {
      this.handleTick()
    }, tickIntervalMs)
    this.timer.unref?.()
  }

  private handleTick(): void {
    if (selectIsPaused(this.store.getState())) {
      return
    }
    const now = performance.now()
    const lastTimestamp = this.lastTickTimestamp ?? now
    const dtSeconds = Math.max(0, (now - lastTimestamp) / 1000)
    this.lastTickTimestamp = now
    const idleSeconds = powerMonitor.getSystemIdleTime()
    this.dispatch({ type: "TICK", idleSeconds, dtSeconds })
  }
}
