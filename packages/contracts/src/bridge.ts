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

export interface AntiRsiRuntimeMeta {
  versions: Record<string, string | undefined>
  /** Set when the UI is loaded over HTTP (dev server or desktop loopback static server). */
  rendererBaseUrl?: string
  /** Reserved for a future hosted or loopback HTTP API (replaces IPC). */
  apiBaseUrl?: string
}

export interface AntiRsiWindowApi {
  antirsi: AntiRsiDesktopBridge
  meta: AntiRsiRuntimeMeta
}
