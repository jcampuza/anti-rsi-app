import type { AntiRsiDesktopBridge, AntiRsiRuntimeMeta } from "@antirsi/contracts"

import { resolveApiBaseUrl } from "~/lib/api-base-url"
import { createAntiRsiHttpClient } from "~/lib/antirsi-http-client"
import { getDesktopWindowApi } from "~/env"

/**
 * Resolves the Anti RSI client used by the UI via the loopback or configured HTTP API.
 */
export function resolveAntiRsiClient(): AntiRsiDesktopBridge {
  return createAntiRsiHttpClient(resolveApiBaseUrl())
}

export function resolveWindowMeta(): AntiRsiRuntimeMeta {
  return (
    getDesktopWindowApi()?.meta ?? {
      versions: {},
    }
  )
}
