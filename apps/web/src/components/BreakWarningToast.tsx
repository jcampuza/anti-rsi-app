import type { AntiRsiBreakWarning } from "@antirsi/core";
import { Show, createMemo, type Component } from "solid-js";
import formatSeconds from "~/utils/time";

interface BreakWarningToastProps {
  warning: AntiRsiBreakWarning | null;
  displaySeconds?: number;
  onPostpone?: () => void;
  postponeDisabled?: boolean;
}

const shellClassName =
  "app-region-drag flex h-screen w-screen items-center rounded-lg border border-white/12 bg-[rgba(10,12,18,0.82)] px-3 text-foreground shadow-[0_14px_36px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.06]";

export const BreakWarningToast: Component<BreakWarningToastProps> = (props) => {
  const title = createMemo(() =>
    props.warning?.breakType === "work" ? "Work break" : "Micro break",
  );
  const seconds = createMemo(() => {
    const warning = props.warning;
    if (!warning) {
      return 0;
    }
    if (props.displaySeconds !== undefined) {
      return props.displaySeconds;
    }
    if (warning.phase === "waiting-for-activity-pause") {
      return warning.forcedStartInSeconds ?? 0;
    }
    return warning.startsInSeconds;
  });

  return (
    <Show when={props.warning}>
      <div class={shellClassName}>
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-xs font-semibold text-white/95">
              <Show
                when={props.warning?.phase === "waiting-for-activity-pause"}
                fallback={`${title()} in`}
              >
                {title()} ready
              </Show>
            </div>
            <div class="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
              <Show
                when={props.warning?.phase === "waiting-for-activity-pause"}
                fallback="Take your hands off when you are ready."
              >
                Waiting for a pause in activity
              </Show>
            </div>
          </div>
          <div class="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-base font-semibold tabular-nums text-white/95">
            {formatSeconds(Math.ceil(seconds()))}
          </div>
          <Show when={props.onPostpone !== undefined}>
            <button
              type="button"
              class="app-region-no-drag shrink-0 rounded-md border border-white/12 bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-white/92 transition-colors hover:border-white/20 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={props.postponeDisabled}
              onClick={(event) => {
                event.stopPropagation();
                props.onPostpone?.();
              }}
            >
              Postpone
            </button>
          </Show>
        </div>
      </div>
    </Show>
  );
};
