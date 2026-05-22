import { join } from 'node:path';

import {
  resolvePackagedWebDistDir,
  startRendererServer,
  type RendererServerHandle,
} from './renderer-server';

let activeServer: RendererServerHandle | null = null;

export function getConfiguredRendererBaseUrl(): string | undefined {
  const devUrl = process.env['VITE_DEV_SERVER_URL']?.trim();
  if (devUrl) {
    return devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
  }

  const rendererUrl = process.env['ANTIRSI_RENDERER_URL']?.trim();
  if (rendererUrl) {
    return rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`;
  }

  return undefined;
}

export function buildRendererUrl(route?: string, baseUrl = getConfiguredRendererBaseUrl()): string {
  if (!baseUrl) {
    throw new Error('Renderer base URL is not configured');
  }

  const url = new URL(baseUrl);
  if (route) {
    url.pathname = route.startsWith('/') ? route : `/${route}`;
  }
  return url.href;
}

export async function ensureRendererServer(moduleDirname: string): Promise<string> {
  const existing = getConfiguredRendererBaseUrl();
  if (existing) {
    return existing;
  }

  if (activeServer) {
    return activeServer.url.href;
  }

  const staticRoot = resolvePackagedWebDistDir(moduleDirname);
  activeServer = await startRendererServer(staticRoot);
  const baseUrl = activeServer.url.href;
  process.env['ANTIRSI_RENDERER_URL'] = baseUrl;
  return baseUrl;
}

export async function stopRendererServer(): Promise<void> {
  const server = activeServer;
  activeServer = null;
  if (!server) {
    return;
  }
  await server.close();
}

export function packagedWebDistPath(moduleDirname: string): string {
  return join(resolvePackagedWebDistDir(moduleDirname));
}
