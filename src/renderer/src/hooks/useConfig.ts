import { useEffect, useState } from 'react'
import type { AntiRsiConfig } from '../../../common/antirsi-core'
import useAntiRsiApi from './useAntiRsiApi'

export const useConfig = (): AntiRsiConfig | null => {
  const api = useAntiRsiApi()
  const [config, setConfig] = useState<AntiRsiConfig | null>(null)

  useEffect(() => {
    if (!api) {
      return
    }

    let mounted = true
    const unsubscribe = api.subscribeConfig((nextConfig) => {
      if (mounted) {
        setConfig(nextConfig)
      }
    })

    api
      .getConfig()
      .then((initialConfig) => {
        if (mounted && initialConfig) {
          setConfig(initialConfig)
        }
      })
      .catch((error) => {
        console.error('[AntiRSI] Failed to load config', error)
      })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [api])

  return config
}

export default useConfig
