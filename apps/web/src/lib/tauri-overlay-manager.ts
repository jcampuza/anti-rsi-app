import type { AntiRsiSnapshot } from "@antirsi/core";
import type { AntiRsiDesktopBridge, MainEvent } from "@antirsi/contracts";
import { invoke } from "@tauri-apps/api/core";

type OverlayKind = "mini" | "work";
type WarningKind = OverlayKind;
type SnapshotEvent = MainEvent & { snapshot: AntiRsiSnapshot };

const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isOverlayWindow = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("overlay");
};

const isWarningWindow = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("warning");
};

const overlayKindForSnapshot = (
  snapshot: AntiRsiSnapshot,
): OverlayKind | null => {
  if (snapshot.state === "pending-mini" || snapshot.state === "in-mini") {
    return "mini";
  }
  if (snapshot.state === "pending-work" || snapshot.state === "in-work") {
    return "work";
  }
  return null;
};

const warningKindForSnapshot = (
  snapshot: AntiRsiSnapshot,
): WarningKind | null => snapshot.breakWarning?.breakType ?? null;

const hasSnapshot = (event: MainEvent): event is SnapshotEvent =>
  "snapshot" in event;

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

export function hideTauriBreakWarning(): void {
  if (!isTauriRuntime()) {
    return;
  }

  void invoke("hide_break_warning").catch((error) => {
    logOverlayError("Failed to hide Anti RSI break warning", error);
  });
}

export function startTauriOverlayManager(
  api: AntiRsiDesktopBridge,
): () => void {
  if (!isTauriRuntime() || isOverlayWindow() || isWarningWindow()) {
    return () => {};
  }

  let visibleKind: OverlayKind | null = null;
  let visibleWarningKind: WarningKind | null = null;
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
    if (event.type === "config-changed") {
      if (visibleWarningKind !== null) {
        visibleWarningKind = null;
        enqueueOverlayCommand(
          () => invoke("hide_break_warning"),
          "Failed to hide Anti RSI break warning",
        );
      }
      return;
    }

    if (event.type === "processes-updated" && event.list.length > 0) {
      if (visibleWarningKind !== null) {
        visibleWarningKind = null;
        enqueueOverlayCommand(
          () => invoke("hide_break_warning"),
          "Failed to hide Anti RSI break warning",
        );
      }
      return;
    }

    if (!hasSnapshot(event)) {
      return;
    }

    const nextKind = overlayKindForSnapshot(event.snapshot);
    const nextWarningKind = warningKindForSnapshot(event.snapshot);

    if (nextKind) {
      if (visibleWarningKind !== null) {
        visibleWarningKind = null;
        enqueueOverlayCommand(
          () => invoke("hide_break_warning"),
          "Failed to hide Anti RSI break warning",
        );
      }

      if (visibleKind === nextKind) {
        return;
      }

      visibleKind = nextKind;
      enqueueOverlayCommand(
        () => invoke("show_break_overlay", { kind: nextKind }),
        "Failed to show Anti RSI break overlay",
      );
      return;
    }

    if (
      visibleKind === null &&
      visibleWarningKind === null &&
      !shouldForceOverlayHide(event)
    ) {
      if (nextWarningKind === null) {
        return;
      }
    }

    if (visibleKind !== null || shouldForceOverlayHide(event)) {
      visibleKind = null;
      enqueueOverlayCommand(
        () => invoke("hide_break_overlay"),
        "Failed to hide Anti RSI break overlay",
      );
    }

    if (nextWarningKind) {
      if (visibleWarningKind === nextWarningKind) {
        return;
      }

      if (visibleWarningKind !== null) {
        enqueueOverlayCommand(
          () => invoke("hide_break_warning"),
          "Failed to hide Anti RSI break warning",
        );
      }

      visibleWarningKind = nextWarningKind;
      enqueueOverlayCommand(
        () => invoke("show_break_warning", { kind: nextWarningKind }),
        "Failed to show Anti RSI break warning",
      );
      return;
    }

    if (visibleWarningKind !== null || shouldForceOverlayHide(event)) {
      visibleWarningKind = null;
      enqueueOverlayCommand(
        () => invoke("hide_break_warning"),
        "Failed to hide Anti RSI break warning",
      );
    }
  };

  const unsubscribe = api.subscribeAll(reconcileOverlay);

  return () => {
    unsubscribe();
    hideTauriBreakOverlay();
    hideTauriBreakWarning();
  };
}
