import { z } from 'zod'

import type {
  GateState,
  Hex64,
  Namespace,
  ProposalKind,
  ProposalStatus,
  StrictnessDirection,
} from '@youtube-ai-factory/contracts'
import type { StandardRule } from '@youtube-ai-factory/core-policy'

export type ProposalSource =
  | 'LRN04'
  | 'LEARNING'
  | 'PROVIDER_WATCH'
  | 'POLICY_WATCH'
  | 'HUMAN'
  | 'INCIDENT'

export interface RuleDiff {
  readonly before: StandardRule
  readonly after: StandardRule
}

export interface EvolutionProposal {
  readonly id: string
  readonly kind: ProposalKind
  readonly source: ProposalSource
  readonly targetRef: string
  readonly diffR2Key: string
  readonly declaredDirection: StrictnessDirection
  readonly computedDirection: StrictnessDirection
  readonly diff: RuleDiff
  readonly status: ProposalStatus
  readonly createdAt: string
  readonly shadowRunId: string | null
  readonly evidenceR2Key: string | null
  readonly evidenceHash: Hex64 | null
  readonly rollbackRef: string | null
}

export interface CreateProposalInput {
  readonly id: string
  readonly kind: ProposalKind
  readonly source: ProposalSource
  readonly targetRef: string
  readonly diffR2Key: string
  readonly declaredDirection: StrictnessDirection
  readonly diff: RuleDiff
  readonly createdAt: string
}

export interface ThresholdArtifactReplay {
  readonly artifactId: string
  readonly sourceNamespace: Namespace
  readonly productionCreatedAt: string
  readonly beforeVerdict: GateState
  readonly afterVerdict: GateState
  readonly evidenceR2Key: string
}

export interface ThresholdShadowInput {
  readonly id: string
  readonly proposalId: string
  readonly executionNamespace: Namespace
  readonly artifacts: readonly ThresholdArtifactReplay[]
  readonly actualCostUsd: number
  readonly projectedOperatingCostDeltaUsd: number
}

export interface VerdictChange {
  readonly artifactId: string
  readonly before: GateState
  readonly after: GateState
}

export interface ThresholdShadowResult {
  readonly kind: 'THRESHOLD_OR_GATE'
  readonly id: string
  readonly proposalId: string
  readonly namespace: 'qualification'
  readonly status: 'PASS'
  readonly artifactCount: number
  readonly verdictChanges: readonly VerdictChange[]
  readonly actualCostUsd: number
  readonly projectedOperatingCostDeltaUsd: number
  readonly canonicalHash: Hex64
}

export interface DefectClassMetrics {
  readonly defectClass: string
  readonly sampleCount: number
  readonly recall: number
  readonly precision: number
  readonly variance: number
}

export interface CapabilityShadowInput {
  readonly id: string
  readonly proposalId: string
  readonly executionNamespace: Namespace
  readonly fullGoldSampleCount: number
  readonly baseline: readonly DefectClassMetrics[]
  readonly candidate: readonly DefectClassMetrics[]
  readonly actualCostUsd: number
  readonly projectedOperatingCostDeltaUsd: number
}

export interface CapabilityShadowResult {
  readonly kind: 'CAPABILITY'
  readonly id: string
  readonly proposalId: string
  readonly namespace: 'qualification'
  readonly status: 'PASS'
  readonly goldSampleCount: number
  readonly baseline: readonly DefectClassMetrics[]
  readonly candidate: readonly DefectClassMetrics[]
  readonly actualCostUsd: number
  readonly projectedOperatingCostDeltaUsd: number
  readonly canonicalHash: Hex64
}

export type ShadowResult = ThresholdShadowResult | CapabilityShadowResult

export interface EvidenceBundle {
  readonly proposalId: string
  readonly targetRef: string
  readonly exactDiff: RuleDiff
  readonly shadowResult: ShadowResult
  readonly cost: {
    readonly actualShadowCostUsd: number
    readonly projectedOperatingCostDeltaUsd: number
  }
  readonly strictness: {
    readonly direction: StrictnessDirection
    readonly relaxRiskAnalysis: string | null
  }
  readonly recommendation: string
  readonly rollback: {
    readonly ref: string
    readonly instruction: string
  }
  readonly evidenceR2Key: string
  readonly canonicalHash: Hex64
}

export interface EvidenceReadyProposal extends EvolutionProposal {
  readonly status: 'EVIDENCE_READY'
  readonly shadowRunId: string
  readonly evidenceR2Key: string
  readonly evidenceHash: Hex64
  readonly rollbackRef: string
}

export const PromoteEvolutionCommandEvidenceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('PROMOTE_EVOLUTION'),
  proposalId: z.string().min(1),
  ownerIdentity: z.string().min(1),
  ownerActive: z.literal(true),
  signature: z.string().min(1),
  evidenceHash: z.string().regex(/^[0-9a-f]{64}$/u),
  executed: z.literal(true),
}).strict()

export type PromoteEvolutionCommandEvidence = z.infer<typeof PromoteEvolutionCommandEvidenceSchema>

export type EvolutionRegistry = Readonly<Record<string, StandardRule>>

export interface PromotedEvolution {
  readonly proposalId: string
  readonly commandId: string
  readonly ownerIdentity: string
  readonly targetRef: string
  readonly before: StandardRule
  readonly after: StandardRule
  readonly rollbackRef: string
  readonly evidenceHash: Hex64
  readonly registry: EvolutionRegistry
  readonly changedKeys: readonly [string]
  readonly status: 'PROMOTED'
}

export interface RolledBackEvolution {
  readonly proposalId: string
  readonly registry: EvolutionRegistry
  readonly changedKeys: readonly [string]
  readonly status: 'ROLLED_BACK'
}
