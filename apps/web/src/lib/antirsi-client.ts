import type { AntiRsiDesktopBridge, AntiRsiRuntimeMeta } from "@antirsi/contracts"

import { getDesktopWindowApi, isElectron } from "~/env"

const configuredApiBaseUrl = (): string | undefined => {
  const value = import.meta.env.VITE_API_BASE_URL?.trim()
  return value && value.length > 0 ? value : undefined
}

/**
 * Resolves the Anti RSI client used by the UI.
 * Today: Electron IPC bridge. Later: HTTP client when `VITE_API_BASE_URL` is set.
 */
export function resolveAntiRsiClient(): AntiRsiDesktopBridge {
  const desktopApi = getDesktopWindowApi()?.antirsi
  if (isElectron && desktopApi) {
    return desktopApi
  }

  const apiBaseUrl = configuredApiBaseUrl()
  if (apiBaseUrl) {
    throw new Error(
      `HTTP API client is not implemented yet (VITE_API_BASE_URL=${apiBaseUrl}). Use the desktop app or Electron IPC for now.`,
    )
  }

  throw new Error(
    isElectron
      ? "Desktop bridge is unavailable."
      : "Anti RSI requires the desktop app, or set VITE_API_BASE_URL when a hosted API is available.",
  )
}

export function resolveWindowMeta(): AntiRsiRuntimeMeta {
  return (
    getDesktopWindowApi()?.meta ?? {
      versions: {},
    }
  )
}
