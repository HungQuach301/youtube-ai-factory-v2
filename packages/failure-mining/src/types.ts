export type FailureSeverity = 'P0' | 'P1' | 'P2'
export type FailureDetectionSource = 'HUMAN' | 'VIEWER' | 'POLICY'

export interface GoldSampleInsert {
  readonly id: string
  readonly defectClass: string
  readonly severity: FailureSeverity
  readonly source: 'rejected_master' | 'escaped_defect'
  readonly r2Key: string
  readonly groundTruth: {
    readonly masterId: string
    readonly stageCode: string
    readonly tStart: number
    readonly tEnd: number
    readonly evidenceR2Keys: readonly string[]
    readonly labelSource: 'HP-04_REJECTION' | 'ESCAPED_DEFECT'
    readonly rationale: string | null
    readonly detectionSource: FailureDetectionSource | null
  }
  readonly createdAt: string
}

export interface EvolutionProposalInsert {
  readonly id: string
  readonly kind: 'GATE' | 'CAPABILITY' | 'PIPELINE_CODE'
  readonly source: 'LRN04'
  readonly targetRef: string
  readonly diffR2Key: string
  readonly strictnessDirection: 'TIGHTEN'
  readonly status: 'PROPOSED'
  readonly createdAt: string
  readonly metadata: {
    readonly defectClass: string
    readonly sourceKind: 'REJECTED_MASTER' | 'ESCAPED_DEFECT' | 'REPEATED_GATE_FAIL' | 'QUARANTINE_CLUSTER'
    readonly proposedControl: 'DETERMINISTIC_LINT' | 'CRITIC_RUBRIC'
    readonly requalifyCapabilityIds: readonly string[]
    readonly sourceEvidenceR2Keys: readonly string[]
    readonly requiresSyntheticSample: boolean
  }
}

export type FailureMiningWrite =
  | { readonly table: 'gold_sample', readonly row: GoldSampleInsert }
  | { readonly table: 'evolution_proposal', readonly row: EvolutionProposalInsert }

export interface FailureMiningResult {
  readonly allowedTables: readonly ['gold_sample', 'evolution_proposal']
  readonly writes: readonly FailureMiningWrite[]
  readonly providerCostUsd: 0
}

export interface RejectionMiningInput {
  readonly masterId: string
  readonly rejectedAt: string
  readonly minedAt: string
  readonly judgment: {
    readonly touchpoint: 'HP-04'
    readonly verdict: 'REJECTED'
    readonly actorIdentity: string
    readonly rationale: string
    readonly evidenceR2Key: string
  }
  readonly defects: readonly {
    readonly defectClass: string
    readonly severity: FailureSeverity
    readonly stageCode: string
    readonly tStart: number
    readonly tEnd: number
  }[]
  readonly existingGoldDefectClasses: readonly string[]
}

export interface EscapedDefectInput {
  readonly id: string
  readonly masterId: string
  readonly defectClass: string
  readonly severity: FailureSeverity
  readonly stageCode: string
  readonly tStart: number
  readonly tEnd: number
  readonly criticCapabilityId: string
  readonly machineMeasurable: boolean
  readonly assurance: {
    readonly verdict: 'PASS'
    readonly decidedAt: string
    readonly evidenceR2Key: string
  }
  readonly detected: {
    readonly source: FailureDetectionSource
    readonly detectedAt: string
    readonly evidenceR2Key: string
  }
}

export interface RepeatedGateFailure {
  readonly id: string
  readonly reason: string
  readonly defectClass: string
  readonly stageCode: string
  readonly earlierStageCode: string | null
  readonly machineMeasurable: boolean
  readonly evidenceR2Key: string
}

export interface QuarantinedItem {
  readonly id: string
  readonly defectClass: string
  readonly stageCode: string
  readonly deterministicLintExists: boolean
  readonly evidenceR2Key: string
}

export interface FailureDensityReport {
  readonly total: number
  readonly byDefectClass: Readonly<Record<string, number>>
  readonly byStage: Readonly<Record<string, number>>
}
