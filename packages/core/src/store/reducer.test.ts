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
    // lastIdleSeconds is intentionally preserved across a config-triggered
    // reset so a config change while idle doesn't emit a spurious "resumed".
    expect(nextState.lastIdleSeconds).toBe(5)
    expect(nextState.lastUpdatedSeconds).toBe(0)
    expect(nextState.config.mini.intervalSeconds).toBe(
      defaultConfig().mini.intervalSeconds + 30,
    )
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

describe("postpone breaks", () => {
  it("postpones the next mini break by resetting the mini interval timer", () => {
    const config = defaultConfig()
    const initialState = {
      ...createInitialState(),
      timings: {
        miniElapsed: config.mini.intervalSeconds - 5,
        miniTaking: 0,
        workElapsed: 120,
        workTaking: 0,
      },
    }

    const nextState = reducer(initialState, {
      type: "POSTPONE_BREAK",
      breakType: "mini",
    })

    expect(nextState.status).toBe("normal")
    expect(nextState.timings).toEqual({
      miniElapsed: 0,
      miniTaking: 0,
      workElapsed: 120,
      workTaking: 0,
    })
    expect(nextState.breakStartDelayElapsed).toBe(0)
  })

  it("postpones the next work break using the configured postpone duration", () => {
    const config = defaultConfig()
    const initialState = {
      ...createInitialState(),
      timings: {
        miniElapsed: config.mini.intervalSeconds - 5,
        miniTaking: 0,
        workElapsed: config.work.intervalSeconds - 5,
        workTaking: 0,
      },
    }

    const nextState = reducer(initialState, {
      type: "POSTPONE_BREAK",
      breakType: "work",
    })

    expect(nextState.status).toBe("normal")
    expect(nextState.timings).toEqual({
      miniElapsed: 0,
      miniTaking: 0,
      workElapsed: config.work.intervalSeconds - config.work.postponeSeconds,
      workTaking: 0,
    })
    expect(nextState.breakStartDelayElapsed).toBe(0)
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
      dtSeconds: 1,
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

  it("starts a pending mini break after the overlay acknowledgement timeout", () => {
    const config = defaultConfig()
    const pendingState = {
      ...createInitialState(),
      status: "pending-mini" as const,
      timings: {
        miniElapsed: config.mini.intervalSeconds,
        miniTaking: 0,
        workElapsed: 0,
        workTaking: 0,
      },
    }

    const activeState = reducer(pendingState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 2,
    })

    expect(activeState.status).toBe("in-mini")
    expect(activeState.timings.miniTaking).toBe(0)
  })

  it("starts a pending work break after the overlay acknowledgement timeout", () => {
    const config = defaultConfig()
    const pendingState = {
      ...createInitialState(),
      status: "pending-work" as const,
      timings: {
        miniElapsed: 0,
        miniTaking: config.mini.durationSeconds,
        workElapsed: config.work.intervalSeconds,
        workTaking: 0,
      },
    }

    const activeState = reducer(pendingState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 2,
    })

    expect(activeState.status).toBe("in-work")
    expect(activeState.timings.workTaking).toBe(0)
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

describe("natural continuation through pending work breaks", () => {
  const pendingNaturalState = () => {
    const initial = createInitialState()
    const state = {
      ...initial,
      timings: { ...initial.timings, workTaking: 120 },
    }
    return reducer(state, { type: "START_WORK_BREAK", naturalContinuation: true })
  }

  it("preserves accrued workTaking through pending and ACK when naturalContinuation is true", () => {
    const pending = pendingNaturalState()
    expect(pending.status).toBe("pending-work")
    expect(pending.pendingNaturalContinuation).toBe(true)
    expect(pending.timings.workTaking).toBe(120)

    const active = reducer(pending, {
      type: "ACK_BREAK_VISIBLE",
      breakType: "work",
    })
    expect(active.status).toBe("in-work")
    expect(active.timings.workTaking).toBe(120)
  })

  it("preserves accrued workTaking when the pending break activates via the ack timeout", () => {
    const pending = pendingNaturalState()

    const active = reducer(pending, {
      type: "TICK",
      idleSeconds: 10,
      dtSeconds: 2,
    })
    expect(active.status).toBe("in-work")
    expect(active.timings.workTaking).toBe(120)
  })

  it("starts the work break from zero when naturalContinuation is false", () => {
    const initial = createInitialState()
    const state = {
      ...initial,
      timings: { ...initial.timings, workTaking: 120 },
    }
    const pending = reducer(state, {
      type: "START_WORK_BREAK",
      naturalContinuation: false,
    })
    expect(pending.pendingNaturalContinuation).toBe(false)
    expect(pending.timings.workTaking).toBe(0)

    const active = reducer(pending, {
      type: "ACK_BREAK_VISIBLE",
      breakType: "work",
    })
    expect(active.timings.workTaking).toBe(0)
  })

  it("does not carry naturalContinuation through a tick-triggered (auto) pending work break", () => {
    const config = defaultConfig()
    const initialState = {
      ...createInitialState(),
      timings: {
        miniElapsed: 0,
        miniTaking: 0,
        workElapsed: config.work.intervalSeconds,
        workTaking: 90,
      },
    }

    const pending = reducer(initialState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 1,
    })
    expect(pending.status).toBe("pending-work")
    expect(pending.pendingNaturalContinuation).toBe(false)

    const active = reducer(pending, {
      type: "ACK_BREAK_VISIBLE",
      breakType: "work",
    })
    expect(active.status).toBe("in-work")
    expect(active.timings.workTaking).toBe(0)
  })
})

describe("work break trigger during natural idle", () => {
  it("does not queue a work break while the user is in a natural idle break", () => {
    const config = defaultConfig()
    const initialState = {
      ...createInitialState(),
      timings: {
        miniElapsed: 0,
        miniTaking: 0,
        workElapsed: config.work.intervalSeconds,
        workTaking: 0,
      },
    }

    const nextState = reducer(initialState, {
      type: "TICK",
      idleSeconds: config.naturalBreakContinuationWindowSeconds,
      dtSeconds: 1,
    })

    expect(nextState.status).toBe("normal")
  })

  it("still queues the work break once the user becomes active again", () => {
    const config = defaultConfig()
    const idleState = {
      ...createInitialState(),
      timings: {
        miniElapsed: 0,
        miniTaking: 0,
        workElapsed: config.work.intervalSeconds,
        workTaking: 0,
      },
      lastIdleSeconds: config.naturalBreakContinuationWindowSeconds,
    }

    const nextState = reducer(idleState, {
      type: "TICK",
      idleSeconds: 0,
      dtSeconds: 1,
    })

    expect(nextState.status).toBe("pending-work")
  })
})

describe("config reset idle preservation", () => {
  it("preserves lastIdleSeconds across RESET_CONFIG", () => {
    const state = { ...createInitialState(), lastIdleSeconds: 42 }
    const nextState = reducer(state, { type: "RESET_CONFIG" })
    expect(nextState.lastIdleSeconds).toBe(42)
  })
})
