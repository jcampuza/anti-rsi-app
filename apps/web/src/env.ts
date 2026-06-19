import type { AntiRsiWindowApi } from "@antirsi/contracts";

type WindowWithApi = Window & { api?: AntiRsiWindowApi };

const getWindowWithApi = (): WindowWithApi | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window as WindowWithApi;
};

/**
 * True when running inside a native shell that exposes runtime metadata.
 */
export const hasDesktopBridge = (): boolean =>
  getWindowWithApi()?.api !== undefined;

export const getDesktopWindowApi = (): AntiRsiWindowApi | undefined =>
  getWindowWithApi()?.api;
