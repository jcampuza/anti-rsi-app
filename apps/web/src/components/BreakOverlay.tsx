import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core";
import { Show, createMemo, type Component } from "solid-js";
import formatSeconds from "~/utils/time";
import { Button } from "~/components/ui/Button";
import { ProgressBar } from "./ui/ProgressBar";

interface BreakOverlayProps {
  snapshot: AntiRsiSnapshot;
  config: AntiRsiConfig;
  onPostpone?: () => void;
  onSkip?: () => void;
}

const getOverlayShellClassName = (config: AntiRsiConfig): string => {
  return config.appearance.translucentWindows
    ? "fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black/52 px-10 py-10 text-foreground backdrop-blur-xl"
    : "fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-10 py-10 text-foreground backdrop-blur-xl";
};

const getOverlayCardClassName = (config: AntiRsiConfig): string => {
  return config.appearance.translucentWindows
    ? "flex max-w-lg flex-col gap-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,29,0.78),rgba(10,11,15,0.78))] px-8 py-10 text-center shadow-[0_28px_80px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.05]"
    : "flex max-w-lg flex-col gap-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,29,0.96),rgba(10,11,15,0.96))] px-8 py-10 text-center shadow-[0_28px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.05]";
};

export const BreakOverlay: Component<BreakOverlayProps> = (props) => {
  const breakState = () => props.snapshot.state;
  const isActiveBreak = createMemo(
    () => breakState() === "in-mini" || breakState() === "in-work",
  );
  const isWorkBreak = createMemo(() => breakState() === "in-work");
  const breakDuration = createMemo(() =>
    isWorkBreak()
      ? props.config.work.durationSeconds
      : props.config.mini.durationSeconds,
  );
  const elapsed = createMemo(() =>
    isWorkBreak()
      ? props.snapshot.timings.workTaking
      : props.snapshot.timings.miniTaking,
  );
  const remaining = createMemo(() => Math.max(breakDuration() - elapsed(), 0));
  const progressAnimationMs = createMemo(() =>
    Math.max(props.config.tickIntervalMs + 160, 280),
  );

  return (
    <div class={getOverlayShellClassName(props.config)}>
      <Show
        when={isActiveBreak()}
        fallback={
          <div class={getOverlayCardClassName(props.config)}>
            <h1 class="text-5xl font-bold">Break Complete</h1>
            <p class="text-lg text-muted-foreground">
              You can get back to work when the overlay closes.
            </p>
          </div>
        }
      >
        <div class={getOverlayCardClassName(props.config)}>
          <h1 class="text-3xl font-semibold text-white/94 sm:text-[2.25rem]">
            {isWorkBreak() ? "Work Break" : "Micro Break"}
          </h1>
          <p class="text-sm text-muted-foreground sm:text-base">
            Relax your hands and look away from the screen.
          </p>
          <div class="flex flex-col items-center gap-2">
            <span class="text-[0.64rem] font-medium tracking-[0.22em] text-muted-foreground/80 uppercase">
              Remaining
            </span>
            <div class="text-[clamp(2.4rem,6vw,3.75rem)] font-medium leading-none tracking-[-0.05em] text-white/95 tabular-nums">
              {formatSeconds(remaining())}
            </div>
          </div>
          <ProgressBar
            value={elapsed()}
            max={breakDuration()}
            label="Break progress"
            animationMs={progressAnimationMs()}
            class="mx-auto mt-1 h-2 w-full max-w-md"
          />

          <Show when={props.onPostpone || props.onSkip}>
            <div class="flex items-center justify-center gap-3">
              <Show when={props.onPostpone}>
                <Button
                  type="button"
                  variant="primary"
                  onClick={props.onPostpone}
                >
                  Postpone
                </Button>
              </Show>
              <Show when={props.onSkip}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={props.onSkip}
                >
                  Skip
                </Button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
