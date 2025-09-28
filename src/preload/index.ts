import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from '../common/antirsi-core'
import { AntiRsiRendererApi } from './index.d'

// Custom APIs for renderer
type AntiRsiRendererCallback = (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void
type AntiRsiConfigCallback = (config: AntiRsiConfig) => void

const antirsi: AntiRsiRendererApi = {
  getSnapshot: (): Promise<AntiRsiSnapshot | undefined> =>
    ipcRenderer.invoke('antirsi:get-snapshot'),

  getConfig: (): Promise<AntiRsiConfig | undefined> => ipcRenderer.invoke('antirsi:get-config'),

  setConfig: (config: Partial<AntiRsiConfig>): Promise<AntiRsiConfig | undefined> =>
    ipcRenderer.invoke('antirsi:set-config', config),

  triggerWorkBreak: (): Promise<void> => ipcRenderer.invoke('antirsi:trigger-work-break'),

  postponeWorkBreak: (): Promise<void> => ipcRenderer.invoke('antirsi:postpone-work-break'),

  pause: (): Promise<void> => ipcRenderer.invoke('antirsi:pause'),

  resume: (): Promise<void> => ipcRenderer.invoke('antirsi:resume'),

  resetTimings: (): Promise<void> => ipcRenderer.invoke('antirsi:reset-timings'),

  subscribe: (callback: AntiRsiRendererCallback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      event: AntiRsiEvent,
      snapshot: AntiRsiSnapshot
    ): void => {
      callback(event, snapshot)
    }
    ipcRenderer.on('antirsi:event', listener)
    return () => ipcRenderer.removeListener('antirsi:event', listener)
  },

  subscribeConfig: (callback: AntiRsiConfigCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AntiRsiConfig): void => {
      callback(config)
    }
    ipcRenderer.on('antirsi:config', listener)
    return () => ipcRenderer.removeListener('antirsi:config', listener)
  }
}

const api = {
  antirsi
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('antirsi', antirsi)
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
}
