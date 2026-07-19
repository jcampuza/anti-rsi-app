import { Context, Effect, Layer, Ref } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const IDLE_POLL_INTERVAL_MS = 1000;

type IdleProviderService = {
  readonly getSystemIdleTime: Effect.Effect<number>;
};

export class IdleProvider extends Context.Service<
  IdleProvider,
  IdleProviderService
>()("@antirsi/tauri-sidecar/IdleProvider") {}

const getMacIdleTimeSeconds = Effect.fn("IdleProvider.getMacIdleTimeSeconds")(
  function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const stdout = yield* spawner.string(
      ChildProcess.make("ioreg", [
        "-r",
        "-c",
        "IOHIDSystem",
        "-d",
        "1",
        "-k",
        "HIDIdleTime",
      ]),
    );
    const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(stdout);
    if (!match) {
      return 0;
    }
    return Math.floor(Number(match[1]) / 1_000_000_000);
  },
);

// kCGEventSourceStateHIDSystemState / kCGAnyInputEventType
const HID_SYSTEM_STATE = 1;
const ANY_INPUT_EVENT_TYPE = 0xffffffff;

const loadNativeIdleReader = (): (() => number) | null => {
  if (!process.versions.bun) {
    return null;
  }
  try {
    const { dlopen, FFIType } = require("bun:ffi") as {
      dlopen: (
        path: string,
        symbols: Record<string, { args: unknown[]; returns: unknown }>,
      ) => { symbols: Record<string, (...args: number[]) => number> };
      FFIType: Record<string, unknown>;
    };
    const coreGraphics = dlopen(
      "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
      {
        CGEventSourceSecondsSinceLastEventType: {
          args: [FFIType.u32, FFIType.u32],
          returns: FFIType.f64,
        },
      },
    );
    const secondsSinceLastEvent =
      coreGraphics.symbols.CGEventSourceSecondsSinceLastEventType;
    if (secondsSinceLastEvent === undefined) {
      return null;
    }
    const probe = secondsSinceLastEvent(HID_SYSTEM_STATE, ANY_INPUT_EVENT_TYPE);
    if (!Number.isFinite(probe) || probe < 0) {
      return null;
    }
    return () => secondsSinceLastEvent(HID_SYSTEM_STATE, ANY_INPUT_EVENT_TYPE);
  } catch {
    return null;
  }
};

const makeIoregPollingProvider = Effect.fn(
  "IdleProvider.makeIoregPollingProvider",
)(function* () {
  const idleSeconds = yield* Ref.make(0);
  const failureLogged = yield* Ref.make(false);
  const pollOnce = getMacIdleTimeSeconds().pipe(
    Effect.flatMap((seconds) =>
      Ref.set(idleSeconds, seconds).pipe(
        Effect.andThen(Ref.set(failureLogged, false)),
      ),
    ),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* Ref.set(idleSeconds, 0);
        const alreadyLogged = yield* Ref.getAndSet(failureLogged, true);
        if (!alreadyLogged) {
          yield* Effect.logError("Idle polling failed", { cause });
        }
      }),
    ),
  );

  yield* pollOnce.pipe(
    Effect.andThen(Effect.sleep(IDLE_POLL_INTERVAL_MS)),
    Effect.forever,
    Effect.forkScoped,
  );

  return IdleProvider.of({
    getSystemIdleTime: Ref.get(idleSeconds),
  });
});

export const IdleProviderLayer = Layer.effect(
  IdleProvider,
  Effect.gen(function* () {
    const readNativeIdleSeconds = loadNativeIdleReader();
    if (readNativeIdleSeconds !== null) {
      yield* Effect.logInfo("Idle provider using CoreGraphics FFI");
      return IdleProvider.of({
        getSystemIdleTime: Effect.sync(() =>
          Math.floor(readNativeIdleSeconds()),
        ),
      });
    }
    yield* Effect.logInfo("Idle provider using ioreg polling");
    return yield* makeIoregPollingProvider();
  }),
);
