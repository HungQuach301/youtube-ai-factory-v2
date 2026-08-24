import { thresholds } from '@youtube-ai-factory/contracts'
import type { Hex64 } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { classifyRuleChange } from '@youtube-ai-factory/core-policy'
import type { StandardRule } from '@youtube-ai-factory/core-policy'

import {
  PromoteEvolutionCommandEvidenceSchema,
  type CapabilityShadowInput,
  type CapabilityShadowResult,
  type CreateProposalInput,
  type DefectClassMetrics,
  type EvidenceBundle,
  type EvidenceReadyProposal,
  type EvolutionProposal,
  type EvolutionRegistry,
  type PromotedEvolution,
  type RolledBackEvolution,
  type RuleDiff,
  type ShadowResult,
  type ThresholdShadowInput,
  type ThresholdShadowResult,
} from './types.js'

export * from './types.js'

export type EvolutionErrorCode =
  | 'PROPOSAL_INPUT_INVALID'
  | 'STRICTNESS_DIRECTION_MISMATCH'
  | 'SHADOW_NAMESPACE_INVALID'
  | 'SHADOW_SAMPLE_INSUFFICIENT'
  | 'SHADOW_ARTIFACT_ORDER_INVALID'
  | 'SHADOW_EVIDENCE_MISSING'
  | 'SHADOW_COST_INVALID'
  | 'GOLD_SET_INCOMPLETE'
  | 'DEFECT_CLASS_REGRESSION'
  | 'EXACT_DIFF_MISMATCH'
  | 'RELAX_RISK_ANALYSIS_MISSING'
  | 'EVIDENCE_BUNDLE_INVALID'
  | 'OWNER_COMMAND_INVALID'
  | 'REGISTRY_TARGET_MISMATCH'
  | 'ROLLBACK_REF_MISMATCH'

export class EvolutionError extends Error {
  override readonly name = 'EvolutionError'

  constructor(readonly code: EvolutionErrorCode, readonly failures: readonly string[] = []) {
    super(`${code}${failures.length === 0 ? '' : `: ${failures.join('; ')}`}`)
  }
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function cloneRule(rule: StandardRule): StandardRule {
  return rule.kind === 'ALLOWLIST' ? { ...rule, values: [...rule.values] } : { ...rule }
}

function sameRule(left: StandardRule, right: StandardRule): boolean {
  return canonicalHash(left) === canonicalHash(right)
}

function assertCosts(actualCostUsd: number, projectedOperatingCostDeltaUsd: number): void {
  if (!Number.isFinite(actualCostUsd) || actualCostUsd < 0
    || !Number.isFinite(projectedOperatingCostDeltaUsd)) {
    throw new EvolutionError('SHADOW_COST_INVALID')
  }
}

export function createProposal(input: CreateProposalInput): EvolutionProposal {
  if (!nonEmpty(input.id) || !nonEmpty(input.targetRef) || !nonEmpty(input.diffR2Key)
    || !validDate(input.createdAt)) {
    throw new EvolutionError('PROPOSAL_INPUT_INVALID')
  }
  const computedDirection = classifyRuleChange(input.diff.before, input.diff.after)
  if (computedDirection !== input.declaredDirection) {
    throw new EvolutionError('STRICTNESS_DIRECTION_MISMATCH', [
      `declared=${input.declaredDirection}`,
      `computed=${computedDirection}`,
    ])
  }
  return {
    id: input.id,
    kind: input.kind,
    source: input.source,
    targetRef: input.targetRef,
    diffR2Key: input.diffR2Key,
    declaredDirection: input.declaredDirection,
    computedDirection,
    diff: { before: cloneRule(input.diff.before), after: cloneRule(input.diff.after) },
    status: 'PROPOSED',
    createdAt: input.createdAt,
    shadowRunId: null,
    evidenceR2Key: null,
    evidenceHash: null,
    rollbackRef: null,
  }
}

export function runThresholdShadow(input: ThresholdShadowInput): ThresholdShadowResult {
  if (input.executionNamespace !== 'qualification'
    || input.artifacts.some((artifact) => artifact.sourceNamespace !== 'production')) {
    throw new EvolutionError('SHADOW_NAMESPACE_INVALID')
  }
  if (input.artifacts.length < thresholds.EVOLUTION.SHADOW_MIN_ARTIFACTS
    || new Set(input.artifacts.map((artifact) => artifact.artifactId)).size !== input.artifacts.length) {
    throw new EvolutionError('SHADOW_SAMPLE_INSUFFICIENT')
  }
  if (input.artifacts.some((artifact) => !validDate(artifact.productionCreatedAt))
    || input.artifacts.some((artifact, index) => {
      const previous = input.artifacts[index - 1]
      return previous !== undefined
        && Date.parse(artifact.productionCreatedAt) > Date.parse(previous.productionCreatedAt)
    })) {
    throw new EvolutionError('SHADOW_ARTIFACT_ORDER_INVALID')
  }
  if (input.artifacts.some((artifact) => !nonEmpty(artifact.artifactId) || !nonEmpty(artifact.evidenceR2Key))) {
    throw new EvolutionError('SHADOW_EVIDENCE_MISSING')
  }
  assertCosts(input.actualCostUsd, input.projectedOperatingCostDeltaUsd)
  const verdictChanges = input.artifacts.flatMap((artifact) => artifact.beforeVerdict === artifact.afterVerdict
    ? []
    : [{ artifactId: artifact.artifactId, before: artifact.beforeVerdict, after: artifact.afterVerdict }])
  const payload = {
    kind: 'THRESHOLD_OR_GATE' as const,
    id: input.id,
    proposal_id: input.proposalId,
    namespace: input.executionNamespace,
    artifact_count: input.artifacts.length,
    artifact_evidence: input.artifacts,
    verdict_changes: verdictChanges,
    actual_cost_usd: input.actualCostUsd,
    projected_operating_cost_delta_usd: input.projectedOperatingCostDeltaUsd,
  }
  return {
    kind: payload.kind,
    id: payload.id,
    proposalId: payload.proposal_id,
    namespace: payload.namespace,
    status: 'PASS',
    artifactCount: payload.artifact_count,
    verdictChanges: payload.verdict_changes,
    actualCostUsd: payload.actual_cost_usd,
    projectedOperatingCostDeltaUsd: payload.projected_operating_cost_delta_usd,
    canonicalHash: canonicalHash(payload),
  }
}

function validMetric(metric: DefectClassMetrics): boolean {
  return nonEmpty(metric.defectClass)
    && Number.isSafeInteger(metric.sampleCount)
    && metric.sampleCount > 0
    && Number.isFinite(metric.recall)
    && metric.recall >= 0
    && metric.recall <= 1
    && Number.isFinite(metric.precision)
    && metric.precision >= 0
    && metric.precision <= 1
    && Number.isFinite(metric.variance)
    && metric.variance >= 0
}

function metricMap(metrics: readonly DefectClassMetrics[]): ReadonlyMap<string, DefectClassMetrics> {
  return new Map(metrics.map((metric) => [metric.defectClass, metric]))
}

export function runCapabilityShadow(input: CapabilityShadowInput): CapabilityShadowResult {
  if (input.executionNamespace !== 'qualification') throw new EvolutionError('SHADOW_NAMESPACE_INVALID')
  assertCosts(input.actualCostUsd, input.projectedOperatingCostDeltaUsd)
  const baseline = metricMap(input.baseline)
  const candidate = metricMap(input.candidate)
  const baselineCount = input.baseline.reduce((sum, metric) => sum + metric.sampleCount, 0)
  const candidateCount = input.candidate.reduce((sum, metric) => sum + metric.sampleCount, 0)
  if (!Number.isSafeInteger(input.fullGoldSampleCount) || input.fullGoldSampleCount <= 0
    || input.baseline.some((metric) => !validMetric(metric))
    || input.candidate.some((metric) => !validMetric(metric))
    || baseline.size !== input.baseline.length
    || candidate.size !== input.candidate.length
    || baseline.size !== candidate.size
    || baselineCount !== input.fullGoldSampleCount
    || candidateCount !== input.fullGoldSampleCount
    || [...baseline.keys()].some((defectClass) => !candidate.has(defectClass))) {
    throw new EvolutionError('GOLD_SET_INCOMPLETE')
  }
  const regressions = [...baseline.entries()].flatMap(([defectClass, before]) => {
    const after = candidate.get(defectClass)
    return after === undefined
      || after.sampleCount !== before.sampleCount
      || after.recall < before.recall
      || after.precision < before.precision
      || after.variance > before.variance
      ? [defectClass]
      : []
  })
  if (regressions.length > 0) throw new EvolutionError('DEFECT_CLASS_REGRESSION', regressions)
  const payload = {
    kind: 'CAPABILITY' as const,
    id: input.id,
    proposal_id: input.proposalId,
    namespace: input.executionNamespace,
    gold_sample_count: input.fullGoldSampleCount,
    baseline: input.baseline,
    candidate: input.candidate,
    actual_cost_usd: input.actualCostUsd,
    projected_operating_cost_delta_usd: input.projectedOperatingCostDeltaUsd,
  }
  return {
    kind: payload.kind,
    id: payload.id,
    proposalId: payload.proposal_id,
    namespace: payload.namespace,
    status: 'PASS',
    goldSampleCount: payload.gold_sample_count,
    baseline: payload.baseline,
    candidate: payload.candidate,
    actualCostUsd: payload.actual_cost_usd,
    projectedOperatingCostDeltaUsd: payload.projected_operating_cost_delta_usd,
    canonicalHash: canonicalHash(payload),
  }
}

function bundlePayload(bundle: Omit<EvidenceBundle, 'canonicalHash'>): Omit<EvidenceBundle, 'canonicalHash'> {
  return bundle
}

export function buildEvidenceBundle(input: {
  readonly proposal: EvolutionProposal
  readonly shadowResult: ShadowResult | null
  readonly exactDiff: RuleDiff
  readonly recommendation: string
  readonly relaxRiskAnalysis: string
  readonly rollback: { readonly ref: string, readonly instruction: string }
}): { readonly proposal: EvidenceReadyProposal, readonly bundle: EvidenceBundle } {
  if (input.shadowResult === null || input.shadowResult.status !== 'PASS'
    || input.shadowResult.proposalId !== input.proposal.id) {
    throw new EvolutionError('SHADOW_EVIDENCE_MISSING')
  }
  if (!sameRule(input.exactDiff.before, input.proposal.diff.before)
    || !sameRule(input.exactDiff.after, input.proposal.diff.after)) {
    throw new EvolutionError('EXACT_DIFF_MISMATCH')
  }
  if (input.proposal.computedDirection === 'RELAX' && !nonEmpty(input.relaxRiskAnalysis)) {
    throw new EvolutionError('RELAX_RISK_ANALYSIS_MISSING')
  }
  if (!nonEmpty(input.recommendation) || !nonEmpty(input.rollback.ref)
    || !nonEmpty(input.rollback.instruction)) {
    throw new EvolutionError('EVIDENCE_BUNDLE_INVALID')
  }
  const keyPrefix = `qualification/evolution/${input.proposal.id}`
  const withoutHash = bundlePayload({
    proposalId: input.proposal.id,
    targetRef: input.proposal.targetRef,
    exactDiff: {
      before: cloneRule(input.exactDiff.before),
      after: cloneRule(input.exactDiff.after),
    },
    shadowResult: input.shadowResult,
    cost: {
      actualShadowCostUsd: input.shadowResult.actualCostUsd,
      projectedOperatingCostDeltaUsd: input.shadowResult.projectedOperatingCostDeltaUsd,
    },
    strictness: {
      direction: input.proposal.computedDirection,
      relaxRiskAnalysis: input.proposal.computedDirection === 'RELAX' ? input.relaxRiskAnalysis : null,
    },
    recommendation: input.recommendation,
    rollback: input.rollback,
    evidenceR2Key: `${keyPrefix}/evidence.json`,
  })
  const evidenceHash = canonicalHash(withoutHash)
  const bundle: EvidenceBundle = { ...withoutHash, canonicalHash: evidenceHash }
  return {
    proposal: {
      ...input.proposal,
      status: 'EVIDENCE_READY',
      shadowRunId: input.shadowResult.id,
      evidenceR2Key: bundle.evidenceR2Key,
      evidenceHash,
      rollbackRef: input.rollback.ref,
    },
    bundle,
  }
}

function verifyEvidenceBundle(proposal: EvidenceReadyProposal, bundle: EvidenceBundle): void {
  const { canonicalHash: recordedHash, ...payload } = bundle
  const computedHash = canonicalHash(payload)
  if (recordedHash !== computedHash
    || recordedHash !== proposal.evidenceHash
    || bundle.evidenceR2Key !== proposal.evidenceR2Key
    || bundle.proposalId !== proposal.id
    || bundle.targetRef !== proposal.targetRef
    || bundle.rollback.ref !== proposal.rollbackRef
    || bundle.strictness.direction !== proposal.computedDirection
    || !sameRule(bundle.exactDiff.before, proposal.diff.before)
    || !sameRule(bundle.exactDiff.after, proposal.diff.after)) {
    throw new EvolutionError('EVIDENCE_BUNDLE_INVALID')
  }
}

function copyRegistry(registry: EvolutionRegistry): Record<string, StandardRule> {
  return Object.fromEntries(Object.entries(registry).map(([key, rule]) => [key, cloneRule(rule)]))
}

export function applyPromoteEvolutionCommand(
  proposal: EvidenceReadyProposal,
  bundle: EvidenceBundle,
  commandInput: unknown,
  registry: EvolutionRegistry,
): PromotedEvolution {
  verifyEvidenceBundle(proposal, bundle)
  const parsed = PromoteEvolutionCommandEvidenceSchema.safeParse(commandInput)
  if (!parsed.success
    || parsed.data.proposalId !== proposal.id
    || parsed.data.evidenceHash !== bundle.canonicalHash) {
    throw new EvolutionError('OWNER_COMMAND_INVALID')
  }
  const current = registry[proposal.targetRef]
  if (current === undefined || !sameRule(current, proposal.diff.before)) {
    throw new EvolutionError('REGISTRY_TARGET_MISMATCH')
  }
  const next = copyRegistry(registry)
  next[proposal.targetRef] = cloneRule(proposal.diff.after)
  return {
    proposalId: proposal.id,
    commandId: parsed.data.id,
    ownerIdentity: parsed.data.ownerIdentity,
    targetRef: proposal.targetRef,
    before: cloneRule(proposal.diff.before),
    after: cloneRule(proposal.diff.after),
    rollbackRef: proposal.rollbackRef,
    evidenceHash: parsed.data.evidenceHash as Hex64,
    registry: next,
    changedKeys: [proposal.targetRef],
    status: 'PROMOTED',
  }
}

export function rollbackPromotion(
  promotion: PromotedEvolution,
  registry: EvolutionRegistry,
  rollbackRef: string,
): RolledBackEvolution {
  if (rollbackRef !== promotion.rollbackRef) throw new EvolutionError('ROLLBACK_REF_MISMATCH')
  const current = registry[promotion.targetRef]
  if (current === undefined || !sameRule(current, promotion.after)) {
    throw new EvolutionError('REGISTRY_TARGET_MISMATCH')
  }
  const restored = copyRegistry(registry)
  restored[promotion.targetRef] = cloneRule(promotion.before)
  return {
    proposalId: promotion.proposalId,
    registry: restored,
    changedKeys: [promotion.targetRef],
    status: 'ROLLED_BACK',
  }
}
