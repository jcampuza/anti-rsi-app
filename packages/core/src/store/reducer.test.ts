import { describe, expect, it } from "vitest"
import { defaultConfig } from "../antirsi-core"
import { createInitialState, reducer } from "./reducer"

describe("reducer config updates", () => {
  it("preserves break progress when only appearance changes", () => {
    const initialState = {
      ...createInitialState(),
      status: "in-mini" as const,
      timings: {
        miniElapsed: 240,
        miniTaking: 6,
        workElapsed: 1200,
        workTaking: 0,
      },
      lastIdleSeconds: 2,
      lastUpdatedSeconds: 1234,
    }

    const nextState = reducer(initialState, {
      type: "SET_CONFIG",
      config: {
        appearance: {
          translucentWindows: true,
        },
      },
    })

    expect(nextState.status).toBe(initialState.status)
    expect(nextState.timings).toEqual(initialState.timings)
    expect(nextState.lastIdleSeconds).toBe(initialState.lastIdleSeconds)
    expect(nextState.lastUpdatedSeconds).toBe(initialState.lastUpdatedSeconds)
    expect(nextState.config.appearance.translucentWindows).toBe(true)
  })

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
