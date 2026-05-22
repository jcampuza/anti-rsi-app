import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const LOOPBACK_HOST = '127.0.0.1';

const MIME_BY_EXT: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface RendererServerHandle {
  readonly url: URL;
  readonly close: () => Promise<void>;
}

export function resolvePackagedWebDistDir(moduleDirname: string): string {
  return resolve(moduleDirname, '../../web/dist');
}

export function normalizeStaticRequestPathname(rawPathname: string): string | null {
  const segments: string[] = [];
  for (const segment of rawPathname.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      return null;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

export function resolveStaticFilePath(staticRoot: string, requestPathname: string): string {
  const staticRootResolved = resolve(staticRoot);
  const fallbackIndex = join(staticRootResolved, 'index.html');
  const normalized = normalizeStaticRequestPathname(requestPathname);
  if (normalized === null) {
    return fallbackIndex;
  }

  const requested = normalized.length > 0 ? normalized : 'index.html';
  const candidate = resolve(staticRootResolved, requested);
  const rootPrefix = staticRootResolved.endsWith(sep)
    ? staticRootResolved
    : `${staticRootResolved}${sep}`;
  if (candidate !== staticRootResolved && !candidate.startsWith(rootPrefix)) {
    return fallbackIndex;
  }

  if (!existsSync(candidate)) {
    return extname(candidate).length > 0 ? candidate : fallbackIndex;
  }

  const stat = statSync(candidate);
  if (stat.isDirectory()) {
    const nestedIndex = join(candidate, 'index.html');
    return existsSync(nestedIndex) ? nestedIndex : fallbackIndex;
  }

  if (extname(candidate).length === 0) {
    return fallbackIndex;
  }

  return candidate;
}

const contentTypeForPath = (filePath: string): string => {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
};

export function startRendererServer(staticRoot: string): Promise<RendererServerHandle> {
  const staticRootResolved = resolve(staticRoot);
  const fallbackIndex = join(staticRootResolved, 'index.html');

  if (!existsSync(fallbackIndex)) {
    return Promise.reject(
      new Error(`Renderer static bundle missing index.html at ${fallbackIndex}`),
    );
  }

  return new Promise((resolvePromise, reject) => {
    const server: Server = createServer((request, response) => {
      try {
        const url = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`);
        const filePath = resolveStaticFilePath(staticRootResolved, url.pathname);
        const isAsset = extname(url.pathname).length > 0;

        if (!existsSync(filePath)) {
          if (isAsset) {
            response.writeHead(404);
            response.end();
            return;
          }
          response.writeHead(404);
          response.end('Not Found');
          return;
        }

        response.writeHead(200, { 'Content-Type': contentTypeForPath(filePath) });
        createReadStream(filePath).pipe(response);
      } catch {
        response.writeHead(500);
        response.end('Internal Server Error');
      }
    });

    server.on('error', reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to resolve renderer server listen address'));
        return;
      }

      const url = new URL(`http://${LOOPBACK_HOST}:${address.port}/`);
      resolvePromise({
        url,
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
      });
    });
  });
}

