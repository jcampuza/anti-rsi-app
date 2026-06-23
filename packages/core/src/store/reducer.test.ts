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

    expect(nextState.status).toBe("pending-mini")
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

describe("pending breaks", () => {
  it("waits for overlay acknowledgement before advancing mini break duration", () => {
    const config = defaultConfig()
    const initialState = {
      ...createInitialState(),
      timings: {
        miniElapsed: config.mini.intervalSeconds - 0.25,
        miniTaking: 0,
        workElapsed: 0,
        workTaking: 0,
      },
    }

    const pendingState = reducer(initialState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 0.5,
    })
    expect(pendingState.status).toBe("pending-mini")
    expect(pendingState.timings.miniTaking).toBe(0)

    const stillPendingState = reducer(pendingState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 5,
    })
    expect(stillPendingState.status).toBe("pending-mini")
    expect(stillPendingState.timings.miniTaking).toBe(0)

    const activeState = reducer(stillPendingState, {
      type: "ACK_BREAK_VISIBLE",
      breakType: "mini",
    })
    expect(activeState.status).toBe("in-mini")
    expect(activeState.timings.miniTaking).toBe(0)
  })

  it("can wait for a pause in activity before entering a pending break", () => {
    const config = defaultConfig()
    const initialState = createInitialState({
      waitForActivityPauseBeforeBreak: true,
      breakStartGraceSeconds: 2,
      maxBreakStartDelaySeconds: 30,
    })
    const dueState = {
      ...initialState,
      timings: {
        ...initialState.timings,
        miniElapsed: config.mini.intervalSeconds - 0.25,
      },
    }

    const waitingState = reducer(dueState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 0.5,
    })
    expect(waitingState.status).toBe("normal")
    expect(waitingState.timings.miniElapsed).toBe(config.mini.intervalSeconds)
    expect(waitingState.breakStartDelayElapsed).toBe(0.5)

    const pendingState = reducer(waitingState, {
      type: "TICK",
      idleSeconds: 2,
      dtSeconds: 0.5,
    })
    expect(pendingState.status).toBe("pending-mini")
  })

  it("forces a pending break after the configured maximum activity delay", () => {
    const config = defaultConfig()
    const initialState = createInitialState({
      waitForActivityPauseBeforeBreak: true,
      breakStartGraceSeconds: 2,
      maxBreakStartDelaySeconds: 3,
    })
    const waitingState = {
      ...initialState,
      timings: {
        ...initialState.timings,
        miniElapsed: config.mini.intervalSeconds,
      },
      breakStartDelayElapsed: 2.5,
    }

    const pendingState = reducer(waitingState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 0.5,
    })
    expect(pendingState.status).toBe("pending-mini")
  })
})
