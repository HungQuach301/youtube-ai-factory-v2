import { thresholds } from '@youtube-ai-factory/contracts'
import {
  ClaimRecordSchema,
  ClaimSourceSchema,
  SourceRecordSchema,
  TerminologySchema,
  type ClaimRecord,
  type ClaimSource,
  type SourceRecord,
  type Terminology,
} from './types.js'

export const validateClaimEvidence = (
  claimInput: unknown,
  sourceInputs: readonly unknown[],
  linkInputs: readonly unknown[],
): { readonly valid: boolean; readonly failures: readonly string[] } => {
  const claim: ClaimRecord = ClaimRecordSchema.parse(claimInput)
  const sources: SourceRecord[] = sourceInputs.map((source) => SourceRecordSchema.parse(source))
  const links: ClaimSource[] = linkInputs.map((link) => ClaimSourceSchema.parse(link))
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const primaryTiers = links
    .filter((link) => link.claimId === claim.id && link.role === 'PRIMARY')
    .map((link) => sourceById.get(link.sourceId)?.tier)
    .filter((tier): tier is 1 | 2 | 3 | 4 => tier !== undefined)
  const failures: string[] = []
  if (claim.criticality === 'CRITICAL' && !primaryTiers.some((tier) => tier <= thresholds.SOURCE_QUALITY.CRITICAL_CLAIM_MIN_TIER)) {
    failures.push('CRITICAL_CLAIM_REQUIRES_T1_T2_PRIMARY')
  }
  return { valid: failures.length === 0, failures }
}

export const defineTerminology = (input: unknown): Terminology => TerminologySchema.parse(input)
