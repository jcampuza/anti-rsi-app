import type { AntiRsiConfig, AntiRsiSnapshot, BreakType } from '../../../common/antirsi-core'
import formatSeconds from '../utils/time'

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
  pendingSeconds
}: BreakStatusCardProps): React.JSX.Element => {
  const breakConfig = config[breakType]
  const isActive = snapshot.state === `in-${breakType}`
  const elapsed = breakType === 'mini' ? snapshot.timings.miniElapsed : snapshot.timings.workElapsed
  const duration = breakConfig.durationSeconds
  const label = breakType === 'mini' ? 'Micro Pause' : 'Work Break'
  const intervalMax =
    breakType === 'mini' ? config.mini.intervalSeconds : config.work.intervalSeconds

  return (
    <article className="rounded-xl border border-border bg-card p-4 text-foreground shadow">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{label}</h2>
        <span
          className={`text-xs uppercase tracking-[0.08em] ${breakType === 'work' ? 'text-accent' : 'text-muted-foreground'}`}
        >
          {isActive ? 'Active' : 'Idle'}
        </span>
      </header>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold">{formatSeconds(pendingSeconds)}</span>
          <span className="text-xs text-muted-foreground">Time Until Next</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold">{formatSeconds(duration)}</span>
          <span className="text-xs text-muted-foreground">Duration</span>
        </div>
      </div>
      <progress value={elapsed} max={intervalMax} aria-label={`${label} progress`} />
    </article>
  )
}

export default BreakStatusCard
