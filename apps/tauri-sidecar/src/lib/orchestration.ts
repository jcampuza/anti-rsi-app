import { Effect, Stream, type Scope } from "effect";
import { AntiRsiRuntime } from "./antirsi-runtime";
import { ConfigStore } from "./config-store";
import { ProcessService } from "./process-service";

type SidecarOrchestrationDeps = {
  readonly userDataDir: string;
};

export const startSidecarOrchestration = ({
  userDataDir,
}: SidecarOrchestrationDeps): Effect.Effect<
  void,
  never,
  AntiRsiRuntime | ConfigStore | ProcessService | Scope.Scope
> =>
  Effect.gen(function* () {
    const runtime = yield* AntiRsiRuntime;
    const configStore = yield* ConfigStore;
    const processService = yield* ProcessService;

    yield* runtime.config.pipe(
      Effect.flatMap((config) => configStore.save(userDataDir, config)),
    );

    const subscription = yield* runtime.subscribeEvents;
    yield* Stream.fromSubscription(subscription).pipe(
      Stream.runForEach((event) => {
        if (event.type !== "config-changed") {
          return Effect.void;
        }
        // Read the authoritative current config rather than persisting
        // `event.config` directly: the events PubSub is sliding and can
        // drop a burst of config-changed notifications, so the event
        // payload here may be stale by the time this consumer catches up.
        // Re-reading `runtime.config` guarantees we always persist the
        // latest value regardless of how many notifications were dropped.
        return runtime.config.pipe(
          Effect.flatMap((config) => configStore.save(userDataDir, config)),
        );
      }),
      Effect.forkScoped,
    );

    yield* processService.startPolling({
      onProcessesChanged: (processes) =>
        Effect.gen(function* () {
          yield* runtime.setProcesses(processes);
          if (processes.length > 0) {
            yield* runtime.addInhibitor("process:zoom");
          } else {
            yield* runtime.removeInhibitor("process:zoom");
          }
        }),
    });
  });
