import { useAtomValue } from "@effect/atom-solid";
import { Settings } from "lucide-solid";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { ConfigPanel } from "~/components/ConfigPanel";
import { buttonVariants } from "~/components/ui/Button";
import { useDispatch } from "~/lib/api";
import { configAtom, connectionStatusAtom } from "~/lib/app-state";

export const Header = () => {
  const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);

  const toggleSettings = () => {
    setIsSettingsOpen((s) => !s);
  };

  const config = useAtomValue(() => configAtom);
  const connectionStatus = useAtomValue(() => connectionStatusAtom);
  const isReconnecting = () => connectionStatus() !== "open";
  const dispatch = useDispatch();
  const [resetError, setResetError] = createSignal(false);

  const handleReset = (): void => {
    setResetError(false);
    dispatch({ type: "RESET_CONFIG" }).catch(() => {
      setResetError(true);
      window.setTimeout(() => setResetError(false), 4000);
    });
  };

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close settings on escape
      if (e.key === "Escape") {
        setIsSettingsOpen(false);
      }

      // Open settings on comma + meta key - similar to other apps
      if (e.key === "," && e.metaKey) {
        setIsSettingsOpen(true);
      }
    };

    document.body.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.body.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <header class="app-region-no-drag flex items-center justify-end gap-6 text-foreground">
      <Show when={isReconnecting()}>
        <div
          class="flex items-center gap-1.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span
            class="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
            aria-hidden="true"
          />
          Reconnecting…
        </div>
      </Show>

      <button
        type="button"
        class={buttonVariants({ variant: "link" })}
        onClick={toggleSettings}
        aria-label="Open settings"
        aria-haspopup="dialog"
      >
        <Settings class="h-5 w-5" />
      </button>

      <Portal>
        <Show when={isSettingsOpen()}>
          <div
            class="fixed inset-0 z-50 overflow-y-auto bg-background/85 p-4 sm:p-6"
            onClick={() => setIsSettingsOpen(false)}
          >
            <div
              class="relative z-10 mx-auto w-full max-w-4xl"
              role="dialog"
              aria-modal="true"
              aria-label="AntiRSI settings"
              onClick={(event) => event.stopPropagation()}
            >
              <ConfigPanel config={config()} onReset={handleReset} />
              <Show when={resetError()}>
                <p
                  class="mt-2 text-xs font-medium text-destructive"
                  role="alert"
                >
                  Failed to reset settings. Please try again.
                </p>
              </Show>
            </div>
          </div>
        </Show>
      </Portal>
    </header>
  );
};
