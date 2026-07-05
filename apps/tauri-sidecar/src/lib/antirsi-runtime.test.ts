import {
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Scope,
  Stream,
} from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  AntiRsiRuntime,
  makeAntiRsiRuntimeLayer,
  type AntiRsiRuntimeEvent,
  type AntiRsiRuntimeService,
} from "./antirsi-runtime";
import { IdleProvider } from "./idle-provider";

type RuntimeHandle = {
  readonly runtime: AntiRsiRuntimeService;
  readonly close: () => Promise<void>;
};

const TestIdleProviderLayer = Layer.succeed(IdleProvider)({
  getSystemIdleTime: Effect.succeed(0),
});

const makeRuntime = async (): Promise<RuntimeHandle> => {
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithMemoMap(
      makeAntiRsiRuntimeLayer().pipe(Layer.provide(TestIdleProviderLayer)),
      Layer.makeMemoMapUnsafe(),
      scope,
    ),
  );
  return {
    runtime: Context.get(context, AntiRsiRuntime),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

const captureNextEvent = <Event extends AntiRsiRuntimeEvent>(
  runtime: AntiRsiRuntimeService,
  predicate: (event: AntiRsiRuntimeEvent) => event is Event,
) =>
  runtime.events.pipe(
    Stream.filter(predicate),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
    Effect.forkDetach({ startImmediately: true }),
  );

describe("AntiRsiRuntime", () => {
  let closeRuntime: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeRuntime?.();
    closeRuntime = undefined;
  });

  it("updates snapshots and emits engine events for dispatched commands", async () => {
    const { runtime, close } = await makeRuntime();
    closeRuntime = close;

    const event = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* captureNextEvent(
          runtime,
          (
            candidate,
          ): candidate is Extract<
            AntiRsiRuntimeEvent,
            { type: "engine-event" }
          > =>
            candidate.type === "engine-event" &&
            candidate.event.type === "paused",
        );
        yield* runtime.dispatch({ type: "SET_USER_PAUSED", value: true });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(event.snapshot.paused).toBe(true);
    expect((await Effect.runPromise(runtime.snapshot)).paused).toBe(true);
  });

  it("emits config changes from SET_CONFIG", async () => {
    const { runtime, close } = await makeRuntime();
    closeRuntime = close;

    const event = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* captureNextEvent(
          runtime,
          (
            candidate,
          ): candidate is Extract<
            AntiRsiRuntimeEvent,
            { type: "config-changed" }
          > => candidate.type === "config-changed",
        );
        yield* runtime.dispatch({
          type: "SET_CONFIG",
          config: { tickIntervalMs: 250 },
        });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(event.config.tickIntervalMs).toBe(250);
    expect((await Effect.runPromise(runtime.config)).tickIntervalMs).toBe(250);
  });

  it("emits process changes from setProcesses", async () => {
    const { runtime, close } = await makeRuntime();
    closeRuntime = close;

    const event = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* captureNextEvent(
          runtime,
          (
            candidate,
          ): candidate is Extract<
            AntiRsiRuntimeEvent,
            { type: "processes-changed" }
          > => candidate.type === "processes-changed",
        );
        yield* runtime.setProcesses(["Zoom"]);
        return yield* Fiber.join(fiber);
      }),
    );

    expect(event.processes).toEqual(["Zoom"]);
    expect(await Effect.runPromise(runtime.processes)).toEqual(["Zoom"]);
  });
});
