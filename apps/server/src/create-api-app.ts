import { API_ROUTES, type ApiErrorBody, type MainEvent } from '@antirsi/contracts';
import {
  type Action,
  selectConfig,
  selectProcesses,
  selectSnapshot,
  type Store,
} from '@antirsi/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

import { LOOPBACK_ORIGIN_PATTERN } from './constants';

export interface ApiServerDeps {
  store: Store;
}

export interface ApiApp {
  app: Hono;
  broadcast: (event: MainEvent) => void;
}

const buildInitEvent = (store: Store): MainEvent => ({
  type: 'init',
  config: selectConfig(store.getState()),
  snapshot: selectSnapshot(store.getState()),
  processes: selectProcesses(store.getState()),
});

export function createApiApp(deps: ApiServerDeps): ApiApp {
  const subscribers = new Set<(event: MainEvent) => void>();

  const broadcast = (event: MainEvent): void => {
    for (const push of subscribers) {
      push(event);
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

  app.get(API_ROUTES.SNAPSHOT, (c) => c.json(selectSnapshot(deps.store.getState())));

  app.get(API_ROUTES.CONFIG, (c) => c.json(selectConfig(deps.store.getState())));

  app.get(API_ROUTES.PROCESSES, (c) => c.json(selectProcesses(deps.store.getState())));

  app.post(API_ROUTES.COMMAND, async (c) => {
    const action = await c.req.json<Action>();
    await deps.store.dispatch(action);
    return c.body(null, 204);
  });

  app.get(API_ROUTES.EVENTS, (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify(buildInitEvent(deps.store)) });

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

  return { app, broadcast };
}
