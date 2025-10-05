# AntiRSI Electron Agents Guide

This document gives a quick orientation to the Electron rewrite of AntiRSI. The goal is to modernise the historical RSI break reminder by pairing the original scheduling logic with a TypeScript/Electron stack that runs on macOS and Windows (Linux planned).

## Purpose

- Mirror the legacy AntiRSI behaviour: track keyboard/mouse idle time, emit micro pauses, and schedule longer work breaks with postpone and natural-break continuation.
- Deliver a cross-platform desktop app by combining Electron with a React renderer and TypeScript core logic.
- Provide a foundation for incremental migration away from the legacy C/Gtk/Cocoa implementations.

## Architecture Overview

- **Core Logic (`src/common/antirsi-core.ts`)**
  - TypeScript port of the historic `ai_tick` engine, handling break state, timers, and helper calculations.
  - Intended to be fully testable in isolation (see `antirsi-core.test.ts`).

- **Main Process (`src/main/`)**
  - Electron bootstrap (`index.ts`) wires windows, IPC, and application lifecycle.
  - `lib/antirsi-service.ts` orchestrates polling (default 500 ms), feeds idle metrics into the core, and emits IPC updates: `break-start`, `break-update`, `break-end`, `status-update`.
  - `lib/config-store.ts` persists preferences via `electron-store`, using `app.getPath('userData')`.

- **Preload (`src/preload/`)**
  - Exposes a safe IPC bridge to the renderer using `contextBridge` and `@electron-toolkit/preload` helpers.
  - Keeps context isolation enabled and avoids `nodeIntegration` in the renderer.

- **Renderer (`src/renderer/`)**
  - Functional React components (e.g., `components/BreakOverlay.tsx`, `BreakStatusCard.tsx`, `ConfigPanel.tsx`) render status and controls.
  - Hooks (`hooks/useAntiRsi.ts`, `useAntiRsiApi.ts`) manage local state and IPC subscriptions.
  - Vite powers the development experience; assets live in `assets/`.

- **Build & Tooling**
  - Scaffolded with `electron-vite` (React + TS template).
  - Scripts (`package.json`) cover `npm run dev`, `npm run build`, platform-specific packaging, linting, formatting, and Vitest.
  - ESLint + Prettier via Electron Toolkit presets.

## Behaviour Summary

- Break types: short micro pauses and longer work breaks with configurable durations.
- Idle detection pipeline feeds recent idle samples into the core, enabling natural break continuation when the user steps away.
- Renderer listens to IPC events to show overlays, progress, postpone options, and “break now” triggers.
- Future milestones include richer idle providers (macOS `CGEventSourceSecondsSinceLastEventType`, Windows `GetLastInputInfo`, later Linux) and overlay polish.

## Coding Preferences

- ALWAYS use named exports. Avoid default exports when adding or updating modules.
- ALWAYS implement React UI as functional components (no class components).
- Favour TypeScript types/interfaces for public APIs and IPC payloads.
- Keep IPC channels, core state transitions, and timing constants documented within their modules.
- NEVER run the build or dev commands after changes, just linting.

## Getting Started

1. Install dependencies with `npm install` inside `electron-rsi/`.
2. Run `npm run dev` for hot-reload development.
3. Use `npm run build` + platform-specific builder scripts for packaged binaries.
4. Run `npm run test` to execute Vitest coverage of the core module.
