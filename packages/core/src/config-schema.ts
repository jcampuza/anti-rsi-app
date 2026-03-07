import { Schema } from "effect"

export const BreakConfigSchema = Schema.Struct({
  intervalSeconds: Schema.Number.pipe(Schema.positive()),
  durationSeconds: Schema.Number.pipe(Schema.positive()),
})

export const WorkBreakConfigSchema = Schema.Struct({
  intervalSeconds: Schema.Number.pipe(Schema.positive()),
  durationSeconds: Schema.Number.pipe(Schema.positive()),
  postponeSeconds: Schema.Number.pipe(Schema.positive()),
})

export const AntiRsiConfigSchema = Schema.Struct({
  mini: BreakConfigSchema,
  work: WorkBreakConfigSchema,
  tickIntervalMs: Schema.Number.pipe(Schema.positive()),
  naturalBreakContinuationWindowSeconds: Schema.Number.pipe(Schema.nonNegative()),
})

export type BreakConfig = typeof BreakConfigSchema.Type
export type WorkBreakConfig = typeof WorkBreakConfigSchema.Type
export type AntiRsiConfig = typeof AntiRsiConfigSchema.Type
