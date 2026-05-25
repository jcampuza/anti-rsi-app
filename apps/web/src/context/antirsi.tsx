import type { MainEvent } from "@antirsi/contracts";
import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core";
import type { AntiRsiDesktopBridge } from "@antirsi/contracts";
import { Loader2 } from "lucide-solid";
import { resolveAntiRsiClient } from "~/lib/antirsi-client";
import {
  createContext,
  createEffect,
  createResource,
  Match,
  Switch,
  onCleanup,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

export type AntiRsiRendererApi = AntiRsiDesktopBridge;

interface AntiRsiState {
  snapshot: AntiRsiSnapshot | undefined;
  config: AntiRsiConfig | undefined;
  processes: string[];
}

/** Bootstrap context — snapshot/config may be undefined until loaded. */
interface AntiRsiBootstrapContextValue {
  api: AntiRsiRendererApi;
  ready: Accessor<boolean>;
  loading: Accessor<boolean>;
  error: Accessor<unknown | undefined>;
  snapshot: Accessor<AntiRsiSnapshot | undefined>;
  config: Accessor<AntiRsiConfig | undefined>;
  processes: Accessor<string[]>;
}

/** App context — only available under {@link AntiRsiBootstrap} after bootstrap completes. */
export interface AntiRsiContextValue {
  api: AntiRsiRendererApi;
  snapshot: Accessor<AntiRsiSnapshot>;
  config: Accessor<AntiRsiConfig>;
  processes: Accessor<string[]>;
}

const AntiRsiBootstrapContext = createContext<AntiRsiBootstrapContextValue>();
const AntiRsiContext = createContext<AntiRsiContextValue>();

const applyMainEvent = (
  payload: MainEvent,
  setState: (patch: Partial<AntiRsiState>) => void,
): void => {
  switch (payload.type) {
    case "init":
      setState({
        snapshot: payload.snapshot,
        config: payload.config,
        processes: payload.processes,
      });
      break;
    case "antirsi":
    case "timers-paused":
    case "timers-resumed":
      setState({ snapshot: payload.snapshot });
      break;
    case "config-changed":
      setState({ config: payload.config });
      break;
    case "processes-updated":
      setState({ processes: payload.list });
      break;
  }
};

export function AntiRsiProvider(props: ParentProps) {
  const api = resolveAntiRsiClient();

  const [state, setState] = createStore<AntiRsiState>({
    snapshot: undefined,
    config: undefined,
    processes: [],
  });

  const [initial] = createResource(async () => {
    const [snapshot, config, processes] = await Promise.all([
      api.getSnapshot(),
      api.getConfig(),
      api.getProcesses(),
    ]);
    return { snapshot, config, processes };
  });

  createEffect(() => {
    const data = initial();
    if (!data) return;
    setState(
      reconcile({
        snapshot: data.snapshot,
        config: data.config,
        processes: data.processes,
      }),
    );
  });

  createEffect(() => {
    const unsubscribe = api.subscribeAll((payload) => {
      applyMainEvent(payload, (patch) => setState(patch));
    });
    onCleanup(() => unsubscribe());
  });

  const value: AntiRsiBootstrapContextValue = {
    api,
    ready: () =>
      initial.state === "ready" &&
      state.snapshot !== undefined &&
      state.config !== undefined,
    loading: () => initial.loading,
    error: () => initial.error,
    snapshot: () => state.snapshot,
    config: () => state.config,
    processes: () => state.processes,
  };

  return (
    <AntiRsiBootstrapContext.Provider value={value}>
      {props.children}
    </AntiRsiBootstrapContext.Provider>
  );
}

function AntiRsiReadyScope(props: ParentProps) {
  const parent = useAntiRsiBootstrap();

  const value: AntiRsiContextValue = {
    api: parent.api,
    snapshot: () => {
      const snapshot = parent.snapshot();
      if (snapshot === undefined) {
        throw new Error(
          "Invariant: snapshot is undefined after AntiRSI bootstrap",
        );
      }
      return snapshot;
    },
    config: () => {
      const config = parent.config();
      if (config === undefined) {
        throw new Error(
          "Invariant: config is undefined after AntiRSI bootstrap",
        );
      }
      return config;
    },
    processes: parent.processes,
  };

  return (
    <AntiRsiContext.Provider value={value}>
      {props.children}
    </AntiRsiContext.Provider>
  );
}

function AntiRsiLoadingScreen() {
  return (
    <div
      class="app-region-drag flex min-h-[520px] flex-col items-center justify-center gap-3 antirsi-bootstrap-enter"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 class="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
      <p class="text-sm text-muted-foreground">Loading AntiRSI…</p>
    </div>
  );
}

function AntiRsiErrorScreen(props: { error: unknown }) {
  const message = () => {
    if (props.error instanceof Error) return props.error.message;
    return "Something went wrong while connecting to AntiRSI.";
  };

  return (
    <div class="app-region-drag flex min-h-[520px] flex-col items-center justify-center gap-2 px-7 text-center antirsi-bootstrap-enter">
      <p class="text-sm font-semibold text-destructive">
        Could not load AntiRSI
      </p>
      <p class="max-w-sm text-sm text-muted-foreground">{message()}</p>
    </div>
  );
}

/** Gates children until snapshot and config are available. Renders loading/error UI otherwise. */
export function AntiRsiBootstrap(props: ParentProps) {
  const antirsi = useAntiRsiBootstrap();

  return (
    <Switch>
      <Match when={antirsi.loading()}>
        <AntiRsiLoadingScreen />
      </Match>
      <Match when={antirsi.error()}>
        {(error) => <AntiRsiErrorScreen error={error()} />}
      </Match>
      <Match when={antirsi.ready()}>
        <AntiRsiReadyScope>{props.children}</AntiRsiReadyScope>
      </Match>
    </Switch>
  );
}

const useAntiRsiBootstrap = (): AntiRsiBootstrapContextValue => {
  const context = useContext(AntiRsiBootstrapContext);
  if (!context) {
    throw new Error("useAntiRsiBootstrap must be used within AntiRsiProvider");
  }
  return context;
};

export const useAntiRsi = (): AntiRsiContextValue => {
  const context = useContext(AntiRsiContext);
  if (!context) {
    throw new Error(
      "useAntiRsi must be used within AntiRsiBootstrap after bootstrap",
    );
  }
  return context;
};
