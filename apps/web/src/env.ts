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
export const isElectron = getWindowWithApi()?.api?.antirsi !== undefined

export const getDesktopWindowApi = (): AntiRsiWindowApi | undefined => getWindowWithApi()?.api
