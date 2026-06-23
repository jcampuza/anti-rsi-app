import type { AntiRsiSnapshot } from "@antirsi/core";
import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";

interface InterpolatedTimings {
  miniElapsed: number;
  workElapsed: number;
  miniTaking: number;
  workTaking: number;
}

const SNAP_THRESHOLD_SECONDS = 2;
const DISPLAY_UPDATE_INTERVAL_MS = 250;

export const projectTimings = (
  snap: AntiRsiSnapshot,
  receivedAt: number,
  now: number,
): InterpolatedTimings => {
  const elapsedSinceSnapshot = Math.max(0, (now - receivedAt) / 1000);
  const timings = { ...snap.timings };

  if (!snap.timersRunning) {
    return timings;
  }

  if (snap.state === "normal") {
    timings.miniElapsed += elapsedSinceSnapshot;
    timings.workElapsed += elapsedSinceSnapshot;
    return timings;
  }

  if (snap.state === "in-mini") {
    timings.workElapsed += elapsedSinceSnapshot;
    if (snap.lastIdleSeconds >= 1) {
      timings.miniTaking += elapsedSinceSnapshot;
    }
    return timings;
  }

  if (snap.state === "in-work") {
    if (snap.lastIdleSeconds >= 4) {
      timings.workTaking += elapsedSinceSnapshot;
    }
    return timings;
  }

  return timings;
};

export function useInterpolatedTimings(
  snapshot: Accessor<AntiRsiSnapshot | undefined>,
  snapshotReceivedAt: Accessor<number>,
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
  const currentTimingsRef = { current: interpolated() };
  const serverStateRef = {
    current: {
      snapshot: null as AntiRsiSnapshot | null,
      receivedAt: 0,
    },
  };

  // Update the non-reactive ref whenever the signal changes
  const updateCurrentRef = () => {
    currentTimingsRef.current = interpolated();
  };

  const publishCurrentTimings = (now = performance.now(), force = false) => {
    const state = serverStateRef.current;
    if (!state.snapshot) {
      return;
    }

    const nextTimings = projectTimings(state.snapshot, state.receivedAt, now);
    const currentTimings = currentTimingsRef.current;

    if (
      force ||
      Math.abs(nextTimings.miniElapsed - currentTimings.miniElapsed) >= 0.5 ||
      Math.abs(nextTimings.workElapsed - currentTimings.workElapsed) >= 0.5 ||
      Math.abs(nextTimings.miniTaking - currentTimings.miniTaking) >= 0.25 ||
      Math.abs(nextTimings.workTaking - currentTimings.workTaking) >= 0.25
    ) {
      currentTimingsRef.current = nextTimings;
      setInterpolated(nextTimings);
    }
  };

  const scheduleNextTick = () => {
    if (!runningRef.current) {
      return;
    }

    timeoutIdRef.current = window.setTimeout(() => {
      timeoutIdRef.current = undefined;
      publishCurrentTimings(performance.now());
      scheduleNextTick();
    }, DISPLAY_UPDATE_INTERVAL_MS);
  };

  const startTimer = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    publishCurrentTimings(performance.now(), true);
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

    const receivedAt = snapshotReceivedAt();
    const projected = projectTimings(snap, receivedAt, performance.now());
    const currentTimings = currentTimingsRef.current;

    // Calculate drift from current interpolated values
    const driftMini = projected.miniElapsed - currentTimings.miniElapsed;
    const driftWork = projected.workElapsed - currentTimings.workElapsed;
    const shouldSnapMini =
      Math.abs(driftMini) >= SNAP_THRESHOLD_SECONDS ||
      Math.abs(projected.miniTaking - currentTimings.miniTaking) >=
        SNAP_THRESHOLD_SECONDS;
    const shouldSnapWork =
      Math.abs(driftWork) >= SNAP_THRESHOLD_SECONDS ||
      Math.abs(projected.workTaking - currentTimings.workTaking) >=
        SNAP_THRESHOLD_SECONDS;

    if (shouldSnapMini || shouldSnapWork) {
      // Snap immediately
      currentTimingsRef.current = projected;
      setInterpolated(projected);
    }

    // Update server state ref
    serverStateRef.current = {
      snapshot: snap,
      receivedAt,
    };

    if (shouldSnapMini || shouldSnapWork || !snap.timersRunning) {
      publishCurrentTimings(performance.now(), true);
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
