import {
  type AntiRsiEvent,
  type AntiRsiState,
  type AntiRsiSnapshot,
  type BreakType
} from '../antirsi-core'
import { type Action } from './actions'
import { selectIsPaused, selectSnapshot } from './selectors'
import { type StoreState } from './state'

const breakTypeForState = (state: AntiRsiState): BreakType | undefined => {
  if (state === 'in-mini') {
    return 'mini'
  }
  if (state === 'in-work') {
    return 'work'
  }
  return undefined
}

const snapshotsEqual = (prev: AntiRsiSnapshot, next: AntiRsiSnapshot): boolean => {
  if (prev.state !== next.state) return false
  if (prev.lastIdleSeconds !== next.lastIdleSeconds) return false
  if (prev.lastUpdatedSeconds !== next.lastUpdatedSeconds) return false
  if (prev.paused !== next.paused) return false
  const prevTimings = prev.timings
  const nextTimings = next.timings
  return (
    prevTimings.miniElapsed === nextTimings.miniElapsed &&
    prevTimings.miniTaking === nextTimings.miniTaking &&
    prevTimings.workElapsed === nextTimings.workElapsed &&
    prevTimings.workTaking === nextTimings.workTaking
  )
}

export const deriveEvents = (
  prevState: StoreState,
  nextState: StoreState,
  action: Action
): { events: AntiRsiEvent[]; snapshotChanged: boolean } => {
  const prevPaused = selectIsPaused(prevState)
  const nextPaused = selectIsPaused(nextState)

  const prevSnapshot = selectSnapshot(prevState)
  const nextSnapshot = selectSnapshot(nextState)

  const events: AntiRsiEvent[] = []

  if (prevPaused !== nextPaused) {
    events.push({ type: nextPaused ? 'paused' : 'resumed' })
  }

  if (prevSnapshot.state !== nextSnapshot.state) {
    const prevBreakType = breakTypeForState(prevSnapshot.state)
    const nextBreakType = breakTypeForState(nextSnapshot.state)

    if (nextBreakType === 'mini') {
      events.push({ type: 'mini-break-start' })
    } else if (nextBreakType === 'work') {
      const naturalContinuation =
        action.type === 'START_WORK_BREAK' &&
        'naturalContinuation' in action &&
        action.naturalContinuation
      events.push({
        type: 'work-break-start',
        naturalContinuation: Boolean(naturalContinuation)
      })
    }

    if (prevBreakType && nextBreakType !== prevBreakType) {
      events.push({ type: 'break-end', breakType: prevBreakType })
    }
  } else {
    const breakType = breakTypeForState(nextSnapshot.state)
    if (breakType) {
      events.push({ type: 'break-update', breakType })
    }
  }

  events.push({ type: 'status-update' })

  return {
    events,
    snapshotChanged: !snapshotsEqual(prevSnapshot, nextSnapshot)
  }
}
