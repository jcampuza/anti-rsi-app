import { describe, expect, it } from "vitest"
import { antiRsiConfigSchema, parseAntiRsiConfig } from "./config-schema"

const validConfig = {
  mini: { intervalSeconds: 240, durationSeconds: 13 },
  work: {
    intervalSeconds: 3000,
    durationSeconds: 480,
    postponeSeconds: 600,
  },
  tickIntervalMs: 500,
  naturalBreakContinuationWindowSeconds: 30,
}

describe("parseAntiRsiConfig", () => {
  it("parses a valid config", () => {
    const config = parseAntiRsiConfig(validConfig)
    expect(config.mini.intervalSeconds).toBe(240)
    expect(config.work.enabled).toBe(true)
  })

  it("defaults work.enabled to true when omitted", () => {
    const config = parseAntiRsiConfig({
      ...validConfig,
      work: {
        intervalSeconds: 3000,
        durationSeconds: 480,
        postponeSeconds: 600,
      },
    })
    expect(config.work.enabled).toBe(true)
  })

  it("rejects non-positive intervalSeconds", () => {
    expect(() =>
      parseAntiRsiConfig({
        ...validConfig,
        mini: { intervalSeconds: 0, durationSeconds: 13 },
      }),
    ).toThrow()
  })

  it("rejects missing required fields", () => {
    expect(() => parseAntiRsiConfig({ mini: validConfig.mini })).toThrow()
  })

  it("rejects negative naturalBreakContinuationWindowSeconds", () => {
    expect(() =>
      parseAntiRsiConfig({
        ...validConfig,
        naturalBreakContinuationWindowSeconds: -1,
      }),
    ).toThrow()
  })
})

describe("antiRsiConfigSchema", () => {
  it("accepts zero for naturalBreakContinuationWindowSeconds", () => {
    const result = antiRsiConfigSchema.safeParse({
      ...validConfig,
      naturalBreakContinuationWindowSeconds: 0,
    })
    expect(result.success).toBe(true)
  })
})
