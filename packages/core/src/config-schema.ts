import { z } from "zod"

export const breakConfigSchema = z.object({
  intervalSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
})

export const workBreakConfigSchema = z.object({
  enabled: z.boolean().default(true),
  intervalSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  postponeSeconds: z.number().positive(),
})

export const antiRsiConfigSchema = z.object({
  mini: breakConfigSchema,
  work: workBreakConfigSchema,
  tickIntervalMs: z.number().positive(),
  naturalBreakContinuationWindowSeconds: z.number().nonnegative(),
})

export type BreakConfig = z.infer<typeof breakConfigSchema>
export type WorkBreakConfig = z.infer<typeof workBreakConfigSchema>
export type AntiRsiConfig = z.infer<typeof antiRsiConfigSchema>

/** @deprecated Use `breakConfigSchema` */
export const BreakConfigSchema = breakConfigSchema
/** @deprecated Use `workBreakConfigSchema` */
export const WorkBreakConfigSchema = workBreakConfigSchema
/** @deprecated Use `antiRsiConfigSchema` */
export const AntiRsiConfigSchema = antiRsiConfigSchema

export function parseAntiRsiConfig(input: unknown): AntiRsiConfig {
  return antiRsiConfigSchema.parse(input)
}
