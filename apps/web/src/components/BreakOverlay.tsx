import { Button } from "~/components/ui/Button"
import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"
import formatSeconds from "../utils/time"

interface BreakOverlayProps {
  snapshot: AntiRsiSnapshot
  config: AntiRsiConfig
  onPostpone?: () => void
  onSkip?: () => void
}

const getOverlayShellClassName = (config: AntiRsiConfig): string => {
  return config.appearance.translucentWindows
    ? "fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black/52 px-10 py-10 text-foreground backdrop-blur-xl"
    : "fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-10 py-10 text-foreground backdrop-blur-xl"
}

const getOverlayCardClassName = (config: AntiRsiConfig): string => {
  return config.appearance.translucentWindows
    ? "flex max-w-lg flex-col gap-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,29,0.78),rgba(10,11,15,0.78))] px-8 py-10 text-center shadow-[0_28px_80px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.05]"
    : "flex max-w-lg flex-col gap-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,29,0.96),rgba(10,11,15,0.96))] px-8 py-10 text-center shadow-[0_28px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.05]"
}

export const BreakOverlay = ({
  snapshot,
  config,
  onPostpone,
  onSkip,
}: BreakOverlayProps): React.JSX.Element => {
  const breakState = snapshot.state

  if (breakState !== "in-mini" && breakState !== "in-work") {
    return (
      <div className={getOverlayShellClassName(config)}>
        <div className={getOverlayCardClassName(config)}>
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
    <div className={getOverlayShellClassName(config)}>
      <div className={getOverlayCardClassName(config)}>
        <h1 className="text-5xl font-bold">{isWorkBreak ? "Work Break" : "Micro Break"}</h1>
        <p className="text-lg text-muted-foreground">
          Relax your hands and look away from the screen.
        </p>
        <div className="text-7xl font-bold tracking-[0.08em]">{formatSeconds(remaining)}</div>
        <progress
          value={elapsed}
          max={breakDuration}
          aria-label="Break progress"
          className="mx-auto mt-2 h-2 w-full max-w-md bg-white/[0.06]"
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
