import type { AntiRsiConfig, AntiRsiSnapshot, BreakType } from "@antirsi/core"
import formatSeconds from "../utils/time"

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
  const isActive = snapshot.state === `in-${breakType}`
  const elapsed = breakType === "mini" ? snapshot.timings.miniElapsed : snapshot.timings.workElapsed
  const duration = breakConfig.durationSeconds
  const label = breakType === "mini" ? "Micro Pause" : "Work Break"
  const intervalMax =
    breakType === "mini" ? config.mini.intervalSeconds : config.work.intervalSeconds

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-card p-5 text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.04]">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{label}</h2>
        <span
          className={`text-xs uppercase tracking-[0.22em] ${breakType === "work" ? "text-accent" : "text-muted-foreground"}`}
        >
          {isActive ? "Active" : "Idle"}
        </span>
      </header>
      <div className="mt-6 flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-4xl font-semibold tracking-[-0.04em]">
            {formatSeconds(pendingSeconds)}
          </span>
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Time Until Next
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-4xl font-semibold tracking-[-0.04em]">{formatSeconds(duration)}</span>
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Duration
          </span>
        </div>
      </div>
      <progress value={elapsed} max={intervalMax} aria-label={`${label} progress`} className="mt-6 w-full bg-white/[0.06]" />
    </article>
  )
}

export default BreakStatusCard
