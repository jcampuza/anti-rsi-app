import { defaultConfig, type AntiRsiConfig, type AntiRsiTimings } from '../antirsi-core'
import {
  type Action,
  type AddInhibitorAction,
  type RemoveInhibitorAction,
  type SetConfigAction,
  type SetProcessesAction,
  type SetUserPausedAction,
  type StartWorkBreakAction,
  type TickAction
} from './actions'
import { type StoreState } from './state'

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
  workTaking: 0
})

const applyConfigPatch = (
  current: AntiRsiConfig,
  patch: Partial<AntiRsiConfig>
): AntiRsiConfig => ({
  mini: { ...current.mini, ...(patch.mini ?? {}) },
  work: { ...current.work, ...(patch.work ?? {}) },
  tickIntervalMs: patch.tickIntervalMs ?? current.tickIntervalMs,
  naturalBreakContinuationWindowSeconds:
    patch.naturalBreakContinuationWindowSeconds ?? current.naturalBreakContinuationWindowSeconds
})

const resetStateWithConfig = (state: StoreState, config: AntiRsiConfig): StoreState => ({
  status: 'normal',
  timings: createTimings(),
  lastIdleSeconds: 0,
  lastUpdatedSeconds: 0,
  config,
  userPaused: state.userPaused,
  inhibitors: new Set(state.inhibitors),
  processes: state.processes ? [...state.processes] : []
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

const enterMiniBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: state.config.mini.intervalSeconds,
    miniTaking: 0
  }
  return { ...state, status: 'in-mini', timings }
}

const leaveMiniBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds
  }
  return { ...state, status: 'normal', timings }
}

const enterWorkBreak = (state: StoreState, naturalContinuation: boolean): StoreState => {
  const timings = {
    ...state.timings,
    workElapsed: state.config.work.intervalSeconds,
    workTaking: naturalContinuation ? state.timings.workTaking : 0,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds
  }
  return { ...state, status: 'in-work', timings }
}

const leaveWorkBreak = (state: StoreState): StoreState => {
  const timings = {
    ...state.timings,
    miniElapsed: 0,
    miniTaking: state.config.mini.durationSeconds,
    workElapsed: 0,
    workTaking: state.config.work.durationSeconds
  }
  return { ...state, status: 'normal', timings }
}

const resetTimings = (state: StoreState): StoreState => ({
  ...state,
  status: 'normal',
  timings: createTimings(),
  lastIdleSeconds: 0,
  lastUpdatedSeconds: 0
})

const postponeWorkBreak = (state: StoreState): StoreState => {
  const workElapsed = clamp(
    state.config.work.intervalSeconds - state.config.work.postponeSeconds,
    0,
    state.config.work.intervalSeconds
  )
  const timings = {
    ...state.timings,
    miniElapsed: 0,
    miniTaking: 0,
    workElapsed,
    workTaking: 0
  }
  return { ...state, status: 'normal', timings }
}

const shouldResetMiniFromNaturalBreak = (idleSeconds: number, config: AntiRsiConfig): boolean =>
  idleSeconds >= config.naturalBreakContinuationWindowSeconds

const resetMiniTimersFromNaturalBreak = (
  timings: AntiRsiTimings,
  config: AntiRsiConfig
): AntiRsiTimings => ({
  ...timings,
  miniElapsed: 0,
  miniTaking: config.mini.durationSeconds
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
    lastUpdatedSeconds: state.lastUpdatedSeconds + delta
  }

  if (state.status === 'normal') {
    const idleThreshold = state.config.mini.durationSeconds * 0.3
    if (action.idleSeconds <= idleThreshold) {
      timings.miniElapsed = clampTo(timings.miniElapsed + delta, state.config.mini.intervalSeconds)
      timings.miniTaking = 0
    } else {
      timings.miniTaking = clampTo(timings.miniTaking + delta, state.config.mini.durationSeconds)
    }

    timings.workElapsed = clampTo(timings.workElapsed + delta, state.config.work.intervalSeconds)
    timings.workTaking = 0

    const naturalReset = shouldResetMiniFromNaturalBreak(action.idleSeconds, state.config)
    if (naturalReset) {
      next.timings = resetMiniTimersFromNaturalBreak(timings, state.config)
    }

    if (next.timings.workElapsed >= state.config.work.intervalSeconds) {
      return enterWorkBreak({ ...next, timings: next.timings }, false)
    }

    if (!naturalReset && next.timings.miniElapsed >= state.config.mini.intervalSeconds) {
      return enterMiniBreak({ ...next, timings: next.timings })
    }

    return { ...next, timings: next.timings }
  }

  if (state.status === 'in-mini') {
    timings.workElapsed = clampTo(timings.workElapsed + delta, state.config.work.intervalSeconds)
    if (action.idleSeconds < 1) {
      timings.miniTaking = 0
    } else {
      timings.miniTaking = clampTo(timings.miniTaking + delta, state.config.mini.durationSeconds)
    }

    if (timings.workElapsed >= state.config.work.intervalSeconds) {
      return enterWorkBreak({ ...next, timings }, false)
    }

    if (timings.miniTaking >= state.config.mini.durationSeconds) {
      return leaveMiniBreak({ ...next, timings })
    }

    return { ...next, timings }
  }

  if (state.status === 'in-work') {
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
    status: 'normal',
    timings: createTimings(),
    lastIdleSeconds: 0,
    lastUpdatedSeconds: 0,
    config,
    userPaused: false,
    inhibitors: new Set<string>(),
    processes: []
  }
}

export const reducer = (state: StoreState, action: Action): StoreState => {
  switch (action.type) {
    case 'TICK':
      return tick(state, action as TickAction)
    case 'SET_CONFIG': {
      const config = applyConfigPatch(state.config, (action as SetConfigAction).config)
      return resetStateWithConfig(state, config)
    }
    case 'RESET_CONFIG': {
      const config = defaultConfig()
      return resetStateWithConfig(state, config)
    }
    case 'RESET_TIMINGS':
      return resetTimings(state)
    case 'START_MINI_BREAK':
      return enterMiniBreak(state)
    case 'END_MINI_BREAK':
      return leaveMiniBreak(state)
    case 'START_WORK_BREAK':
      return enterWorkBreak(state, (action as StartWorkBreakAction).naturalContinuation)
    case 'END_WORK_BREAK':
      return leaveWorkBreak(state)
    case 'POSTPONE_WORK_BREAK':
      return postponeWorkBreak(state)
    case 'SET_USER_PAUSED':
      return setUserPaused(state, action as SetUserPausedAction)
    case 'ADD_INHIBITOR':
      return addInhibitor(state, action as AddInhibitorAction)
    case 'REMOVE_INHIBITOR':
      return removeInhibitor(state, action as RemoveInhibitorAction)
    case 'SET_PROCESSES':
      return setProcesses(state, action as SetProcessesAction)
    default:
      return state
  }
}
