import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { beatSequenceDiff, phashHamming } from '@youtube-ai-factory/intelligence'
import { z } from 'zod'

const { ATTENTION, POLICY } = thresholds
const isoTimestamp = z.string().datetime({ offset: true })
const hex64 = z.string().regex(/^[0-9a-f]{64}$/u)

export const PolicyCheckSchema = z.object({
  code: z.enum(['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'PC8']),
  state: z.enum(['PASS', 'FAIL', 'NOT_EVALUATED']),
  evidenceR2Key: z.string().min(1).nullable(),
  evaluatedAt: isoTimestamp,
}).strict().superRefine((value, context) => {
  if (value.state === 'PASS' && value.evidenceR2Key === null) {
    context.addIssue({ code: 'custom', path: ['evidenceR2Key'], message: 'G7/G15: PASS requires evidence' })
  }
})

export type PolicyCheck = z.infer<typeof PolicyCheckSchema>
const CHECK_CODES = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'PC8'] as const

export function evaluatePolicyChecklist(checks: readonly PolicyCheck[]): {
  readonly state: 'PASS' | 'FAIL'
  readonly missing: readonly string[]
  readonly failed: readonly string[]
} {
  const parsed = checks.map((check) => PolicyCheckSchema.parse(check))
  const byCode = new Map(parsed.map((check) => [check.code, check]))
  if (byCode.size !== parsed.length) throw new Error('G15: duplicate policy check code')
  const missing = CHECK_CODES.filter((code) => !byCode.has(code))
  const failed = CHECK_CODES.filter((code) => byCode.get(code)?.state !== 'PASS')
  return { state: missing.length === 0 && failed.length === 0 ? 'PASS' : 'FAIL', missing, failed }
}

export const DisclosureDecisionSchema = z.object({
  packageId: z.string().min(1),
  syntheticToggle: z.boolean().default(true),
  rationaleText: z.string().nullable().default(null),
  decidedBy: z.string().min(3),
  decidedAt: isoTimestamp,
}).strict().superRefine((value, context) => {
  if (!value.syntheticToggle && (value.rationaleText?.trim().length ?? 0) < ATTENTION.RATIONALE_MIN_CHARS) {
    context.addIssue({ code: 'custom', path: ['rationaleText'], message: 'PC-4: disabling disclosure requires written rationale' })
  }
})

export function disclosureDecision(input: z.input<typeof DisclosureDecisionSchema>): z.output<typeof DisclosureDecisionSchema> {
  return DisclosureDecisionSchema.parse(input)
}

export function authorizePublish(input: {
  readonly checks: readonly PolicyCheck[]
  readonly disclosureRecorded: boolean
  readonly predictionSealed: boolean
  readonly activeOwner: boolean
  readonly channelFrozen: boolean
}): { readonly authorized: boolean; readonly failures: readonly string[] } {
  const failures: string[] = []
  if (evaluatePolicyChecklist(input.checks).state !== 'PASS') failures.push('POLICY_CHECKLIST_INCOMPLETE')
  if (!input.disclosureRecorded) failures.push('DISCLOSURE_DECISION_MISSING')
  if (!input.predictionSealed) failures.push('SEALED_PREDICTION_MISSING')
  if (!input.activeOwner) failures.push('ACTIVE_OWNER_AUTHORIZATION_MISSING')
  if (input.channelFrozen) failures.push('CHANNEL_FROZEN')
  return { authorized: failures.length === 0, failures }
}

export interface SelfSimilarityReference {
  readonly videoId: string
  readonly beats: readonly string[]
  readonly voiceSettingsHash: string
  readonly thumbnailPhash: string
}

export function evaluateSelfSimilarity(current: SelfSimilarityReference, previous: readonly SelfSimilarityReference[]): {
  readonly pass: boolean
  readonly violations: readonly string[]
} {
  const window = previous.slice(-POLICY.SELF_SIMILARITY_WINDOW_VIDEOS)
  const violations: string[] = []
  for (const reference of window) {
    if (beatSequenceDiff(current.beats, reference.beats) < POLICY.SELF_BEAT_SEQUENCE_DIFF_MIN) {
      violations.push(`BEAT_TOO_SIMILAR:${reference.videoId}`)
    }
    if (phashHamming(current.thumbnailPhash, reference.thumbnailPhash) < POLICY.SELF_THUMBNAIL_PHASH_HAMMING_MIN) {
      violations.push(`THUMBNAIL_TOO_SIMILAR:${reference.videoId}`)
    }
    if (current.voiceSettingsHash === reference.voiceSettingsHash) {
      violations.push(`VOICE_SETTINGS_REUSED:${reference.videoId}`)
    }
  }
  return { pass: violations.length === 0, violations }
}

export const IncidentSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  level: z.enum(['I1', 'I2', 'I3', 'I4']),
  source: z.enum(['PLATFORM_NOTICE', 'INTERNAL', 'VIEWER']),
  detectedAt: isoTimestamp,
}).strict()

export function assertIncidentFreeze(input: {
  readonly incident: z.infer<typeof IncidentSchema>
  readonly openFreezeIncidentId: string | null
}): void {
  const incident = IncidentSchema.parse(input.incident)
  if (incident.level !== 'I1' && input.openFreezeIncidentId !== incident.id) {
    throw new Error('INCIDENT: I2+ requires immediate channel freeze')
  }
}

export function authorizeEmergencyFreeze(actor: { readonly role: 'OWNER' | 'OPERATOR' | 'EDITOR'; readonly active: boolean }): boolean {
  return actor.active && (actor.role === 'OWNER' || (actor.role === 'OPERATOR' && POLICY.OPERATOR_EMERGENCY_FREEZE))
}

export function authorizeUnfreeze(input: {
  readonly actor: { readonly role: 'OWNER' | 'OPERATOR' | 'EDITOR'; readonly active: boolean }
  readonly promotedLearningIds: readonly string[]
}): { readonly authorized: boolean; readonly reason: string | null } {
  if (!input.actor.active || input.actor.role !== 'OWNER') return { authorized: false, reason: 'ACTIVE_OWNER_REQUIRED' }
  if (input.promotedLearningIds.length === 0) return { authorized: false, reason: 'PROMOTED_INCIDENT_LEARNING_REQUIRED' }
  return { authorized: true, reason: null }
}

export const PolicySnapshotSchema = z.object({
  sourceKey: z.enum(['ypp_monetization', 'inauthentic_content', 'synthetic_disclosure', 'advertiser_friendly']),
  sourceUrl: z.string().url().refine((value) => value.startsWith('https://'), 'Official policy sources require HTTPS'),
  fetchedAt: isoTimestamp,
  snapshotR2Key: z.string().min(1),
  contentHash: hex64,
}).strict()

export function policyWatch(previous: z.infer<typeof PolicySnapshotSchema> | null, current: z.infer<typeof PolicySnapshotSchema>): {
  readonly changed: boolean
  readonly proposal: null | { readonly source: 'POLICY_WATCH'; readonly kind: 'POLICY'; readonly sourceKey: string; readonly previousHash: string | null; readonly currentHash: string; readonly evidenceR2Key: string; readonly idempotencyHash: string }
} {
  const next = PolicySnapshotSchema.parse(current)
  const prior = previous === null ? null : PolicySnapshotSchema.parse(previous)
  if (prior !== null && prior.sourceKey !== next.sourceKey) throw new Error('POLICY_WATCH_SOURCE_MISMATCH')
  const changed = prior?.contentHash !== next.contentHash
  if (!changed) return { changed: false, proposal: null }
  const proposal = {
    source: 'POLICY_WATCH' as const,
    kind: 'POLICY' as const,
    sourceKey: next.sourceKey,
    previousHash: prior?.contentHash ?? null,
    currentHash: next.contentHash,
    evidenceR2Key: next.snapshotR2Key,
  }
  return { changed: true, proposal: { ...proposal, idempotencyHash: canonicalHash(proposal) } }
}

export const POLICY_RUNTIME = {
  disclosureDefault: POLICY.DISCLOSURE_DEFAULT,
  operatorEmergencyFreeze: POLICY.OPERATOR_EMERGENCY_FREEZE,
  freezeOwnerConfirmHours: POLICY.FREEZE_OWNER_CONFIRM_HOURS,
  samplingMinCleanStreak: POLICY.SAMPLING_MIN_CLEAN_STREAK,
  killCriteriaVideoCount: POLICY.KILL_CRITERIA_VIDEO_COUNT,
} as const
