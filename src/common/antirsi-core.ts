export type BreakType = "mini" | "work"

export type AntiRsiState = "normal" | "in-mini" | "in-work"

export interface BreakConfig {
  intervalSeconds: number
  durationSeconds: number
}

export interface WorkBreakConfig extends BreakConfig {
  postponeSeconds: number
}

export interface AntiRsiConfig {
  mini: BreakConfig
  work: WorkBreakConfig
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
  | { type: "mini-break-start" }
  | { type: "work-break-start"; naturalContinuation: boolean }
  | { type: "break-update"; breakType: BreakType }
  | { type: "break-end"; breakType: BreakType }
  | { type: "status-update" }
  | { type: "paused" }
  | { type: "resumed" }

export type AntiRsiEventListener = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void

const mergeConfig = (override?: Partial<AntiRsiConfig>): AntiRsiConfig => {
  const base: AntiRsiConfig = {
    mini: {
      intervalSeconds: 4 * 60,
      durationSeconds: 13,
    },
    work: {
      intervalSeconds: 50 * 60,
      durationSeconds: 8 * 60,
      postponeSeconds: 10 * 60,
    },
    tickIntervalMs: 500,
    naturalBreakContinuationWindowSeconds: 30,
  }

  if (!override) {
    return base
  }

  return {
    mini: { ...base.mini, ...(override.mini ?? {}) },
    work: { ...base.work, ...(override.work ?? {}) },
    tickIntervalMs: override.tickIntervalMs ?? base.tickIntervalMs,
    naturalBreakContinuationWindowSeconds:
      override.naturalBreakContinuationWindowSeconds ?? base.naturalBreakContinuationWindowSeconds,
  }
}

export const defaultConfig = (): AntiRsiConfig => mergeConfig()
