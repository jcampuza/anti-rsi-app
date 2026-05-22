import type { AntiRsiWindowApi } from "@antirsi/contracts"

type WindowWithApi = Window & { api?: AntiRsiWindowApi }

const getWindowWithApi = (): WindowWithApi | undefined => {
  if (typeof window === "undefined") {
    return undefined
  }
  return window as WindowWithApi
}

/**
 * True when running inside the Electron preload bridge.
 * The preload exposes `window.api` before any web code runs.
 */
export const hasDesktopBridge = (): boolean => getWindowWithApi()?.api !== undefined

/** @deprecated Use hasDesktopBridge */
export const isElectron = hasDesktopBridge

export const getDesktopWindowApi = (): AntiRsiWindowApi | undefined => getWindowWithApi()?.api
