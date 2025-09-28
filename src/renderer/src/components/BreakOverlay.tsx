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
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-10 py-10 text-foreground">
        <div className="flex max-w-lg flex-col gap-6 text-center">
          <h1 className="text-5xl font-bold">Break Complete</h1>
          <p className="text-lg text-muted-foreground">
            You can get back to work when the overlay closes.
          </p>
        </div>
      </div>
    )
  }

  const isWorkBreak = breakState === 'in-work'
  const breakDuration = isWorkBreak ? config.work.durationSeconds : config.mini.durationSeconds
  const elapsed = isWorkBreak ? snapshot.timings.workTaking : snapshot.timings.miniTaking
  const remaining = Math.max(breakDuration - elapsed, 0)

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-10 py-10 text-foreground`}
    >
      <div className="flex max-w-lg flex-col gap-6 text-center">
        <h1 className="text-5xl font-bold">{isWorkBreak ? 'Work Break' : 'Micro Break'}</h1>
        <p className="text-lg text-muted-foreground">
          Relax your hands and look away from the screen.
        </p>
        <div className="text-7xl font-bold tracking-[0.08em]">{formatSeconds(remaining)}</div>
        <progress value={elapsed} max={breakDuration} aria-label="Break progress" />
        {isWorkBreak && onPostpone ? (
          <button
            type="button"
            className="mx-auto rounded-md border border-border bg-secondary px-5 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:opacity-90"
            onClick={onPostpone}
          >
            Postpone
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default BreakOverlay
