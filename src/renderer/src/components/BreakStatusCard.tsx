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
    <article className="status-card">
      <header>
        <h2>{label}</h2>
        <span className={`status-state${breakType === 'work' ? ' status-state--accent' : ''}`}>
          {isActive ? 'Active' : 'Idle'}
        </span>
      </header>
      <div className="status-metrics">
        <div>
          <span className="metric-value">{formatSeconds(pendingSeconds)}</span>
          <span className="metric-label">Time Until Next</span>
        </div>
        <div>
          <span className="metric-value">{formatSeconds(duration)}</span>
          <span className="metric-label">Duration</span>
        </div>
      </div>
      <progress value={elapsed} max={intervalMax} aria-label={`${label} progress`} />
    </article>
  )
}

export default BreakStatusCard
