import { z } from 'zod'

export const SourceTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export const ClaimTypeSchema = z.enum(['FACT', 'ESTIMATE', 'MECHANISM', 'INTERPRETATION', 'PREDICTION'])
export const ClaimCriticalitySchema = z.enum(['CRITICAL', 'NORMAL', 'SUPPORTING'])
export const SourceRoleSchema = z.enum(['PRIMARY', 'SUPPORTING', 'LOCATING'])

export const SourceRecordSchema = z.object({
  id: z.string().min(1),
  tier: SourceTierSchema,
  url: z.string().url(),
  snapshotR2Key: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  fetchedAt: z.string().datetime(),
}).strict()

export const ClaimRecordSchema = z.object({
  id: z.string().min(1),
  type: ClaimTypeSchema,
  criticality: ClaimCriticalitySchema,
  text: z.string().min(1),
  asOfDate: z.string().date().nullable(),
  jurisdiction: z.string().min(1).nullable(),
}).strict()

export const ClaimSourceSchema = z.object({
  claimId: z.string().min(1),
  sourceId: z.string().min(1),
  role: SourceRoleSchema,
}).strict()

export const TerminologySchema = z.object({
  term: z.string().min(1),
  plainMeaning: z.string().min(1),
  institutionalRole: z.string().min(1).nullable(),
  ipa: z.string().min(1),
  arpabet: z.string().min(1),
}).strict()

export type SourceRecord = z.infer<typeof SourceRecordSchema>
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>
export type ClaimSource = z.infer<typeof ClaimSourceSchema>
export type Terminology = z.infer<typeof TerminologySchema>

export interface ParsedNumber {
  readonly raw: string
  readonly value: number
  readonly unit: 'NUMBER' | 'PERCENT' | 'BASIS_POINT'
  readonly currency: 'USD' | 'EUR' | 'GBP' | null
  readonly qualifier: 'EXACT' | 'ABOUT' | 'MORE_THAN' | 'LESS_THAN'
}

export interface AdviceFinding {
  readonly code: 'DIRECT_ADVICE' | 'INDIRECT_ADVICE' | 'PROFIT_PROMISE' | 'GUARANTEE'
  readonly excerpt: string
}
