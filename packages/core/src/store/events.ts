import {
  type AntiRsiEvent,
  type AntiRsiState,
  type AntiRsiSnapshot,
  type BreakType,
} from "../antirsi-core"
import { type Action } from "./actions"
import { selectTimersRunning, selectSnapshot } from "./selectors"
import { type StoreState } from "./state"

const breakTypeForState = (state: AntiRsiState): BreakType | undefined => {
  if (state === "in-mini") {
    return "mini"
  }
  if (state === "in-work") {
    return "work"
  }
  return undefined
}

/** User/command-driven timing changes must bypass throttled status-update broadcasts. */
const shouldEmitTimingsReset = (
  action: Action,
  prevSnapshot: AntiRsiSnapshot,
  nextSnapshot: AntiRsiSnapshot,
): boolean => {
  switch (action.type) {
    case "RESET_TIMINGS":
    case "POSTPONE_WORK_BREAK":
    case "RESET_CONFIG":
      return true
    case "SET_CONFIG":
      return !snapshotsEqual(prevSnapshot, nextSnapshot)
    default:
      return false
  }
}

const snapshotsEqual = (prev: AntiRsiSnapshot, next: AntiRsiSnapshot): boolean => {
  if (prev.state !== next.state) return false
  if (prev.lastIdleSeconds !== next.lastIdleSeconds) return false
  if (prev.lastUpdatedSeconds !== next.lastUpdatedSeconds) return false
  if (prev.paused !== next.paused) return false
  if (prev.timersRunning !== next.timersRunning) return false
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
  action: Action,
): { events: AntiRsiEvent[]; snapshotChanged: boolean } => {
  const prevTimersRunning = selectTimersRunning(prevState)
  const nextTimersRunning = selectTimersRunning(nextState)

  const prevSnapshot = selectSnapshot(prevState)
  const nextSnapshot = selectSnapshot(nextState)

  const events: AntiRsiEvent[] = []

  if (prevTimersRunning !== nextTimersRunning) {
    events.push({ type: nextTimersRunning ? "resumed" : "paused" })
  }

  if (prevSnapshot.state !== nextSnapshot.state) {
    const prevBreakType = breakTypeForState(prevSnapshot.state)
    const nextBreakType = breakTypeForState(nextSnapshot.state)

    if (nextBreakType === "mini") {
      events.push({ type: "mini-break-start" })
    } else if (nextBreakType === "work") {
      const naturalContinuation =
        action.type === "START_WORK_BREAK" &&
        "naturalContinuation" in action &&
        action.naturalContinuation
      events.push({
        type: "work-break-start",
        naturalContinuation: Boolean(naturalContinuation),
      })
    }

    if (prevBreakType && nextBreakType !== prevBreakType) {
      events.push({ type: "break-end", breakType: prevBreakType })
    }
  } else {
    const breakType = breakTypeForState(nextSnapshot.state)
    if (breakType) {
      events.push({ type: "break-update", breakType })
    }
  }

  if (shouldEmitTimingsReset(action, prevSnapshot, nextSnapshot)) {
    events.push({ type: "timings-reset" })
  }

  events.push({ type: "status-update" })

  return {
    events,
    snapshotChanged: !snapshotsEqual(prevSnapshot, nextSnapshot),
  }
}
