import type { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from "@antirsi/core"

export const IPC_EVENTS = {
  EVENT: "antirsi:event",
  OVERLAY_BREAK: "antirsi:overlay-break",
  CONFIG: "antirsi:config",
  PROCESSES_UPDATE: "antirsi:processes-update",
} as const

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]

export type MainEvent =
  | { type: "antirsi"; event: AntiRsiEvent; snapshot: AntiRsiSnapshot }
  | { type: "timers-paused"; snapshot: AntiRsiSnapshot }
  | { type: "timers-resumed"; snapshot: AntiRsiSnapshot }
  | { type: "config-changed"; config: AntiRsiConfig }
  | { type: "processes-updated"; list: string[] }
  | { type: "init"; config: AntiRsiConfig; snapshot: AntiRsiSnapshot; processes: string[] }
