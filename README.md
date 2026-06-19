# AntiRSI

AntiRSI is a macOS-focused Tauri desktop app backed by a Bun workspace.

- `apps/tauri` contains the native Tauri shell, macOS overlay window commands, icons, and bundle config.
- `apps/tauri-sidecar` contains the Node sidecar that runs the AntiRSI engine and loopback HTTP API.
- `apps/web` contains the Solid renderer app used by Tauri.
- `apps/server` contains the loopback HTTP API shared by the sidecar.
- `packages/core` contains platform-agnostic AntiRSI logic and store code.
- `packages/contracts` contains shared event and runtime metadata types.

## Commands

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run test
bun run build
bun run package
```

`bun run dev` starts the Tauri app. `bun run package` builds the Tauri bundle; macOS artifacts are written under `apps/tauri/src-tauri/target/release/bundle`.

## Layout

```text
apps/
  server/
  tauri/
  tauri-sidecar/
  web/
packages/
  contracts/
  core/
```
