import { Context, Effect, Layer, Ref, type Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const WATCHED_PROCESSES = ["zoom.us"];
const PROCESS_POLL_INTERVAL_MS = 2500;

type ProcessPollingDeps = {
  readonly onProcessesChanged: (processes: string[]) => Effect.Effect<void>;
};

type ProcessServiceShape = {
  readonly startPolling: (
    deps: ProcessPollingDeps,
  ) => Effect.Effect<void, never, Scope.Scope>;
};

export class ProcessService extends Context.Service<
  ProcessService,
  ProcessServiceShape
>()("@antirsi/tauri-sidecar/ProcessService") {}

const sameList = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index]);

export const ProcessServiceLayer = Layer.effect(
  ProcessService,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const isProcessRunning = Effect.fn("ProcessService.isProcessRunning")(
      function* (name: string) {
        return yield* spawner
          .string(ChildProcess.make("pgrep", ["-x", name]))
          .pipe(
            Effect.map((stdout) => stdout.trim().length > 0),
            Effect.catch(() => Effect.succeed(false)),
          );
      },
    );

    const pollWatchedProcesses = Effect.fn(
      "ProcessService.pollWatchedProcesses",
    )(function* () {
      const running = yield* Effect.forEach(
        WATCHED_PROCESSES,
        (processName) =>
          isProcessRunning(processName).pipe(
            Effect.map((isRunning) => (isRunning ? processName : null)),
          ),
        { concurrency: "unbounded" },
      );
      return running.filter(
        (processName): processName is string => processName !== null,
      );
    });

    const startPolling = Effect.fn("ProcessService.startPolling")(function* ({
      onProcessesChanged,
    }: ProcessPollingDeps) {
      const lastProcesses = yield* Ref.make<string[]>([]);
      const pollOnce = Effect.gen(function* () {
        const processes = yield* pollWatchedProcesses();
        const previous = yield* Ref.get(lastProcesses);
        if (sameList(previous, processes)) {
          return;
        }
        yield* Ref.set(lastProcesses, processes);
        yield* onProcessesChanged(processes);
      }).pipe(
        Effect.catch((error) =>
          Effect.logError("Process polling failed", { error }),
        ),
      );

      yield* pollOnce.pipe(
        Effect.andThen(Effect.sleep(PROCESS_POLL_INTERVAL_MS)),
        Effect.forever,
        Effect.forkScoped,
      );
    });

    return ProcessService.of({ startPolling });
  }),
);
