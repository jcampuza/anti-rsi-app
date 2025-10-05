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
  SET_CONFIG: 'antirsi:set-config',
  TRIGGER_WORK_BREAK: 'antirsi:trigger-work-break',
  POSTPONE_WORK_BREAK: 'antirsi:postpone-work-break',
  SKIP_WORK_BREAK: 'antirsi:skip-work-break',
  PAUSE: 'antirsi:pause',
  RESUME: 'antirsi:resume',
  RESET_TIMINGS: 'antirsi:reset-timings',
  GET_PROCESSES: 'antirsi:get-processes'
} as const

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]
export type IpcAction = (typeof IPC_ACTIONS)[keyof typeof IPC_ACTIONS]
