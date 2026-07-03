import type {
  Action,
  AntiRsiConfig,
  AntiRsiEvent,
  AntiRsiSnapshot,
} from "@antirsi/core";
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { API_ROUTES } from "./api";
import type { MainEvent, SnapshotEventMeta } from "./ipc";

const BreakTypeSchema = Schema.Literals(["mini", "work"]);

const BreakConfigSchema = Schema.Struct({
  intervalSeconds: Schema.Finite,
  durationSeconds: Schema.Finite,
});

const WorkBreakConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  intervalSeconds: Schema.Finite,
  durationSeconds: Schema.Finite,
  postponeSeconds: Schema.Finite,
});

export const AntiRsiConfigSchema = Schema.Struct({
  mini: BreakConfigSchema,
  work: WorkBreakConfigSchema,
  tickIntervalMs: Schema.Finite,
  naturalBreakContinuationWindowSeconds: Schema.Finite,
  breakWarningLeadSeconds: Schema.Finite,
  waitForActivityPauseBeforeBreak: Schema.Boolean,
  breakStartGraceSeconds: Schema.Finite,
  maxBreakStartDelaySeconds: Schema.Finite,
}) satisfies Schema.ConstraintCodec<AntiRsiConfig>;

const PartialAntiRsiConfigSchema = Schema.Struct({
  mini: Schema.optionalKey(BreakConfigSchema),
  work: Schema.optionalKey(WorkBreakConfigSchema),
  tickIntervalMs: Schema.optionalKey(Schema.Finite),
  naturalBreakContinuationWindowSeconds: Schema.optionalKey(Schema.Finite),
  breakWarningLeadSeconds: Schema.optionalKey(Schema.Finite),
  waitForActivityPauseBeforeBreak: Schema.optionalKey(Schema.Boolean),
  breakStartGraceSeconds: Schema.optionalKey(Schema.Finite),
  maxBreakStartDelaySeconds: Schema.optionalKey(Schema.Finite),
}) satisfies Schema.ConstraintCodec<Partial<AntiRsiConfig>>;

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

export const ActionSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("TICK"),
    idleSeconds: Schema.Finite,
    dtSeconds: Schema.Finite,
  }),
  Schema.Struct({
    type: Schema.Literal("SET_CONFIG"),
    config: PartialAntiRsiConfigSchema,
  }),
  Schema.Struct({ type: Schema.Literal("RESET_TIMINGS") }),
  Schema.Struct({ type: Schema.Literal("START_MINI_BREAK") }),
  Schema.Struct({ type: Schema.Literal("END_MINI_BREAK") }),
  Schema.Struct({
    type: Schema.Literal("START_WORK_BREAK"),
    naturalContinuation: Schema.Boolean,
  }),
  Schema.Struct({ type: Schema.Literal("END_WORK_BREAK") }),
  Schema.Struct({
    type: Schema.Literal("ACK_BREAK_VISIBLE"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({ type: Schema.Literal("POSTPONE_WORK_BREAK") }),
  Schema.Struct({
    type: Schema.Literal("SET_USER_PAUSED"),
    value: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("ADD_INHIBITOR"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("REMOVE_INHIBITOR"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("SET_PROCESSES"),
    processes: Schema.mutable(Schema.Array(Schema.String)),
  }),
  Schema.Struct({ type: Schema.Literal("RESET_CONFIG") }),
]) satisfies Schema.ConstraintCodec<Action>;

export const SnapshotEventMetaSchema = Schema.Struct({
  sequence: Schema.Finite,
  serverMonotonicMs: Schema.Finite,
}) satisfies Schema.ConstraintCodec<SnapshotEventMeta>;

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
    config: AntiRsiConfigSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("processes-updated"),
    list: Schema.mutable(Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("init"),
    config: AntiRsiConfigSchema,
    processes: Schema.mutable(Schema.Array(Schema.String)),
    ...SnapshotEventPayloadSchema,
  }),
]) satisfies Schema.ConstraintCodec<MainEvent>;

const RootGroup = HttpApiGroup.make("root", { topLevel: true }).add(
  HttpApiEndpoint.get("snapshot", API_ROUTES.SNAPSHOT, {
    success: AntiRsiSnapshotSchema,
  }),
  HttpApiEndpoint.get("config", API_ROUTES.CONFIG, {
    success: AntiRsiConfigSchema,
  }),
  HttpApiEndpoint.get("processes", API_ROUTES.PROCESSES, {
    success: Schema.mutable(Schema.Array(Schema.String)),
  }),
  HttpApiEndpoint.post("command", API_ROUTES.COMMAND, {
    payload: ActionSchema,
    success: HttpApiSchema.NoContent,
  }),
  HttpApiEndpoint.get("events", API_ROUTES.EVENTS, {
    success: HttpApiSchema.StreamSse({ data: MainEventSchema }),
  }),
);

export const AntiRsiApi = HttpApi.make("AntiRsiApi").add(RootGroup);
