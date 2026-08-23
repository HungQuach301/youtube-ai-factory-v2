import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash, canonicalize } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

const { ATTENTION, POLICY } = thresholds

const isoTimestamp = z.string().datetime({ offset: true })
const identity = z.string().min(3).refine(
  (value) => !/(?:<domain>|example\.com|placeholder|service|bot)/iu.test(value),
  'Human identity must be an explicit, non-placeholder allowlist identity',
)

export const HumanActorSchema = z.object({
  identity,
  displayName: z.string().min(1),
  role: z.enum(['OWNER', 'OPERATOR', 'EDITOR']),
  isService: z.literal(false),
  active: z.boolean(),
}).strict()

export const HumanDecisionSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  packageId: z.string().min(1),
  decisionType: z.enum(['D1', 'D2', 'D3', 'D4', 'D5']),
  actorIdentity: identity,
  artifactBeforeId: z.string().min(1).nullable(),
  artifactAfterId: z.string().min(1),
  diffR2Key: z.string().min(1),
  rationaleText: z.string().min(ATTENTION.RATIONALE_MIN_CHARS),
  createdAt: isoTimestamp,
}).strict()

export const ArtifactSealSchema = z.object({
  artifactId: z.string().min(1),
  sealedAt: isoTimestamp,
}).strict()

export const AttentionEntrySchema = z.object({
  id: z.string().min(1),
  actorIdentity: identity,
  touchpoint: z.enum(['HP01', 'HP02', 'HP03', 'HP04', 'HP05', 'HP06', 'HP07']),
  packageId: z.string().min(1).nullable(),
  minutesSpent: z.number().positive().finite(),
  weekStart: z.string().date(),
  createdAt: isoTimestamp,
}).strict()

export type HumanActor = z.infer<typeof HumanActorSchema>
export type HumanDecision = z.infer<typeof HumanDecisionSchema>
export type ArtifactSeal = z.infer<typeof ArtifactSealSchema>
export type AttentionEntry = z.infer<typeof AttentionEntrySchema>

export interface ImprintEvaluation {
  readonly state: 'PASS' | 'FAIL'
  readonly code: 'EDITORIAL_IMPRINT_PRESENT'
  readonly failures: readonly string[]
  readonly decisionCount: number
  readonly distinctDecisionTypes: number
}

function activeActorMap(actors: readonly HumanActor[]): ReadonlyMap<string, HumanActor> {
  if (actors.length === 0) throw new Error('HP-02: human allowlist is required')
  const parsed = actors.map((actor) => HumanActorSchema.parse(actor))
  const map = new Map(parsed.map((actor) => [actor.identity, actor]))
  if (map.size !== parsed.length) throw new Error('HP-02: duplicate human allowlist identity')
  return map
}

export function evaluateEditorialImprint(input: {
  readonly packageId: string
  readonly actors: readonly HumanActor[]
  readonly decisions: readonly HumanDecision[]
  readonly artifactSeals: readonly ArtifactSeal[]
}): ImprintEvaluation {
  const actors = activeActorMap(input.actors)
  const decisions = input.decisions.map((decision) => HumanDecisionSchema.parse(decision))
    .filter((decision) => decision.packageId === input.packageId)
  const seals = new Map(input.artifactSeals.map((seal) => {
    const parsed = ArtifactSealSchema.parse(seal)
    return [parsed.artifactId, parsed.sealedAt]
  }))
  const failures: string[] = []

  if (decisions.length < POLICY.MIN_HUMAN_DECISIONS) failures.push('MIN_HUMAN_DECISIONS')
  const distinct = new Set(decisions.map((decision) => decision.decisionType)).size
  if (distinct < POLICY.MIN_DISTINCT_DECISION_TYPES) failures.push('MIN_DISTINCT_DECISION_TYPES')

  for (const decision of decisions) {
    if (actors.get(decision.actorIdentity)?.active !== true) failures.push(`INACTIVE_OR_UNKNOWN_ACTOR:${decision.id}`)
    const sealedAt = seals.get(decision.artifactAfterId)
    if (sealedAt === undefined || Date.parse(sealedAt) <= Date.parse(decision.createdAt)) {
      failures.push(`POST_DECISION_LINEAGE_MISSING:${decision.id}`)
    }
  }

  return {
    state: failures.length === 0 ? 'PASS' : 'FAIL',
    code: 'EDITORIAL_IMPRINT_PRESENT',
    failures,
    decisionCount: decisions.length,
    distinctDecisionTypes: distinct,
  }
}

function normalizeRationale(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function lintDecisionDiversity(decisions: readonly HumanDecision[]): readonly string[] {
  const parsed = decisions.map((decision) => HumanDecisionSchema.parse(decision))
  const recentPackages = Array.from(new Set(parsed.map((decision) => decision.packageId))).slice(-POLICY.DECISION_TYPE_DIVERSITY_WINDOW)
  const window = parsed.filter((decision) => recentPackages.includes(decision.packageId))
  const warnings: string[] = []
  if (window.length > 1 && new Set(window.map((decision) => normalizeRationale(decision.rationaleText))).size === 1) {
    warnings.push('REPEATED_RATIONALE_PATTERN')
  }
  if (window.length > 1 && new Set(window.map((decision) => decision.decisionType)).size < POLICY.MIN_DISTINCT_DECISION_TYPES) {
    warnings.push('INSUFFICIENT_DECISION_TYPE_DIVERSITY')
  }
  return warnings
}

export function attentionLoad(entries: readonly AttentionEntry[], weekStart: string): {
  readonly used: number
  readonly ceiling: number
  readonly remaining: number
} {
  z.string().date().parse(weekStart)
  const used = entries.map((entry) => AttentionEntrySchema.parse(entry))
    .filter((entry) => entry.weekStart === weekStart)
    .reduce((total, entry) => total + entry.minutesSpent, 0)
  return { used, ceiling: ATTENTION.OWNER_WEEKLY_CEILING_MIN, remaining: ATTENTION.OWNER_WEEKLY_CEILING_MIN - used }
}

export function authorizeAttention(input: {
  readonly entries: readonly AttentionEntry[]
  readonly weekStart: string
  readonly projectedMinutes: number
}): { readonly authorized: boolean; readonly projectedTotal: number; readonly reason: string | null } {
  const projectedMinutes = z.number().positive().finite().parse(input.projectedMinutes)
  const load = attentionLoad(input.entries, input.weekStart)
  const projectedTotal = load.used + projectedMinutes
  return projectedTotal <= load.ceiling
    ? { authorized: true, projectedTotal, reason: null }
    : { authorized: false, projectedTotal, reason: 'OWNER_WEEKLY_ATTENTION_CEILING_EXCEEDED' }
}

export function queueAgeAlert(enqueuedAt: string, now: string): boolean {
  isoTimestamp.parse(enqueuedAt)
  isoTimestamp.parse(now)
  return Date.parse(now) - Date.parse(enqueuedAt) >= ATTENTION.QUEUE_AGE_ALERT_HOURS * 60 * 60 * 1_000
}

export interface EvidenceReportInput {
  readonly channelId: string
  readonly window: { readonly from: string; readonly to: string }
  readonly decisions: readonly HumanDecision[]
  readonly releaseAuthorizations: readonly { readonly packageId: string; readonly actorIdentity: string; readonly at: string }[]
  readonly publishAuthorizations: readonly { readonly packageId: string; readonly actorIdentity: string; readonly at: string }[]
  readonly disclosureDecisions: readonly { readonly packageId: string; readonly enabled: boolean; readonly at: string }[]
  readonly differentiation: readonly { readonly packageId: string; readonly score: number }[]
  readonly sourcedClaimRatios: readonly { readonly packageId: string; readonly tierOneTwoRatio: number }[]
}

export function generateEvidenceReport(input: EvidenceReportInput): { readonly content: string; readonly hash: string } {
  const from = Date.parse(isoTimestamp.parse(input.window.from))
  const to = Date.parse(isoTimestamp.parse(input.window.to))
  if (from > to) throw new Error('Evidence report window is reversed')
  const decisions = input.decisions.map((decision) => HumanDecisionSchema.parse(decision))
    .filter((decision) => decision.channelId === input.channelId && Date.parse(decision.createdAt) >= from && Date.parse(decision.createdAt) <= to)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  const packageIds = Array.from(new Set(decisions.map((decision) => decision.packageId))).sort()
  const body = {
    schemaVersion: 1,
    channelId: input.channelId,
    window: input.window,
    decisions,
    releaseAuthorizations: input.releaseAuthorizations.filter((row) => packageIds.includes(row.packageId)).sort((a, b) => a.at.localeCompare(b.at)),
    publishAuthorizations: input.publishAuthorizations.filter((row) => packageIds.includes(row.packageId)).sort((a, b) => a.at.localeCompare(b.at)),
    disclosureDecisions: input.disclosureDecisions.filter((row) => packageIds.includes(row.packageId)).sort((a, b) => a.at.localeCompare(b.at)),
    differentiation: input.differentiation.filter((row) => packageIds.includes(row.packageId)).sort((a, b) => a.packageId.localeCompare(b.packageId)),
    sourcedClaimRatios: input.sourcedClaimRatios.filter((row) => packageIds.includes(row.packageId)).sort((a, b) => a.packageId.localeCompare(b.packageId)),
    summary: { packageCount: packageIds.length, decisionCount: decisions.length, autoPublishedCount: 0 },
  }
  return { content: canonicalize(body), hash: canonicalHash(body) }
}
