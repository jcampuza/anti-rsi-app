import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_ROUTES } from "@antirsi/contracts";
import { Context, Effect, Exit, Layer, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  AntiRsiRuntime,
  makeAntiRsiRuntimeLayer,
  type AntiRsiRuntimeService,
} from "../lib/antirsi-runtime";
import { IdleProvider } from "../lib/idle-provider";

import {
  startApiServerEffect,
  type ApiServerDeps,
  type ApiServerHandle,
} from "./start-api-server";

interface SseSession {
  next: () => Promise<unknown>;
  close: () => void;
}

const openSseSession = (eventsUrl: URL): SseSession => {
  const queue: unknown[] = [];
  let pendingResolve: ((value: unknown) => void) | null = null;
  let buffer = "";

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
    response.on("data", (chunk) => {
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

const TestIdleProviderLayer = Layer.succeed(IdleProvider)({
  getSystemIdleTime: Effect.succeed(0),
});

const makeRuntime = async (): Promise<{
  readonly runtime: AntiRsiRuntimeService;
  readonly close: () => Promise<void>;
}> => {
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithMemoMap(
      makeAntiRsiRuntimeLayer().pipe(Layer.provide(TestIdleProviderLayer)),
      Layer.makeMemoMapUnsafe(),
      scope,
    ),
  );
  return {
    runtime: Context.get(context, AntiRsiRuntime),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

const startTestApiServer = (
  deps: ApiServerDeps,
  runtime: AntiRsiRuntimeService,
): Promise<ApiServerHandle> =>
  Effect.runPromise(
    startApiServerEffect(deps).pipe(
      Effect.provideService(AntiRsiRuntime, runtime),
    ),
  );

describe("startApiServer", () => {
  let server: ApiServerHandle | undefined;
  let runtime: AntiRsiRuntimeService | undefined;
  let closeRuntime: (() => Promise<void>) | undefined;
  const tempDirs: string[] = [];

  afterEach(async () => {
    await server?.close();
    server = undefined;
    await closeRuntime?.();
    runtime = undefined;
    closeRuntime = undefined;
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("serves snapshot, config, and processes", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);
    const baseUrl = server.url.href;

    const snapshotResponse = await fetch(new URL(API_ROUTES.SNAPSHOT, baseUrl));
    expect(snapshotResponse.ok).toBe(true);
    const snapshot = (await snapshotResponse.json()) as { state: string };
    expect(snapshot.state).toBe("normal");

    const configResponse = await fetch(new URL(API_ROUTES.CONFIG, baseUrl));
    expect(configResponse.ok).toBe(true);

    const processesResponse = await fetch(
      new URL(API_ROUTES.PROCESSES, baseUrl),
    );
    expect(processesResponse.ok).toBe(true);
    const processes = (await processesResponse.json()) as string[];
    expect(Array.isArray(processes)).toBe(true);
  });

  it("dispatches commands via POST /command", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);
    const baseUrl = server.url.href;

    const response = await fetch(new URL(API_ROUTES.COMMAND, baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SET_USER_PAUSED", value: true }),
    });

    expect(response.status).toBe(204);
    const snapshot = (await fetch(new URL(API_ROUTES.SNAPSHOT, baseUrl)).then(
      (r) => r.json(),
    )) as {
      paused: boolean;
    };
    expect(snapshot.paused).toBe(true);
  });

  it("rejects invalid command payloads", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);

    const response = await fetch(new URL(API_ROUTES.COMMAND, server.url.href), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "NOT_A_COMMAND" }),
    });

    expect(response.status).toBe(400);
  });

  it("sends init event on SSE connect", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);
    const session = openSseSession(new URL(API_ROUTES.EVENTS, server.url.href));

    const event = (await session.next()) as { type: string };
    expect(event.type).toBe("init");
    session.close();
  });

  it("broadcasts events to connected SSE clients", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);
    const session = openSseSession(new URL(API_ROUTES.EVENTS, server.url.href));

    const initEvent = (await session.next()) as { type: string };
    expect(initEvent.type).toBe("init");

    await Effect.runPromise(runtime.setProcesses(["Zoom"]));

    const nextEvent = (await session.next()) as {
      type: string;
      list: string[];
    };
    expect(nextEvent.type).toBe("processes-updated");
    expect(nextEvent.list).toEqual(["Zoom"]);
    session.close();
  });

  it("broadcasts timers-paused events to connected SSE clients", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);
    const session = openSseSession(new URL(API_ROUTES.EVENTS, server.url.href));

    const initEvent = (await session.next()) as { type: string };
    expect(initEvent.type).toBe("init");

    await Effect.runPromise(
      runtime.dispatch({ type: "SET_USER_PAUSED", value: true }),
    );

    const nextEvent = (await session.next()) as {
      type: string;
      snapshot: { paused: boolean };
    };
    expect(nextEvent.type).toBe("timers-paused");
    expect(nextEvent.snapshot.paused).toBe(true);
    session.close();
  });

  it("sets CORS headers for loopback origins", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    server = await startTestApiServer({}, runtime);
    const baseUrl = server.url.href;

    const response = await fetch(new URL(API_ROUTES.SNAPSHOT, baseUrl), {
      headers: { Origin: "http://localhost:5733" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5733",
    );
  });

  it("writes server lifecycle logs to the configured file", async () => {
    ({ runtime, close: closeRuntime } = await makeRuntime());
    const logDir = await mkdtemp(join(tmpdir(), "antirsi-server-"));
    tempDirs.push(logDir);
    const logFilePath = join(logDir, "anti-rsi.log");

    server = await startTestApiServer({ logFilePath }, runtime);
    await server.close();
    server = undefined;

    const logContent = await readFile(logFilePath, "utf8");
    expect(logContent).toContain("API server started");
    expect(logContent).toContain("API server stopping");
  });
});
