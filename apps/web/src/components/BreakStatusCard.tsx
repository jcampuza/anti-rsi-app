import type { AntiRsiConfig, AntiRsiSnapshot, BreakType } from "@antirsi/core";
import { createMemo, type Component } from "solid-js";
import formatSeconds from "~/utils/time";

interface BreakStatusCardProps {
  snapshot: AntiRsiSnapshot;
  config: AntiRsiConfig;
  breakType: BreakType;
  pendingSeconds: number;
}

const BreakStatusCard: Component<BreakStatusCardProps> = (props) => {
  const breakConfig = () => props.config[props.breakType];

  const label = () =>
    props.breakType === "mini" ? "Micro Pause" : "Work Break";
  const isPending = createMemo(
    () =>
      props.snapshot.state ===
      (props.breakType === "mini" ? "pending-mini" : "pending-work"),
  );
  const pendingDisplaySeconds = createMemo(() =>
    isPending() ? 0 : Math.ceil(props.pendingSeconds),
  );
  const pendingLabel = createMemo(() =>
    isPending() ? "Starting Pause" : "Until Next Pause",
  );

  return (
    <article class="rounded-2xl border border-white/[0.08] bg-card p-4 text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.04] sm:p-5">
      <header>
        <h2 class="text-lg font-semibold text-white/92">{label()}</h2>
      </header>
      <div class="mt-5 flex flex-col gap-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-6">
        <div class="flex flex-col gap-0.5">
          <span class="text-[1.6rem] font-medium leading-none tracking-[-0.04em] text-white/94 tabular-nums sm:text-[1.9rem]">
            {formatSeconds(pendingDisplaySeconds())}
          </span>
          <span class="text-[0.68rem] tracking-[0.13em] text-muted-foreground uppercase">
            {pendingLabel()}
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
    </article>
  );
};

export default BreakStatusCard;
