import { useEffect } from 'react'

export interface UseOverlayModeOptions {
  isEnabled?: boolean
}

export const useOverlayMode = (options?: UseOverlayModeOptions): void => {
  const isEnabled = options?.isEnabled ?? false

  useEffect(() => {
    const body = document.body
    if (!body) {
      return
    }

    if (isEnabled) {
      body.classList.add('overlay-mode')
    } else {
      body.classList.remove('overlay-mode')
    }

    return () => {
      // Ensure we always clean up the overlay mode when unmounting or toggling off
      body.classList.remove('overlay-mode')
    }
  }, [isEnabled])
}
