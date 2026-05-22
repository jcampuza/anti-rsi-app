import { serve } from '@hono/node-server';
import type { MainEvent } from '@antirsi/contracts';
import type { Store } from '@antirsi/core';

import { LOOPBACK_HOST } from './constants';
import { createApiApp } from './create-api-app';

export interface ApiServerDeps {
  store: Store;
}

export interface ApiServerHandle {
  readonly url: URL;
  readonly close: () => Promise<void>;
  broadcast: (event: MainEvent) => void;
}

export function startApiServer(deps: ApiServerDeps): Promise<ApiServerHandle> {
  const { app, broadcast } = createApiApp(deps);

  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: LOOPBACK_HOST,
        port: 0,
      },
      (info) => {
        resolve({
          url: new URL(`http://${LOOPBACK_HOST}:${info.port}/`),
          close: () =>
            new Promise<void>((closeResolve, closeReject) => {
              server.close((error) => {
                if (error) {
                  closeReject(error);
                  return;
                }
                closeResolve();
              });
            }),
          broadcast,
        });
      },
    );

    server.on('error', reject);
  });
}
