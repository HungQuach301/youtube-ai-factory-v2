import type {
  CriticCode,
  GateState,
  GateTier,
  Hex64,
  ProfileName,
  thresholds,
} from '@youtube-ai-factory/contracts'

export type AssuranceDimension = keyof typeof thresholds.ASSURANCE.FLOORS
export type AssuranceMode = 'WARNING_ONLY' | 'HARD_GATE'
export type AssuranceVerdict = 'PASS' | 'FAIL' | 'NOT_RUN'

export interface RubricAnchor {
  readonly fail: string
  readonly borderline: string
  readonly pass: string
  readonly evidenceR2Key: string
  readonly selectedBy: string
}

export type AssuranceRubric = Partial<Readonly<Record<AssuranceDimension, RubricAnchor>>>

export interface AssurancePrerequisite {
  readonly gateCode: string
  readonly tier: Extract<GateTier, 'M0' | 'M1'>
  readonly state: GateState
}

export interface BlindAssuranceRequest {
  readonly blindMasterId: Hex64
  readonly criticCode: CriticCode
  readonly temperature: 0
  readonly seed: number
  readonly attempt: 1 | 2 | 3
  readonly temporalSampleRefs: readonly string[]
  readonly rubric: Readonly<Record<AssuranceDimension, RubricAnchor>>
}

export interface AssuranceCriticResponse {
  readonly dimensionScores: Partial<Readonly<Record<AssuranceDimension, number>>>
  readonly p0Count: number
  readonly criticalP1Count: number
  readonly evidenceR2Key: string
}

export interface AssuranceCritic {
  readonly code: CriticCode
  readonly capabilityId: string
  readonly qualificationState: string
  readonly qualificationRunId: string | null
  judge(request: BlindAssuranceRequest): Promise<AssuranceCriticResponse>
}

export interface AssuranceRunInput {
  readonly runId: string
  readonly profile: ProfileName
  readonly profileSettings: (typeof thresholds.PROFILE)[ProfileName]
  readonly mode: AssuranceMode
  readonly masterEvidenceHash: Hex64
  readonly temporalSampleRefs: readonly string[]
  readonly prerequisites: readonly AssurancePrerequisite[]
  readonly rubric: AssuranceRubric
}

export interface CriticDimensionEvidence {
  readonly criticCode: CriticCode
  readonly dimension: AssuranceDimension
  readonly samples: readonly number[]
  readonly median: number
  readonly variance: number
  readonly evidenceR2Keys: readonly string[]
}

export interface AssuranceRunResult {
  readonly runId: string
  readonly mode: AssuranceMode
  readonly gateState: Extract<GateState, 'PASS' | 'FAIL' | 'NOT_EVALUATED'>
  readonly verdict: AssuranceVerdict
  readonly providerCallCount: number
  readonly blockers: readonly string[]
  readonly dimensionScores: Partial<Readonly<Record<AssuranceDimension, number>>>
  readonly borderlineDimensions: readonly AssuranceDimension[]
  readonly criticEvidence: readonly CriticDimensionEvidence[]
  readonly p0Count: number
  readonly criticalP1Count: number
}

export interface QualificationSample {
  readonly id: string
  readonly defectClass: string
  readonly severity: 'P0' | 'P1' | 'P2'
}

export interface QualificationObservation {
  readonly sampleId: string
  readonly runOrdinal: 1 | 2 | 3
  readonly predictedDefectClasses: readonly string[]
  readonly score: number
}

export interface CriticQualificationInput {
  readonly samples: readonly QualificationSample[]
  readonly observations: readonly QualificationObservation[]
  readonly goldSetReady: boolean
  readonly rubric: AssuranceRubric
}

export interface CriticQualificationResult {
  readonly verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE'
  readonly qualificationState: 'QUALIFIED' | 'REGISTERED'
  readonly recallP0ByDefectClass: Readonly<Record<string, number>>
  readonly recallP1: number
  readonly precision: number
  readonly maxScoreVariance: number
  readonly failures: readonly string[]
}
