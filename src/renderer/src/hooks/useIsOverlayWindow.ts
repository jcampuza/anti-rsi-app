import { useEffect, useState } from 'react'

const useIsOverlayWindow = (): boolean => {
  const [isOverlay, setIsOverlay] = useState<boolean>(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const searchParams = new URLSearchParams(hash)
    return searchParams.has('overlay')
  })

  useEffect((): (() => void) => {
    const handleHashChange = (): void => {
      const hash = window.location.hash.replace(/^#/, '')
      const searchParams = new URLSearchParams(hash)
      setIsOverlay(searchParams.has('overlay'))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return isOverlay
}

export default useIsOverlayWindow
