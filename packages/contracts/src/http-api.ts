import {
  antiRsiConfigSchema,
  breakConfigSchema,
  NonNegativeFinite,
  PositiveFinite,
  workBreakConfigSchema,
} from "@antirsi/core";
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { API_ROUTES } from "./api";
import { AntiRsiSnapshotSchema, BreakTypeSchema, MainEventSchema } from "./ipc";
export {
  AntiRsiEventSchema,
  AntiRsiSnapshotSchema,
  MainEventSchema,
} from "./ipc";

export const AntiRsiConfigSchema = antiRsiConfigSchema;

/**
 * Partial config accepted by SET_CONFIG. Numeric fields reuse the same
 * constraint schemas as {@link antiRsiConfigSchema} so strict checks
 * (positive/non-negative) apply on the partial path. The constraint-only
 * exports are used instead of the base schema's fields because those carry
 * decoding defaults, which would inject unrelated keys into sparse patches.
 */
const PartialAntiRsiConfigSchema = Schema.Struct({
  mini: Schema.optionalKey(breakConfigSchema),
  work: Schema.optionalKey(workBreakConfigSchema),
  tickIntervalMs: Schema.optionalKey(PositiveFinite),
  naturalBreakContinuationWindowSeconds: Schema.optionalKey(NonNegativeFinite),
  breakWarningLeadSeconds: Schema.optionalKey(NonNegativeFinite),
  waitForActivityPauseBeforeBreak: Schema.optionalKey(Schema.Boolean),
  breakStartGraceSeconds: Schema.optionalKey(NonNegativeFinite),
  maxBreakStartDelaySeconds: Schema.optionalKey(NonNegativeFinite),
});

/**
 * Actions accepted over the local HTTP API. Internal engine actions (TICK,
 * SET_PROCESSES, ADD_INHIBITOR, REMOVE_INHIBITOR) are intentionally excluded:
 * they are dispatched only inside the sidecar runtime and must not be
 * injectable by other local processes.
 */
export const ActionSchema = Schema.Union([
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
  Schema.Struct({
    type: Schema.Literal("POSTPONE_BREAK"),
    breakType: BreakTypeSchema,
  }),
  Schema.Struct({ type: Schema.Literal("POSTPONE_WORK_BREAK") }),
  Schema.Struct({
    type: Schema.Literal("SET_USER_PAUSED"),
    value: Schema.Boolean,
  }),
  Schema.Struct({ type: Schema.Literal("RESET_CONFIG") }),
]);

const RootGroup = HttpApiGroup.make("root").add(
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

/**
 * Actions accepted by the `command` endpoint. A strict subset of the core
 * `Action` union (internal engine actions are excluded — see {@link ActionSchema}).
 */
export type ApiAction = typeof ActionSchema.Type;
