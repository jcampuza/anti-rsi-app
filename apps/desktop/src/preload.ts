import { contextBridge, ipcRenderer } from "electron"
import type { AntiRsiDesktopBridge, AntiRsiWindowApi, MainEvent } from "@antirsi/contracts"
import { IPC_EVENTS, IPC_ACTIONS } from "@antirsi/contracts"
import type { Action, AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"

export const antirsi: AntiRsiDesktopBridge = {
  getSnapshot: (): Promise<AntiRsiSnapshot> => ipcRenderer.invoke(IPC_ACTIONS.GET_SNAPSHOT),

  getConfig: (): Promise<AntiRsiConfig> => ipcRenderer.invoke(IPC_ACTIONS.GET_CONFIG),

  getProcesses: (): Promise<string[]> => ipcRenderer.invoke(IPC_ACTIONS.GET_PROCESSES),

  dispatch: (action: Action): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.COMMAND, action),

  subscribeAll: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: MainEvent): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_EVENTS.EVENT, listener)
    void ipcRenderer.invoke(IPC_ACTIONS.SUBSCRIBE_ALL)
    return () => ipcRenderer.removeListener(IPC_EVENTS.EVENT, listener)
  },
}

export const api: AntiRsiWindowApi = {
  antirsi,
  meta: {
    versions: process.versions,
  },
}

try {
  contextBridge.exposeInMainWorld("api", api)
} catch (error) {
  console.error(error)
}
