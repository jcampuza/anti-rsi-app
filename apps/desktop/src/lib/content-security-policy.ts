import { session } from 'electron';

const LOOPBACK_CONNECT_SRC = [
  'http://127.0.0.1:*',
  'http://localhost:*',
  'ws://127.0.0.1:*',
  'ws://localhost:*',
] as const;

export const buildContentSecurityPolicy = (apiBaseUrl: string): string => {
  const apiOrigin = new URL(apiBaseUrl).origin;
  const connectSrc = ["'self'", apiOrigin, ...LOOPBACK_CONNECT_SRC].join(' ');

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
  ].join('; ');
};

let configured = false;

/**
 * Injects a CSP response header for renderer documents. Chromium treats
 * `http://127.0.0.1` (no port) as port 80 only, so we include the runtime API
 * origin and explicit loopback port wildcards.
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/security
 */
export function configureRendererContentSecurityPolicy(apiBaseUrl: string): void {
  if (configured) {
    return;
  }
  configured = true;

  const policy = buildContentSecurityPolicy(apiBaseUrl);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') {
      callback({ responseHeaders: details.responseHeaders ?? {} });
      return;
    }

    const responseHeaders: Record<string, string | string[]> = {
      ...(details.responseHeaders ?? {}),
      'Content-Security-Policy': [policy],
    };

    callback({ responseHeaders });
  });
}
