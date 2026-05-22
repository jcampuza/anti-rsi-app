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
  /** Loopback HTTP API base URL (desktop) or hosted API (via VITE_API_BASE_URL). */
  apiBaseUrl?: string
}

/** Preload exposes runtime meta only; data access uses the HTTP client. */
export interface AntiRsiWindowApi {
  meta: AntiRsiRuntimeMeta
}
