export type {
  BreakConfig,
  WorkBreakConfig,
  AntiRsiConfig,
} from "./config-schema";
export {
  antiRsiConfigSchema,
  breakConfigSchema,
  workBreakConfigSchema,
  parseAntiRsiConfig,
} from "./config-schema";

import { antiRsiConfigKeys, type AntiRsiConfig } from "./config-schema";

/**
 * Idle-time thresholds baked into the break engine. These are deliberately
 * not configurable: they encode what "resting" means, not user preference.
 */

/**
 * During a mini break, any input within the last second means the user is
 * still active, so the break's rest progress resets — a mini break only
 * counts if the hands are continuously off the keyboard/mouse.
 */
export const MINI_BREAK_ACTIVITY_RESET_IDLE_SECONDS = 1;

/**
 * During a work break, rest time only accrues once the user has been idle
 * for a few seconds, so brief incidental input doesn't count toward the
 * break while still tolerating small adjustments (moving the mouse aside).
 */
export const WORK_BREAK_REST_IDLE_THRESHOLD_SECONDS = 4;

/**
 * A pause longer than this fraction of the mini-break duration is treated as
 * a natural (self-taken) break, pausing the interval timers — matching the
 * original AntiRSI heuristic that a meaningful pause is ~30% of a mini break.
 */
export const NATURAL_BREAK_IDLE_FACTOR = 0.3;

export type BreakType = "mini" | "work";

export type AntiRsiState =
  "normal" | "pending-mini" | "pending-work" | "in-mini" | "in-work";

export interface AntiRsiTimings {
  miniElapsed: number;
  miniTaking: number;
  workElapsed: number;
  workTaking: number;
}

export interface AntiRsiBreakWarning {
  breakType: BreakType;
  phase: "countdown" | "waiting-for-activity-pause";
  startsInSeconds: number;
  forcedStartInSeconds: number | null;
}

export interface AntiRsiSnapshot {
  state: AntiRsiState;
  timings: AntiRsiTimings;
  lastIdleSeconds: number;
  lastUpdatedSeconds: number;
  paused: boolean;
  timersRunning: boolean;
  breakWarning: AntiRsiBreakWarning | null;
}

export type AntiRsiEvent =
  | { type: "mini-break-start" }
  | { type: "work-break-start"; naturalContinuation: boolean }
  | { type: "break-update"; breakType: BreakType }
  | { type: "break-end"; breakType: BreakType }
  | { type: "break-warning-start"; breakType: BreakType }
  | { type: "break-warning-update"; breakType: BreakType }
  | { type: "break-warning-end"; breakType: BreakType }
  | { type: "timings-reset" }
  | { type: "status-update" }
  | { type: "paused" }
  | { type: "resumed" };

export type AntiRsiEventListener = (
  event: AntiRsiEvent,
  snapshot: AntiRsiSnapshot,
) => void;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const baseDefaultConfig: AntiRsiConfig = {
  mini: {
    intervalSeconds: 4 * 60,
    durationSeconds: 13,
  },
  work: {
    enabled: true,
    intervalSeconds: 50 * 60,
    durationSeconds: 8 * 60,
    postponeSeconds: 10 * 60,
  },
  tickIntervalMs: 500,
  naturalBreakContinuationWindowSeconds: 30,
  breakWarningLeadSeconds: 10,
  waitForActivityPauseBeforeBreak: false,
  breakStartGraceSeconds: 2,
  maxBreakStartDelaySeconds: 30,
};

/**
 * Returns a fresh config with `patch` applied over `base`. Nested config
 * objects are merged shallowly. Driven by the schema key list so adding a
 * config field requires touching only the schema.
 */
export const mergeConfig = (
  base: AntiRsiConfig,
  patch?: Partial<AntiRsiConfig>,
): AntiRsiConfig => {
  const next: Record<string, unknown> = {};
  for (const key of antiRsiConfigKeys) {
    const baseValue = base[key];
    const patchValue = patch?.[key];
    next[key] = isPlainObject(baseValue)
      ? { ...baseValue, ...(isPlainObject(patchValue) ? patchValue : {}) }
      : (patchValue ?? baseValue);
  }
  return next as unknown as AntiRsiConfig;
};

/** Structural equality over the schema key list (one level of nesting). */
export const configsEqual = (
  left: AntiRsiConfig,
  right: AntiRsiConfig,
): boolean =>
  antiRsiConfigKeys.every((key) => {
    const l = left[key];
    const r = right[key];
    if (isPlainObject(l) && isPlainObject(r)) {
      const lRecord = l as Record<string, unknown>;
      const rRecord = r as Record<string, unknown>;
      const nestedKeys = new Set([
        ...Object.keys(lRecord),
        ...Object.keys(rRecord),
      ]);
      return [...nestedKeys].every((nested) => lRecord[nested] === rRecord[nested]);
    }
    return l === r;
  });

export const defaultConfig = (): AntiRsiConfig =>
  mergeConfig(baseDefaultConfig);
