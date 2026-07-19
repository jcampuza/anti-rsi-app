import { type AntiRsiConfig, type AntiRsiState, type AntiRsiTimings } from "../antirsi-core"

export interface StoreState {
  status: AntiRsiState
  timings: AntiRsiTimings
  /**
   * Whether a pending work break, once acknowledged (or timed out), should
   * preserve already-accrued `workTaking` (natural continuation) instead of
   * starting the break from zero. Only meaningful while status is
   * "pending-work".
   */
  pendingNaturalContinuation: boolean
  lastIdleSeconds: number
  lastUpdatedSeconds: number
  breakStartDelayElapsed: number
  config: AntiRsiConfig
  userPaused: boolean
  inhibitors: Set<string>
  processes: string[]
}
