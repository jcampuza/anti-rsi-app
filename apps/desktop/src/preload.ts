import { contextBridge, ipcRenderer } from "electron"
import type { AntiRsiWindowApi } from "@antirsi/contracts"

const RENDERER_LOG_CHANNEL = "__ANTIRSI_RENDERER_LOG__"

const rendererBaseUrl = (() => {
  const configured =
    process.env['ANTIRSI_RENDERER_URL']?.trim() ?? process.env['VITE_DEV_SERVER_URL']?.trim()
  if (!configured) {
    return undefined
  }
  return configured.endsWith('/') ? configured : `${configured}/`
})()

const apiBaseUrl = (() => {
  const configured = process.env['ANTIRSI_API_BASE_URL']?.trim()
  if (!configured) {
    return undefined
  }
  return configured.endsWith('/') ? configured : `${configured}/`
})()

export const api: AntiRsiWindowApi = {
  meta: {
    versions: process.versions,
    ...(rendererBaseUrl ? { rendererBaseUrl } : {}),
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
  },
}

const reportRendererError = (type: string, detail: unknown): void => {
  ipcRenderer.send(RENDERER_LOG_CHANNEL, {
    type,
    detail:
      detail instanceof Error
        ? { name: detail.name, message: detail.message, stack: detail.stack }
        : detail,
  })
}

window.addEventListener("error", (event) => {
  reportRendererError("window.error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error:
      event.error instanceof Error
        ? { name: event.error.name, message: event.error.message, stack: event.error.stack }
        : event.error,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  reportRendererError("window.unhandledrejection", event.reason)
})

if (!apiBaseUrl) {
  reportRendererError("preload.missing-api-base-url", {
    message: "ANTIRSI_API_BASE_URL is not set; the HTTP API client cannot connect.",
  })
}

try {
  contextBridge.exposeInMainWorld("api", api)
} catch (error) {
  reportRendererError("contextBridge.exposeInMainWorld.failed", error)
  console.error(error)
}
