import { ElectronAPI } from '@electron-toolkit/preload'
import { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from '../common/antirsi-core'
import { Effect, Stream } from 'effect'

// Import the actual implementations to infer types
import type { antirsi, processes, api } from './index'

// Infer types from the actual implementations
export type AntiRsiRendererApi = typeof antirsi
export type ProcessesRendererApi = typeof processes
export type ApiType = typeof api

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiType
    antirsi: AntiRsiRendererApi
    processes: ProcessesRendererApi
  }
}
