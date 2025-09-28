import type { AntiRsiConfig, AntiRsiSnapshot } from '../../../common/antirsi-core'
import formatSeconds from '../utils/time'

interface BreakOverlayProps {
  snapshot: AntiRsiSnapshot
  config: AntiRsiConfig
  onPostpone?: () => void
}

const BreakOverlay = ({ snapshot, config, onPostpone }: BreakOverlayProps): React.JSX.Element => {
  const breakState = snapshot.state

  if (breakState !== 'in-mini' && breakState !== 'in-work') {
    return (
      <div className="overlay-shell">
        <div className="overlay-content">
          <h1>Break Complete</h1>
          <p>You can get back to work when the overlay closes.</p>
        </div>
      </div>
    )
  }

  const isWorkBreak = breakState === 'in-work'
  const breakDuration = isWorkBreak ? config.work.durationSeconds : config.mini.durationSeconds
  const elapsed = isWorkBreak ? snapshot.timings.workTaking : snapshot.timings.miniTaking
  const remaining = Math.max(breakDuration - elapsed, 0)

  return (
    <div className={`overlay-shell overlay-shell--${isWorkBreak ? 'work' : 'mini'}`}>
      <div className="overlay-content">
        <h1>{isWorkBreak ? 'Work Break' : 'Micro Break'}</h1>
        <p>Relax your hands and look away from the screen.</p>
        <div className="overlay-timer">
          <span>{formatSeconds(remaining)}</span>
        </div>
        <progress value={elapsed} max={breakDuration} aria-label="Break progress" />
        {isWorkBreak && onPostpone ? (
          <button type="button" onClick={onPostpone}>
            Postpone
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default BreakOverlay
