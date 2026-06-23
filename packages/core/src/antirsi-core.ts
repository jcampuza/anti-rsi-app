export type { BreakConfig, WorkBreakConfig, AntiRsiConfig } from "./config-schema"
export {
  antiRsiConfigSchema,
  breakConfigSchema,
  workBreakConfigSchema,
  parseAntiRsiConfig,
  BreakConfigSchema,
  WorkBreakConfigSchema,
  AntiRsiConfigSchema,
} from "./config-schema"

import type { AntiRsiConfig } from "./config-schema"

export type BreakType = "mini" | "work"

export type AntiRsiState = "normal" | "pending-mini" | "pending-work" | "in-mini" | "in-work"

export interface AntiRsiTimings {
  miniElapsed: number
  miniTaking: number
  workElapsed: number
  workTaking: number
}

export interface AntiRsiBreakWarning {
  breakType: BreakType
  phase: "countdown" | "waiting-for-activity-pause"
  startsInSeconds: number
  forcedStartInSeconds: number | null
}

export interface AntiRsiSnapshot {
  state: AntiRsiState
  timings: AntiRsiTimings
  lastIdleSeconds: number
  lastUpdatedSeconds: number
  paused: boolean
  timersRunning: boolean
  breakWarning: AntiRsiBreakWarning | null
}

export type AntiRsiEvent =
  | { type: "mini-break-start" }
  | { type: "work-break-start"; naturalContinuation: boolean }
  | { type: "break-update"; breakType: BreakType }
  | { type: "break-end"; breakType: BreakType }
  | { type: "break-warning-start"; breakType: BreakType }
  | { type: "break-warning-update"; breakType: BreakType }
  | { type: "break-warning-end"; breakType: BreakType }
  | { type: "timings-reset" }
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
      enabled: true,
      intervalSeconds: 50 * 60,
      durationSeconds: 8 * 60,
      postponeSeconds: 10 * 60,
    },
    tickIntervalMs: 500,
    naturalBreakContinuationWindowSeconds: 30,
    breakWarningLeadSeconds: 10,
    waitForActivityPauseBeforeBreak: false,
    breakStartGraceSeconds: 2,
    maxBreakStartDelaySeconds: 30,
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
    breakWarningLeadSeconds: override.breakWarningLeadSeconds ?? base.breakWarningLeadSeconds,
    waitForActivityPauseBeforeBreak:
      override.waitForActivityPauseBeforeBreak ?? base.waitForActivityPauseBeforeBreak,
    breakStartGraceSeconds: override.breakStartGraceSeconds ?? base.breakStartGraceSeconds,
    maxBreakStartDelaySeconds:
      override.maxBreakStartDelaySeconds ?? base.maxBreakStartDelaySeconds,
  }
}

export const defaultConfig = (): AntiRsiConfig => mergeConfig()
