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
    const stdout = yield* spawner
      .string(ChildProcess.make("ioreg", ["-c", "IOHIDSystem"]))
      .pipe(Effect.catch(() => Effect.succeed("")));
    const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(stdout);
    if (!match) {
      return 0;
    }
    return Math.floor(Number(match[1]) / 1_000_000_000);
  },
);

export const IdleProviderLayer = Layer.effect(
  IdleProvider,
  Effect.gen(function* () {
    const idleSeconds = yield* Ref.make(0);
    const pollOnce = getMacIdleTimeSeconds().pipe(
      Effect.flatMap((seconds) => Ref.set(idleSeconds, seconds)),
      Effect.catch((error) =>
        Effect.logError("Idle polling failed", { error }),
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
  }),
);
