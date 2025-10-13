import type { AntiRsiRendererApi } from '../hooks/useAntiRsiApi'
import type { AntiRsiSnapshot } from '../../../common/antirsi-core'
import { Button } from '@renderer/components/ui/Button'

interface HeaderActionsProps {
  api: AntiRsiRendererApi
  snapshot: AntiRsiSnapshot
  disabled?: boolean
}

export const HeaderActions = ({
  api,
  snapshot,
  disabled = false
}: HeaderActionsProps): React.JSX.Element => {
  const isActionDisabled = disabled
  const isPaused = snapshot.paused

  const handleTriggerWorkBreak = (): void => {
    api.triggerWorkBreak().catch((error) => {
      console.error('[AntiRSI] Failed to trigger work break', error)
    })
  }

  const handleTriggerMicroPause = (): void => {
    api.triggerMicroPause().catch((error) => {
      console.error('[AntiRSI] Failed to trigger micro pause', error)
    })
  }

  const handlePostponeWorkBreak = (): void => {
    api.postponeWorkBreak().catch((error) => {
      console.error('[AntiRSI] Failed to postpone work break', error)
    })
  }

  const handleTogglePause = (): void => {
    const action = isPaused ? api.resume : api.pause
    action()
      .then(() => {
        console.info(`[AntiRSI] ${isPaused ? 'Resumed' : 'Paused'} timers`)
      })
      .catch((error) => {
        console.error('[AntiRSI] Failed to toggle pause', error)
      })
  }

  const handleResetTimings = (): void => {
    api.resetTimings().catch((error) => console.error('[AntiRSI] Failed to reset timers', error))
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
        {isPaused ? 'Resume Timers' : 'Pause Timers'}
      </Button>
      <Button type="button" variant="secondary" onClick={handleResetTimings}>
        Reset Timers
      </Button>
    </div>
  )
}
