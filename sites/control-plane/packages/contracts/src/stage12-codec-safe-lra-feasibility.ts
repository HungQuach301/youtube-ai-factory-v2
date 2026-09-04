import type {
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_DISPOSITIONS,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SCHEMA_VERSION,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TERMINAL_REASONS,
} from './stage12-codec-safe-lra-feasibility-policy.mjs'

export {
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ALGORITHM_DESCRIPTOR,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_COMMAND,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_DISPOSITIONS,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_OWNER_APPROVAL,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PARENT_BINDING,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SCHEMA_VERSION,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TERMINAL_REASONS,
} from './stage12-codec-safe-lra-feasibility-policy.mjs'

export type Stage12CodecSafeLraFeasibilityPolicy =
  typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY

export type Stage12CodecSafeLraFeasibilityPhase =
  typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES[number]

export type Stage12CodecSafeLraFeasibilityDisposition =
  typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_DISPOSITIONS[number]

export type Stage12CodecSafeLraFeasibilityTerminalReason =
  typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TERMINAL_REASONS[number]

export type Stage12CodecSafeLraExactMeasurements = Readonly<{
  integratedLufs: number
  integratedLufsExact: string
  truePeakDbtp: number
  truePeakDbtpExact: string
  loudnessRangeLu: number
  loudnessRangeLuExact: string
}>

export type Stage12CodecSafeLraFeasibilityCandidate =
  Stage12CodecSafeLraExactMeasurements & Readonly<{
    candidateOrdinal: number
    phase: Stage12CodecSafeLraFeasibilityPhase
    phaseSlot: number
    seedOrdinal: 0 | 1 | null
    seedMapCandidateOrdinal: number | null
    parentCandidateOrdinal: number | null
    rollbackToCandidateOrdinal: number | null
    losslessReferenceSha256: string
    integratedTargetLufs: number
    limiterCeilingDbtp: number
    macroDepthDb: number
    targetStepLufs: number
    ceilingStepDb: number
    codecOvershootDb: number
    failedPredicates: readonly string[]
    encodedArtifactSha256: string
    audioFrameMd5Sha256: string
    disposition: Stage12CodecSafeLraFeasibilityDisposition
  }>

export type Stage12CodecSafeLraFeasibilityBudget = Readonly<{
  limit: number
  used: number
  remaining: number
}>

export type Stage12CodecSafeLraFeasibilityBudgetLedger = Readonly<
  Record<Stage12CodecSafeLraFeasibilityPhase | 'TOTAL',
    Stage12CodecSafeLraFeasibilityBudget>
>

export type Stage12CodecSafeLraFeasibilitySafeRollback =
  Stage12CodecSafeLraExactMeasurements & Readonly<{
    parentCandidatePass: 5
    losslessReferenceSha256: string
    integratedTargetLufs: number
    limiterCeilingDbtp: number
    macroDepthDb: number
    audioFrameMd5Sha256: string
    verificationCandidateOrdinal: number | null
  }>

export type Stage12CodecSafeLraGuardParentCandidate =
  Stage12CodecSafeLraExactMeasurements & Readonly<{
    candidatePass: number
    phase: string
    decision: string
    parentCandidatePass: number | null
    rollbackToCandidatePass: number | null
    bracketLowDepthDb: number
    bracketHighDepthDb: number
    losslessReferenceSha256: string
    integratedTargetLufs: number
    limiterCeilingDbtp: number
    macroDepthDb: number
    targetStepLufs: number
    codecOvershootDb: number
    failedPredicates: readonly string[]
    audioFrameMd5Sha256: string
    disposition: string
  }>

export type Stage12CodecSafeLraGuardParentTrace = Readonly<{
  shadowOutcome: 'FAIL'
  terminalReason: 'BUDGET_EXHAUSTED'
  lastEvaluatedCandidatePass: 7
  bestSafeCandidatePass: 5
  selectedCandidatePass: 5
  finalMeasurements: Stage12CodecSafeLraExactMeasurements
  failedPredicates: readonly string[]
  candidates: readonly Stage12CodecSafeLraGuardParentCandidate[]
}>

export type Stage12CodecSafeRuntimeProvenance = Readonly<{
  ffmpegVersion: string
  ffmpegBuildFingerprint: string
  libopusEncoderFingerprint: string
}>

export type Stage12CodecSafeLosslessReference = Readonly<{
  sha256: string
  byteLength: number
  audioFrameMd5Sha256: string
  codec: 'pcm_f32le'
  sampleRateHz: number
}>

export type Stage12CodecSafeLraFeasibilitySearchContract = Readonly<{
  schemaVersion: typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SCHEMA_VERSION
  evidenceSemantics: typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS
  sourceAttemptOrdinal: 3
  sourceCorrectionOrdinal: 2
  historicalFailureCorrectionOrdinal: 3
  sourceCorrectionJobId: string
  historicalFailureJobId: string
  diagnosticReplayJobId: string
  diagnosticReplayEvidenceId: string
  codecSafeTruePeakShadowJobId: string
  codecSafeTruePeakShadowEvidenceId: string
  codecSafeLraGuardShadowJobId: string
  codecSafeLraGuardShadowEvidenceId: string
  sourceCorrectedPreMaster: Readonly<{
    r2Key: string
    sha256: string
    byteLength: number
  }>
  sourceCorrectionReceiptSha256: string
  parentWorkerImageDigest: string
  parentAlgorithmFingerprint: string
  parentThresholdSnapshotSha256: string
  parentControllerPolicySha256: string
  parentRenderKernelFingerprint: string
  parentRenderRuntimeFingerprint: string
  parentRuntimeProvenance: Stage12CodecSafeRuntimeProvenance
  parentLosslessReference: Stage12CodecSafeLosslessReference
  parentGuardTrace: Stage12CodecSafeLraGuardParentTrace
  controllerPolicy: Stage12CodecSafeLraFeasibilityPolicy
  expectedWorkerImageDigest: string
  algorithmFingerprint: string
  thresholdSnapshotSha256: string
  controllerPolicySha256: string
  renderKernelFingerprint: string
  historicalBackfill: false
  uploadCorrectedOutput: false
  providerDispatch: 'OFF'
  providerCallCount: 0
  calibration: false
  finalize: false
  release: false
  productionActivation: false
  autoPublish: 'OFF'
}>

export type Stage12CodecSafeLraFeasibilitySearchResult = Readonly<{
  accepted: true
  schemaVersion: typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SCHEMA_VERSION
  evidenceSemantics: typeof STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS
  boundary: 'POST_OPUS_LRA_FEASIBILITY_SEARCH'
  source: Readonly<{ correctionOrdinal: 2; correctionJobId: string; r2Key: string
    sha256: string; byteLength: number; receiptSha256: string }>
  historicalFailure: Readonly<{ correctionOrdinal: 3; correctionJobId: string
    errorCode: 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED' }>
  diagnosticReplay: Readonly<{ jobId: string; evidenceId: string }>
  parentTruePeakShadow: Readonly<{ jobId: string; evidenceId: string }>
  parentLraGuard: Readonly<{ jobId: string; evidenceId: string }>
  losslessReference: Stage12CodecSafeLosslessReference
  parentGuardTrace: Stage12CodecSafeLraGuardParentTrace
  controllerPolicy: Stage12CodecSafeLraFeasibilityPolicy
  candidates: readonly Stage12CodecSafeLraFeasibilityCandidate[]
  budgetLedger: Stage12CodecSafeLraFeasibilityBudgetLedger
  lastEvaluatedCandidateOrdinal: number
  selectedSeedOrdinal: 0 | 1 | null
  selectedCandidateOrdinal: number
  verifiedCandidateOrdinal: number | null
  safeRollback: Stage12CodecSafeLraFeasibilitySafeRollback
  shadowOutcome: 'PASS' | 'FAIL'
  terminalReason: Stage12CodecSafeLraFeasibilityTerminalReason
  finalMeasurements: Stage12CodecSafeLraExactMeasurements
  failedPredicates: readonly string[]
  workerImageDigest: string
  expectedWorkerImageDigest: string
  parentWorkerImageDigest: string
  algorithmFingerprint: string
  thresholdSnapshotSha256: string
  controllerPolicySha256: string
  renderKernelFingerprint: string
  parentRenderKernelFingerprint: string
  parentRenderRuntimeFingerprint: string
  renderRuntimeFingerprint: string
  parentRuntimeProvenance: Stage12CodecSafeRuntimeProvenance
  runtimeProvenance: Stage12CodecSafeRuntimeProvenance
  correctedOutputUploaded: false
  historicalBackfill: false
  providerCallCount: 0
  providerDispatch: 'OFF'
  calibration: false
  finalize: false
  releaseEligible: false
  productionActivation: false
  autoPublish: 'OFF'
}>
