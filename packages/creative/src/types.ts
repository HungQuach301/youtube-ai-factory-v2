import { z } from 'zod'

export const HOOK_TYPES = [
  'cold_open_anomaly',
  'direct_question',
  'stakes_statement',
  'in_medias_res',
  'counterintuitive_claim',
  'visual_reveal',
] as const

export const NARRATIVE_DEVICES = [
  'chronological',
  'mystery_reveal',
  'comparison',
  'case_study',
  'mechanism_teardown',
  'counterfactual',
] as const

export const HookTypeSchema = z.enum(HOOK_TYPES)
export const NarrativeDeviceSchema = z.enum(NARRATIVE_DEVICES)

export const CreativeRouteSchema = z.object({
  id: z.string().min(1),
  hookType: HookTypeSchema,
  narrativeDevice: NarrativeDeviceSchema,
  premise: z.string().min(1),
}).strict()

export const PackagingContractSchema = z.object({
  titleCandidates: z.array(z.string().min(1)).min(1),
  thumbnailConcept: z.string().min(1),
  viewerPromise: z.string().min(1),
  viewerPromiseClaimIds: z.array(z.string().min(1)).min(1),
}).strict()

export const BeatSchema = z.object({
  id: z.string().min(1),
  tStartSec: z.number().nonnegative(),
  tEndSec: z.number().positive(),
  beatType: z.string().min(1),
  knowledgeBefore: z.array(z.string().min(1)),
  knowledgeAfter: z.array(z.string().min(1)),
  expectationDelta: z.string().min(1),
  claimIds: z.array(z.string().min(1)),
  loopOpened: z.string().min(1).nullable(),
  loopClosed: z.string().min(1).nullable(),
  visualIntent: z.string().min(1),
  prosodyIntent: z.string().min(1),
  newEntities: z.array(z.string().min(1)),
}).strict()

export const PredictionWeightsSchema = z.object({
  stateStaleness: z.number().nonnegative(),
  entityDensity: z.number().nonnegative(),
  openLoopDistance: z.number().nonnegative(),
  archetypeStaleness: z.number().nonnegative(),
}).strict()

export const ScriptSectionKindSchema = z.enum([
  'HOOK',
  'ESCALATION',
  'DENSE_MECHANISM',
  'PAYOFF',
  'OTHER',
])

export const ScriptSectionSchema = z.object({
  id: z.string().min(1),
  kind: ScriptSectionKindSchema,
  text: z.string().min(1),
  durationSec: z.number().positive(),
  claimIds: z.array(z.string().min(1)),
}).strict()

export const NumericClaimSchema = z.object({
  claimId: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(['NUMBER', 'PERCENT', 'BASIS_POINT']),
  currency: z.enum(['USD', 'EUR', 'GBP']).nullable(),
  asOfDate: z.string().date(),
}).strict()

export const NumberBindingSchema = z.object({
  sectionId: z.string().min(1),
  numberIndex: z.number().int().nonnegative(),
  claimId: z.string().min(1),
  asOfEvidence: z.enum(['SPOKEN', 'ONSCREEN']),
}).strict()

export type CreativeRoute = z.infer<typeof CreativeRouteSchema>
export type PackagingContract = z.infer<typeof PackagingContractSchema>
export type Beat = z.infer<typeof BeatSchema>
export type PredictionWeights = z.infer<typeof PredictionWeightsSchema>
export type ScriptSection = z.infer<typeof ScriptSectionSchema>
export type NumericClaim = z.infer<typeof NumericClaimSchema>
export type NumberBinding = z.infer<typeof NumberBindingSchema>

export interface LintResult {
  readonly valid: boolean
  readonly failures: readonly string[]
}

export interface ScriptLintResult extends LintResult {
  readonly warnings: readonly string[]
}
