import { Button } from "@renderer/components/ui/Button"
import type { AntiRsiConfig, AntiRsiSnapshot } from "src/common/antirsi-core"
import formatSeconds from "../utils/time"

interface BreakOverlayProps {
  snapshot: AntiRsiSnapshot
  config: AntiRsiConfig
  onPostpone?: () => void
  onSkip?: () => void
}

const BreakOverlay = ({
  snapshot,
  config,
  onPostpone,
  onSkip,
}: BreakOverlayProps): React.JSX.Element => {
  const breakState = snapshot.state

  if (breakState !== "in-mini" && breakState !== "in-work") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm px-10 py-10 text-foreground">
        <div className="flex max-w-lg flex-col gap-6 text-center">
          <h1 className="text-5xl font-bold">Break Complete</h1>
          <p className="text-lg text-muted-foreground">
            You can get back to work when the overlay closes.
          </p>
        </div>
      </div>
    )
  }

  const isWorkBreak = breakState === "in-work"
  const breakDuration = isWorkBreak ? config.work.durationSeconds : config.mini.durationSeconds
  const elapsed = isWorkBreak ? snapshot.timings.workTaking : snapshot.timings.miniTaking
  const remaining = Math.max(breakDuration - elapsed, 0)

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background/75 backdrop-blur-sm px-10 py-10 text-foreground`}
    >
      <div className="flex max-w-lg flex-col gap-6 text-center">
        <h1 className="text-5xl font-bold">{isWorkBreak ? "Work Break" : "Micro Break"}</h1>
        <p className="text-lg text-foreground">Relax your hands and look away from the screen.</p>
        <div className="text-7xl font-bold tracking-[0.08em]">{formatSeconds(remaining)}</div>
        <progress
          value={elapsed}
          max={breakDuration}
          aria-label="Break progress"
          className="mx-auto h-2 w-full max-w-md"
        />

        {onPostpone || onSkip ? (
          <div className="flex gap-3 items-center justify-center">
            {onPostpone ? (
              <Button type="button" variant="primary" onClick={onPostpone}>
                Postpone
              </Button>
            ) : null}
            {onSkip ? (
              <Button type="button" variant="secondary" onClick={onSkip}>
                Skip
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default BreakOverlay
