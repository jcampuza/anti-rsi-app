import { describe, expect, it } from "vitest"
import { createInitialState, reducer } from "./reducer"
import { deriveEvents } from "./events"

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

  it("does not emit timings-reset for appearance-only SET_CONFIG", () => {
    const prevState = createInitialState()
    const action = {
      type: "SET_CONFIG" as const,
      config: { appearance: { translucentWindows: true } },
    }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).not.toContainEqual({ type: "timings-reset" })
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
      config: { mini: { intervalSeconds: 600 } },
    }
    const nextState = reducer(prevState, action)
    const { events } = deriveEvents(prevState, nextState, action)

    expect(events).toContainEqual({ type: "timings-reset" })
  })
})
