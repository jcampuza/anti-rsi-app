import { useMemo } from "react"

export type AntiRsiRendererApi = Window["api"]["antirsi"]

export const useAntiRsiApi = (): AntiRsiRendererApi => {
  return useMemo(() => window.api.antirsi, [])
}
