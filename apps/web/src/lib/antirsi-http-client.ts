import type { ApiAppType } from "@antirsi/server"
import type { AntiRsiDesktopBridge, ApiErrorBody, MainEvent } from "@antirsi/contracts"
import type { Action } from "@antirsi/core"
import { hc, parseResponse } from "hono/client"

const commandErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = (await response.json()) as ApiErrorBody
    if (body.message) {
      return body.message
    }
  } catch {
    // ignore parse errors for error bodies
  }
  return fallback
}

export function createAntiRsiHttpClient(baseUrl: string): AntiRsiDesktopBridge {
  const client = hc<ApiAppType>(baseUrl)

  const getSnapshot = () => parseResponse(client.snapshot.$get())

  const getConfig = () => parseResponse(client.config.$get())

  const getProcesses = () => parseResponse(client.processes.$get())

  const dispatch = async (action: Action): Promise<void> => {
    const response = await client.command.$post({ json: action })
    if (!response.ok) {
      throw new Error(await commandErrorMessage(response, `Command failed (${response.status})`))
    }
  }

  const subscribeAll = (callback: (payload: MainEvent) => void): (() => void) => {
    const source = new EventSource(client.events.$url().href)

    source.onmessage = (event) => {
      try {
        callback(JSON.parse(event.data) as MainEvent)
      } catch {
        // ignore malformed SSE payloads
      }
    }

    source.onerror = () => {
      // Keep the stream open so EventSource can reconnect after transient
      // interruptions such as system sleep. The API sends a fresh init snapshot
      // whenever a new SSE connection is established.
    }

    return () => {
      source.close()
    }
  }

  return {
    getSnapshot,
    getConfig,
    getProcesses,
    dispatch,
    subscribeAll,
  }
}
