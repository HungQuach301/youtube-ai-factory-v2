import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import type {
  EscapedDefectInput,
  EvolutionProposalInsert,
  FailureDensityReport,
  FailureMiningResult,
  FailureMiningWrite,
  QuarantinedItem,
  RejectionMiningInput,
  RepeatedGateFailure,
} from './types.js'

export * from './types.js'

export type FailureMiningErrorCode =
  | 'REJECTION_EVIDENCE_INVALID'
  | 'REJECTION_SLA_EXCEEDED'
  | 'ESCAPED_DEFECT_EVIDENCE_INVALID'
  | 'ESCAPED_P0_SLA_EXCEEDED'
  | 'FAILURE_EVIDENCE_INVALID'

export class FailureMiningError extends Error {
  override readonly name = 'FailureMiningError'

  constructor(readonly code: FailureMiningErrorCode, readonly failures: readonly string[] = []) {
    super(`${code}${failures.length === 0 ? '' : `: ${failures.join('; ')}`}`)
  }
}

export const FAILURE_MINING_ALLOWED_TABLES = ['gold_sample', 'evolution_proposal'] as const
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

function validText(value: string): boolean {
  return value.trim().length > 0
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function validWindow(start: string, end: string, maximumMs: number): boolean {
  if (!validDate(start) || !validDate(end)) return false
  const duration = Date.parse(end) - Date.parse(start)
  return duration >= 0 && duration <= maximumMs
}

function validDefect(defect: { readonly defectClass: string, readonly stageCode: string, readonly tStart: number, readonly tEnd: number }): boolean {
  return validText(defect.defectClass) && validText(defect.stageCode)
    && Number.isFinite(defect.tStart) && defect.tStart >= 0
    && Number.isFinite(defect.tEnd) && defect.tEnd > defect.tStart
}

function result(writes: readonly FailureMiningWrite[]): FailureMiningResult {
  return { allowedTables: FAILURE_MINING_ALLOWED_TABLES, writes, providerCostUsd: 0 }
}

function stableId(prefix: string, payload: unknown): string {
  return `${prefix}-${canonicalHash(payload).slice(0, 24)}`
}

function proposal(input: {
  readonly sourceKind: EvolutionProposalInsert['metadata']['sourceKind']
  readonly defectClass: string
  readonly kind: EvolutionProposalInsert['kind']
  readonly targetRef: string
  readonly proposedControl: EvolutionProposalInsert['metadata']['proposedControl']
  readonly requalifyCapabilityIds?: readonly string[]
  readonly evidenceR2Keys: readonly string[]
  readonly requiresSyntheticSample?: boolean
  readonly createdAt: string
}): EvolutionProposalInsert {
  const identity = {
    source_kind: input.sourceKind,
    defect_class: input.defectClass,
    target_ref: input.targetRef,
    evidence_r2_keys: [...input.evidenceR2Keys].sort(),
  }
  const id = stableId('lrn04', identity)
  return {
    id,
    kind: input.kind,
    source: 'LRN04',
    targetRef: input.targetRef,
    diffR2Key: `learning/lrn04/${id}/proposed-diff.json`,
    strictnessDirection: 'TIGHTEN',
    status: 'PROPOSED',
    createdAt: input.createdAt,
    metadata: {
      defectClass: input.defectClass,
      sourceKind: input.sourceKind,
      proposedControl: input.proposedControl,
      requalifyCapabilityIds: [...new Set(input.requalifyCapabilityIds ?? [])].sort(),
      sourceEvidenceR2Keys: [...new Set(input.evidenceR2Keys)].sort(),
      requiresSyntheticSample: input.requiresSyntheticSample ?? false,
    },
  }
}

export function mineRejection(input: RejectionMiningInput): FailureMiningResult {
  const judgmentValid = input.judgment.touchpoint === 'HP-04'
    && input.judgment.verdict === 'REJECTED'
    && validText(input.masterId)
    && validText(input.judgment.actorIdentity)
    && input.judgment.rationale.trim().length >= 20
    && validText(input.judgment.evidenceR2Key)
    && input.defects.length > 0
    && input.defects.every(validDefect)
  if (!judgmentValid) throw new FailureMiningError('REJECTION_EVIDENCE_INVALID')
  if (!validWindow(input.rejectedAt, input.minedAt, thresholds.EVOLUTION.REJECTED_MASTER_TO_GOLD_SLA_DAYS * DAY_MS)) {
    throw new FailureMiningError('REJECTION_SLA_EXCEEDED')
  }
  const known = new Set(input.existingGoldDefectClasses)
  const proposedDefectClasses = new Set<string>()
  const writes: FailureMiningWrite[] = []
  for (const defect of input.defects) {
    const identity = { master_id: input.masterId, defect, judgment_evidence: input.judgment.evidenceR2Key }
    const id = stableId('gold-rejection', identity)
    writes.push({
      table: 'gold_sample',
      row: {
        id,
        defectClass: defect.defectClass,
        severity: defect.severity,
        source: 'rejected_master',
        r2Key: `gold/rejected-master/${input.masterId}/${id}.mp4`,
        groundTruth: {
          masterId: input.masterId,
          stageCode: defect.stageCode,
          tStart: defect.tStart,
          tEnd: defect.tEnd,
          evidenceR2Keys: [input.judgment.evidenceR2Key],
          labelSource: 'HP-04_REJECTION',
          rationale: input.judgment.rationale,
          detectionSource: null,
        },
        createdAt: input.minedAt,
      },
    })
    if (!known.has(defect.defectClass) && !proposedDefectClasses.has(defect.defectClass)) {
      proposedDefectClasses.add(defect.defectClass)
      writes.push({
        table: 'evolution_proposal',
        row: proposal({
          sourceKind: 'REJECTED_MASTER', defectClass: defect.defectClass, kind: 'CAPABILITY',
          targetRef: `critic-rubric:${defect.defectClass}`, proposedControl: 'CRITIC_RUBRIC',
          evidenceR2Keys: [input.judgment.evidenceR2Key], requiresSyntheticSample: true,
          createdAt: input.minedAt,
        }),
      })
    }
  }
  return result(writes)
}

export function detectEscapes(since: Date, defects: readonly EscapedDefectInput[]): readonly EscapedDefectInput[] {
  if (!Number.isFinite(since.getTime())) throw new FailureMiningError('ESCAPED_DEFECT_EVIDENCE_INVALID')
  return defects.filter((defect) => Date.parse(defect.detected.detectedAt) >= since.getTime())
}

export function mineEscapedDefects(input: { readonly minedAt: string, readonly defects: readonly EscapedDefectInput[] }): FailureMiningResult {
  if (!validDate(input.minedAt)) throw new FailureMiningError('ESCAPED_DEFECT_EVIDENCE_INVALID')
  const writes: FailureMiningWrite[] = []
  for (const defect of input.defects) {
    const valid = validText(defect.id) && validText(defect.masterId) && validDefect(defect)
      && validText(defect.criticCapabilityId) && defect.assurance.verdict === 'PASS'
      && validText(defect.assurance.evidenceR2Key) && validText(defect.detected.evidenceR2Key)
      && validDate(defect.assurance.decidedAt) && validDate(defect.detected.detectedAt)
      && Date.parse(defect.detected.detectedAt) >= Date.parse(defect.assurance.decidedAt)
      && Date.parse(input.minedAt) >= Date.parse(defect.detected.detectedAt)
    if (!valid) throw new FailureMiningError('ESCAPED_DEFECT_EVIDENCE_INVALID', [defect.id])
    if (defect.severity === 'P0' && !validWindow(defect.detected.detectedAt, input.minedAt, thresholds.EVOLUTION.ESCAPED_P0_PROPOSAL_SLA_HOURS * HOUR_MS)) {
      throw new FailureMiningError('ESCAPED_P0_SLA_EXCEEDED', [defect.id])
    }
    const evidence = [defect.assurance.evidenceR2Key, defect.detected.evidenceR2Key]
    const goldId = stableId('gold-escape', { defect_id: defect.id, evidence })
    writes.push({ table: 'gold_sample', row: {
      id: goldId, defectClass: defect.defectClass, severity: defect.severity, source: 'escaped_defect',
      r2Key: `gold/escaped-defect/${defect.masterId}/${goldId}.mp4`,
      groundTruth: {
        masterId: defect.masterId, stageCode: defect.stageCode, tStart: defect.tStart, tEnd: defect.tEnd,
        evidenceR2Keys: evidence, labelSource: 'ESCAPED_DEFECT', rationale: null,
        detectionSource: defect.detected.source,
      },
      createdAt: input.minedAt,
    } })
    writes.push({ table: 'evolution_proposal', row: proposal({
      sourceKind: 'ESCAPED_DEFECT', defectClass: defect.defectClass,
      kind: defect.machineMeasurable ? 'GATE' : 'CAPABILITY',
      targetRef: defect.severity === 'P0'
        ? `capability:${defect.criticCapabilityId}:requalify`
        : `critic-rubric:${defect.criticCapabilityId}`,
      proposedControl: defect.machineMeasurable ? 'DETERMINISTIC_LINT' : 'CRITIC_RUBRIC',
      requalifyCapabilityIds: defect.severity === 'P0' ? [defect.criticCapabilityId] : [],
      evidenceR2Keys: evidence, createdAt: input.minedAt,
    }) })
  }
  return result(writes)
}

export function mineRepeatedFailures(input: { readonly minedAt: string, readonly failures: readonly RepeatedGateFailure[] }): FailureMiningResult {
  if (!validDate(input.minedAt) || input.failures.some((failure) => !validText(failure.id)
    || !validText(failure.reason) || !validText(failure.defectClass) || !validText(failure.stageCode)
    || !validText(failure.evidenceR2Key))
    || new Set(input.failures.map((failure) => failure.id)).size !== input.failures.length) {
    throw new FailureMiningError('FAILURE_EVIDENCE_INVALID')
  }
  const groups = new Map<string, RepeatedGateFailure[]>()
  for (const failure of input.failures) {
    const key = `${failure.reason}\u0000${failure.defectClass}\u0000${failure.stageCode}`
    groups.set(key, [...(groups.get(key) ?? []), failure])
  }
  const writes: FailureMiningWrite[] = []
  for (const failures of groups.values()) {
    const first = failures[0]
    if (first === undefined || failures.length < thresholds.OPS.GATE_FAIL_REPEAT_TO_LRN04
      || !first.machineMeasurable || first.earlierStageCode === null || !validText(first.earlierStageCode)) continue
    writes.push({ table: 'evolution_proposal', row: proposal({
      sourceKind: 'REPEATED_GATE_FAIL', defectClass: first.defectClass, kind: 'GATE',
      targetRef: `gate:${first.earlierStageCode}:${first.reason}`, proposedControl: 'DETERMINISTIC_LINT',
      evidenceR2Keys: failures.map((failure) => failure.evidenceR2Key), createdAt: input.minedAt,
    }) })
  }
  return result(writes)
}

export function mineQuarantine(input: { readonly minedAt: string, readonly items: readonly QuarantinedItem[] }): FailureMiningResult {
  if (!validDate(input.minedAt) || input.items.some((item) => !validText(item.id)
    || !validText(item.defectClass) || !validText(item.stageCode) || !validText(item.evidenceR2Key))
    || new Set(input.items.map((item) => item.id)).size !== input.items.length) {
    throw new FailureMiningError('FAILURE_EVIDENCE_INVALID')
  }
  if (input.items.length === 0) return result([])
  const groups = new Map<string, QuarantinedItem[]>()
  for (const item of input.items) groups.set(item.defectClass, [...(groups.get(item.defectClass) ?? []), item])
  const writes: FailureMiningWrite[] = []
  for (const [defectClass, items] of groups) {
    const density = items.length / input.items.length
    if (density <= thresholds.EVOLUTION.QUARANTINE_CLUSTER_PROPOSAL_PCT
      || items.some((item) => item.deterministicLintExists)) continue
    const stages = [...new Set(items.map((item) => item.stageCode))].sort()
    writes.push({ table: 'evolution_proposal', row: proposal({
      sourceKind: 'QUARANTINE_CLUSTER', defectClass, kind: 'GATE',
      targetRef: `gate:${stages.join('+')}:${defectClass}`, proposedControl: 'DETERMINISTIC_LINT',
      evidenceR2Keys: items.map((item) => item.evidenceR2Key), createdAt: input.minedAt,
    }) })
  }
  return result(writes)
}

export function failureDensityReport(failures: readonly { readonly defectClass: string, readonly stageCode: string }[]): FailureDensityReport {
  const total = failures.length
  const defectCounts: Record<string, number> = {}
  const stageCounts: Record<string, number> = {}
  for (const failure of failures) {
    defectCounts[failure.defectClass] = (defectCounts[failure.defectClass] ?? 0) + 1
    stageCounts[failure.stageCode] = (stageCounts[failure.stageCode] ?? 0) + 1
  }
  const ratios = (counts: Readonly<Record<string, number>>): Record<string, number> => Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => [key, total === 0 ? 0 : count / total]),
  )
  return { total, byDefectClass: ratios(defectCounts), byStage: ratios(stageCounts) }
}
