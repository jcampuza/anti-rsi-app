# AGENTS.md

This is a Bun monorepo for a Tauri app.

The server application uses Effect v4 beta. When referencing or updating code that uses effect invoke the `/effect-reference` skill. 

## Apps

- `apps/web` - `@antirsi/web`
- `apps/tauri` - `@antirsi/tauri` Tauri desktop app; Rust lives in `apps/tauri/src-tauri`
- `apps/tauri-sidecar` - `@antirsi/tauri-sidecar`; owns the sidecar runtime and loopback HTTP API

## Packages

- `packages/core` - `@antirsi/core`
- `packages/contracts` - `@antirsi/contracts`
- `packages/utils` - `@antirsi/utils`

## Commands

- Typecheck all workspaces: `bun run typecheck`
- Build all workspaces: `bun run build`
- Build the Tauri app: `bun run build:tauri`
- Dev: `bun run dev`
