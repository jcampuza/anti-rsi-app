import type { AntiRsiConfig } from '../../../common/antirsi-core'
import { useAntiRsiStore } from '@renderer/stores/antirsi'

export const useConfig = (): AntiRsiConfig | null => {
  const config = useAntiRsiStore((s) => s.config)

  return config
}
