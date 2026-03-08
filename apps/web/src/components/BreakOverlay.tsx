import { Button } from "~/components/ui/Button"
import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core"
import formatSeconds from "../utils/time"
import { ProgressBar } from "./ui/ProgressBar"

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
  const progressAnimationMs = Math.max(config.tickIntervalMs + 160, 280)

  return (
    <div className={getOverlayShellClassName(config)}>
      <div className={getOverlayCardClassName(config)}>
        <h1 className="text-3xl font-semibold text-white/94 sm:text-[2.25rem]">
          {isWorkBreak ? "Work Break" : "Micro Break"}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Relax your hands and look away from the screen.
        </p>
        <div className="flex flex-col items-center gap-2">
          <span className="text-[0.64rem] font-medium uppercase tracking-[0.22em] text-muted-foreground/80">
            Remaining
          </span>
          <div className="text-[clamp(2.4rem,6vw,3.75rem)] font-medium leading-none tabular-nums tracking-[-0.05em] text-white/95">
            {formatSeconds(remaining)}
          </div>
        </div>
        <ProgressBar
          value={elapsed}
          max={breakDuration}
          label="Break progress"
          animationMs={progressAnimationMs}
          className="mx-auto mt-1 h-2 w-full max-w-md"
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
