import type { AntiRsiRendererApi } from '../hooks/useAntiRsiApi'
import type { AntiRsiSnapshot } from '../../../common/antirsi-core'
import { Button } from '@renderer/components/ui/Button'

interface HeaderActionsProps {
  api: AntiRsiRendererApi | undefined
  snapshot: AntiRsiSnapshot
  disabled?: boolean
}

export const HeaderActions = ({
  api,
  snapshot,
  disabled = false
}: HeaderActionsProps): React.JSX.Element => {
  const isActionDisabled = disabled || !api
  const isPaused = snapshot.paused

  const handleTriggerWorkBreak = (): void => {
    if (!api) {
      return
    }
    api.triggerWorkBreak().catch((error) => {
      console.error('[AntiRSI] Failed to trigger work break', error)
    })
  }

  const handlePostponeWorkBreak = (): void => {
    if (!api) {
      return
    }
    api.postponeWorkBreak().catch((error) => {
      console.error('[AntiRSI] Failed to postpone work break', error)
    })
  }

  const handleTogglePause = (): void => {
    if (!api) {
      return
    }
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
    if (!api) {
      return
    }
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
        onClick={handlePostponeWorkBreak}
        disabled={isActionDisabled}
      >
        Postpone Work Break
      </Button>
      <Button type="button" variant="secondary" onClick={handleTogglePause} disabled={!api}>
        {isPaused ? 'Resume Timers' : 'Pause Timers'}
      </Button>
      <Button type="button" variant="secondary" onClick={handleResetTimings} disabled={!api}>
        Reset Timers
      </Button>
    </div>
  )
}
