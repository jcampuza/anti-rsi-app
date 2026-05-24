import { powerMonitor } from "electron";
import { Effect, PubSub, Stream, Ref } from "effect";
import { type AntiRsiEvent, type AntiRsiSnapshot } from "@antirsi/core";
import { ProcessService } from "./process-service";
import { AntiRsiEngine } from "./antirsi-service";
import { OverlayManager } from "./overlay-manager";
import { broadcastApiEvent } from "./api-runtime";
import { broadcastAntiRsiEvent } from "./window-utils";

export class AppOrchestrator extends Effect.Service<AppOrchestrator>()(
  "AppOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const antiRsiService = yield* AntiRsiEngine;
      const processService = yield* ProcessService;
      const overlayManager = yield* OverlayManager;

      const lastStatusBroadcastAtRef = yield* Ref.make(0);
      const statusThrottleMs = 5000;

      const handleAntiRsiEvent = (
        event: AntiRsiEvent,
        snapshot: AntiRsiSnapshot,
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const now = Date.now();

          // Pause/resume must reach clients immediately (not via throttled status-update).
          if (event.type === "paused") {
            broadcastApiEvent({ type: "timers-paused", snapshot });
            return;
          }
          if (event.type === "resumed") {
            broadcastApiEvent({ type: "timers-resumed", snapshot });
            return;
          }

          if (event.type === "status-update") {
            const lastBroadcastAt = yield* Ref.get(lastStatusBroadcastAtRef);
            if (now - lastBroadcastAt < statusThrottleMs) {
              return;
            }
            yield* Ref.set(lastStatusBroadcastAtRef, now);
          } else if (event.type === "timings-reset") {
            // Immediate snapshot for user-driven timing changes (reset, postpone, config).
            yield* Ref.set(lastStatusBroadcastAtRef, now);
          }

          broadcastAntiRsiEvent(event, snapshot);

          if (event.type === "mini-break-start") {
            overlayManager.ensureOverlayWindows("mini");
          } else if (event.type === "work-break-start") {
            overlayManager.ensureOverlayWindows("work");
          } else if (event.type === "break-end") {
            overlayManager.hideOverlayWindows();
          }
        });

      // Subscribe to AntiRSI domain events via Stream
      yield* Effect.forkScoped(
        Effect.scoped(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(antiRsiService.events);
            yield* Stream.fromQueue(subscription).pipe(
              Stream.runForEach(({ event, snapshot }) =>
                handleAntiRsiEvent(event, snapshot),
              ),
            );
          }),
        ),
      );

      const handleProcessesChanged = (list: string[]): Effect.Effect<void> =>
        Effect.gen(function* () {
          antiRsiService.setProcesses(list);
          const hasAny = list.length > 0;
          if (hasAny) {
            yield* antiRsiService.addInhibitor("process:zoom");
          } else {
            yield* antiRsiService.removeInhibitor("process:zoom");
          }

          broadcastApiEvent({ type: "processes-updated", list });
        });

      // Subscribe to process changes via Stream to manage inhibitors and update store.
      yield* Effect.forkScoped(
        processService.changes.pipe(Stream.runForEach(handleProcessesChanged)),
      );

      const onSuspend = (): void => {
        Effect.runFork(antiRsiService.addInhibitor("system:suspend"));
      };
      const onResume = (): void => {
        Effect.runFork(antiRsiService.removeInhibitor("system:suspend"));
      };
      const onLock = (): void => {
        Effect.runFork(antiRsiService.addInhibitor("system:lock"));
      };
      const onUnlock = (): void => {
        Effect.runFork(antiRsiService.removeInhibitor("system:lock"));
      };

      // System power events as inhibitors.
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          powerMonitor.on("suspend", onSuspend);
          powerMonitor.on("resume", onResume);
          powerMonitor.on("lock-screen", onLock);
          powerMonitor.on("unlock-screen", onUnlock);
        }),
        () =>
          Effect.sync(() => {
            powerMonitor.off("suspend", onSuspend);
            powerMonitor.off("resume", onResume);
            powerMonitor.off("lock-screen", onLock);
            powerMonitor.off("unlock-screen", onUnlock);
          }),
      );

      return {} as const;
    }),
  },
) {}
