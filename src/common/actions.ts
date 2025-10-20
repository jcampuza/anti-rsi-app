import type { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from './antirsi-core'
// IPC event constants for AntiRSI application

// Main process -> Renderer events
export const IPC_EVENTS = {
  EVENT: 'antirsi:event',
  OVERLAY_BREAK: 'antirsi:overlay-break',
  CONFIG: 'antirsi:config',
  PROCESSES_UPDATE: 'antirsi:processes-update'
} as const

// Renderer -> Main process actions
export const IPC_ACTIONS = {
  GET_SNAPSHOT: 'antirsi:get-snapshot',
  GET_CONFIG: 'antirsi:get-config',
  GET_PROCESSES: 'antirsi:get-processes',
  SUBSCRIBE_ALL: 'antirsi:subscribe-all',
  COMMAND: 'antirsi:command'
} as const

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]
export type IpcAction = (typeof IPC_ACTIONS)[keyof typeof IPC_ACTIONS]

// Unified main->renderer event bus payload
export type MainEvent =
  | { type: 'antirsi'; event: AntiRsiEvent; snapshot: AntiRsiSnapshot }
  | { type: 'config-changed'; config: AntiRsiConfig }
  | { type: 'processes-updated'; list: string[] }
  | { type: 'init'; config: AntiRsiConfig; snapshot: AntiRsiSnapshot; processes: string[] }
