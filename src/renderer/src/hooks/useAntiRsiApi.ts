import { useMemo } from 'react'

export type AntiRsiRendererApi = Window['antirsi']
export type ProcessesRendererApi = Window['processes']

const useAntiRsiApi = (): AntiRsiRendererApi => {
  return useMemo(() => window.api.antirsi, [])
}

export default useAntiRsiApi
