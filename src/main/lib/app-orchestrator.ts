import { powerMonitor, BrowserWindow } from 'electron';
import { Effect, PubSub, Stream, Ref } from 'effect';
import { type AntiRsiEvent, type AntiRsiSnapshot } from '../../common/antirsi-core';
import { ProcessService } from './process-service';
import { AntiRsiEngine } from './antirsi-service';
import { OverlayManager } from './overlay-manager';
import { broadcastAntiRsiEvent } from './window-utils';
import { IPC_EVENTS } from '../../common/actions';

export class AppOrchestrator extends Effect.Service<AppOrchestrator>()('AppOrchestrator', {
  scoped: Effect.gen(function* () {
    const antiRsiService = yield* AntiRsiEngine;
    const processService = yield* ProcessService;
    const overlayManager = yield* OverlayManager;

    const lastStatusBroadcastAtRef = yield* Ref.make(0);
    const statusThrottleMs = 250;

    const handleAntiRsiEvent = (
      event: AntiRsiEvent,
      snapshot: AntiRsiSnapshot,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (event.type === 'status-update') {
          const now = Date.now();
          const lastBroadcastAt = yield* Ref.get(lastStatusBroadcastAtRef);
          if (now - lastBroadcastAt < statusThrottleMs) {
            return;
          }
          yield* Ref.set(lastStatusBroadcastAtRef, now);
        }

        broadcastAntiRsiEvent(event, snapshot);

        if (event.type === 'mini-break-start') {
          overlayManager.ensureOverlayWindows('mini');
        } else if (event.type === 'work-break-start') {
          overlayManager.ensureOverlayWindows('work');
        } else if (event.type === 'break-end') {
          overlayManager.hideOverlayWindows();
        }
      });

    // Subscribe to AntiRSI domain events via Stream
    yield* Effect.forkScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(antiRsiService.events);
          yield* Stream.fromQueue(subscription).pipe(
            Stream.runForEach(({ event, snapshot }) => handleAntiRsiEvent(event, snapshot)),
          );
        }),
      ),
    );

    const handleProcessesChanged = (list: string[]): Effect.Effect<void> =>
      Effect.gen(function* () {
        antiRsiService.setProcesses(list);
        const hasAny = list.length > 0;
        if (hasAny) {
          yield* antiRsiService.addInhibitor('process:zoom');
        } else {
          yield* antiRsiService.removeInhibitor('process:zoom');
        }

        // Broadcast to renderers via unified event.
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send(IPC_EVENTS.EVENT, { type: 'processes-updated', list });
        });
      });

    // Subscribe to process changes via Stream to manage inhibitors and update store.
    yield* Effect.forkScoped(
      processService.changes.pipe(Stream.runForEach(handleProcessesChanged)),
    );

    const onSuspend = (): void => {
      Effect.runFork(antiRsiService.addInhibitor('system:suspend'));
    };
    const onResume = (): void => {
      Effect.runFork(antiRsiService.removeInhibitor('system:suspend'));
    };
    const onLock = (): void => {
      Effect.runFork(antiRsiService.addInhibitor('system:lock'));
    };
    const onUnlock = (): void => {
      Effect.runFork(antiRsiService.removeInhibitor('system:lock'));
    };

    // System power events as inhibitors.
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        powerMonitor.on('suspend', onSuspend);
        powerMonitor.on('resume', onResume);
        powerMonitor.on('lock-screen', onLock);
        powerMonitor.on('unlock-screen', onUnlock);
      }),
      () =>
        Effect.sync(() => {
          powerMonitor.off('suspend', onSuspend);
          powerMonitor.off('resume', onResume);
          powerMonitor.off('lock-screen', onLock);
          powerMonitor.off('unlock-screen', onUnlock);
        }),
    );

    return {} as const;
  }),
}) {}
