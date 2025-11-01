// (no-op)
import { contextBridge, ipcRenderer } from "electron"
import { type AntiRsiConfig, type AntiRsiSnapshot } from "../common/antirsi-core"
import { IPC_EVENTS, IPC_ACTIONS, MainEvent } from "../common/actions"
import { type Action } from "../common/store/actions"

// Custom APIs for renderer
type MainEventCallback = (payload: MainEvent) => void

export const antirsi = {
  getSnapshot: (): Promise<AntiRsiSnapshot> => ipcRenderer.invoke(IPC_ACTIONS.GET_SNAPSHOT),

  getConfig: (): Promise<AntiRsiConfig> => ipcRenderer.invoke(IPC_ACTIONS.GET_CONFIG),

  getProcesses: (): Promise<string[]> => ipcRenderer.invoke(IPC_ACTIONS.GET_PROCESSES),

  // New unified command channel
  dispatch: (action: Action): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.COMMAND, action),

  // Unified subscription: renderer receives MainEvent payloads
  subscribeAll: (callback: MainEventCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: MainEvent): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_EVENTS.EVENT, listener)
    // Ask main for a one-shot init event, then continue streaming
    void ipcRenderer.invoke(IPC_ACTIONS.SUBSCRIBE_ALL)
    return () => ipcRenderer.removeListener(IPC_EVENTS.EVENT, listener)
  },
}

// Enhanced preload/index.ts

export const api = {
  antirsi,
  meta: {
    versions: process.versions,
  },
}

// With contextIsolation and sandbox enabled, always expose via contextBridge
try {
  contextBridge.exposeInMainWorld("api", api)
} catch (error) {
  console.error(error)
}
