import type { AntiRsiConfig, AntiRsiSnapshot, BreakType } from "@antirsi/core";
import { createMemo, type Component, type Accessor } from "solid-js";
import formatSeconds from "~/utils/time";
import { ProgressBar } from "./ui/ProgressBar";

interface BreakStatusCardProps {
  snapshot: AntiRsiSnapshot;
  config: AntiRsiConfig;
  breakType: BreakType;
  pendingSeconds: number;
  miniElapsed: number;
  workElapsed: number;
}

const BreakStatusCard: Component<BreakStatusCardProps> = (props) => {
  const breakConfig = () => props.config[props.breakType];
  const elapsed = () =>
    props.breakType === "mini" ? props.miniElapsed : props.workElapsed;

  const label = () =>
    props.breakType === "mini" ? "Micro Pause" : "Work Break";
  const intervalMax = () =>
    props.breakType === "mini"
      ? props.config.mini.intervalSeconds
      : props.config.work.intervalSeconds;

  // Use a minimal animation duration since rAF handles smooth updates
  const progressAnimationMs = () => 50;

  return (
    <article class="rounded-2xl border border-white/[0.08] bg-card p-5 text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.04]">
      <header>
        <h2 class="text-lg font-semibold text-white/92">{label()}</h2>
      </header>
      <div class="mt-6 flex items-center justify-between gap-6">
        <div class="flex flex-col gap-0.5">
          <span class="text-[1.6rem] font-medium leading-none tracking-[-0.04em] text-white/94 tabular-nums sm:text-[1.9rem]">
            {formatSeconds(props.pendingSeconds)}
          </span>
          <span class="text-[0.68rem] tracking-[0.13em] text-muted-foreground uppercase">
            Until Next Pause
          </span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[1.6rem] font-medium leading-none tracking-[-0.04em] text-white/82 tabular-nums sm:text-[1.9rem]">
            {formatSeconds(breakConfig().durationSeconds)}
          </span>
          <span class="text-[0.68rem] tracking-[0.13em] text-muted-foreground uppercase">
            Pause Duration
          </span>
        </div>
      </div>
      <ProgressBar
        value={elapsed()}
        max={intervalMax()}
        label={`${label()} progress`}
        animationMs={progressAnimationMs()}
        class="mt-6 h-1.5 w-full"
      />
    </article>
  );
};

export default BreakStatusCard;
