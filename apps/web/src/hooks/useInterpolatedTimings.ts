import type { AntiRsiSnapshot } from "@antirsi/core";
import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

interface InterpolatedTimings {
  miniElapsed: number;
  workElapsed: number;
  miniTaking: number;
  workTaking: number;
}

const SNAP_THRESHOLD_SECONDS = 2;
const DISPLAY_UPDATE_INTERVAL_MS = 1000;

export function useInterpolatedTimings(
  snapshot: Accessor<AntiRsiSnapshot | undefined>,
): Accessor<InterpolatedTimings> {
  const [interpolated, setInterpolated] = createSignal<InterpolatedTimings>({
    miniElapsed: 0,
    workElapsed: 0,
    miniTaking: 0,
    workTaking: 0,
  });

  // Refs track timer state and current values without creating reactive dependencies.
  const timeoutIdRef = { current: undefined as number | undefined };
  const runningRef = { current: false };
  const currentValuesRef = { current: { mini: 0, work: 0 } };
  const lastServerTakingRef = {
    current: { mini: undefined as number | undefined, work: undefined as number | undefined },
  };
  const serverStateRef = {
    current: {
      serverTimings: null as AntiRsiSnapshot["timings"] | null,
      serverReceivedAt: 0,
      timersRunning: true,
    },
  };

  // Update the non-reactive ref whenever the signal changes
  const updateCurrentRef = () => {
    const vals = interpolated();
    currentValuesRef.current.mini = vals.miniElapsed;
    currentValuesRef.current.work = vals.workElapsed;
  };

  const publishCurrentTimings = (now = Date.now(), force = false) => {
    const state = serverStateRef.current;
    if (!state.serverTimings) {
      return;
    }

    const elapsedSinceServer = state.timersRunning ? (now - state.serverReceivedAt) / 1000 : 0;
    const newMini = state.serverTimings.miniElapsed + elapsedSinceServer;
    const newWork = state.serverTimings.workElapsed + elapsedSinceServer;

    if (
      force ||
      Math.abs(newMini - currentValuesRef.current.mini) >= 0.5 ||
      Math.abs(newWork - currentValuesRef.current.work) >= 0.5
    ) {
      currentValuesRef.current.mini = newMini;
      currentValuesRef.current.work = newWork;
      setInterpolated({
        miniElapsed: newMini,
        workElapsed: newWork,
        miniTaking: state.serverTimings.miniTaking,
        workTaking: state.serverTimings.workTaking,
      });
    }
  };

  const scheduleNextTick = () => {
    if (!runningRef.current) {
      return;
    }

    timeoutIdRef.current = window.setTimeout(() => {
      timeoutIdRef.current = undefined;
      publishCurrentTimings();
      scheduleNextTick();
    }, DISPLAY_UPDATE_INTERVAL_MS);
  };

  const startTimer = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    publishCurrentTimings(Date.now(), true);
    scheduleNextTick();
  };

  const stopTimer = () => {
    runningRef.current = false;
    if (timeoutIdRef.current !== undefined) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = undefined;
    }
  };

  // Track snapshot changes and update server state
  createEffect(() => {
    const snap = snapshot();
    if (!snap) return;

    const serverReceivedAt = Date.now();
    const timersRunning = snap.timersRunning;
    const wasTimersRunning = serverStateRef.current.timersRunning;

    // Freeze at the displayed values when timers stop so we do not drift ahead of the server.
    const serverTimings =
      serverStateRef.current.serverTimings && !timersRunning && wasTimersRunning
        ? {
            miniElapsed: currentValuesRef.current.mini,
            workElapsed: currentValuesRef.current.work,
            miniTaking: snap.timings.miniTaking,
            workTaking: snap.timings.workTaking,
          }
        : snap.timings;

    // Calculate drift from current interpolated values
    const driftMini = serverTimings.miniElapsed - currentValuesRef.current.mini;
    const driftWork = serverTimings.workElapsed - currentValuesRef.current.work;

    const lastTaking = lastServerTakingRef.current;
    const shouldSnapMini =
      Math.abs(driftMini) >= SNAP_THRESHOLD_SECONDS ||
      (lastTaking.mini !== undefined && serverTimings.miniTaking !== lastTaking.mini);
    const shouldSnapWork =
      Math.abs(driftWork) >= SNAP_THRESHOLD_SECONDS ||
      (lastTaking.work !== undefined && serverTimings.workTaking !== lastTaking.work);

    if (shouldSnapMini || shouldSnapWork) {
      // Snap immediately
      currentValuesRef.current.mini = serverTimings.miniElapsed;
      currentValuesRef.current.work = serverTimings.workElapsed;
      setInterpolated({
        miniElapsed: serverTimings.miniElapsed,
        workElapsed: serverTimings.workElapsed,
        miniTaking: serverTimings.miniTaking,
        workTaking: serverTimings.workTaking,
      });
    }

    lastServerTakingRef.current = {
      mini: serverTimings.miniTaking,
      work: serverTimings.workTaking,
    };

    // Update server state ref
    serverStateRef.current = {
      serverTimings,
      serverReceivedAt,
      timersRunning,
    };

    if (shouldSnapMini || shouldSnapWork || !timersRunning) {
      publishCurrentTimings(serverReceivedAt, true);
    }
  });

  // Start display updates on mount, stop on cleanup.
  onMount(() => {
    updateCurrentRef();
    startTimer();
  });

  onCleanup(() => {
    stopTimer();
  });

  return interpolated;
}
