import { powerMonitor } from "electron";
import { type AntiRsiEvent, type AntiRsiSnapshot } from "@antirsi/core";
import { type ProcessService } from "./process-service";
import { type AntiRsiEngine } from "./antirsi-service";
import { type OverlayManager } from "./overlay-manager";
import { broadcastApiEvent } from "./api-runtime";
import { broadcastAntiRsiEvent } from "./window-utils";

export class AppOrchestrator {
  private lastStatusBroadcastAt = 0;
  private readonly statusThrottleMs = 5000;
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly antiRsiEngine: AntiRsiEngine,
    private readonly processService: ProcessService,
    private readonly overlayManager: OverlayManager,
  ) {}

  start(): void {
    this.unsubscribers.push(
      this.antiRsiEngine.onEvent(({ event, snapshot }) => {
        this.handleAntiRsiEvent(event, snapshot);
      }),
    );

    this.unsubscribers.push(
      this.processService.subscribe((list) => {
        this.handleProcessesChanged(list);
      }),
    );

    const onSuspend = (): void => {
      this.antiRsiEngine.addInhibitor("system:suspend");
    };
    const onResume = (): void => {
      this.antiRsiEngine.removeInhibitor("system:suspend");
    };
    const onLock = (): void => {
      this.antiRsiEngine.addInhibitor("system:lock");
    };
    const onUnlock = (): void => {
      this.antiRsiEngine.removeInhibitor("system:lock");
    };

    powerMonitor.on("suspend", onSuspend);
    powerMonitor.on("resume", onResume);
    powerMonitor.on("lock-screen", onLock);
    powerMonitor.on("unlock-screen", onUnlock);

    this.unsubscribers.push(() => {
      powerMonitor.off("suspend", onSuspend);
      powerMonitor.off("resume", onResume);
      powerMonitor.off("lock-screen", onLock);
      powerMonitor.off("unlock-screen", onUnlock);
    });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private handleAntiRsiEvent(event: AntiRsiEvent, snapshot: AntiRsiSnapshot): void {
    const now = Date.now();

    if (event.type === "paused") {
      broadcastApiEvent({ type: "timers-paused", snapshot });
      return;
    }
    if (event.type === "resumed") {
      broadcastApiEvent({ type: "timers-resumed", snapshot });
      return;
    }

    if (event.type === "status-update") {
      if (now - this.lastStatusBroadcastAt < this.statusThrottleMs) {
        return;
      }
      this.lastStatusBroadcastAt = now;
    } else if (event.type === "timings-reset") {
      this.lastStatusBroadcastAt = now;
    }

    broadcastAntiRsiEvent(event, snapshot);

    if (event.type === "mini-break-start") {
      this.overlayManager.ensureOverlayWindows("mini");
    } else if (event.type === "work-break-start") {
      this.overlayManager.ensureOverlayWindows("work");
    } else if (event.type === "break-end") {
      this.overlayManager.hideOverlayWindows();
    }
  }

  private handleProcessesChanged(list: string[]): void {
    this.antiRsiEngine.setProcesses(list);
    const hasAny = list.length > 0;
    if (hasAny) {
      this.antiRsiEngine.addInhibitor("process:zoom");
    } else {
      this.antiRsiEngine.removeInhibitor("process:zoom");
    }
    broadcastApiEvent({ type: "processes-updated", list });
  }
}
