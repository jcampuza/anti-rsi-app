import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { ActionSchema } from "./http-api";

const decodeSetConfig = (config: unknown) =>
  Schema.decodeUnknownSync(ActionSchema)({ type: "SET_CONFIG", config });

describe("ActionSchema SET_CONFIG partial config validation", () => {
  it("accepts a valid partial config", () => {
    const action = decodeSetConfig({
      mini: { intervalSeconds: 300, durationSeconds: 15 },
    });
    expect(action.type).toBe("SET_CONFIG");
  });

  it("rejects zero mini.intervalSeconds", () => {
    expect(() =>
      decodeSetConfig({ mini: { intervalSeconds: 0, durationSeconds: 15 } }),
    ).toThrow();
  });

  it("rejects negative mini.durationSeconds", () => {
    expect(() =>
      decodeSetConfig({ mini: { intervalSeconds: 300, durationSeconds: -1 } }),
    ).toThrow();
  });

  it("rejects zero tickIntervalMs", () => {
    expect(() => decodeSetConfig({ tickIntervalMs: 0 })).toThrow();
  });

  it("rejects negative naturalBreakContinuationWindowSeconds", () => {
    expect(() =>
      decodeSetConfig({ naturalBreakContinuationWindowSeconds: -5 }),
    ).toThrow();
  });

  it("rejects negative breakWarningLeadSeconds", () => {
    expect(() => decodeSetConfig({ breakWarningLeadSeconds: -1 })).toThrow();
  });

  it("rejects negative breakStartGraceSeconds", () => {
    expect(() => decodeSetConfig({ breakStartGraceSeconds: -1 })).toThrow();
  });

  it("rejects negative maxBreakStartDelaySeconds", () => {
    expect(() => decodeSetConfig({ maxBreakStartDelaySeconds: -1 })).toThrow();
  });

  it("rejects zero work.intervalSeconds", () => {
    expect(() =>
      decodeSetConfig({
        work: {
          enabled: true,
          intervalSeconds: 0,
          durationSeconds: 480,
          postponeSeconds: 600,
        },
      }),
    ).toThrow();
  });

  it("does not inject decoding defaults into sparse patches", () => {
    const action = decodeSetConfig({ tickIntervalMs: 250 });
    if (action.type !== "SET_CONFIG") throw new Error("unexpected action");
    expect(Object.keys(action.config)).toEqual(["tickIntervalMs"]);
  });

  it("accepts zero naturalBreakContinuationWindowSeconds (non-negative, not strictly positive)", () => {
    const action = decodeSetConfig({ naturalBreakContinuationWindowSeconds: 0 });
    expect(action.type).toBe("SET_CONFIG");
  });
});
