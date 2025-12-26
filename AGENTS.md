# AntiRSI Electron Agents Guide

## Purpose

- track keyboard/mouse idle time, emit micro pauses, and schedule longer work breaks with postpone and natural-break continuation.
- Deliver a cross-platform desktop app by combining Electron with a React renderer and TypeScript core logic.

## Architecture Overview

- **Core Logic (`src/common/antirsi-core.ts`)**
  - TypeScript port of the historic `ai_tick` engine, handling break state, timers, and helper calculations.

- **Main Process (`src/main/`)**
  - Electron bootstrap (`index.ts`) wires windows, IPC, and application lifecycle.

- **Preload (`src/preload/`)**
  - Exposes a safe IPC bridge to the renderer using `contextBridge` and `@electron-toolkit/preload` helpers.
  - Keeps context isolation enabled and avoids `nodeIntegration` in the renderer.

- **Renderer (`src/renderer/`)**
  - Functional React components (e.g., `components/BreakOverlay.tsx`, `BreakStatusCard.tsx`, `ConfigPanel.tsx`) render status and controls.
  - Hooks (`hooks/useAntiRsi.ts`, `useAntiRsiApi.ts`) manage local state and IPC subscriptions.
  - Vite powers the development experience.

- **Build & Tooling**
  - Scaffolded with `electron-vite` (React + TS template).
  - Scripts (`package.json`) cover `bun run dev`, `bun run build`, platform-specific packaging, linting, formatting, and Vitest.

## Effect Solutions Usage

The Effect Solutions CLI provides curated best practices and patterns for Effect TypeScript. Before working on Effect code, ALWAYS check if there's a relevant topic that covers your use case.

- `effect-solutions list` - List all available topics
- `effect-solutions show <slug...>` - Read one or more topics
- `effect-solutions search <term>` - Search topics by keyword

**Local Effect Source:** The Effect repository is cloned to `~/.local/share/effect-solutions/effect` for reference. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.

NOTE: This project is incrementally adopting effect, it may not be in use everywhere yet. Keep this in mind as implementing effect-ful code.

## Behaviour Summary

- Break types: short micro pauses and longer work breaks with configurable durations.
- Idle detection pipeline feeds recent idle samples into the core, enabling natural break continuation when the user steps away.
- Renderer listens to IPC events to show overlays, progress, postpone options, and "break now" triggers.

## Coding Preferences

- ALWAYS use named exports. Avoid default exports when adding or updating modules.
- ALWAYS implement React UI as functional components (no class components).
- Favour TypeScript types/interfaces for public APIs and IPC payloads.
- Keep IPC channels, core state transitions, and timing constants documented within their modules.
- NEVER run the build or dev commands after changes, just linting.

## btca

Trigger: user says "use btca" (for codebase/docs questions).

Run:

- btca ask -t <tech> -q "<question>"

Available <tech>: svelte, tailwindcss, effect
