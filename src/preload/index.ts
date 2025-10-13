import { Effect, Stream, Chunk } from 'effect'
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from '../common/antirsi-core'
import { IPC_EVENTS, IPC_ACTIONS } from '../common/actions'

// Custom APIs for renderer
type AntiRsiRendererCallback = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void
type AntiRsiConfigCallback = (config: AntiRsiConfig) => void

export const antirsi = {
  getSnapshot: (): Promise<AntiRsiSnapshot> => ipcRenderer.invoke(IPC_ACTIONS.GET_SNAPSHOT),

  getConfig: (): Promise<AntiRsiConfig> => ipcRenderer.invoke(IPC_ACTIONS.GET_CONFIG),

  setConfig: (config: Partial<AntiRsiConfig>): Promise<AntiRsiConfig | undefined> =>
    ipcRenderer.invoke(IPC_ACTIONS.SET_CONFIG, config),

  resetConfigToDefaults: (): Promise<AntiRsiConfig | undefined> =>
    ipcRenderer.invoke(IPC_ACTIONS.RESET_CONFIG_TO_DEFAULTS),

  triggerWorkBreak: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.TRIGGER_WORK_BREAK),

  triggerMicroPause: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.TRIGGER_MICRO_PAUSE),

  postponeWorkBreak: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.POSTPONE_WORK_BREAK),

  skipWorkBreak: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.SKIP_WORK_BREAK),

  pause: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.PAUSE),

  resume: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.RESUME),

  resetTimings: (): Promise<void> => ipcRenderer.invoke(IPC_ACTIONS.RESET_TIMINGS),

  subscribe: (callback: AntiRsiRendererCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      event: AntiRsiEvent,
      snapshot: AntiRsiSnapshot
    ): void => {
      callback(event, snapshot)
    }
    ipcRenderer.on(IPC_EVENTS.EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_EVENTS.EVENT, listener)
  },

  subscribeConfig: (callback: AntiRsiConfigCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AntiRsiConfig): void => {
      callback(config)
    }
    ipcRenderer.on(IPC_EVENTS.CONFIG, listener)
    return () => ipcRenderer.removeListener(IPC_EVENTS.CONFIG, listener)
  }
}

// Enhanced preload/index.ts

export const processes = {
  getProcesses: (): Promise<string[] | undefined> => ipcRenderer.invoke(IPC_ACTIONS.GET_PROCESSES),

  // Keep existing callback-based for backward compatibility
  subscribe: (callback: (processes: string[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, list: string[]): void => {
      callback(list)
    }
    ipcRenderer.on(IPC_EVENTS.PROCESSES_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_EVENTS.PROCESSES_UPDATE, listener)
  },

  // New stream-based subscription
  subscribeStream: () =>
    Stream.async<string[]>((emit) => {
      const listener = (_event: Electron.IpcRendererEvent, list: string[]) => {
        emit(Effect.succeed(Chunk.of(list)))
      }

      ipcRenderer.on(IPC_EVENTS.PROCESSES_UPDATE, listener)

      return Effect.sync(() => {
        ipcRenderer.removeListener(IPC_EVENTS.PROCESSES_UPDATE, listener)
      })
    })
}

export const api = {
  antirsi,
  processes
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('antirsi', antirsi)
    contextBridge.exposeInMainWorld('processes', processes)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.antirsi = antirsi
  // @ts-ignore (define in dts)
  window.processes = processes
}
