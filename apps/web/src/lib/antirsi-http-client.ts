import { API_ROUTES, type AntiRsiDesktopBridge, type ApiErrorBody, type MainEvent } from "@antirsi/contracts"
import type { Action, AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as ApiErrorBody
      if (body.message) {
        message = body.message
      }
    } catch {
      // ignore parse errors for error bodies
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

const apiUrl = (baseUrl: string, route: string): string => new URL(route, baseUrl).href

export function createAntiRsiHttpClient(baseUrl: string): AntiRsiDesktopBridge {
  const getSnapshot = async (): Promise<AntiRsiSnapshot> => {
    const response = await fetch(apiUrl(baseUrl, API_ROUTES.SNAPSHOT))
    return parseJson<AntiRsiSnapshot>(response)
  }

  const getConfig = async (): Promise<AntiRsiConfig> => {
    const response = await fetch(apiUrl(baseUrl, API_ROUTES.CONFIG))
    return parseJson<AntiRsiConfig>(response)
  }

  const getProcesses = async (): Promise<string[]> => {
    const response = await fetch(apiUrl(baseUrl, API_ROUTES.PROCESSES))
    return parseJson<string[]>(response)
  }

  const dispatch = async (action: Action): Promise<void> => {
    const response = await fetch(apiUrl(baseUrl, API_ROUTES.COMMAND), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    })

    if (!response.ok) {
      let message = `Command failed (${response.status})`
      try {
        const body = (await response.json()) as ApiErrorBody
        if (body.message) {
          message = body.message
        }
      } catch {
        // ignore parse errors for error bodies
      }
      throw new Error(message)
    }
  }

  const subscribeAll = (callback: (payload: MainEvent) => void): (() => void) => {
    const source = new EventSource(apiUrl(baseUrl, API_ROUTES.EVENTS))

    source.onmessage = (event) => {
      try {
        callback(JSON.parse(event.data) as MainEvent)
      } catch {
        // ignore malformed SSE payloads
      }
    }

    source.onerror = () => {
      source.close()
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
