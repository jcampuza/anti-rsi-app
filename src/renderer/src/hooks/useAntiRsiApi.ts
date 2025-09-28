import { useMemo } from 'react'

export type AntiRsiRendererApi = Window['antirsi']

const useAntiRsiApi = (): AntiRsiRendererApi | undefined => {
  return useMemo(() => window.antirsi ?? window.api?.antirsi, [])
}

export default useAntiRsiApi
