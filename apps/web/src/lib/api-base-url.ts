import { getDesktopWindowApi, hasDesktopBridge } from "~/env"

let resolvedApiBaseUrl: string | undefined

const normalizeBaseUrl = (value: string): string => (value.endsWith("/") ? value : `${value}/`)

const configuredViteApiBaseUrl = (): string | undefined => {
  const value = import.meta.env.VITE_API_BASE_URL?.trim()
  return value && value.length > 0 ? normalizeBaseUrl(value) : undefined
}

export function resolveApiBaseUrl(): string {
  if (resolvedApiBaseUrl) {
    return resolvedApiBaseUrl
  }

  const fromBridge = getDesktopWindowApi()?.meta?.apiBaseUrl?.trim()
  if (fromBridge) {
    resolvedApiBaseUrl = normalizeBaseUrl(fromBridge)
    return resolvedApiBaseUrl
  }

  const fromVite = configuredViteApiBaseUrl()
  if (fromVite) {
    resolvedApiBaseUrl = fromVite
    return resolvedApiBaseUrl
  }

  if (hasDesktopBridge()) {
    throw new Error(
      "Desktop bridge is available but apiBaseUrl is missing. Restart the desktop app.",
    )
  }

  throw new Error(
    "Anti RSI API URL is not configured. Run the desktop app, or set VITE_API_BASE_URL for a hosted API.",
  )
}
