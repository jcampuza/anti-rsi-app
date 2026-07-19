import { type AntiRsiConfig } from "../antirsi-core"

export type TickAction = {
  type: "TICK"
  idleSeconds: number
  dtSeconds: number
}

export type SetConfigAction = {
  type: "SET_CONFIG"
  config: Partial<AntiRsiConfig>
}

export type ResetTimingsAction = {
  type: "RESET_TIMINGS"
}

export type StartMiniBreakAction = {
  type: "START_MINI_BREAK"
}

export type EndMiniBreakAction = {
  type: "END_MINI_BREAK"
}

export type StartWorkBreakAction = {
  type: "START_WORK_BREAK"
  naturalContinuation: boolean
}

export type EndWorkBreakAction = {
  type: "END_WORK_BREAK"
}

export type AckBreakVisibleAction = {
  type: "ACK_BREAK_VISIBLE"
  breakType: "mini" | "work"
}

export type PostponeWorkBreakAction = {
  type: "POSTPONE_WORK_BREAK"
}

export type PostponeBreakAction = {
  type: "POSTPONE_BREAK"
  breakType: "mini" | "work"
}

export type SetUserPausedAction = {
  type: "SET_USER_PAUSED"
  value: boolean
}

export type AddInhibitorAction = {
  type: "ADD_INHIBITOR"
  id: string
}

export type RemoveInhibitorAction = {
  type: "REMOVE_INHIBITOR"
  id: string
}

export type SetProcessesAction = {
  type: "SET_PROCESSES"
  processes: string[]
}

export type ResetConfigAction = {
  type: "RESET_CONFIG"
}

export type Action =
  | TickAction
  | SetConfigAction
  | ResetTimingsAction
  | StartMiniBreakAction
  | EndMiniBreakAction
  | StartWorkBreakAction
  | EndWorkBreakAction
  | AckBreakVisibleAction
  | PostponeWorkBreakAction
  | PostponeBreakAction
  | SetUserPausedAction
  | AddInhibitorAction
  | RemoveInhibitorAction
  | SetProcessesAction
  | ResetConfigAction
