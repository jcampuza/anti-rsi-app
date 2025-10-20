import { type Action } from './actions'
import { createInitialState, reducer } from './reducer'
import { type StoreState } from './state'

export interface Store {
  getState: () => StoreState
  dispatch: (action: Action) => void
  subscribe: (listener: (state: StoreState, action: Action) => void) => () => void
}

export const createStore = (initialConfig?: Partial<StoreState['config']>): Store => {
  let state = createInitialState(initialConfig)
  const listeners = new Set<(state: StoreState, action: Action) => void>()

  const getState = (): StoreState => state

  const dispatch = (action: Action): void => {
    const nextState = reducer(state, action)
    if (nextState === state) {
      return
    }
    state = nextState
    listeners.forEach((listener) => listener(state, action))
  }

  const subscribe = (listener: (state: StoreState, action: Action) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getState, dispatch, subscribe }
}
