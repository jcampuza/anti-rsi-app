import { useEffect, useMemo, useState } from 'react'
import { AntiRsiSnapshot } from '../../../common/antirsi-core'
import useAntiRsiApi, { AntiRsiRendererApi } from './useAntiRsiApi'

interface UseAntiRsiResult {
  snapshot: AntiRsiSnapshot | null
  api: AntiRsiRendererApi | undefined
}

const useAntiRsi = (): UseAntiRsiResult => {
  const api = useAntiRsiApi()
  const [snapshot, setSnapshot] = useState<AntiRsiSnapshot | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let mounted = true

    const initialise = async (): Promise<void> => {
      if (!api) {
        return
      }
      const initialSnapshot = await api.getSnapshot()
      if (mounted && initialSnapshot) {
        setSnapshot(initialSnapshot)
      }
      unsubscribe = api.subscribe((event, newSnapshot) => {
        if (event.type === 'status-update' || event.type === 'break-update') {
          setSnapshot(newSnapshot)
        }
      })
    }

    initialise().catch((error) => {
      console.error('[AntiRSI] Failed to initialise renderer state', error)
    })

    return () => {
      mounted = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [api])

  return useMemo(
    () => ({
      snapshot,
      api
    }),
    [api, snapshot]
  )
}

export default useAntiRsi
