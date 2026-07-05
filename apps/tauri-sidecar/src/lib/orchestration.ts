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

    yield* runtime.events.pipe(
      Stream.runForEach((event) => {
        if (event.type !== "config-changed") {
          return Effect.void;
        }
        return configStore.save(userDataDir, event.config);
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
