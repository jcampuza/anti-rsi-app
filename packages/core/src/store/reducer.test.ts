import { describe, expect, it } from "vitest"
import { defaultConfig } from "../antirsi-core"
import { createInitialState, reducer } from "./reducer"

describe("reducer config updates", () => {
  it("resets timings when break configuration changes", () => {
    const initialState = {
      ...createInitialState(),
      status: "in-work" as const,
      timings: {
        miniElapsed: 120,
        miniTaking: 10,
        workElapsed: 3000,
        workTaking: 180,
      },
      lastIdleSeconds: 5,
      lastUpdatedSeconds: 2222,
    }

    const nextState = reducer(initialState, {
      type: "SET_CONFIG",
      config: {
        mini: {
          intervalSeconds: defaultConfig().mini.intervalSeconds + 30,
          durationSeconds: defaultConfig().mini.durationSeconds,
        },
      },
    })

    expect(nextState.status).toBe("normal")
    expect(nextState.timings).toEqual({
      miniElapsed: 0,
      miniTaking: 0,
      workElapsed: 0,
      workTaking: 0,
    })
    expect(nextState.lastIdleSeconds).toBe(0)
    expect(nextState.lastUpdatedSeconds).toBe(0)
    expect(nextState.config.mini.intervalSeconds).toBe(defaultConfig().mini.intervalSeconds + 30)
  })
})

describe("work break disabling", () => {
  it("does not start automatic work breaks when work breaks are disabled", () => {
    const config = defaultConfig()
    const initialState = createInitialState({
      work: {
        ...config.work,
        enabled: false,
      },
    })

    const nextState = reducer(initialState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: config.work.intervalSeconds + 1,
    })

    expect(nextState.status).toBe("in-mini")
    expect(nextState.timings.workElapsed).toBe(0)
    expect(nextState.timings.workTaking).toBe(0)
  })

  it("does not start manual work breaks when work breaks are disabled", () => {
    const config = defaultConfig()
    const initialState = createInitialState({
      work: {
        ...config.work,
        enabled: false,
      },
    })

    const nextState = reducer(initialState, {
      type: "START_WORK_BREAK",
      naturalContinuation: false,
    })

    expect(nextState).toBe(initialState)
  })
})

describe("natural idle breaks", () => {
  it("does not advance interval timers while the user is idle", () => {
    const config = defaultConfig()
    const initialState = {
      ...createInitialState(),
      timings: {
        miniElapsed: 30,
        miniTaking: 0,
        workElapsed: 120,
        workTaking: 0,
      },
    }

    const nextState = reducer(initialState, {
      type: "TICK",
      idleSeconds: config.mini.durationSeconds,
      dtSeconds: 5,
    })

    expect(nextState.timings.miniElapsed).toBe(initialState.timings.miniElapsed)
    expect(nextState.timings.workElapsed).toBe(initialState.timings.workElapsed)
    expect(nextState.timings.miniTaking).toBe(5)
  })
})
