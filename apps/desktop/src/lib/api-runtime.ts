import type { MainEvent } from '@antirsi/contracts';
import type { Store } from '@antirsi/core';

import { startApiServer, type ApiServerHandle } from '@antirsi/server';

let activeServer: ApiServerHandle | null = null;

export function getConfiguredApiBaseUrl(): string | undefined {
  const apiUrl = process.env['ANTIRSI_API_BASE_URL']?.trim();
  if (!apiUrl) {
    return undefined;
  }
  return apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
}

export async function ensureApiServer(store: Store): Promise<string> {
  const existing = getConfiguredApiBaseUrl();
  if (existing) {
    return existing;
  }

  if (activeServer) {
    return activeServer.url.href;
  }

  activeServer = await startApiServer({ store });
  const baseUrl = activeServer.url.href;
  process.env['ANTIRSI_API_BASE_URL'] = baseUrl;
  return baseUrl;
}

export function broadcastApiEvent(event: MainEvent): void {
  activeServer?.broadcast(event);
}

export async function stopApiServer(): Promise<void> {
  const server = activeServer;
  activeServer = null;
  if (!server) {
    return;
  }
  await server.close();
}
