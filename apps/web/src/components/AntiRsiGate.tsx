import { useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2 } from "lucide-solid";
import {
  createEffect,
  createSignal,
  Match,
  Switch,
  type ParentProps,
} from "solid-js";
import {
  appStateAtom,
  BOOTSTRAP_SEED_SEQUENCE,
  bootstrapAtom,
  bootstrapReadyAtom,
  sseDriverAtom,
} from "~/lib/app-state";
import { whenApiConfigReady } from "~/lib/api-base-url";

/**
 * Drives bootstrap + the live SSE stream and gates children until the first
 * snapshot and config are available. Replaces the former `AntiRsiProvider` /
 * `AntiRsiBootstrap` context: state now lives in atoms, so consumers read the
 * live atoms directly instead of a context hook.
 *
 * Two-stage gate: the native shell creates this window before the sidecar has
 * started and patches the real `apiBaseUrl`/`apiToken` into `window.api.meta`
 * via `eval` once it's ready — so nothing that resolves the API address (the
 * SSE driver, the bootstrap fetch) may mount until the bridge is populated.
 */
export function AntiRsiGate(props: ParentProps) {
  const [bridgeState, setBridgeState] = createSignal<
    { status: "waiting" } | { status: "ready" } | { status: "failed"; error: unknown }
  >({ status: "waiting" });

  whenApiConfigReady().then(
    () => setBridgeState({ status: "ready" }),
    (error: unknown) => setBridgeState({ status: "failed", error }),
  );

  return (
    <Switch>
      <Match when={bridgeState().status === "ready"}>
        <AntiRsiConnectedGate>{props.children}</AntiRsiConnectedGate>
      </Match>
      <Match
        when={(() => {
          const s = bridgeState();
          return s.status === "failed" ? s : undefined;
        })()}
      >
        {(failed) => <AntiRsiErrorScreen error={failed().error} />}
      </Match>
      <Match when={true}>
        <AntiRsiLoadingScreen />
      </Match>
    </Switch>
  );
}

function AntiRsiConnectedGate(props: ParentProps) {
  // Keep the SSE stream running for the lifetime of the gate.
  useAtomMount(() => sseDriverAtom);

  const bootstrap = useAtomValue(() => bootstrapAtom);
  const ready = useAtomValue(() => bootstrapReadyAtom);
  const setState = useAtomSet(() => appStateAtom);
  const [seeded, setSeeded] = createSignal(false);

  // Seed the live state from the bootstrap fetch once, for a fast first paint
  // before the SSE stream delivers its own init snapshot. Skip if the stream
  // already populated state (sequence dedup then handles any overlap).
  createEffect(() => {
    const result = bootstrap();
    if (seeded() || !AsyncResult.isSuccess(result)) {
      return;
    }
    setSeeded(true);
    setState((prev) =>
      prev.snapshot !== undefined
        ? prev
        : {
            ...prev,
            snapshot: result.value.snapshot,
            // Sequenced strictly below any real server sequence (which
            // restarts at 1 per connection) so the SSE `init` event always
            // supersedes this bootstrap seed instead of tying and being
            // dropped by the sequence-gate dedup in `reduceMainEvent`.
            snapshotMeta: {
              sequence: BOOTSTRAP_SEED_SEQUENCE,
              serverMonotonicMs: performance.now(),
            },
            snapshotReceivedAt: performance.now(),
            config: result.value.config,
            processes: result.value.processes,
          },
    );
  });

  const bootstrapError = () => {
    const result = bootstrap();
    return AsyncResult.isFailure(result)
      ? Cause.squash(result.cause)
      : undefined;
  };

  return (
    <Switch>
      <Match when={ready()}>{props.children}</Match>
      <Match when={bootstrapError()}>
        {(error) => <AntiRsiErrorScreen error={error()} />}
      </Match>
      <Match when={true}>
        <AntiRsiLoadingScreen />
      </Match>
    </Switch>
  );
}

function AntiRsiLoadingScreen() {
  return (
    <div
      class="app-region-drag flex min-h-[330px] flex-col items-center justify-center gap-3 antirsi-bootstrap-enter"
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
    <div class="app-region-drag flex min-h-[330px] flex-col items-center justify-center gap-2 px-4 text-center antirsi-bootstrap-enter sm:px-6">
      <p class="text-sm font-semibold text-destructive">
        Could not load AntiRSI
      </p>
      <p class="max-w-sm text-sm text-muted-foreground">{message()}</p>
    </div>
  );
}
