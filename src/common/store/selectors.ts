import { type AntiRsiConfig, type AntiRsiSnapshot, type AntiRsiTimings } from '../antirsi-core'
import { type StoreState } from './state'

const cloneTimings = (timings: AntiRsiTimings): AntiRsiTimings => ({
  miniElapsed: timings.miniElapsed,
  miniTaking: timings.miniTaking,
  workElapsed: timings.workElapsed,
  workTaking: timings.workTaking
})

export const selectConfig = (state: StoreState): AntiRsiConfig => ({
  mini: { ...state.config.mini },
  work: { ...state.config.work },
  tickIntervalMs: state.config.tickIntervalMs,
  naturalBreakContinuationWindowSeconds: state.config.naturalBreakContinuationWindowSeconds
})

export const selectTimings = (state: StoreState): AntiRsiTimings => cloneTimings(state.timings)

export const selectSnapshot = (state: StoreState): AntiRsiSnapshot => ({
  state: state.status,
  timings: selectTimings(state),
  lastIdleSeconds: state.lastIdleSeconds,
  lastUpdatedSeconds: state.lastUpdatedSeconds,
  paused: selectIsPaused(state)
})

export const selectIsPaused = (state: StoreState): boolean =>
  state.userPaused || state.inhibitors.size > 0

export const selectInhibitorCount = (state: StoreState): number => state.inhibitors.size

export const selectProcesses = (state: StoreState): string[] => {
  return state.processes
}
