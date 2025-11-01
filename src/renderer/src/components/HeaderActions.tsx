import type { AntiRsiRendererApi } from "../hooks/useAntiRsiApi"
import type { AntiRsiSnapshot } from "src/common/antirsi-core"
import { Button } from "@renderer/components/ui/Button"

interface HeaderActionsProps {
  api: AntiRsiRendererApi
  snapshot: AntiRsiSnapshot
  disabled?: boolean
}

export const HeaderActions = ({
  api,
  snapshot,
  disabled = false,
}: HeaderActionsProps): React.JSX.Element => {
  const isActionDisabled = disabled
  const isPaused = snapshot.paused

  const handleTriggerWorkBreak = (): void => {
    api.dispatch({ type: "START_WORK_BREAK", naturalContinuation: false }).catch((error) => {
      console.error("[AntiRSI] Failed to trigger work break", error)
    })
  }

  const handleTriggerMicroPause = (): void => {
    api.dispatch({ type: "START_MINI_BREAK" }).catch((error) => {
      console.error("[AntiRSI] Failed to trigger micro pause", error)
    })
  }

  const handlePostponeWorkBreak = (): void => {
    api.dispatch({ type: "POSTPONE_WORK_BREAK" }).catch((error) => {
      console.error("[AntiRSI] Failed to postpone work break", error)
    })
  }

  const handleTogglePause = (): void => {
    const promise = api.dispatch({ type: "SET_USER_PAUSED", value: !isPaused })

    promise
      .then(() => {
        console.info(`[AntiRSI] ${isPaused ? "Resumed" : "Paused"} timers`)
      })
      .catch((error) => {
        console.error("[AntiRSI] Failed to toggle pause", error)
      })
  }

  const handleResetTimings = (): void => {
    api
      .dispatch({ type: "RESET_TIMINGS" })
      .catch((error) => console.error("[AntiRSI] Failed to reset timers", error))
  }

  return (
    <div className="flex flex-wrap justify-end gap-3 app-region-no-drag">
      <Button
        type="button"
        variant="primary"
        onClick={handleTriggerWorkBreak}
        disabled={isActionDisabled}
      >
        Start Work Break
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={handleTriggerMicroPause}
        disabled={isActionDisabled}
      >
        Micro Pause
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={handlePostponeWorkBreak}
        disabled={isActionDisabled}
      >
        Postpone Work Break
      </Button>
      <Button type="button" variant="secondary" onClick={handleTogglePause}>
        {isPaused ? "Resume Timers" : "Pause Timers"}
      </Button>
      <Button type="button" variant="secondary" onClick={handleResetTimings}>
        Reset Timers
      </Button>
    </div>
  )
}
