import {
  MotionClassSchema,
  VisualArchetypeSchema,
  VisualRouteSchema,
} from '@youtube-ai-factory/design'
import { z } from 'zod'

export const TemporalStateSchema = z.enum(['BEFORE', 'DURING', 'AFTER'])

export const ShotAssertionSchema = z.object({
  temporalState: TemporalStateSchema,
  statement: z.string().min(1),
  claimIds: z.array(z.string().min(1)).min(1),
  evidenceBinding: z.string().min(1),
}).strict()

export const ShotLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['SOURCE', 'AUTHORED', 'TEXT', 'DATA', 'OVERLAY']),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict()

export const ShotInputSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  tStartTick: z.number().int().nonnegative(),
  tEndTick: z.number().int().positive(),
  route: VisualRouteSchema,
  archetype: VisualArchetypeSchema,
  motionClass: MotionClassSchema,
  claimIds: z.array(z.string().min(1)).min(1),
  layers: z.array(ShotLayerSchema).min(1),
  sourceQuery: z.string().min(1).nullable(),
  assertions: z.array(ShotAssertionSchema).length(3),
}).strict()

export const ShotCueProgramInputSchema = z.object({
  packageId: z.string().min(1),
  timebaseHz: z.number().int().positive(),
  frameRate: z.object({
    numerator: z.number().int().positive(),
    denominator: z.number().int().positive(),
  }).strict(),
  canonicalDurationTicks: z.number().int().positive(),
  shots: z.array(ShotInputSchema).min(1),
}).strict()

export type TemporalState = z.infer<typeof TemporalStateSchema>
export type ShotAssertion = z.infer<typeof ShotAssertionSchema>
export type ShotLayer = z.infer<typeof ShotLayerSchema>
export type ShotInput = z.infer<typeof ShotInputSchema>
export type ShotCueProgramInput = z.infer<typeof ShotCueProgramInputSchema>

export interface TimelineReport {
  readonly gapCount: number
  readonly overlapCount: number
  readonly durationDeltaTicks: number
  readonly durationDeltaFrames: number
}

export interface AdaptiveWarning {
  readonly code:
    | 'SHOT_DURATION_BELOW_GUIDANCE'
    | 'SHOT_DURATION_ABOVE_GUIDANCE'
    | 'MEDIAN_DURATION_OUTSIDE_GUIDANCE'
    | 'ARCHETYPE_RUN_ABOVE_GUIDANCE'
    | 'ARCHETYPE_HOLD_ABOVE_GUIDANCE'
  readonly shotId: string | null
  readonly observed: number
  readonly guidance: number
}

export interface ShotCueProgram extends ShotCueProgramInput {
  readonly shotCount: number
  readonly timeline: TimelineReport
  readonly adaptiveWarnings: readonly AdaptiveWarning[]
  readonly canonicalHash: string
}
