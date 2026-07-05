import type { AntiRsiEvent, AntiRsiSnapshot } from "@antirsi/core";
import { antiRsiConfigSchema } from "@antirsi/core";
import { Schema } from "effect";

export const IPC_EVENTS = {
  EVENT: "antirsi:event",
  OVERLAY_BREAK: "antirsi:overlay-break",
  CONFIG: "antirsi:config",
  PROCESSES_UPDATE: "antirsi:processes-update",
} as const;

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

export const BreakTypeSchema = Schema.Literals(["mini", "work"]);

const AntiRsiTimingsSchema = Schema.Struct({
  miniElapsed: Schema.Finite,
  miniTaking: Schema.Finite,
  workElapsed: Schema.Finite,
  workTaking: Schema.Finite,
});

const AntiRsiBreakWarningSchema = Schema.Struct({
  breakType: BreakTypeSchema,
  phase: Schema.Literals(["countdown", "waiting-for-activity-pause"]),
  startsInSeconds: Schema.Finite,
  forcedStartInSeconds: Schema.NullOr(Schema.Finite),
});

export const AntiRsiSnapshotSchema = Schema.Struct({
  state: Schema.Literals([
    "normal",
    "pending-mini",
    "pending-work",
    "in-mini",
    "in-work",
  ]),
  timings: AntiRsiTimingsSchema,
  lastIdleSeconds: Schema.Finite,
  lastUpdatedSeconds: Schema.Finite,
  paused: Schema.Boolean,
  timersRunning: Schema.Boolean,
  breakWarning: Schema.NullOr(AntiRsiBreakWarningSchema),
}) satisfies Schema.ConstraintCodec<AntiRsiSnapshot>;

export const AntiRsiEventSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("mini-break-start") }),
  Schema.Struct({
    type: Schema.Literal("work-break-start"),
    naturalContinuation: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("break-update"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("break-end"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("break-warning-start"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("break-warning-update"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("break-warning-end"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({ type: Schema.Literal("timings-reset") }),
  Schema.Struct({ type: Schema.Literal("status-update") }),
  Schema.Struct({ type: Schema.Literal("paused") }),
  Schema.Struct({ type: Schema.Literal("resumed") }),
]) satisfies Schema.ConstraintCodec<AntiRsiEvent>;

export const SnapshotEventMetaSchema = Schema.Struct({
  sequence: Schema.Finite,
  serverMonotonicMs: Schema.Finite,
});

export type SnapshotEventMeta = typeof SnapshotEventMetaSchema.Type;

const SnapshotEventPayloadSchema = {
  snapshot: AntiRsiSnapshotSchema,
  meta: Schema.optionalKey(SnapshotEventMetaSchema),
} as const;

export const MainEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("antirsi"),
    event: AntiRsiEventSchema,
    ...SnapshotEventPayloadSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("timers-paused"),
    ...SnapshotEventPayloadSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("timers-resumed"),
    ...SnapshotEventPayloadSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("config-changed"),
    config: antiRsiConfigSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("processes-updated"),
    list: Schema.mutable(Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("init"),
    config: antiRsiConfigSchema,
    processes: Schema.mutable(Schema.Array(Schema.String)),
    ...SnapshotEventPayloadSchema,
  }),
]);

export type MainEvent = typeof MainEventSchema.Type;
