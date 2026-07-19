import { defaultConfig, type AntiRsiConfig } from "@antirsi/core";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { AntiRsiRuntime, makeAntiRsiRuntimeLayer } from "./antirsi-runtime";
import { ConfigStore } from "./config-store";
import { IdleProvider } from "./idle-provider";
import { startSidecarOrchestration } from "./orchestration";
import { ProcessService } from "./process-service";

const TestIdleProviderLayer = Layer.succeed(IdleProvider)({
  getSystemIdleTime: Effect.succeed(0),
});

const NoopProcessServiceLayer = Layer.succeed(ProcessService)({
  startPolling: () => Effect.void,
});

const makeRecordingConfigStoreLayer = (saved: AntiRsiConfig[]) =>
  Layer.succeed(ConfigStore)({
    load: () => Effect.succeed(null),
    save: (_userDataDir, config) =>
      Effect.sync(() => {
        saved.push(config);
      }),
  });

/**
 * Waits for the orchestration's forked config-save consumer to catch up by
 * repeatedly yielding (bounded, cooperative — no real sleeps).
 */
const awaitCondition = (predicate: () => boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < 1000; i += 1) {
      if (predicate()) {
        return;
      }
      yield* Effect.yieldNow;
    }
  });

describe("startSidecarOrchestration", () => {
  it("persists the current config on startup", async () => {
    const saved: AntiRsiConfig[] = [];
    const layers = Layer.mergeAll(
      makeAntiRsiRuntimeLayer({ tickIntervalMs: 600_000 }).pipe(
        Layer.provide(TestIdleProviderLayer),
      ),
      makeRecordingConfigStoreLayer(saved),
      NoopProcessServiceLayer,
    );

    await Effect.runPromise(
      Effect.scoped(startSidecarOrchestration({ userDataDir: "/unused" })).pipe(
        Effect.provide(layers),
      ),
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({ ...defaultConfig(), tickIntervalMs: 600_000 });
  });

  it("persists a SET_CONFIG dispatched immediately after setup (subscription race regression)", async () => {
    const saved: AntiRsiConfig[] = [];
    const layers = Layer.mergeAll(
      makeAntiRsiRuntimeLayer({ tickIntervalMs: 600_000 }).pipe(
        Layer.provide(TestIdleProviderLayer),
      ),
      makeRecordingConfigStoreLayer(saved),
      NoopProcessServiceLayer,
    );

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* AntiRsiRuntime;
          yield* startSidecarOrchestration({ userDataDir: "/unused" });

          // Dispatch before the forked save consumer has necessarily started
          // pulling. The subscription is created synchronously during setup,
          // so this event must not be lost.
          yield* runtime.dispatch({
            type: "SET_CONFIG",
            config: { tickIntervalMs: 250 },
          });

          yield* awaitCondition(() =>
            saved.some((config) => config.tickIntervalMs === 250),
          );
        }),
      ).pipe(Effect.provide(layers)),
    );

    expect(saved.map((config) => config.tickIntervalMs)).toEqual([
      600_000, 250,
    ]);
  });
});
