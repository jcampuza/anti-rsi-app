/// <reference types="vite/client" />

import type { AntiRsiWindowApi } from "@antirsi/contracts"

declare global {
  interface Window {
    api: AntiRsiWindowApi
  }
}
