import type { MainEvent } from "@antirsi/contracts"
import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"
import type { AntiRsiDesktopBridge } from "@antirsi/contracts"
import { resolveAntiRsiClient } from "~/lib/antirsi-client"
import {
  createContext,
  createEffect,
  createResource,
  onCleanup,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js"
import { createStore, reconcile } from "solid-js/store"

export type AntiRsiRendererApi = AntiRsiDesktopBridge

interface AntiRsiState {
  snapshot: AntiRsiSnapshot | undefined
  config: AntiRsiConfig | undefined
  processes: string[]
}

interface AntiRsiContextValue {
  api: AntiRsiRendererApi
  ready: Accessor<boolean>
  loading: Accessor<boolean>
  error: Accessor<unknown | undefined>
  snapshot: Accessor<AntiRsiSnapshot | undefined>
  config: Accessor<AntiRsiConfig | undefined>
  processes: Accessor<string[]>
}

const AntiRsiContext = createContext<AntiRsiContextValue>()

const applyMainEvent = (payload: MainEvent, setState: (patch: Partial<AntiRsiState>) => void): void => {
  switch (payload.type) {
    case "init":
      setState({
        snapshot: payload.snapshot,
        config: payload.config,
        processes: payload.processes,
      })
      break
    case "antirsi":
      setState({ snapshot: payload.snapshot })
      break
    case "config-changed":
      setState({ config: payload.config })
      break
    case "processes-updated":
      setState({ processes: payload.list })
      break
  }
}

export function AntiRsiProvider(props: ParentProps) {
  const api = resolveAntiRsiClient()

  const [state, setState] = createStore<AntiRsiState>({
    snapshot: undefined,
    config: undefined,
    processes: [],
  })

  const [initial] = createResource(async () => {
    const [snapshot, config, processes] = await Promise.all([
      api.getSnapshot(),
      api.getConfig(),
      api.getProcesses(),
    ])
    return { snapshot, config, processes }
  })

  createEffect(() => {
    const data = initial()
    if (!data) return
    setState(
      reconcile({
        snapshot: data.snapshot,
        config: data.config,
        processes: data.processes,
      }),
    )
  })

  createEffect(() => {
    const unsubscribe = api.subscribeAll((payload) => {
      applyMainEvent(payload, (patch) => setState(patch))
    })
    onCleanup(() => unsubscribe())
  })

  const value: AntiRsiContextValue = {
    api,
    ready: () => initial.state === "ready" && state.snapshot !== undefined && state.config !== undefined,
    loading: () => initial.loading,
    error: () => initial.error,
    snapshot: () => state.snapshot,
    config: () => state.config,
    processes: () => state.processes,
  }

  return <AntiRsiContext.Provider value={value}>{props.children}</AntiRsiContext.Provider>
}

export const useAntiRsi = (): AntiRsiContextValue => {
  const context = useContext(AntiRsiContext)
  if (!context) {
    throw new Error("useAntiRsi must be used within AntiRsiProvider")
  }
  return context
}
