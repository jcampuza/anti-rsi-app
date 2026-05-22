import type { AntiRsiSnapshot } from "@antirsi/core";
import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

interface InterpolatedTimings {
  miniElapsed: number;
  workElapsed: number;
  miniTaking: number;
  workTaking: number;
}

const SNAP_THRESHOLD_SECONDS = 2;
const SMOOTHING_DURATION_MS = 300;

export function useInterpolatedTimings(
  snapshot: Accessor<AntiRsiSnapshot | undefined>,
): Accessor<InterpolatedTimings> {
  const [interpolated, setInterpolated] = createSignal<InterpolatedTimings>({
    miniElapsed: 0,
    workElapsed: 0,
    miniTaking: 0,
    workTaking: 0,
  });

  // Refs to track RAF and current values without creating reactive dependencies
  const rafIdRef = { current: undefined as number | undefined };
  const runningRef = { current: false };
  const currentValuesRef = { current: { mini: 0, work: 0 } };
  const lastServerTakingRef = {
    current: { mini: undefined as number | undefined, work: undefined as number | undefined },
  };
  const serverStateRef = {
    current: {
      serverTimings: null as AntiRsiSnapshot["timings"] | null,
      serverReceivedAt: 0,
      isPaused: false,
      isSmoothing: false,
      smoothingStartTime: 0,
      smoothingFromMini: 0,
      smoothingFromWork: 0,
    },
  };

  // Update the non-reactive ref whenever the signal changes
  const updateCurrentRef = () => {
    const vals = interpolated();
    currentValuesRef.current.mini = vals.miniElapsed;
    currentValuesRef.current.work = vals.workElapsed;
  };

  const startRaf = () => {
    if (rafIdRef.current !== undefined) return;
    runningRef.current = true;

    const tick = () => {
      if (!runningRef.current) return;

      const state = serverStateRef.current;
      if (!state.serverTimings) {
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      const elapsedSinceServer = (now - state.serverReceivedAt) / 1000;

      let newMini: number;
      let newWork: number;

      if (state.isPaused) {
        newMini = state.serverTimings.miniElapsed;
        newWork = state.serverTimings.workElapsed;
      } else if (state.isSmoothing) {
        const smoothingProgress = Math.min(
          (now - state.smoothingStartTime) / SMOOTHING_DURATION_MS,
          1,
        );
        const targetMini = state.serverTimings.miniElapsed + elapsedSinceServer;
        const targetWork = state.serverTimings.workElapsed + elapsedSinceServer;

        newMini =
          state.smoothingFromMini +
          (targetMini - state.smoothingFromMini) * smoothingProgress;
        newWork =
          state.smoothingFromWork +
          (targetWork - state.smoothingFromWork) * smoothingProgress;

        if (smoothingProgress >= 1) {
          state.isSmoothing = false;
        }
      } else {
        newMini = state.serverTimings.miniElapsed + elapsedSinceServer;
        newWork = state.serverTimings.workElapsed + elapsedSinceServer;
      }

      // Update ref and signal if changed
      if (
        Math.abs(newMini - currentValuesRef.current.mini) > 0.001 ||
        Math.abs(newWork - currentValuesRef.current.work) > 0.001
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

      if (runningRef.current) {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  };

  const stopRaf = () => {
    runningRef.current = false;
    if (rafIdRef.current !== undefined) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = undefined;
    }
  };

  // Track snapshot changes and update server state
  createEffect(() => {
    const snap = snapshot();
    if (!snap) return;

    const serverTimings = snap.timings;
    const serverReceivedAt = Date.now();
    const isPaused = snap.paused;

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

    const isSmoothing =
      !shouldSnapMini &&
      !shouldSnapWork &&
      (Math.abs(driftMini) > 0.1 || Math.abs(driftWork) > 0.1);

    lastServerTakingRef.current = {
      mini: serverTimings.miniTaking,
      work: serverTimings.workTaking,
    };

    // Update server state ref
    serverStateRef.current = {
      serverTimings,
      serverReceivedAt,
      isPaused,
      isSmoothing,
      smoothingStartTime: isSmoothing ? serverReceivedAt : 0,
      smoothingFromMini: isSmoothing ? currentValuesRef.current.mini : serverTimings.miniElapsed,
      smoothingFromWork: isSmoothing ? currentValuesRef.current.work : serverTimings.workElapsed,
    };
  });

  // Start RAF on mount, stop on cleanup
  onMount(() => {
    updateCurrentRef();
    startRaf();
  });

  onCleanup(() => {
    stopRaf();
  });

  return interpolated;
}
