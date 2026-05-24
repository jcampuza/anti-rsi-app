import http from 'node:http';
import { API_ROUTES } from '@antirsi/contracts';
import { createStore, selectSnapshot } from '@antirsi/core';
import { afterEach, describe, expect, it } from 'vitest';

import { startApiServer, type ApiServerHandle } from './start-api-server';

interface SseSession {
  next: () => Promise<unknown>;
  close: () => void;
}

const openSseSession = (eventsUrl: URL): SseSession => {
  const queue: unknown[] = [];
  let pendingResolve: ((value: unknown) => void) | null = null;
  let buffer = '';

  const pushEvent = (event: unknown): void => {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(event);
      return;
    }
    queue.push(event);
  };

  const request = http.get(eventsUrl, (response) => {
    response.on('data', (chunk) => {
      buffer += chunk.toString();
      while (true) {
        const match = buffer.match(/^data: (.+)\r?\n\r?\n/m);
        if (!match?.[1]) {
          return;
        }
        buffer = buffer.slice(match.index! + match[0].length);
        pushEvent(JSON.parse(match[1]) as unknown);
      }
    });
  });

  return {
    next: () => {
      const queued = queue.shift();
      if (queued !== undefined) {
        return Promise.resolve(queued);
      }
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    close: () => {
      request.destroy();
    },
  };
};

describe('startApiServer', () => {
  let server: ApiServerHandle | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('serves snapshot, config, and processes', async () => {
    const store = createStore();
    server = await startApiServer({ store });
    const baseUrl = server.url.href;

    const snapshotResponse = await fetch(new URL(API_ROUTES.SNAPSHOT, baseUrl));
    expect(snapshotResponse.ok).toBe(true);
    const snapshot = (await snapshotResponse.json()) as { state: string };
    expect(snapshot.state).toBe('normal');

    const configResponse = await fetch(new URL(API_ROUTES.CONFIG, baseUrl));
    expect(configResponse.ok).toBe(true);

    const processesResponse = await fetch(new URL(API_ROUTES.PROCESSES, baseUrl));
    expect(processesResponse.ok).toBe(true);
    const processes = (await processesResponse.json()) as string[];
    expect(Array.isArray(processes)).toBe(true);
  });

  it('dispatches commands via POST /command', async () => {
    const store = createStore();
    server = await startApiServer({ store });
    const baseUrl = server.url.href;

    const response = await fetch(new URL(API_ROUTES.COMMAND, baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SET_USER_PAUSED', value: true }),
    });

    expect(response.status).toBe(204);
    const snapshot = (await fetch(new URL(API_ROUTES.SNAPSHOT, baseUrl)).then((r) => r.json())) as {
      paused: boolean;
    };
    expect(snapshot.paused).toBe(true);
  });

  it('sends init event on SSE connect', async () => {
    const store = createStore();
    server = await startApiServer({ store });
    const session = openSseSession(new URL(API_ROUTES.EVENTS, server.url.href));

    const event = (await session.next()) as { type: string };
    expect(event.type).toBe('init');
    session.close();
  });

  it('broadcasts events to connected SSE clients', async () => {
    const store = createStore();
    server = await startApiServer({ store });
    const session = openSseSession(new URL(API_ROUTES.EVENTS, server.url.href));

    const initEvent = (await session.next()) as { type: string };
    expect(initEvent.type).toBe('init');

    server.broadcast({ type: 'processes-updated', list: ['Zoom'] });

    const nextEvent = (await session.next()) as { type: string; list: string[] };
    expect(nextEvent.type).toBe('processes-updated');
    expect(nextEvent.list).toEqual(['Zoom']);
    session.close();
  });

  it('broadcasts timers-paused events to connected SSE clients', async () => {
    const store = createStore();
    server = await startApiServer({ store });
    const session = openSseSession(new URL(API_ROUTES.EVENTS, server.url.href));

    const initEvent = (await session.next()) as { type: string };
    expect(initEvent.type).toBe('init');

    const pausedSnapshot = {
      ...selectSnapshot(store.getState()),
      paused: true,
    };
    server.broadcast({ type: 'timers-paused', snapshot: pausedSnapshot });

    const nextEvent = (await session.next()) as { type: string; snapshot: { paused: boolean } };
    expect(nextEvent.type).toBe('timers-paused');
    expect(nextEvent.snapshot.paused).toBe(true);
    session.close();
  });

  it('sets CORS headers for loopback origins', async () => {
    const store = createStore();
    server = await startApiServer({ store });
    const baseUrl = server.url.href;

    const response = await fetch(new URL(API_ROUTES.SNAPSHOT, baseUrl), {
      headers: { Origin: 'http://localhost:5733' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5733');
  });
});
