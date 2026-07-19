import { getDesktopWindowApi, hasDesktopBridge } from "~/env";

/**
 * TODO(contracts): `apiToken` is not yet part of `AntiRsiRuntimeMeta` in
 * packages/contracts. The Rust shell is adding it alongside `apiBaseUrl` on
 * the same bridge; once that lands, this local extension can be dropped in
 * favor of the contract type. Optional so web typechecks regardless of
 * whether the contracts change has landed yet.
 */
interface RuntimeMetaWithApiToken {
  /** Per-launch bearer token issued by the native shell, if any. */
  apiToken?: string;
}

let resolvedApiBaseUrl: string | undefined;

const normalizeBaseUrl = (value: string): string =>
  value.endsWith("/") ? value : `${value}/`;

const configuredViteApiBaseUrl = (): string | undefined => {
  const value = import.meta.env.VITE_API_BASE_URL?.trim();
  return value && value.length > 0 ? normalizeBaseUrl(value) : undefined;
};

export function resolveApiBaseUrl(): string {
  if (resolvedApiBaseUrl) {
    return resolvedApiBaseUrl;
  }

  const fromBridge = getDesktopWindowApi()?.meta?.apiBaseUrl?.trim();
  if (fromBridge) {
    resolvedApiBaseUrl = normalizeBaseUrl(fromBridge);
    return resolvedApiBaseUrl;
  }

  const fromVite = configuredViteApiBaseUrl();
  if (fromVite) {
    resolvedApiBaseUrl = fromVite;
    return resolvedApiBaseUrl;
  }

  if (hasDesktopBridge()) {
    throw new Error(
      "Runtime bridge is available but apiBaseUrl is missing. Restart Anti RSI.",
    );
  }

  throw new Error(
    "Anti RSI API URL is not configured. Run the Tauri app, or set VITE_API_BASE_URL for a hosted API.",
  );
}

/**
 * Returns the per-launch API bearer token exposed by the native shell's
 * bridge, or `undefined` when running in pure-browser dev mode (no bridge) or
 * when the shell hasn't set one. Callers should send no `Authorization`
 * header / no `token` query param when this is `undefined`.
 */
export function resolveApiAuthToken(): string | undefined {
  // Never cached: the native shell creates the window with an empty bridge
  // and patches `window.api.meta` in via `eval` once the sidecar is ready, so
  // an early read must not pin the token to `undefined` for the page's
  // lifetime. It's a plain property read — caching buys nothing.
  const meta = getDesktopWindowApi()?.meta as
    | (RuntimeMetaWithApiToken | undefined)
    | undefined;
  const token = meta?.apiToken?.trim();
  return token && token.length > 0 ? token : undefined;
}

/**
 * True once the API is addressable: either no desktop bridge exists (pure
 * browser mode — the Vite env var or an error path handles it), or the bridge
 * has been patched with a non-empty `apiBaseUrl` by the native shell.
 */
export function isApiConfigReady(): boolean {
  const api = getDesktopWindowApi();
  if (api === undefined) {
    return true;
  }
  const fromBridge = api.meta?.apiBaseUrl?.trim();
  return Boolean(fromBridge && fromBridge.length > 0);
}

/**
 * Resolves once {@link isApiConfigReady} holds. The native shell creates the
 * main window before the sidecar finishes starting and injects the real
 * `apiBaseUrl`/`apiToken` via `eval` when it's ready, so callers must wait for
 * this before constructing an `EventSource` or resolving the base URL.
 * Rejects after `timeoutMs` (sidecar failed to start).
 */
export function whenApiConfigReady(timeoutMs = 20_000): Promise<void> {
  if (isApiConfigReady()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (isApiConfigReady()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            "AntiRSI engine did not become ready. Restart Anti RSI.",
          ),
        );
      }
    }, 100);
  });
}
