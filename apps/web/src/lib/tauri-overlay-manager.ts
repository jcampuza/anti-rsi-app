import type { AntiRsiSnapshot } from "@antirsi/core";
import type { AntiRsiDesktopBridge, MainEvent } from "@antirsi/contracts";
import { invoke } from "@tauri-apps/api/core";

type OverlayKind = "mini" | "work";
type SnapshotEvent = MainEvent & { snapshot: AntiRsiSnapshot };

const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isOverlayWindow = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("overlay");
};

const overlayKindForSnapshot = (
  snapshot: AntiRsiSnapshot,
): OverlayKind | null => {
  if (snapshot.state === "in-mini") {
    return "mini";
  }
  if (snapshot.state === "in-work") {
    return "work";
  }
  return null;
};

const hasSnapshot = (event: MainEvent): event is SnapshotEvent =>
  "snapshot" in event;

const isBreakStartEvent = (event: MainEvent): boolean =>
  event.type === "antirsi" &&
  (event.event.type === "mini-break-start" ||
    event.event.type === "work-break-start");

const shouldForceOverlayHide = (event: SnapshotEvent): boolean =>
  event.type === "init" ||
  (event.type === "antirsi" && event.event.type === "break-end");

const logOverlayError = (message: string, error: unknown): void => {
  console.error(message, error);
};

export function hideTauriBreakOverlay(): void {
  if (!isTauriRuntime()) {
    return;
  }

  void invoke("hide_break_overlay").catch((error) => {
    logOverlayError("Failed to hide Anti RSI break overlay", error);
  });
}

export function startTauriOverlayManager(
  api: AntiRsiDesktopBridge,
): () => void {
  if (!isTauriRuntime() || isOverlayWindow()) {
    return () => {};
  }

  let visibleKind: OverlayKind | null = null;
  let commandQueue: Promise<unknown> = Promise.resolve();

  const enqueueOverlayCommand = (
    command: () => Promise<unknown>,
    errorMessage: string,
  ): void => {
    commandQueue = commandQueue.then(command, command).catch((error) => {
      logOverlayError(errorMessage, error);
    });
  };

  const reconcileOverlay = (event: MainEvent): void => {
    if (!hasSnapshot(event)) {
      return;
    }

    const nextKind = overlayKindForSnapshot(event.snapshot);

    if (nextKind) {
      if (visibleKind === nextKind && !isBreakStartEvent(event)) {
        return;
      }

      visibleKind = nextKind;
      enqueueOverlayCommand(
        () => invoke("show_break_overlay", { kind: nextKind }),
        "Failed to show Anti RSI break overlay",
      );
      return;
    }

    if (visibleKind === null && !shouldForceOverlayHide(event)) {
      return;
    }

    visibleKind = null;
    enqueueOverlayCommand(
      () => invoke("hide_break_overlay"),
      "Failed to hide Anti RSI break overlay",
    );
  };

  const unsubscribe = api.subscribeAll(reconcileOverlay);

  return () => {
    unsubscribe();
    hideTauriBreakOverlay();
  };
}
