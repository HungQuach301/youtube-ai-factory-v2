import { z } from 'zod'

export const GoldDefectClassSchema = z.enum([
  'BLACK_FRAME',
  'FREEZE_FRAME',
  'SILENCE',
  'CLIPPING',
  'DROP_FRAME',
  'MOBILE_LEGIBILITY',
  'SAFE_ZONE',
  'TIMELINE',
])

export const GoldSeveritySchema = z.enum(['P0', 'P1', 'P2'])
export const GoldSourceSchema = z.enum(['synthetic', 'rejected_master'])

export const GoldGroundTruthSchema = z.object({
  defectClass: GoldDefectClassSchema,
  severity: GoldSeveritySchema,
  tStart: z.number().nonnegative(),
  tEnd: z.number().positive(),
}).strict().refine((value) => value.tEnd > value.tStart, {
  message: 'tEnd must be greater than tStart',
})

export const OwnerJudgmentSchema = z.object({
  actorIdentity: z.string().min(1),
  rationale: z.string().min(20),
  decidedAt: z.string().datetime(),
}).strict()

export const GoldSampleSchema = z.object({
  id: z.string().min(1),
  source: GoldSourceSchema,
  r2Key: z.string().min(1),
  groundTruth: GoldGroundTruthSchema,
  ownerJudgment: OwnerJudgmentSchema.nullable(),
  recipe: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.source === 'rejected_master' && value.ownerJudgment === null) {
    context.addIssue({ code: 'custom', message: 'rejected master requires owner judgment' })
  }
  if (value.source === 'synthetic' && value.recipe === null) {
    context.addIssue({ code: 'custom', message: 'synthetic sample requires a recipe' })
  }
})

export type GoldDefectClass = z.infer<typeof GoldDefectClassSchema>
export type GoldGroundTruth = z.infer<typeof GoldGroundTruthSchema>
export type GoldSample = z.infer<typeof GoldSampleSchema>

export interface GoldDetection {
  readonly sampleId: string
  readonly detected: boolean
}

export interface GoldMetric {
  readonly defectClass: GoldDefectClass
  readonly precision: number
  readonly recall: number
  readonly durationVariance: number
}

export interface GoldReadiness {
  readonly ready: boolean
  readonly sampleCount: number
  readonly rejectedMasterCount: number
  readonly failures: readonly string[]
}
