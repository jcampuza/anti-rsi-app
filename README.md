# AntiRSI

AntiRSI is now organized as a Bun workspace monorepo:

The desktop app targets macOS only.

- `apps/web` contains the React renderer app.
- `apps/desktop` contains the Electron main process, preload bridge, desktop scripts, and packaging assets.
- `packages/core` contains platform-agnostic AntiRSI logic and store code.
- `packages/contracts` contains IPC channels and bridge types shared by desktop and web.

## Commands

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run test
bun run build:desktop
bun run dist:desktop:mac
```

## Layout

```text
apps/
  desktop/
  web/
packages/
  contracts/
  core/
scripts/
  build-desktop-artifact.ts
  dev-runner.ts
```

## Notes

- The desktop preload bridge is located at `apps/desktop/src/preload.ts`.
- Desktop packaging assets live in `apps/desktop/resources`.
- Desktop artifact packaging is staged by `scripts/build-desktop-artifact.ts`.
