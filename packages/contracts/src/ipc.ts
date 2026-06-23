import type { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from "@antirsi/core"

export const IPC_EVENTS = {
  EVENT: "antirsi:event",
  OVERLAY_BREAK: "antirsi:overlay-break",
  CONFIG: "antirsi:config",
  PROCESSES_UPDATE: "antirsi:processes-update",
} as const

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]

export interface SnapshotEventMeta {
  sequence: number
  serverMonotonicMs: number
}

type SnapshotEventPayload = {
  snapshot: AntiRsiSnapshot
  meta?: SnapshotEventMeta
}

export type MainEvent =
  | ({ type: "antirsi"; event: AntiRsiEvent } & SnapshotEventPayload)
  | ({ type: "timers-paused" } & SnapshotEventPayload)
  | ({ type: "timers-resumed" } & SnapshotEventPayload)
  | { type: "config-changed"; config: AntiRsiConfig }
  | { type: "processes-updated"; list: string[] }
  | ({ type: "init"; config: AntiRsiConfig; processes: string[] } & SnapshotEventPayload)
