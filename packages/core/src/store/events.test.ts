import { describe, expect, it } from "vitest"
import { createInitialState, reducer } from "./reducer"
import { deriveEvents } from "./events"
import { selectSnapshot } from "./selectors"

describe("deriveEvents", () => {
  it("emits timings-reset for RESET_TIMINGS", () => {
    const prevState = {
      ...createInitialState(),
      timings: {
        miniElapsed: 120,
        miniTaking: 0,
        workElapsed: 600,
        workTaking: 0,
      },
    }
    const action = { type: "RESET_TIMINGS" as const }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).toContainEqual({ type: "timings-reset" })
    expect(events).toContainEqual({ type: "status-update" })
  })

  it("emits paused when an inhibitor is added", () => {
    const prevState = createInitialState()
    const action = { type: "ADD_INHIBITOR" as const, id: "system:suspend" }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).toContainEqual({ type: "paused" })
    expect(events).toContainEqual({ type: "status-update" })
  })

  it("emits resumed when the last inhibitor is removed", () => {
    const prevState = {
      ...createInitialState(),
      inhibitors: new Set(["system:suspend"]),
    }
    const action = { type: "REMOVE_INHIBITOR" as const, id: "system:suspend" }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).toContainEqual({ type: "resumed" })
    expect(events).toContainEqual({ type: "status-update" })
  })

  it("emits paused when natural idle stops interval timers", () => {
    const prevState = createInitialState()
    const action = {
      type: "TICK" as const,
      idleSeconds: prevState.config.mini.durationSeconds,
      dtSeconds: 1,
    }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).toContainEqual({ type: "paused" })
    expect(selectSnapshot(nextState).paused).toBe(false)
    expect(selectSnapshot(nextState).timersRunning).toBe(false)
  })

  it("emits resumed when the user becomes active after natural idle", () => {
    const idleState = reducer(createInitialState(), {
      type: "TICK",
      idleSeconds: defaultIdleSeconds(),
      dtSeconds: 1,
    })
    const action = { type: "TICK" as const, idleSeconds: 0, dtSeconds: 1 }
    const nextState = reducer(idleState, action)
    const { events } = deriveEvents(idleState, nextState, action)

    expect(events).toContainEqual({ type: "resumed" })
    expect(selectSnapshot(nextState).timersRunning).toBe(true)
  })

  it("emits timings-reset when SET_CONFIG changes break intervals", () => {
    const prevState = {
      ...createInitialState(),
      timings: {
        miniElapsed: 90,
        miniTaking: 0,
        workElapsed: 300,
        workTaking: 0,
      },
    }
    const action = {
      type: "SET_CONFIG" as const,
      config: { mini: { ...prevState.config.mini, intervalSeconds: 600 } },
    }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).toContainEqual({ type: "timings-reset" })
  })
})

const defaultIdleSeconds = (): number => createInitialState().config.mini.durationSeconds
