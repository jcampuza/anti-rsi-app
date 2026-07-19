import type { StoreState } from "@antirsi/core";
import { Effect, Layer, Logger, PubSub } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import {
  AntiRsiRuntime,
  computeClampedDtSeconds,
  makeAntiRsiRuntimeLayer,
  type AntiRsiRuntimeEvent,
  type AntiRsiRuntimeService,
} from "./antirsi-runtime";
import { IdleProvider } from "./idle-provider";

type CapturedLog = {
  readonly logLevel: string;
  readonly message: unknown;
};

type TestHarness = {
  readonly logs: CapturedLog[];
  readonly run: <A>(
    body: (runtime: AntiRsiRuntimeService) => Effect.Effect<A>,
  ) => Promise<A>;
};

/**
 * Builds an AntiRsiRuntime backed by the TestClock so both the tick loop and
 * the status-update throttle are fully deterministic. Logs are captured in
 * memory (keeping output quiet and letting tests assert on logged defects).
 */
const makeHarness = (options?: {
  readonly idleSeconds?: Effect.Effect<number>;
  readonly initialConfig?: Partial<StoreState["config"]>;
}): TestHarness => {
  const logs: CapturedLog[] = [];
  const idleLayer = Layer.succeed(IdleProvider)({
    getSystemIdleTime: options?.idleSeconds ?? Effect.succeed(0),
  });
  const loggerLayer = Logger.layer(
    [
      Logger.make((entry) => {
        logs.push({ logLevel: entry.logLevel, message: entry.message });
      }),
    ],
    { mergeWithExisting: false },
  );
  const layer = makeAntiRsiRuntimeLayer(options?.initialConfig).pipe(
    Layer.provide(idleLayer),
    Layer.provideMerge(TestClock.layer()),
    Layer.provideMerge(loggerLayer),
  );
  return {
    logs,
    run: (body) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* AntiRsiRuntime;
          return yield* body(runtime);
        }).pipe(Effect.provide(layer)),
      ),
  };
};

/** Non-blocking drain of everything currently buffered in a subscription. */
const drain = (
  subscription: PubSub.Subscription<AntiRsiRuntimeEvent>,
): Effect.Effect<AntiRsiRuntimeEvent[]> =>
  Effect.sync(() => subscription.subscription.pollUpTo(Number.MAX_SAFE_INTEGER));

const statusUpdates = (events: AntiRsiRuntimeEvent[]): AntiRsiRuntimeEvent[] =>
  events.filter(
    (event) =>
      event.type === "engine-event" && event.event.type === "status-update",
  );

describe("AntiRsiRuntime tick loop (TestClock)", () => {
  it("dispatches ticks on the configured interval and advances timings", async () => {
    const harness = makeHarness();

    const snapshot = await harness.run((runtime) =>
      Effect.gen(function* () {
        // Default tickIntervalMs is 500. The first tick establishes the tick
        // baseline (dt 0); subsequent ticks accumulate elapsed time.
        yield* TestClock.adjust(500);
        yield* TestClock.adjust(500);
        yield* TestClock.adjust(500);
        return yield* runtime.snapshot;
      }),
    );

    expect(snapshot.timings.miniElapsed).toBeCloseTo(1, 5);
    expect(snapshot.timings.workElapsed).toBeCloseTo(1, 5);
  });

  it("logs a tick defect and keeps ticking (no silent engine death)", async () => {
    let calls = 0;
    const harness = makeHarness({
      idleSeconds: Effect.suspend(() => {
        calls += 1;
        if (calls <= 2) {
          return Effect.die(new Error("idle provider exploded"));
        }
        return Effect.succeed(0);
      }),
    });

    const snapshot = await harness.run((runtime) =>
      Effect.gen(function* () {
        // Ticks 1 and 2 die inside the idle provider; ticks 3 and 4 succeed.
        yield* TestClock.adjust(2000);
        return yield* runtime.snapshot;
      }),
    );

    // The loop survived the defects: later ticks ran and advanced state.
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(snapshot.timings.miniElapsed).toBeGreaterThan(0);

    // The defect was logged, not swallowed.
    const errorLogs = harness.logs.filter((log) => log.logLevel === "Error");
    expect(
      errorLogs.some((log) =>
        JSON.stringify(log.message).includes("Anti RSI runtime tick failed"),
      ),
    ).toBe(true);
  });

  describe("computeClampedDtSeconds", () => {
    // `TestClock.adjust` faithfully replays every scheduled sleep within a
    // time jump, so it cannot simulate a genuine laptop suspend/resume
    // (a frozen process whose timers don't fire until it wakes, at which
    // point a single tick's `Clock.currentTimeMillis` delta reflects the
    // entire outage). These tests exercise the tick loop's clamp function
    // directly against that scenario instead.
    const tickIntervalMs = 500;

    it("clamps a huge single-tick dt to 3x the tick interval", () => {
      const previousTickMs = 0;
      const nowMs = previousTickMs + 60 * 60 * 1000; // 1 hour later
      const dtSeconds = computeClampedDtSeconds(
        nowMs,
        previousTickMs,
        tickIntervalMs,
      );
      expect(dtSeconds).toBe((3 * tickIntervalMs) / 1000);
    });

    it("passes normal jitter through unclamped", () => {
      const previousTickMs = 0;
      const nowMs = previousTickMs + tickIntervalMs + 20; // small scheduling jitter
      const dtSeconds = computeClampedDtSeconds(
        nowMs,
        previousTickMs,
        tickIntervalMs,
      );
      expect(dtSeconds).toBeCloseTo((tickIntervalMs + 20) / 1000, 5);
    });

    it("reports dt 0 on the first tick (no prior tick to measure from)", () => {
      const nowMs = 60 * 60 * 1000;
      const dtSeconds = computeClampedDtSeconds(nowMs, null, tickIntervalMs);
      expect(dtSeconds).toBe(0);
    });
  });

  it("stops advancing timings while paused", async () => {
    const harness = makeHarness();

    const snapshot = await harness.run((runtime) =>
      Effect.gen(function* () {
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        yield* TestClock.adjust(2000);
        return yield* runtime.snapshot;
      }),
    );

    expect(snapshot.timings.miniElapsed).toBe(0);
    expect(snapshot.timings.workElapsed).toBe(0);
  });
});

describe("AntiRsiRuntime status-update throttling (TestClock)", () => {
  // A huge tick interval keeps the internal tick loop quiet so the test fully
  // controls which actions are dispatched.
  const quietLoopConfig = { tickIntervalMs: 600_000 };

  it("publishes status-update at most once per 5s", async () => {
    const harness = makeHarness({ initialConfig: quietLoopConfig });

    await harness.run((runtime) =>
      Effect.scoped(
        Effect.gen(function* () {
          const subscription = yield* runtime.subscribeEvents;

          // t=0: the layer published its initial status-update at t=0, so a
          // status-update produced now is inside the 5s window -> suppressed.
          yield* runtime.dispatch({ type: "TICK", idleSeconds: 0, dtSeconds: 1 });
          expect(statusUpdates(yield* drain(subscription))).toHaveLength(0);

          // t=5000: window elapsed -> the next status-update is published.
          yield* TestClock.adjust(5000);
          yield* runtime.dispatch({ type: "TICK", idleSeconds: 0, dtSeconds: 1 });
          expect(statusUpdates(yield* drain(subscription))).toHaveLength(1);

          // Still t=5000: immediately following status-update is suppressed.
          yield* runtime.dispatch({ type: "TICK", idleSeconds: 0, dtSeconds: 1 });
          expect(statusUpdates(yield* drain(subscription))).toHaveLength(0);
        }),
      ),
    );
  });

  it("state-transition events bypass the status-update throttle", async () => {
    const harness = makeHarness({ initialConfig: quietLoopConfig });

    await harness.run((runtime) =>
      Effect.scoped(
        Effect.gen(function* () {
          const subscription = yield* runtime.subscribeEvents;

          // Prime the throttle: a status-update was just published at t=0 by
          // the layer, so plain status-updates are currently suppressed.
          yield* runtime.dispatch({ type: "TICK", idleSeconds: 0, dtSeconds: 1 });
          expect(statusUpdates(yield* drain(subscription))).toHaveLength(0);

          // A break start still inside the throttle window must be delivered.
          yield* runtime.dispatch({ type: "START_MINI_BREAK" });
          const events = yield* drain(subscription);
          expect(
            events.some(
              (event) =>
                event.type === "engine-event" &&
                event.event.type === "mini-break-start",
            ),
          ).toBe(true);
        }),
      ),
    );
  });

  it("timings-reset events bypass the throttle and reset the window", async () => {
    const harness = makeHarness({ initialConfig: quietLoopConfig });

    await harness.run((runtime) =>
      Effect.scoped(
        Effect.gen(function* () {
          const subscription = yield* runtime.subscribeEvents;

          yield* runtime.dispatch({ type: "TICK", idleSeconds: 0, dtSeconds: 1 });
          yield* drain(subscription);

          // RESET_TIMINGS emits timings-reset which is never throttled.
          yield* runtime.dispatch({ type: "RESET_TIMINGS" });
          const events = yield* drain(subscription);
          expect(
            events.some(
              (event) =>
                event.type === "engine-event" &&
                event.event.type === "timings-reset",
            ),
          ).toBe(true);
        }),
      ),
    );
  });
});
