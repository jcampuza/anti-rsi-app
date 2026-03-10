import { contextBridge, ipcRenderer } from "electron"
import type { AntiRsiDesktopBridge, AntiRsiWindowApi, MainEvent } from "@antirsi/contracts"
import { IPC_EVENTS, IPC_ACTIONS } from "@antirsi/contracts"
import type { Action, AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"

const RENDERER_LOG_CHANNEL = "__ANTIRSI_RENDERER_LOG__"

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

const reportRendererError = (type: string, detail: unknown): void => {
  ipcRenderer.send(RENDERER_LOG_CHANNEL, {
    type,
    detail:
      detail instanceof Error
        ? { name: detail.name, message: detail.message, stack: detail.stack }
        : detail,
  })
}

window.addEventListener("error", (event) => {
  reportRendererError("window.error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error:
      event.error instanceof Error
        ? { name: event.error.name, message: event.error.message, stack: event.error.stack }
        : event.error,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  reportRendererError("window.unhandledrejection", event.reason)
})

try {
  contextBridge.exposeInMainWorld("api", api)
} catch (error) {
  reportRendererError("contextBridge.exposeInMainWorld.failed", error)
  console.error(error)
}
