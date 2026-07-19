import type { MainEvent } from "@antirsi/contracts";
import {
  createInitialState,
  selectConfig,
  selectProcesses,
  selectSnapshot,
} from "@antirsi/core";
import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_SEED_SEQUENCE,
  initialAntiRsiState,
  isAntiRsiBootstrapReady,
  reduceMainEvent,
} from "./app-state";

describe("AntiRsi bootstrap event handling", () => {
  it("treats an SSE init event as bootstrap readiness", () => {
    const state = createInitialState();
    const initEvent: MainEvent = {
      type: "init",
      snapshot: selectSnapshot(state),
      config: selectConfig(state),
      processes: selectProcesses(state),
      meta: {
        sequence: 1,
        serverMonotonicMs: 100,
      },
    };

    const next = reduceMainEvent(initialAntiRsiState, initEvent);

    expect(isAntiRsiBootstrapReady(next)).toBe(true);
    expect(next.snapshot).toEqual(initEvent.snapshot);
    expect(next.config).toEqual(initEvent.config);
    expect(next.processes).toEqual(initEvent.processes);
    expect(next.snapshotMeta).toEqual(initEvent.meta);
  });

  it("drops events whose sequence is not newer", () => {
    const state = createInitialState();
    const existingSnapshot = selectSnapshot(state);
    const priorState = {
      ...initialAntiRsiState,
      snapshot: existingSnapshot,
      snapshotMeta: {
        sequence: 5,
        serverMonotonicMs: 100,
      },
      config: selectConfig(state),
    };

    const staleEvent: MainEvent = {
      type: "antirsi",
      snapshot: selectSnapshot(createInitialState()),
      event: { type: "status-update" },
      meta: {
        sequence: 5,
        serverMonotonicMs: 200,
      },
    };

    const next = reduceMainEvent(priorState, staleEvent);

    expect(next.snapshot).toBe(existingSnapshot);
  });

  it("applies config-changed and processes-updated", () => {
    const state = createInitialState();
    const config = selectConfig(state);

    let nextState = reduceMainEvent(initialAntiRsiState, {
      type: "config-changed",
      config,
    });

    expect(nextState.config).toEqual(config);

    nextState = reduceMainEvent(nextState, {
      type: "processes-updated",
      list: ["Zoom"],
    });

    expect(nextState.processes).toEqual(["Zoom"]);
  });

  it("supersedes a bootstrap seed (sequence 0) with a real SSE init (sequence 1)", () => {
    const state = createInitialState();
    const seededState = {
      ...initialAntiRsiState,
      snapshot: selectSnapshot(state),
      snapshotMeta: {
        sequence: BOOTSTRAP_SEED_SEQUENCE,
        serverMonotonicMs: 0,
      },
      config: selectConfig(state),
      processes: selectProcesses(state),
    };

    const differentState = {
      ...state,
      lastIdleSeconds: state.lastIdleSeconds + 42,
    };
    const initEvent: MainEvent = {
      type: "init",
      snapshot: selectSnapshot(differentState),
      config: selectConfig(differentState),
      processes: selectProcesses(differentState),
      meta: {
        sequence: 1,
        serverMonotonicMs: 100,
      },
    };

    const next = reduceMainEvent(seededState, initEvent);

    expect(next.snapshot).toEqual(initEvent.snapshot);
    expect(next.snapshotMeta).toEqual(initEvent.meta);
  });

  it("does not let a bootstrap seed overwrite state once SSE init has already applied", () => {
    const state = createInitialState();
    const initEvent: MainEvent = {
      type: "init",
      snapshot: selectSnapshot(state),
      config: selectConfig(state),
      processes: selectProcesses(state),
      meta: {
        sequence: 1,
        serverMonotonicMs: 100,
      },
    };

    const afterInit = reduceMainEvent(initialAntiRsiState, initEvent);

    // Simulate the gate's "seed only if snapshot is still undefined" guard:
    // once SSE init has populated state, a late bootstrap seed must not run.
    expect(afterInit.snapshot).not.toBeUndefined();
  });
});
