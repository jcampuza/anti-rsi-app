import type { Action, AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"
import type { MainEvent } from "./ipc"

export type MainEventCallback = (payload: MainEvent) => void

export interface AntiRsiDesktopBridge {
  getSnapshot: () => Promise<AntiRsiSnapshot>
  getConfig: () => Promise<AntiRsiConfig>
  getProcesses: () => Promise<string[]>
  dispatch: (action: Action) => Promise<void>
  subscribeAll: (callback: MainEventCallback) => () => void
}

export interface AntiRsiWindowApi {
  antirsi: AntiRsiDesktopBridge
  meta: {
    versions: Record<string, string | undefined>
  }
}
