import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

import type {
  MandatoryAlert,
  MetricInput,
  MinimumMetrics,
  OperatorWorkspaceInput,
  Percentiles,
  ReconstructedOutput,
  ReconstructedProviderCall,
  ReconstructedTrace,
  TraceEvent,
} from './types.js'

export * from './types.js'

const isoTimestamp = z.string().datetime({ offset: true })
const nonEmpty = z.string().min(1)
const hex64 = z.string().regex(/^[0-9a-f]{64}$/u)

const TraceEventSchema = z.object({
  id: nonEmpty,
  traceId: nonEmpty,
  sequence: z.number().int().nonnegative(),
  packageId: nonEmpty,
  stageInstanceId: nonEmpty,
  eventType: z.enum([
    'STAGE_ATTEMPT_STARTED', 'PROVIDER_REQUESTED', 'PROVIDER_RESPONDED', 'COST_SETTLED',
    'OUTPUT_SEALED', 'GATE_EVALUATED', 'STAGE_ATTEMPT_COMPLETED',
  ]),
  spanId: nonEmpty.optional(),
  reservationId: nonEmpty.optional(),
  requestR2Key: nonEmpty.optional(),
  responseR2Key: nonEmpty.optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  errorClass: z.enum([
    'TRANSIENT', 'RATE_LIMIT', 'SCHEMA_VIOLATION', 'RIGHTS_DENIED', 'BUDGET_DENIED',
    'CONTENT_FILTERED', 'PROVIDER_ERROR',
  ]).nullable().optional(),
  costUsd: z.number().nonnegative().finite().optional(),
  outputId: nonEmpty.optional(),
  outputR2Key: nonEmpty.optional(),
  outputSha256: hex64.optional(),
  gateCode: nonEmpty.optional(),
  gateState: z.enum(['PASS', 'FAIL', 'NOT_EVALUATED', 'WAIVED']).optional(),
  outcome: z.enum(['SUCCEEDED', 'FAILED']).optional(),
  occurredAt: isoTimestamp,
  evidenceR2Key: nonEmpty,
}).strict()

export type ObservabilityErrorCode =
  | 'TRACE_NOT_FOUND'
  | 'TRACE_EVENT_INVALID'
  | 'TRACE_ID_MISMATCH'
  | 'TRACE_SCOPE_MISMATCH'
  | 'TRACE_SEQUENCE_INVALID'
  | 'TRACE_BOUNDARY_INVALID'
  | 'PROVIDER_LIFECYCLE_INCOMPLETE'
  | 'OUTPUT_LIFECYCLE_INVALID'
  | 'NEXT_VALID_ACTION_AMBIGUOUS'

export class ObservabilityError extends Error {
  override readonly name = 'ObservabilityError'

  constructor(readonly code: ObservabilityErrorCode, readonly details: readonly string[] = []) {
    super(`${code}${details.length === 0 ? '' : `: ${details.join('; ')}`}`)
  }
}

interface MutableProviderCall {
  reservationId: string
  requestR2Key: string
  responseR2Key?: string
  latencyMs?: number
  errorClass?: ReconstructedProviderCall['errorClass']
  costUsd?: number
}

function requireField<T>(value: T | undefined, event: TraceEvent, name: string): T {
  if (value === undefined) throw new ObservabilityError('TRACE_EVENT_INVALID', [`${event.id}:${name}`])
  return value
}

export function reconstructTrace(traceId: string, sourceEvents: readonly unknown[]): ReconstructedTrace {
  const parsed: TraceEvent[] = []
  for (const candidate of sourceEvents) {
    const result = TraceEventSchema.safeParse(candidate)
    if (!result.success) throw new ObservabilityError('TRACE_EVENT_INVALID', result.error.issues.map((issue) => issue.message))
    if (result.data.traceId === traceId) parsed.push(result.data)
  }
  if (parsed.length === 0) throw new ObservabilityError('TRACE_NOT_FOUND', [traceId])
  const events = parsed.sort((left, right) => left.sequence - right.sequence)
  const first = events[0]
  const last = events.at(-1)
  if (first === undefined || last === undefined) throw new ObservabilityError('TRACE_NOT_FOUND', [traceId])
  if (events.some((event) => event.traceId !== traceId)) throw new ObservabilityError('TRACE_ID_MISMATCH')
  if (events.some((event) => event.packageId !== first.packageId || event.stageInstanceId !== first.stageInstanceId)) {
    throw new ObservabilityError('TRACE_SCOPE_MISMATCH')
  }
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.sequence !== index) throw new ObservabilityError('TRACE_SEQUENCE_INVALID', [`expected:${index}`])
  }
  if (first.eventType !== 'STAGE_ATTEMPT_STARTED' || last.eventType !== 'STAGE_ATTEMPT_COMPLETED'
    || last.outcome === undefined || events.slice(0, -1).some((event) => event.eventType === 'STAGE_ATTEMPT_COMPLETED')) {
    throw new ObservabilityError('TRACE_BOUNDARY_INVALID')
  }

  const providers = new Map<string, MutableProviderCall>()
  const outputs: ReconstructedOutput[] = []
  for (const event of events) {
    if (event.eventType === 'PROVIDER_REQUESTED') {
      const spanId = requireField(event.spanId, event, 'spanId')
      if (providers.has(spanId)) throw new ObservabilityError('PROVIDER_LIFECYCLE_INCOMPLETE', [`duplicate:${spanId}`])
      providers.set(spanId, {
        reservationId: requireField(event.reservationId, event, 'reservationId'),
        requestR2Key: requireField(event.requestR2Key, event, 'requestR2Key'),
      })
    }
    if (event.eventType === 'PROVIDER_RESPONDED') {
      const spanId = requireField(event.spanId, event, 'spanId')
      const call = providers.get(spanId)
      if (call === undefined || call.responseR2Key !== undefined) {
        throw new ObservabilityError('PROVIDER_LIFECYCLE_INCOMPLETE', [`response:${spanId}`])
      }
      call.responseR2Key = requireField(event.responseR2Key, event, 'responseR2Key')
      call.latencyMs = requireField(event.latencyMs, event, 'latencyMs')
      call.errorClass = event.errorClass ?? null
    }
    if (event.eventType === 'COST_SETTLED') {
      const spanId = requireField(event.spanId, event, 'spanId')
      const call = providers.get(spanId)
      if (call === undefined || call.responseR2Key === undefined || call.costUsd !== undefined
        || call.reservationId !== requireField(event.reservationId, event, 'reservationId')) {
        throw new ObservabilityError('PROVIDER_LIFECYCLE_INCOMPLETE', [`cost:${spanId}`])
      }
      call.costUsd = requireField(event.costUsd, event, 'costUsd')
    }
    if (event.eventType === 'OUTPUT_SEALED') {
      outputs.push({
        outputId: requireField(event.outputId, event, 'outputId'),
        outputR2Key: requireField(event.outputR2Key, event, 'outputR2Key'),
        outputSha256: requireField(event.outputSha256, event, 'outputSha256'),
      })
    }
    if (event.eventType === 'GATE_EVALUATED') {
      requireField(event.gateCode, event, 'gateCode')
      requireField(event.gateState, event, 'gateState')
    }
  }
  const providerCalls = [...providers.entries()].map(([spanId, call]): ReconstructedProviderCall => {
    if (call.responseR2Key === undefined || call.latencyMs === undefined || call.errorClass === undefined || call.costUsd === undefined) {
      throw new ObservabilityError('PROVIDER_LIFECYCLE_INCOMPLETE', [spanId])
    }
    return { spanId, ...call, responseR2Key: call.responseR2Key, latencyMs: call.latencyMs, errorClass: call.errorClass, costUsd: call.costUsd }
  })
  if (last.outcome === 'SUCCEEDED' && outputs.length === 0) throw new ObservabilityError('OUTPUT_LIFECYCLE_INVALID')
  const totalCostUsd = providerCalls.reduce((total, call) => total + call.costUsd, 0)
  return {
    traceId, packageId: first.packageId, stageInstanceId: first.stageInstanceId,
    outcome: last.outcome, events, providerCalls, outputs, totalCostUsd,
    canonicalHash: canonicalHash({ trace_id: traceId, events }),
  }
}

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

function sumBy<T>(rows: readonly T[], key: (row: T) => string, value: (row: T) => number): Readonly<Record<string, number>> {
  const sums: Record<string, number> = {}
  for (const row of rows) sums[key(row)] = (sums[key(row)] ?? 0) + value(row)
  return sums
}

function percentile(values: readonly number[]): Percentiles {
  const sorted = [...values].sort((left, right) => left - right)
  const at = (quantile: number): number => sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) }
}

function groupedPercentiles<T>(rows: readonly T[], key: (row: T) => string, value: (row: T) => number): Readonly<Record<string, Percentiles>> {
  const groups = new Map<string, number[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), value(row)])
  return Object.fromEntries([...groups].map(([name, values]) => [name, percentile(values)]))
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

export function computeMinimumMetrics(input: MetricInput): MinimumMetrics {
  const stageAttempts = new Map<string, { total: number; firstPass: number }>()
  for (const stage of input.stages) {
    const current = stageAttempts.get(stage.stageCode) ?? { total: 0, firstPass: 0 }
    current.total += 1
    if (stage.firstPass) current.firstPass += 1
    stageAttempts.set(stage.stageCode, current)
  }
  const defectCounts = countBy(input.escapedDefects.map((defect) => defect.defectClass))
  return {
    latency: {
      byCapability: groupedPercentiles(input.providerCalls, (call) => call.capabilityId, (call) => call.latencyMs),
      byStage: groupedPercentiles(input.providerCalls, (call) => call.stageCode, (call) => call.latencyMs),
    },
    errors: {
      byClass: countBy(input.providerCalls.flatMap((call) => call.errorClass === null ? [] : [call.errorClass])),
      byProvider: countBy(input.providerCalls.flatMap((call) => call.errorClass === null ? [] : [call.provider])),
    },
    cost: {
      totalUsd: input.providerCalls.reduce((total, call) => total + call.costUsd, 0),
      byStageUsd: sumBy(input.providerCalls, (call) => call.stageCode, (call) => call.costUsd),
      byPackageUsd: sumBy(input.providerCalls, (call) => call.packageId, (call) => call.costUsd),
      byChannelUsd: sumBy(input.providerCalls, (call) => call.channelId, (call) => call.costUsd),
      costPerSealedArtifactUsd: rate(input.providerCalls.reduce((total, call) => total + call.costUsd, 0), input.sealedArtifactCount),
    },
    quality: {
      firstPassYieldByStage: Object.fromEntries([...stageAttempts].map(([stage, value]) => [stage, value.firstPass / value.total])),
      p0EscapeCount: input.p0EscapeCount,
      criticVarianceMax: input.criticVariances.length === 0 ? null : Math.max(...input.criticVariances),
    },
    capability: {
      qualified: input.capabilityBindings.filter((binding) => binding.state === 'QUALIFIED').length,
      total: input.capabilityBindings.length,
      blockedDispatchesByReason: countBy(input.blockedDispatches.map((dispatch) => dispatch.reason)),
    },
    operations: {
      orphanReservationRate: rate(input.reservations.filter((reservation) => reservation.state === 'ORPHANED').length, input.reservations.length),
      leaseExpiryRate: rate(input.leases.filter((lease) => lease.expired).length, input.leases.length),
      queueDepth: input.queueDepth,
    },
    attention: {
      weeklyMinutes: input.attentionMinutesThisWeek,
      oldestHumanQueueAgeHours: input.humanQueueAgesHours.length === 0 ? null : Math.max(...input.humanQueueAgesHours),
    },
    evolution: {
      proposalsByStatus: countBy(input.proposals.map((proposal) => proposal.status)),
      escapedFailureDensityByDefectClass: Object.fromEntries(Object.entries(defectCounts).map(([name, count]) => [name, rate(count, input.producedArtifactCount)])),
    },
  }
}

const DAY_MS = 24 * 60 * 60 * 1_000

export function evaluateMandatoryAlerts(input: {
  readonly now: string
  readonly spendUsedUsd: number
  readonly spendCeilingUsd: number
  readonly providerRequestCount: number
  readonly schemaViolationCount: number
  readonly schemaViolationRateMax: number
  readonly criticVariances: readonly number[]
  readonly revokedCapabilityIds: readonly string[]
  readonly orphanReservations: readonly { readonly id: string; readonly orphanedAt: string }[]
  readonly humanQueue: readonly { readonly id: string; readonly enqueuedAt: string }[]
}): readonly MandatoryAlert[] {
  const now = Date.parse(isoTimestamp.parse(input.now))
  const alerts: MandatoryAlert[] = []
  const spendRatio = rate(input.spendUsedUsd, input.spendCeilingUsd)
  if (spendRatio !== null && spendRatio >= thresholds.OPS.SPEND_ALERT_PCT) alerts.push({
    code: 'SPEND_CEILING_80_PERCENT', severity: 'WARNING', subjects: [], observed: spendRatio,
    threshold: thresholds.OPS.SPEND_ALERT_PCT, thresholdSource: 'OPS.SPEND_ALERT_PCT',
  })
  const schemaRate = rate(input.schemaViolationCount, input.providerRequestCount)
  if (schemaRate !== null && schemaRate > input.schemaViolationRateMax) alerts.push({
    code: 'SCHEMA_VIOLATION_RATE_EXCEEDED', severity: 'CRITICAL', subjects: [], observed: schemaRate,
    threshold: input.schemaViolationRateMax, thresholdSource: 'active-standard.schemaViolationRateMax',
  })
  const maxVariance = input.criticVariances.length === 0 ? null : Math.max(...input.criticVariances)
  if (maxVariance !== null && maxVariance > thresholds.ASSURANCE.MAX_VARIANCE) alerts.push({
    code: 'CRITIC_VARIANCE_EXCEEDED', severity: 'CRITICAL', subjects: [], observed: maxVariance,
    threshold: thresholds.ASSURANCE.MAX_VARIANCE, thresholdSource: 'ASSURANCE.MAX_VARIANCE',
  })
  if (input.revokedCapabilityIds.length > 0) alerts.push({
    code: 'CAPABILITY_REVOKED', severity: 'CRITICAL', subjects: [...input.revokedCapabilityIds].sort(),
    observed: input.revokedCapabilityIds.length, threshold: 0, thresholdSource: 'capability_binding.state',
  })
  const oldOrphans = input.orphanReservations.filter((reservation) => now - Date.parse(isoTimestamp.parse(reservation.orphanedAt)) > DAY_MS)
  if (oldOrphans.length > 0) alerts.push({
    code: 'ORPHAN_RESERVATION_OVER_24H', severity: 'CRITICAL', subjects: oldOrphans.map((row) => row.id).sort(),
    observed: Math.max(...oldOrphans.map((row) => (now - Date.parse(row.orphanedAt)) / 3_600_000)),
    threshold: 24, thresholdSource: 'OPS-01 mandatory alert',
  })
  const oldQueue = input.humanQueue.filter((item) => now - Date.parse(isoTimestamp.parse(item.enqueuedAt)) >= thresholds.ATTENTION.QUEUE_AGE_ALERT_HOURS * 3_600_000)
  if (oldQueue.length > 0) alerts.push({
    code: 'HUMAN_QUEUE_OVER_48H', severity: 'WARNING', subjects: oldQueue.map((row) => row.id).sort(),
    observed: Math.max(...oldQueue.map((row) => (now - Date.parse(row.enqueuedAt)) / 3_600_000)),
    threshold: thresholds.ATTENTION.QUEUE_AGE_ALERT_HOURS, thresholdSource: 'ATTENTION.QUEUE_AGE_ALERT_HOURS',
  })
  return alerts
}

export const FIXTURE_BANNER = 'QUALIFICATION FIXTURE — NOT A RELEASE CANDIDATE' as const

export const RejectionLabelSchema = z.object({
  defectClass: z.enum(['P0', 'P1', 'P2', 'EDITORIAL', 'RIGHTS', 'POLICY', 'TECHNICAL']),
  stageCode: nonEmpty,
  rationale: z.string().min(thresholds.ATTENTION.RATIONALE_MIN_CHARS),
  evidenceR2Key: nonEmpty,
}).strict()

export function validateRejectionLabel(value: unknown): ReturnType<typeof RejectionLabelSchema.safeParse> {
  return RejectionLabelSchema.safeParse(value)
}

const decisionTypes = ['D1', 'D2', 'D3', 'D4', 'D5'] as const
const gateStates = ['PASS', 'FAIL', 'NOT_EVALUATED', 'WAIVED'] as const

export function buildOperatorWorkspace(input: OperatorWorkspaceInput) {
  if (input.nextValidActions.length !== 1 || input.nextValidActions[0] === undefined) {
    throw new ObservabilityError('NEXT_VALID_ACTION_AMBIGUOUS')
  }
  const gateGroups = Object.fromEntries(gateStates.map((state) => {
    const items = input.gates.filter((gate) => gate.state === state)
    const colorToken = state === 'NOT_EVALUATED' ? 'gate-unknown' : state === 'FAIL' ? 'gate-danger' : `gate-${state.toLowerCase()}`
    return [state, { state, count: items.length, colorToken, items }]
  })) as unknown as Record<(typeof gateStates)[number], { readonly state: (typeof gateStates)[number]; readonly count: number; readonly colorToken: string; readonly items: typeof input.gates }>
  const sortedDecisions = [...input.decisions].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
  const diffDecision = sortedDecisions[0] ?? null
  const remainingMinutes = input.attention.ceilingMinutes - input.attention.usedMinutes
  const hardAlerts = input.incident !== null && ['I2', 'I3'].includes(input.incident.level) && !input.incident.channelFrozen
    ? ['I2_INCIDENT_REQUIRES_CHANNEL_FREEZE'] : []
  return {
    effectiveState: input.effectiveState,
    nextValidAction: input.nextValidActions[0],
    gateGroups,
    candidate: input.candidateKind === 'QUALIFICATION_FIXTURE'
      ? { kind: input.candidateKind, releaseCandidate: false as const, banner: FIXTURE_BANNER }
      : { kind: input.candidateKind, releaseCandidate: true as const, banner: null },
    standardVersion: input.standardVersion,
    cost: { spentUsd: input.spentUsd, ceilingUsd: input.ceilingUsd, remainingUsd: input.ceilingUsd - input.spentUsd },
    priorWork: { displayMode: 'ON_DEMAND' as const, items: input.priorWork },
    humanTouchpointQueue: [...input.humanQueue].sort((left, right) => left.enqueuedAt.localeCompare(right.enqueuedAt) || left.id.localeCompare(right.id)),
    decisionDesk: {
      layout: 'SIDE_BY_SIDE' as const,
      columns: decisionTypes.map((decisionType) => ({ decisionType, decision: sortedDecisions.find((decision) => decision.decisionType === decisionType) ?? null })),
      diffBox: { mode: 'D1_D5_DIFF' as const, r2Key: diffDecision?.diffR2Key ?? null },
    },
    rejectionLabelForm: { schemaVersion: 1, requiredFields: ['defectClass', 'stageCode', 'rationale', 'evidenceR2Key'] as const },
    generateEvidenceReportButton: { action: 'GENERATE_EVIDENCE_REPORT' as const, enabled: true },
    attentionBudgetClock: {
      usedMinutes: input.attention.usedMinutes, ceilingMinutes: input.attention.ceilingMinutes,
      remainingMinutes, exceeded: remainingMinutes < 0,
    },
    ownerConsole: {
      isolated: true as const,
      identityBoundActions: ['AUTHORIZE_RELEASE', 'AUTHORIZE_PUBLISH', 'PROMOTE_LEARNING'] as const,
    },
    hardAlerts,
  }
}
