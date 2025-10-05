import { create } from 'zustand'
import type { AntiRsiConfig, AntiRsiEvent, AntiRsiSnapshot } from '../../../common/antirsi-core'
import type { AntiRsiRendererApi } from '@renderer/hooks/useAntiRsiApi'

interface AntiRsiState {
  snapshot: AntiRsiSnapshot | null
  config: AntiRsiConfig | null
  initialized: boolean
  init: () => void
  setConfig: (config: Partial<AntiRsiConfig>) => Promise<void>
  triggerWorkBreak: () => Promise<void>
  postponeWorkBreak: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  resetTimings: () => Promise<void>
}

const getApi = (): AntiRsiRendererApi => window.api.antirsi

export const useAntiRsiStore = create<AntiRsiState>((set, get) => ({
  snapshot: null,
  config: null,
  initialized: false,
  init: () => {
    if (get().initialized) {
      return
    }
    const api = getApi()

    api
      .getSnapshot()
      .then((initial) => {
        if (initial) set({ snapshot: initial })
      })
      .catch(() => {})

    api
      .getConfig()
      .then((initial) => {
        if (initial) set({ config: initial })
      })
      .catch(() => {})

    api.subscribe((event: AntiRsiEvent, next: AntiRsiSnapshot) => {
      if (event.type === 'status-update' || event.type === 'break-update') {
        set({ snapshot: next })
      }
    })

    api.subscribeConfig((nextConfig: AntiRsiConfig) => {
      set({ config: nextConfig })
    })

    set({ initialized: true })
  },
  setConfig: async (config: Partial<AntiRsiConfig>) => {
    const api = getApi()
    const updated = await api.setConfig(config)
    if (updated) set({ config: updated })
  },
  triggerWorkBreak: async () => {
    const api = getApi()
    await api.triggerWorkBreak()
  },
  postponeWorkBreak: async () => {
    const api = getApi()
    await api.postponeWorkBreak()
  },
  pause: async () => {
    const api = getApi()
    await api.pause()
  },
  resume: async () => {
    const api = getApi()
    await api.resume()
  },
  resetTimings: async () => {
    const api = getApi()
    await api.resetTimings()
  }
}))
