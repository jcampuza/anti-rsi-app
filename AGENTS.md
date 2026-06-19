# AGENTS.md

This is a Bun monorepo for a Tauri app.

## Apps

- `apps/web` - `@antirsi/web`
- `apps/server` - `@antirsi/server`
- `apps/tauri` - `@antirsi/tauri` Tauri desktop app; Rust lives in `apps/tauri/src-tauri`
- `apps/tauri-sidecar` - `@antirsi/tauri-sidecar`

## Packages

- `packages/core` - `@antirsi/core`
- `packages/contracts` - `@antirsi/contracts`
- `packages/utils` - `@antirsi/utils`

## Commands

- Typecheck all workspaces: `bun run typecheck`
- Build all workspaces: `bun run build`
- Build the Tauri app: `bun run build:tauri`
