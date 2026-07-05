# Implementation Notes

## Sidecar Effect Migration

- The sidecar runtime is now centered on `AntiRsiRuntime`, an Effect service backed by `Ref` state, `PubSub` events, and a scoped tick fiber. This replaces the imperative `AntiRsiEngine` class and callback `Emitter`.
- `packages/core` remains pure. The sidecar owns all Effect resource management, scheduling, idle-time reads, process polling, persistence, HTTP serving, and logging.
- Runtime transitions are state-driven: commands update the core reducer, then the runtime derives config, process, and engine events from the before/after state.
- Status updates are throttled in the runtime service rather than in orchestration. `timings-reset` still resets that throttle so command-driven timing changes are delivered immediately.
- The runtime layer is built in the long-lived sidecar scope. This keeps the scoped tick fiber alive for the lifetime of the sidecar instead of returning a detached service value after its layer scope has closed.

## HTTP Server Boundary

- The HTTP server now depends on `AntiRsiRuntime` directly. Snapshot, config, process, command, and SSE handlers no longer receive or mutate a raw store.
- SSE is projected from the runtime event stream. Each connection still receives an `init` event built from current runtime state, then follows live runtime events.
- `startApiServerEffect` is the canonical server start API. The old production `startApiServer(...)` Promise helper was removed.
- The HTTP server layer is built with an explicit Effect `Scope` and `Layer.buildWithMemoMap`, not `ManagedRuntime.make`. Closing the returned server handle closes that scope.
- The returned `close()` method remains Promise-based because it is an external shutdown handle used by tests and native lifecycle code; internally it runs Effect cleanup and logging.

## Orchestration Boundary

- Sidecar orchestration now coordinates effects around the runtime instead of owning state itself.
- Config persistence subscribes to `config-changed` runtime events and also saves the current config at startup, preserving the previous behavior where the active startup config is written.
- Process polling writes process lists and the Zoom inhibitor through runtime commands. This keeps process side effects out of the reducer and maintains a single state transition path.

## Logging And Startup

- File logging is now an Effect logger layer. The sidecar ensures the user data directory exists through `FileSystem` before starting the server.
- The parent process watchdog is an Effect loop forked into the sidecar scope instead of a raw interval.
- The sidecar still prints `ANTIRSI_API_BASE_URL=...` to stdout as the readiness handshake for the Tauri host.

## Tests

- Added service-level runtime tests for command dispatch, config changes, and process changes.
- Updated HTTP/SSE tests to build runtime and server layers with explicit scopes, matching production resource lifetimes more closely.
