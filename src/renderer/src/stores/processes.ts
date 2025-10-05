import { create } from 'zustand'
import type { ProcessesRendererApi } from '@renderer/hooks/useAntiRsiApi'

interface ProcessesState {
  processes: string[]
  initialized: boolean
  init: () => void
}

const getApi = (): ProcessesRendererApi => window.api.processes

export const useProcessesStore = create<ProcessesState>((set, get) => ({
  processes: [],
  initialized: false,
  init: () => {
    if (get().initialized) {
      return
    }
    const api = getApi()

    api
      .getProcesses()
      .then((list) => {
        if (Array.isArray(list)) set({ processes: list })
      })
      .catch(() => {})

    api.subscribe((list) => set({ processes: list }))

    set({ initialized: true })
  }
}))
