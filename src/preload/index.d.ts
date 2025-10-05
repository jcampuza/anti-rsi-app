import { ElectronAPI } from '@electron-toolkit/preload'
import { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from '../common/antirsi-core'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      antirsi: AntiRsiRendererApi
      processes: ProcessesRendererApi
    }
    antirsi: AntiRsiRendererApi
    processes: ProcessesRendererApi
  }
}

export interface AntiRsiRendererApi {
  getSnapshot: () => Promise<AntiRsiSnapshot | undefined>
  getConfig: () => Promise<AntiRsiConfig | undefined>
  setConfig: (config: Partial<AntiRsiConfig>) => Promise<AntiRsiConfig | undefined>
  triggerWorkBreak: () => Promise<void>
  postponeWorkBreak: () => Promise<void>
  skipWorkBreak: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  resetTimings: () => Promise<void>
  subscribe: (callback: (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void) => () => void
  subscribeConfig: (callback: (config: AntiRsiConfig) => void) => () => void
}

export interface ProcessesRendererApi {
  getProcesses: () => Promise<string[] | undefined>
  subscribe: (callback: (processes: string[]) => void) => () => void
}
