import { Effect, Schema } from "effect";

const PositiveFinite = Schema.Finite.check(Schema.isGreaterThan(0));
const NonNegativeFinite = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const breakConfigSchema = Schema.Struct({
  intervalSeconds: PositiveFinite,
  durationSeconds: PositiveFinite,
});

export const workBreakConfigSchema = Schema.Struct({
  enabled: Schema.Boolean.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(true)),
  ),
  intervalSeconds: PositiveFinite,
  durationSeconds: PositiveFinite,
  postponeSeconds: PositiveFinite,
});

export const antiRsiConfigSchema = Schema.Struct({
  mini: breakConfigSchema,
  work: workBreakConfigSchema,
  tickIntervalMs: PositiveFinite,
  naturalBreakContinuationWindowSeconds: NonNegativeFinite,
  breakWarningLeadSeconds: NonNegativeFinite.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(10)),
  ),
  waitForActivityPauseBeforeBreak: Schema.Boolean.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(false)),
  ),
  breakStartGraceSeconds: NonNegativeFinite.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(2)),
  ),
  maxBreakStartDelaySeconds: NonNegativeFinite.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(30)),
  ),
});

export type BreakConfig = typeof breakConfigSchema.Type;
export type WorkBreakConfig = typeof workBreakConfigSchema.Type;
export type AntiRsiConfig = typeof antiRsiConfigSchema.Type;

export function parseAntiRsiConfig(input: unknown): AntiRsiConfig {
  return Schema.decodeUnknownSync(antiRsiConfigSchema)(input);
}
