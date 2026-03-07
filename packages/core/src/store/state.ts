import { type AntiRsiConfig, type AntiRsiState, type AntiRsiTimings } from "../antirsi-core"

export interface StoreState {
  status: AntiRsiState
  timings: AntiRsiTimings
  lastIdleSeconds: number
  lastUpdatedSeconds: number
  config: AntiRsiConfig
  userPaused: boolean
  inhibitors: Set<string>
  processes: string[]
}
