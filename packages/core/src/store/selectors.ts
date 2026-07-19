import {
  NATURAL_BREAK_IDLE_FACTOR,
  type AntiRsiBreakWarning,
  type AntiRsiConfig,
  type AntiRsiSnapshot,
  type AntiRsiTimings,
  type BreakType,
} from "../antirsi-core"
import { type StoreState } from "./state"

const cloneTimings = (timings: AntiRsiTimings): AntiRsiTimings => ({
  miniElapsed: timings.miniElapsed,
  miniTaking: timings.miniTaking,
  workElapsed: timings.workElapsed,
  workTaking: timings.workTaking,
})

export const selectConfig = (state: StoreState): AntiRsiConfig => ({
  ...state.config,
  mini: { ...state.config.mini },
  work: { ...state.config.work },
})

export const selectTimings = (state: StoreState): AntiRsiTimings => cloneTimings(state.timings)

export const selectIsPaused = (state: StoreState): boolean =>
  state.userPaused || state.inhibitors.size > 0

export const selectIsIdleNaturalBreak = (state: StoreState): boolean => {
  if (state.status !== "normal") {
    return false
  }

  const idleThresholdSeconds = state.config.mini.durationSeconds * NATURAL_BREAK_IDLE_FACTOR
  return state.lastIdleSeconds > idleThresholdSeconds
}

export const selectTimersRunning = (state: StoreState): boolean =>
  !selectIsPaused(state) && !selectIsIdleNaturalBreak(state)

const breakRemainingSeconds = (state: StoreState, breakType: BreakType): number => {
  if (breakType === "work") {
    return Math.max(state.config.work.intervalSeconds - state.timings.workElapsed, 0)
  }
  return Math.max(state.config.mini.intervalSeconds - state.timings.miniElapsed, 0)
}

const selectNextBreakType = (state: StoreState): BreakType | null => {
  const miniRemaining = breakRemainingSeconds(state, "mini")
  const workRemaining = state.config.work.enabled ? breakRemainingSeconds(state, "work") : Infinity

  if (workRemaining === 0 && miniRemaining === 0) {
    return "work"
  }
  if (workRemaining <= miniRemaining) {
    return "work"
  }
  return "mini"
}

export const selectBreakWarning = (state: StoreState): AntiRsiBreakWarning | null => {
  if (state.status !== "normal" || selectIsPaused(state)) {
    return null
  }

  const breakType = selectNextBreakType(state)
  if (!breakType) {
    return null
  }

  const startsInSeconds = breakRemainingSeconds(state, breakType)
  const leadSeconds = state.config.breakWarningLeadSeconds
  const isWaiting = startsInSeconds === 0 && state.config.waitForActivityPauseBeforeBreak
  if (startsInSeconds > leadSeconds && !isWaiting) {
    return null
  }

  return {
    breakType,
    phase: isWaiting ? "waiting-for-activity-pause" : "countdown",
    startsInSeconds,
    forcedStartInSeconds: isWaiting
      ? Math.max(state.config.maxBreakStartDelaySeconds - state.breakStartDelayElapsed, 0)
      : null,
  }
}

export const selectSnapshot = (state: StoreState): AntiRsiSnapshot => ({
  state: state.status,
  timings: selectTimings(state),
  lastIdleSeconds: state.lastIdleSeconds,
  lastUpdatedSeconds: state.lastUpdatedSeconds,
  paused: selectIsPaused(state),
  timersRunning: selectTimersRunning(state),
  breakWarning: selectBreakWarning(state),
})

export const selectInhibitorCount = (state: StoreState): number => state.inhibitors.size

export const selectProcesses = (state: StoreState): string[] => {
  return state.processes
}
