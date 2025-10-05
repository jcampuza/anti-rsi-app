import { AntiRsiSnapshot } from '../../../common/antirsi-core'
import useAntiRsiApi, { AntiRsiRendererApi } from './useAntiRsiApi'
import { useAntiRsiStore } from '@renderer/stores/antirsi'

interface UseAntiRsiResult {
  snapshot: AntiRsiSnapshot | null
  api: AntiRsiRendererApi
}

export const useAntiRsi = (): UseAntiRsiResult => {
  const api = useAntiRsiApi()
  const snapshot = useAntiRsiStore((s) => s.snapshot)

  return {
    snapshot,
    api
  }
}
