import type { antirsi, api } from './index'

export type AntiRsiRendererApi = typeof antirsi
export type ApiType = typeof api

declare global {
  interface Window {
    api: ApiType
  }
}
