import type { AntiRsiDesktopBridge } from "@antirsi/contracts";
import { invoke } from "@tauri-apps/api/core";

const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
  _api: AntiRsiDesktopBridge,
): () => void {
  // Native break and warning windows are reconciled by Rust from the sidecar
  // event stream so hidden WebKit throttling cannot delay window commands.
  return () => {};
}
