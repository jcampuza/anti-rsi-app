import { useMemo } from 'react'

export type AntiRsiRendererApi = Window['api']['antirsi']

const useAntiRsiApi = (): AntiRsiRendererApi => {
  return useMemo(() => window.api.antirsi, [])
}

export default useAntiRsiApi
