import type { AntiRsiConfig, AntiRsiSnapshot, BreakType } from "@antirsi/core"
import formatSeconds from "../utils/time"
import { ProgressBar } from "./ui/ProgressBar"

interface BreakStatusCardProps {
  snapshot: AntiRsiSnapshot
  config: AntiRsiConfig
  breakType: BreakType
  pendingSeconds: number
}

const BreakStatusCard = ({
  snapshot,
  config,
  breakType,
  pendingSeconds,
}: BreakStatusCardProps): React.JSX.Element => {
  const breakConfig = config[breakType]
  const elapsed = breakType === "mini" ? snapshot.timings.miniElapsed : snapshot.timings.workElapsed
  const duration = breakConfig.durationSeconds
  const label = breakType === "mini" ? "Micro Pause" : "Work Break"
  const intervalMax =
    breakType === "mini" ? config.mini.intervalSeconds : config.work.intervalSeconds
  const progressAnimationMs = Math.max(config.tickIntervalMs + 160, 280)

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-card p-5 text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.04]">
      <header>
        <h2 className="text-lg font-semibold text-white/92">{label}</h2>
      </header>
      <div className="mt-6 flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-[1.6rem] font-medium leading-none tabular-nums tracking-[-0.04em] text-white/94 sm:text-[1.9rem]">
            {formatSeconds(pendingSeconds)}
          </span>
          <span className="text-[0.68rem] uppercase tracking-[0.13em] text-muted-foreground">
            Until Next Pause
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[1.6rem] font-medium leading-none tabular-nums tracking-[-0.04em] text-white/82 sm:text-[1.9rem]">
            {formatSeconds(duration)}
          </span>
          <span className="text-[0.68rem] uppercase tracking-[0.13em] text-muted-foreground">
            Pause Duration
          </span>
        </div>
      </div>
      <ProgressBar
        value={elapsed}
        max={intervalMax}
        label={`${label} progress`}
        animationMs={progressAnimationMs}
        className="mt-6 h-1.5 w-full"
      />
    </article>
  )
}

export default BreakStatusCard
