import type { AntiRsiDesktopBridge, MainEvent } from "@antirsi/contracts";
import { invoke } from "@tauri-apps/api/core";

const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isOverlayWindow = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("overlay");
};

const overlayKindForEvent = (event: MainEvent): "mini" | "work" | null => {
  if (event.type !== "antirsi") {
    return null;
  }
  if (event.event.type === "mini-break-start") {
    return "mini";
  }
  if (event.event.type === "work-break-start") {
    return "work";
  }
  return null;
};

export function startTauriOverlayManager(
  api: AntiRsiDesktopBridge,
): () => void {
  if (!isTauriRuntime() || isOverlayWindow()) {
    return () => {};
  }

  const unsubscribe = api.subscribeAll((event) => {
    const kind = overlayKindForEvent(event);
    if (kind) {
      void invoke("show_break_overlay", { kind }).catch((error) => {
        console.error("Failed to show Anti RSI break overlay", error);
      });
      return;
    }

    if (event.type === "antirsi" && event.event.type === "break-end") {
      void invoke("hide_break_overlay").catch((error) => {
        console.error("Failed to hide Anti RSI break overlay", error);
      });
    }
  });

  return () => {
    unsubscribe();
    void invoke("hide_break_overlay").catch(() => undefined);
  };
}
