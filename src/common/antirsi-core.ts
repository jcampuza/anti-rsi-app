export type BreakType = 'mini' | 'work'

export type AntiRsiState = 'normal' | 'in-mini' | 'in-work'

export interface BreakConfig {
  intervalSeconds: number
  durationSeconds: number
}

export interface AntiRsiConfig {
  mini: BreakConfig
  work: BreakConfig & { postponeSeconds: number }
  tickIntervalMs: number
  naturalBreakContinuationWindowSeconds: number
}

export interface AntiRsiTimings {
  miniElapsed: number
  miniTaking: number
  workElapsed: number
  workTaking: number
}

export interface AntiRsiSnapshot {
  state: AntiRsiState
  timings: AntiRsiTimings
  lastIdleSeconds: number
  lastUpdatedSeconds: number
  paused: boolean
}

export type AntiRsiEvent =
  | { type: 'mini-break-start' }
  | { type: 'work-break-start'; naturalContinuation: boolean }
  | { type: 'break-update'; breakType: BreakType }
  | { type: 'break-end'; breakType: BreakType }
  | { type: 'status-update' }
  | { type: 'paused' }
  | { type: 'resumed' }

export type AntiRsiEventListener = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void

const cloneSnapshot = (snapshot: AntiRsiSnapshot): AntiRsiSnapshot => ({
  state: snapshot.state,
  timings: { ...snapshot.timings },
  lastIdleSeconds: snapshot.lastIdleSeconds,
  lastUpdatedSeconds: snapshot.lastUpdatedSeconds,
  paused: snapshot.paused
})

const mergeConfig = (override?: Partial<AntiRsiConfig>): AntiRsiConfig => {
  const base: AntiRsiConfig = {
    mini: {
      intervalSeconds: 4 * 60,
      durationSeconds: 13
    },
    work: {
      intervalSeconds: 50 * 60,
      durationSeconds: 8 * 60,
      postponeSeconds: 10 * 60
    },
    tickIntervalMs: 500,
    naturalBreakContinuationWindowSeconds: 30
  }

  if (!override) {
    return base
  }

  return {
    mini: { ...base.mini, ...override.mini },
    work: { ...base.work, ...override.work },
    tickIntervalMs: override.tickIntervalMs ?? base.tickIntervalMs,
    naturalBreakContinuationWindowSeconds:
      override.naturalBreakContinuationWindowSeconds ?? base.naturalBreakContinuationWindowSeconds
  }
}

export const defaultConfig = (): AntiRsiConfig => mergeConfig()

const stepSeconds = (config: AntiRsiConfig): number => config.tickIntervalMs / 1000

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const clampTo = (value: number, max: number): number => clamp(value, 0, max)

export interface AntiRsiCoreOptions {
  config?: Partial<AntiRsiConfig>
}

export class AntiRsiCore {
  private readonly snapshot: AntiRsiSnapshot
  private config: AntiRsiConfig
  private listeners = new Set<AntiRsiEventListener>()
  private paused = false

  constructor(options: AntiRsiCoreOptions = {}) {
    this.config = mergeConfig(options.config)
    this.snapshot = {
      state: 'normal',
      timings: {
        miniElapsed: 0,
        miniTaking: 0,
        workElapsed: 0,
        workTaking: 0
      },
      lastIdleSeconds: 0,
      lastUpdatedSeconds: 0,
      paused: false
    }
  }

  getSnapshot(): AntiRsiSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  getConfig(): AntiRsiConfig {
    return {
      mini: { ...this.config.mini },
      work: { ...this.config.work },
      tickIntervalMs: this.config.tickIntervalMs,
      naturalBreakContinuationWindowSeconds: this.config.naturalBreakContinuationWindowSeconds
    }
  }

  subscribe(listener: AntiRsiEventListener): () => void {
    this.listeners.add(listener)
    listener({ type: 'status-update' }, this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  tick(idleSeconds: number): void {
    if (this.paused) {
      return
    }
    const { timings } = this.snapshot
    const delta = stepSeconds(this.config)

    this.snapshot.lastIdleSeconds = idleSeconds
    this.snapshot.lastUpdatedSeconds += delta

    if (this.snapshot.state === 'normal') {
      const idleThreshold = this.config.mini.durationSeconds * 0.3
      if (idleSeconds <= idleThreshold) {
        timings.miniElapsed = clampTo(timings.miniElapsed + delta, this.config.mini.intervalSeconds)
        timings.miniTaking = 0
      } else {
        timings.miniTaking = clampTo(timings.miniTaking + delta, this.config.mini.durationSeconds)
      }

      timings.workElapsed = clampTo(timings.workElapsed + delta, this.config.work.intervalSeconds)
      timings.workTaking = 0
      const naturalMiniResetApplied = this.shouldResetMiniFromNaturalBreak(idleSeconds)
      if (naturalMiniResetApplied) {
        this.resetMiniTimersFromNaturalBreak()
      }

      if (timings.workElapsed >= this.config.work.intervalSeconds) {
        this.startWorkBreak(false)
      } else if (
        !naturalMiniResetApplied &&
        timings.miniElapsed >= this.config.mini.intervalSeconds
      ) {
        this.startMiniBreak()
      }
    } else if (this.snapshot.state === 'in-mini') {
      timings.workElapsed = clampTo(timings.workElapsed + delta, this.config.work.intervalSeconds)
      if (idleSeconds < 1) {
        timings.miniTaking = 0
      } else {
        timings.miniTaking = clampTo(timings.miniTaking + delta, this.config.mini.durationSeconds)
      }
    } else if (this.snapshot.state === 'in-work') {
      if (idleSeconds >= 4) {
        timings.workTaking = clampTo(timings.workTaking + delta, this.config.work.durationSeconds)
      }
    }

    if (this.snapshot.state === 'in-mini') {
      if (timings.workElapsed >= this.config.work.intervalSeconds) {
        this.startWorkBreak(false)
      } else if (timings.miniTaking >= this.config.mini.durationSeconds) {
        this.endMiniBreak()
      } else {
        this.emit({ type: 'break-update', breakType: 'mini' })
      }
    } else if (this.snapshot.state === 'in-work') {
      if (timings.workTaking >= this.config.work.durationSeconds) {
        this.endWorkBreak()
      } else {
        this.emit({ type: 'break-update', breakType: 'work' })
      }
    }

    this.emit({ type: 'status-update' })
  }

  postponeWorkBreak(): void {
    if (this.paused) {
      return
    }
    const { timings } = this.snapshot
    timings.miniElapsed = 0
    timings.miniTaking = 0
    timings.workElapsed = clamp(
      this.config.work.intervalSeconds - this.config.work.postponeSeconds,
      0,
      this.config.work.intervalSeconds
    )
    timings.workTaking = 0
    if (this.snapshot.state !== 'normal') {
      this.snapshot.state = 'normal'
      this.emit({ type: 'break-end', breakType: 'work' })
    }
    this.emit({ type: 'status-update' })
  }

  triggerWorkBreak(): void {
    if (this.paused) {
      return
    }
    this.startWorkBreak(false)
    this.emit({ type: 'status-update' })
  }

  triggerMicroPause(): void {
    if (this.paused) {
      return
    }
    this.startMiniBreak()
    this.emit({ type: 'status-update' })
  }

  skipWorkBreak(): void {
    if (this.paused) {
      return
    }
    if (this.snapshot.state === 'in-work') {
      this.endWorkBreak()
    }
    this.emit({ type: 'status-update' })
  }

  pause(): void {
    if (this.paused) {
      return
    }
    this.paused = true
    this.snapshot.paused = true
    this.emit({ type: 'status-update' })
    this.emit({ type: 'paused' })
  }

  resume(): void {
    if (!this.paused) {
      return
    }
    this.paused = false
    this.snapshot.paused = false
    this.emit({ type: 'resumed' })
    this.emit({ type: 'status-update' })
  }

  resetTimings(): void {
    const previousState = this.snapshot.state
    this.paused = false
    this.snapshot.paused = false
    this.resetState()
    if (previousState === 'in-mini') {
      this.emit({ type: 'break-end', breakType: 'mini' })
    } else if (previousState === 'in-work') {
      this.emit({ type: 'break-end', breakType: 'work' })
    }
    this.emit({ type: 'status-update' })
  }

  isPaused(): boolean {
    return this.paused
  }

  setConfig(config: Partial<AntiRsiConfig>): void {
    const merged = mergeConfig({
      ...this.config,
      ...config,
      mini: { ...this.config.mini, ...config.mini },
      work: { ...this.config.work, ...config.work },
      tickIntervalMs: config.tickIntervalMs ?? this.config.tickIntervalMs,
      naturalBreakContinuationWindowSeconds:
        config.naturalBreakContinuationWindowSeconds ??
        this.config.naturalBreakContinuationWindowSeconds
    })
    this.config = merged
    this.resetState()
    this.emit({ type: 'status-update' })
  }

  private startMiniBreak(): void {
    this.snapshot.state = 'in-mini'
    this.snapshot.timings.miniElapsed = this.config.mini.intervalSeconds
    this.snapshot.timings.miniTaking = 0
    this.emit({ type: 'mini-break-start' })
  }

  private shouldResetMiniFromNaturalBreak(idleSeconds: number): boolean {
    console.log(
      'shouldResetMiniFromNaturalBreak',
      idleSeconds,
      this.config.mini.durationSeconds * 2
    )
    return idleSeconds >= this.config.mini.durationSeconds * 2
  }

  private resetMiniTimersFromNaturalBreak(): void {
    this.snapshot.timings.miniElapsed = 0
    this.snapshot.timings.miniTaking = this.config.mini.durationSeconds
  }

  private startWorkBreak(naturalContinuation: boolean): void {
    this.snapshot.state = 'in-work'
    this.snapshot.timings.workElapsed = this.config.work.intervalSeconds
    if (!naturalContinuation) {
      this.snapshot.timings.workTaking = 0
    }
    this.snapshot.timings.miniElapsed = 0
    this.snapshot.timings.miniTaking = this.config.mini.durationSeconds
    this.emit({ type: 'work-break-start', naturalContinuation })
  }

  private endMiniBreak(): void {
    this.snapshot.state = 'normal'
    this.snapshot.timings.miniElapsed = 0
    this.snapshot.timings.miniTaking = this.config.mini.durationSeconds
    this.emit({ type: 'break-end', breakType: 'mini' })
  }

  private endWorkBreak(): void {
    this.snapshot.state = 'normal'
    this.snapshot.timings.miniElapsed = 0
    this.snapshot.timings.miniTaking = this.config.mini.durationSeconds
    this.snapshot.timings.workElapsed = 0
    this.snapshot.timings.workTaking = this.config.work.durationSeconds
    this.emit({ type: 'break-end', breakType: 'work' })
  }

  private emit(event: AntiRsiEvent): void {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(event, snapshot))
  }

  private resetState(): void {
    this.snapshot.state = 'normal'
    this.snapshot.timings.miniElapsed = 0
    this.snapshot.timings.miniTaking = 0
    this.snapshot.timings.workElapsed = 0
    this.snapshot.timings.workTaking = 0
    this.snapshot.lastIdleSeconds = 0
    this.snapshot.lastUpdatedSeconds = 0
    this.snapshot.paused = this.paused
  }
}
