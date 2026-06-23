import {
  API_ROUTES,
  type ApiErrorBody,
  type MainEvent,
  type SnapshotEventMeta,
} from '@antirsi/contracts';
import {
  type Action,
  selectConfig,
  selectProcesses,
  selectSnapshot,
  type Store,
} from '@antirsi/core';
import type { ApplyGlobalResponse } from 'hono/client';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { performance } from 'node:perf_hooks';

import { LOOPBACK_ORIGIN_PATTERN } from './constants';

export interface ApiServerDeps {
  store: Store;
}

type SnapshotMainEvent = Extract<
  MainEvent,
  { type: 'init' | 'antirsi' | 'timers-paused' | 'timers-resumed' }
>;

export function createApiApp(deps: ApiServerDeps) {
  let sequence = 0;
  const subscribers = new Set<(event: MainEvent) => void>();

  const nextMeta = (): SnapshotEventMeta => ({
    sequence: ++sequence,
    serverMonotonicMs: performance.now(),
  });

  const withMeta = <T extends SnapshotMainEvent>(event: T): T =>
    ({ ...event, meta: nextMeta() }) as T;

  const buildInitEvent = (): MainEvent =>
    withMeta({
      type: 'init',
      config: selectConfig(deps.store.getState()),
      snapshot: selectSnapshot(deps.store.getState()),
      processes: selectProcesses(deps.store.getState()),
    });

  const broadcast = (event: MainEvent): void => {
    const eventWithFreshMeta = 'snapshot' in event ? withMeta(event) : event;
    for (const push of subscribers) {
      push(eventWithFreshMeta);
    }
  };

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => (LOOPBACK_ORIGIN_PATTERN.test(origin) ? origin : ''),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const body: ApiErrorBody = { message };
    return c.json(body, 400);
  });

  app.notFound((c) => {
    const body: ApiErrorBody = { message: 'Not Found' };
    return c.json(body, 404);
  });

  const routes = app
    .get(API_ROUTES.SNAPSHOT, (c) => c.json(selectSnapshot(deps.store.getState())))
    .get(API_ROUTES.CONFIG, (c) => c.json(selectConfig(deps.store.getState())))
    .get(API_ROUTES.PROCESSES, (c) => c.json(selectProcesses(deps.store.getState())))
    .post(API_ROUTES.COMMAND, async (c) => {
      const action = await c.req.json<Action>();
      await deps.store.dispatch(action);
      return c.body(null, 204);
    })
    .get(API_ROUTES.EVENTS, (c) => {
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ data: JSON.stringify(buildInitEvent()) });

        const push = (event: MainEvent): void => {
          void stream.writeSSE({ data: JSON.stringify(event) });
        };
        subscribers.add(push);

        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener('abort', () => {
            subscribers.delete(push);
            resolve();
          });
        });
      });
    });

  return { app: routes, broadcast };
}

export type ApiApp = ReturnType<typeof createApiApp>;

/** Hono RPC app type for typed `hc` clients (web, tests). */
export type ApiAppType = ApplyGlobalResponse<
  ReturnType<typeof createApiApp>['app'],
  {
    400: { json: ApiErrorBody };
    404: { json: ApiErrorBody };
  }
>;
