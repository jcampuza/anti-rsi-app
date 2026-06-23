import { defaultConfig, type AntiRsiConfig, type AntiRsiTimings } from "../antirsi-core"
import {
  type Action,
  type AddInhibitorAction,
  type RemoveInhibitorAction,
  type SetConfigAction,
  type SetProcessesAction,
  type SetUserPausedAction,
  type TickAction,
} from "./actions"
import { type StoreState } from "./state"

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const clampTo = (value: number, max: number): number => clamp(value, 0, max)

const createTimings = (): AntiRsiTimings => ({
  miniElapsed: 0,
  miniTaking: 0,
  workElapsed: 0,
  workTaking: 0,
})

const applyConfigPatch = (
  current: AntiRsiConfig,
  patch: Partial<AntiRsiConfig>,
): AntiRsiConfig => ({
  mini: { ...current.mini, ...(patch.mini ?? {}) },
  work: { ...current.work, ...(patch.work ?? {}) },
  tickIntervalMs: patch.tickIntervalMs ?? current.tickIntervalMs,
  naturalBreakContinuationWindowSeconds:
    patch.naturalBreakContinuationWindowSeconds ?? current.naturalBreakContinuationWindowSeconds,
  breakWarningLeadSeconds: patch.breakWarningLeadSeconds ?? current.breakWarningLeadSeconds,
  waitForActivityPauseBeforeBreak:
    patch.waitForActivityPauseBeforeBreak ?? current.waitForActivityPauseBeforeBreak,
  breakStartGraceSeconds: patch.breakStartGraceSeconds ?? current.breakStartGraceSeconds,
  maxBreakStartDelaySeconds:
    patch.maxBreakStartDelaySeconds ?? current.maxBreakStartDelaySeconds,
})

const configsEqual = (left: AntiRsiConfig, right: AntiRsiConfig): boolean =>
  left.mini.intervalSeconds === right.mini.intervalSeconds &&
  left.mini.durationSeconds === right.mini.durationSeconds &&
  left.work.enabled === right.work.enabled &&
  left.work.intervalSeconds === right.work.intervalSeconds &&
  left.work.durationSeconds === right.work.durationSeconds &&
  left.work.postponeSeconds === right.work.postponeSeconds &&
  left.tickIntervalMs === right.tickIntervalMs &&
  left.naturalBreakContinuationWindowSeconds === right.naturalBreakContinuationWindowSeconds &&
  left.breakWarningLeadSeconds === right.breakWarningLeadSeconds &&
  left.waitForActivityPauseBeforeBreak === right.waitForActivityPauseBeforeBreak &&
  left.breakStartGraceSeconds === right.breakStartGraceSeconds &&
  left.maxBreakStartDelaySeconds === right.maxBreakStartDelaySeconds

const shouldResetStateForConfigChange = (current: AntiRsiConfig, next: AntiRsiConfig): boolean =>
  current.mini.intervalSeconds !== next.mini.intervalSeconds ||
  current.mini.durationSeconds !== next.mini.durationSeconds ||
  current.work.enabled !== next.work.enabled ||
  current.work.intervalSeconds !== next.work.intervalSeconds ||
  current.work.durationSeconds !== next.work.durationSeconds ||
  current.work.postponeSeconds !== next.work.postponeSeconds ||
  current.tickIntervalMs !== next.tickIntervalMs ||
  current.naturalBreakContinuationWindowSeconds !== next.naturalBreakContinuationWindowSeconds ||
  current.breakWarningLeadSeconds !== next.breakWarningLeadSeconds ||
  current.waitForActivityPauseBeforeBreak !== next.waitForActivityPauseBeforeBreak ||
  current.breakStartGraceSeconds !== next.breakStartGraceSeconds ||
  current.maxBreakStartDelaySeconds !== next.maxBreakStartDelaySeconds

const resetStateWithConfig = (state: StoreState, config: AntiRsiConfig): StoreState => ({
  status: "normal",
  timings: createTimings(),
  lastIdleSeconds: 0,
  lastUpdatedSeconds: 0,
  breakStartDelayElapsed: 0,
  config,
  userPaused: state.userPaused,
  inhibitors: new Set(state.inhibitors),
  processes: state.processes ? [...state.processes] : [],
})

const addInhibitor = (state: StoreState, action: AddInhibitorAction): StoreState => {
  if (state.inhibitors.has(action.id)) {
    return state
  }
  const inhibitors = new Set(state.inhibitors)
  inhibitors.add(action.id)
  return { ...state, inhibitors }
}

const removeInhibitor = (state: StoreState, action: RemoveInhibitorAction): StoreState => {
  if (!state.inhibitors.has(action.id)) {
    return state
  }
  const inhibitors = new Set(state.inhibitors)
  inhibitors.delete(action.id)
  return { ...state, inhibitors }
}

const setUserPaused = (state: StoreState, action: SetUserPausedAction): StoreState => {
  if (state.userPaused === action.value) {
    return state
  }
  return { ...state, userPaused: action.value }
}

const setProcesses = (state: StoreState, action: SetProcessesAction): StoreState => {
  const newProcesses = action.processes
  const oldProcesses = state.processes
  if (
    newProcesses.length === oldProcesses.length &&
    newProcesses.every((p, i) => p === oldProcesses[i])
  ) {
    return state
  }
  return { ...state, processes: [...newProcesses] }
}

const enterPendingMiniBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: state.config.mini.intervalSeconds,
    miniTaking: 0,
  }
  return { ...state, status: "pending-mini", timings, breakStartDelayElapsed: 0 }
}

const enterMiniBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: state.config.mini.intervalSeconds,
    miniTaking: 0,
  }
  return { ...state, status: "in-mini", timings, breakStartDelayElapsed: 0 }
}

const leaveMiniBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds,
  }
  return { ...state, status: "normal", timings, breakStartDelayElapsed: 0 }
}

const enterPendingWorkBreak = (state: StoreState): StoreState => {
  if (!state.config.work.enabled) {
    return state
  }

  const timings = {
    ...state.timings,
    workElapsed: state.config.work.intervalSeconds,
    workTaking: 0,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds,
  }
  return { ...state, status: "pending-work", timings, breakStartDelayElapsed: 0 }
}

const enterWorkBreak = (state: StoreState, naturalContinuation: boolean): StoreState => {
  if (!state.config.work.enabled) {
    return state
  }

  const timings = {
    ...state.timings,
    workElapsed: state.config.work.intervalSeconds,
    workTaking: naturalContinuation ? state.timings.workTaking : 0,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds,
  }
  return { ...state, status: "in-work", timings, breakStartDelayElapsed: 0 }
}

const leaveWorkBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds,
    workElapsed: 0,
    workTaking: state.config.work.durationSeconds,
  }
  return { ...state, status: "normal", timings, breakStartDelayElapsed: 0 }
}

const resetTimings = (state: StoreState): StoreState => ({
  ...state,
  status: "normal",
  timings: createTimings(),
  lastIdleSeconds: 0,
  lastUpdatedSeconds: 0,
  breakStartDelayElapsed: 0,
})

const postponeWorkBreak = (state: StoreState): StoreState => {
  if (!state.config.work.enabled) {
    return state
  }

  const workElapsed = clamp(
    state.config.work.intervalSeconds - state.config.work.postponeSeconds,
    0,
    state.config.work.intervalSeconds,
  )
  const timings = {
    ...state.timings,
    miniElapsed: 0,
    miniTaking: 0,
    workElapsed,
    workTaking: 0,
  }
  return { ...state, status: "normal", timings, breakStartDelayElapsed: 0 }
}

const shouldResetMiniFromNaturalBreak = (idleSeconds: number, config: AntiRsiConfig): boolean =>
  idleSeconds >= config.naturalBreakContinuationWindowSeconds

const shouldWaitForActivityPause = (
  state: StoreState,
  action: TickAction,
  breakStartDelayElapsed: number,
): boolean => {
  if (!state.config.waitForActivityPauseBeforeBreak) {
    return false
  }
  if (action.idleSeconds >= state.config.breakStartGraceSeconds) {
    return false
  }
  return breakStartDelayElapsed < state.config.maxBreakStartDelaySeconds
}

const resetMiniTimersFromNaturalBreak = (
  timings: AntiRsiTimings,
  config: AntiRsiConfig,
): AntiRsiTimings => ({
  ...timings,
  miniElapsed: 0,
  miniTaking: config.mini.durationSeconds,
})

const tick = (state: StoreState, action: TickAction): StoreState => {
  if (state.userPaused || state.inhibitors.size > 0) {
    return state
  }

  const delta = Math.max(0, action.dtSeconds)
  if (delta === 0 && action.idleSeconds === state.lastIdleSeconds) {
    return state
  }

  const timings = { ...state.timings }
  const next: StoreState = {
    ...state,
    timings,
    lastIdleSeconds: action.idleSeconds,
    lastUpdatedSeconds: state.lastUpdatedSeconds + delta,
    breakStartDelayElapsed: 0,
  }

  if (state.status === "normal") {
    const idleThreshold = state.config.mini.durationSeconds * 0.3
    const isIdleNaturalBreak = action.idleSeconds > idleThreshold

    if (!isIdleNaturalBreak) {
      timings.miniElapsed = clampTo(timings.miniElapsed + delta, state.config.mini.intervalSeconds)
      timings.miniTaking = 0

      if (state.config.work.enabled) {
        timings.workElapsed = clampTo(
          timings.workElapsed + delta,
          state.config.work.intervalSeconds,
        )
      } else {
        timings.workElapsed = 0
        timings.workTaking = 0
      }
    } else {
      timings.miniTaking = clampTo(timings.miniTaking + delta, state.config.mini.durationSeconds)
      if (!state.config.work.enabled) {
        timings.workElapsed = 0
        timings.workTaking = 0
      }
    }
    timings.workTaking = 0

    const naturalReset = shouldResetMiniFromNaturalBreak(action.idleSeconds, state.config)
    if (naturalReset) {
      next.timings = resetMiniTimersFromNaturalBreak(timings, state.config)
    }

    if (
      state.config.work.enabled &&
      next.timings.workElapsed >= state.config.work.intervalSeconds
    ) {
      const breakStartDelayElapsed = state.breakStartDelayElapsed + delta
      if (shouldWaitForActivityPause(state, action, breakStartDelayElapsed)) {
        return { ...next, breakStartDelayElapsed }
      }
      return enterPendingWorkBreak({ ...next, timings: next.timings })
    }

    if (!naturalReset && next.timings.miniElapsed >= state.config.mini.intervalSeconds) {
      const breakStartDelayElapsed = state.breakStartDelayElapsed + delta
      if (shouldWaitForActivityPause(state, action, breakStartDelayElapsed)) {
        return { ...next, breakStartDelayElapsed }
      }
      return enterPendingMiniBreak({ ...next, timings: next.timings })
    }

    return { ...next, timings: next.timings, breakStartDelayElapsed: 0 }
  }

  if (state.status === "pending-mini" || state.status === "pending-work") {
    return {
      ...next,
      status: state.status,
      timings: state.timings,
      breakStartDelayElapsed: state.breakStartDelayElapsed,
    }
  }

  if (state.status === "in-mini") {
    if (state.config.work.enabled) {
      timings.workElapsed = clampTo(timings.workElapsed + delta, state.config.work.intervalSeconds)
    } else {
      timings.workElapsed = 0
      timings.workTaking = 0
    }
    if (action.idleSeconds < 1) {
      timings.miniTaking = 0
    } else {
      timings.miniTaking = clampTo(timings.miniTaking + delta, state.config.mini.durationSeconds)
    }

    if (state.config.work.enabled && timings.workElapsed >= state.config.work.intervalSeconds) {
      return enterPendingWorkBreak({ ...next, timings })
    }

    if (timings.miniTaking >= state.config.mini.durationSeconds) {
      return leaveMiniBreak({ ...next, timings })
    }

    return { ...next, timings }
  }

  if (state.status === "in-work") {
    if (action.idleSeconds >= 4) {
      timings.workTaking = clampTo(timings.workTaking + delta, state.config.work.durationSeconds)
    }

    if (timings.workTaking >= state.config.work.durationSeconds) {
      return leaveWorkBreak({ ...next, timings })
    }

    return { ...next, timings }
  }

  return state
}

export const createInitialState = (initialConfig?: Partial<AntiRsiConfig>): StoreState => {
  const config = initialConfig ? applyConfigPatch(defaultConfig(), initialConfig) : defaultConfig()
  return {
    status: "normal",
    timings: createTimings(),
    lastIdleSeconds: 0,
    lastUpdatedSeconds: 0,
    breakStartDelayElapsed: 0,
    config,
    userPaused: false,
    inhibitors: new Set<string>(),
    processes: [],
  }
}

export const reducer = (state: StoreState, action: Action): StoreState => {
  switch (action.type) {
    case "TICK":
      return tick(state, action as TickAction)
    case "SET_CONFIG": {
      const config = applyConfigPatch(state.config, (action as SetConfigAction).config)
      if (configsEqual(state.config, config)) {
        return state
      }
      if (!shouldResetStateForConfigChange(state.config, config)) {
        return { ...state, config }
      }
      return resetStateWithConfig(state, config)
    }
    case "RESET_CONFIG": {
      const config = defaultConfig()
      return resetStateWithConfig(state, config)
    }
    case "RESET_TIMINGS":
      return resetTimings(state)
    case "START_MINI_BREAK":
      return enterPendingMiniBreak(state)
    case "END_MINI_BREAK":
      return leaveMiniBreak(state)
    case "START_WORK_BREAK":
      return enterPendingWorkBreak(state)
    case "ACK_BREAK_VISIBLE": {
      if (action.breakType === "mini" && state.status === "pending-mini") {
        return enterMiniBreak(state)
      }
      if (action.breakType === "work" && state.status === "pending-work") {
        return enterWorkBreak(state, false)
      }
      return state
    }
    case "END_WORK_BREAK":
      return leaveWorkBreak(state)
    case "POSTPONE_WORK_BREAK":
      return postponeWorkBreak(state)
    case "SET_USER_PAUSED":
      return setUserPaused(state, action as SetUserPausedAction)
    case "ADD_INHIBITOR":
      return addInhibitor(state, action as AddInhibitorAction)
    case "REMOVE_INHIBITOR":
      return removeInhibitor(state, action as RemoveInhibitorAction)
    case "SET_PROCESSES":
      return setProcesses(state, action as SetProcessesAction)
    default:
      return state
  }
}
