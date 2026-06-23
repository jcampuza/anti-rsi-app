import type { AntiRsiSnapshot } from "@antirsi/core";
import { createRoot, createSignal, type Accessor, type Setter } from "solid-js";
import { describe, expect, it } from "vitest";
import { projectTimings, useInterpolatedTimings } from "./useInterpolatedTimings";

const snapshot = (
  overrides: Partial<AntiRsiSnapshot> = {},
): AntiRsiSnapshot => ({
  state: "normal",
  timings: {
    miniElapsed: 0,
    miniTaking: 0,
    workElapsed: 0,
    workTaking: 0,
  },
  lastIdleSeconds: 0,
  lastUpdatedSeconds: 0,
  paused: false,
  timersRunning: true,
  breakWarning: null,
  ...overrides,
});

describe("projectTimings", () => {
  it("freezes normal countdown projection when timers are not running", () => {
    const projected = projectTimings(
      snapshot({
        timersRunning: false,
        timings: {
          miniElapsed: 0,
          miniTaking: 13,
          workElapsed: 0,
          workTaking: 0,
        },
      }),
      1_000,
      11_000,
    );

    expect(projected).toEqual({
      miniElapsed: 0,
      miniTaking: 13,
      workElapsed: 0,
      workTaking: 0,
    });
  });
});

describe("useInterpolatedTimings", () => {
  it("does not recursively update after a break ends while timers are idle", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis;

    try {
      let timings!: Accessor<AntiRsiSnapshot["timings"]>;
      let setCurrentSnapshot!: Setter<AntiRsiSnapshot>;
      let setReceivedAt!: Setter<number>;

      const dispose = createRoot((dispose) => {
        const [currentSnapshot, updateSnapshot] = createSignal(
          snapshot({
            state: "in-mini",
            timings: {
              miniElapsed: 240,
              miniTaking: 13,
              workElapsed: 0,
              workTaking: 0,
            },
          }),
        );
        const [receivedAt, updateReceivedAt] = createSignal(performance.now());
        timings = useInterpolatedTimings(currentSnapshot, receivedAt);
        setCurrentSnapshot = updateSnapshot;
        setReceivedAt = updateReceivedAt;

        return dispose;
      });

      await Promise.resolve();

      setCurrentSnapshot(
        snapshot({
          timersRunning: false,
          timings: {
            miniElapsed: 0,
            miniTaking: 13,
            workElapsed: 0,
            workTaking: 0,
          },
        }),
      );
      setReceivedAt(performance.now());
      await Promise.resolve();

      expect(timings().miniElapsed).toBe(0);
      expect(timings().miniTaking).toBe(13);

      dispose();
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
