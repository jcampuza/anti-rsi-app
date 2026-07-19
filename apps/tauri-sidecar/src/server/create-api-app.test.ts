import type { MainEvent, SnapshotEventMeta } from "@antirsi/contracts";
import { Effect, Fiber, Layer, Logger, References, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  AntiRsiRuntime,
  makeAntiRsiRuntimeLayer,
  type AntiRsiRuntimeService,
} from "../lib/antirsi-runtime";
import { IdleProvider } from "../lib/idle-provider";

import { ApiEventBus, ApiEventBusLayer } from "./create-api-app";

type CapturedLog = {
  readonly logLevel: string;
  readonly message: unknown;
};

type ApiEventBusService = {
  readonly events: () => Stream.Stream<MainEvent>;
};

type BusHarness = {
  readonly logs: CapturedLog[];
  readonly run: <A>(
    body: (deps: {
      readonly runtime: AntiRsiRuntimeService;
      readonly bus: ApiEventBusService;
    }) => Effect.Effect<A>,
  ) => Promise<A>;
};

const TestIdleProviderLayer = Layer.succeed(IdleProvider)({
  getSystemIdleTime: Effect.succeed(0),
});

/**
 * Builds the runtime + ApiEventBus with an in-memory logger. A huge tick
 * interval keeps the runtime's internal tick loop from interleaving events.
 */
const makeBusHarness = (): BusHarness => {
  const logs: CapturedLog[] = [];
  const layer = ApiEventBusLayer.pipe(
    Layer.provideMerge(
      makeAntiRsiRuntimeLayer({ tickIntervalMs: 600_000 }).pipe(
        Layer.provide(TestIdleProviderLayer),
      ),
    ),
    Layer.provideMerge(
      Logger.layer(
        [
          Logger.make((entry) => {
            logs.push({ logLevel: entry.logLevel, message: entry.message });
          }),
        ],
        { mergeWithExisting: false },
      ),
    ),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel)("Debug")),
  );
  return {
    logs,
    run: (body) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* AntiRsiRuntime;
          const bus = yield* ApiEventBus;
          return yield* body({ runtime, bus });
        }).pipe(Effect.provide(layer)),
      ),
  };
};

/** Lets already-running fibers (event bridge, client streams) catch up. */
const settle = Effect.gen(function* () {
  for (let i = 0; i < 20; i += 1) {
    yield* Effect.yieldNow;
  }
});

const metaOf = (event: MainEvent): SnapshotEventMeta | undefined =>
  "meta" in event ? event.meta : undefined;

describe("ApiEventBus client streams", () => {
  it("delivers init first with a snapshot reflecting pre-subscription events", async () => {
    const harness = makeBusHarness();

    const events = await harness.run(({ runtime, bus }) =>
      Effect.gen(function* () {
        // Published before the client exists: must be reflected in the init
        // snapshot rather than delivered (or lost) as a stream event.
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        yield* settle;

        const fiber = yield* bus.events().pipe(
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );

        // Published right after subscription: must not be lost.
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: false });
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "init",
      "timers-resumed",
      "timers-paused",
    ]);
    const init = events[0] as Extract<MainEvent, { type: "init" }>;
    expect(init.snapshot.paused).toBe(true);
    expect(init.meta?.sequence).toBe(1);
  });

  it("assigns contiguous meta.sequence across mixed event types", async () => {
    const harness = makeBusHarness();

    const events = await harness.run(({ runtime, bus }) =>
      Effect.gen(function* () {
        const fiber = yield* bus.events().pipe(
          Stream.take(5),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );

        // Mix meta-carrying snapshot events with non-meta events.
        yield* runtime.dispatch({
          type: "SET_CONFIG",
          config: { naturalBreakContinuationWindowSeconds: 45 },
        });
        yield* runtime.setProcesses(["Zoom"]);
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: false });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "init",
      "config-changed",
      "processes-updated",
      "timers-paused",
      "timers-resumed",
    ]);

    const sequences = events
      .map(metaOf)
      .filter((meta): meta is SnapshotEventMeta => meta !== undefined)
      .map((meta) => meta.sequence);
    // Strictly monotonic and contiguous starting at 1, even though non-meta
    // events (config-changed, processes-updated) are interleaved.
    expect(sequences).toEqual([1, 2, 3]);
  });

  it("keeps per-client sequence counters independent", async () => {
    const harness = makeBusHarness();

    const [first, second] = await harness.run(({ runtime, bus }) =>
      Effect.gen(function* () {
        const firstFiber = yield* bus.events().pipe(
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        const firstEvents = yield* Fiber.join(firstFiber);

        const secondFiber = yield* bus.events().pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );
        const secondEvents = yield* Fiber.join(secondFiber);
        return [firstEvents, secondEvents] as const;
      }),
    );

    expect(metaOf(first[0]!)?.sequence).toBe(1);
    expect(metaOf(first[1]!)?.sequence).toBe(2);
    // A fresh client starts back at sequence 1.
    expect(second[0]!.type).toBe("init");
    expect(metaOf(second[0]!)?.sequence).toBe(1);
  });

  it("releases the client subscription when the stream is interrupted", async () => {
    const harness = makeBusHarness();

    await harness.run(({ runtime, bus }) =>
      Effect.gen(function* () {
        const fiber = yield* bus.events().pipe(
          Stream.runForEach(() => Effect.void),
          Effect.forkChild({ startImmediately: true }),
        );
        yield* settle;
        yield* Fiber.interrupt(fiber);

        // The bus keeps working for new clients after a disconnect.
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        const nextClient = yield* bus.events().pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );
        const events = yield* Fiber.join(nextClient);
        expect(events[0]!.type).toBe("init");
      }),
    );

    // The stream finalizer ran, proving the scoped pubsub subscription was
    // released on disconnect.
    expect(
      harness.logs.some((log) =>
        JSON.stringify(log.message).includes("SSE client disconnected"),
      ),
    ).toBe(true);
  });
});
