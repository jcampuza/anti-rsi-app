import {
  antiRsiConfigSchema,
  breakConfigSchema,
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

const PartialAntiRsiConfigSchema = Schema.Struct({
  mini: Schema.optionalKey(breakConfigSchema),
  work: Schema.optionalKey(workBreakConfigSchema),
  tickIntervalMs: Schema.optionalKey(Schema.Finite),
  naturalBreakContinuationWindowSeconds: Schema.optionalKey(Schema.Finite),
  breakWarningLeadSeconds: Schema.optionalKey(Schema.Finite),
  waitForActivityPauseBeforeBreak: Schema.optionalKey(Schema.Boolean),
  breakStartGraceSeconds: Schema.optionalKey(Schema.Finite),
  maxBreakStartDelaySeconds: Schema.optionalKey(Schema.Finite),
});

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
]);

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
