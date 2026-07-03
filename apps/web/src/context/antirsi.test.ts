import type { MainEvent, SnapshotEventMeta } from "@antirsi/contracts";
import {
  createStore,
  selectConfig,
  selectProcesses,
  selectSnapshot,
  type AntiRsiConfig,
  type AntiRsiSnapshot,
} from "@antirsi/core";
import { describe, expect, it } from "vitest";
import { applyMainEvent, isAntiRsiBootstrapReady } from "./antirsi";

type BootstrapState = {
  snapshot: AntiRsiSnapshot | undefined;
  snapshotMeta: SnapshotEventMeta | undefined;
  snapshotReceivedAt: number;
  config: AntiRsiConfig | undefined;
  processes: string[];
};

describe("AntiRsi bootstrap event handling", () => {
  it("treats an SSE init event as bootstrap readiness", () => {
    const store = createStore();
    let state: BootstrapState = {
      snapshot: undefined,
      snapshotMeta: undefined,
      snapshotReceivedAt: 0,
      config: undefined,
      processes: [],
    };

    const initEvent: MainEvent = {
      type: "init",
      snapshot: selectSnapshot(store.getState()),
      config: selectConfig(store.getState()),
      processes: selectProcesses(store.getState()),
      meta: {
        sequence: 1,
        serverMonotonicMs: 100,
      },
    };

    applyMainEvent(initEvent, undefined, (patch) => {
      state = { ...state, ...patch };
    });

    expect(isAntiRsiBootstrapReady(state)).toBe(true);
    expect(state.snapshot).toEqual(initEvent.snapshot);
    expect(state.config).toEqual(initEvent.config);
    expect(state.processes).toEqual(initEvent.processes);
    expect(state.snapshotMeta).toEqual(initEvent.meta);
  });
});
