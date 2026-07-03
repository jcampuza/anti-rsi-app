import type { Action } from "@antirsi/core"
import type { AntiRsiDesktopBridge, ApiErrorBody, MainEvent } from "@antirsi/contracts"
import { API_ROUTES } from "@antirsi/contracts"

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

const apiUrl = (baseUrl: string, route: string): URL => new URL(route, baseUrl)

const jsonFetch = async <T>(url: URL): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function createAntiRsiHttpClient(baseUrl: string): AntiRsiDesktopBridge {
  const getSnapshot = () =>
    jsonFetch<Awaited<ReturnType<AntiRsiDesktopBridge["getSnapshot"]>>>(
      apiUrl(baseUrl, API_ROUTES.SNAPSHOT),
    )

  const getConfig = () =>
    jsonFetch<Awaited<ReturnType<AntiRsiDesktopBridge["getConfig"]>>>(
      apiUrl(baseUrl, API_ROUTES.CONFIG),
    )

  const getProcesses = () =>
    jsonFetch<Awaited<ReturnType<AntiRsiDesktopBridge["getProcesses"]>>>(
      apiUrl(baseUrl, API_ROUTES.PROCESSES),
    )

  const dispatch = async (action: Action): Promise<void> => {
    const response = await fetch(apiUrl(baseUrl, API_ROUTES.COMMAND), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    })
    if (!response.ok) {
      throw new Error(await commandErrorMessage(response, `Command failed (${response.status})`))
    }
  }

  const subscribeAll = (callback: (payload: MainEvent) => void): (() => void) => {
    const source = new EventSource(apiUrl(baseUrl, API_ROUTES.EVENTS).href)

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
