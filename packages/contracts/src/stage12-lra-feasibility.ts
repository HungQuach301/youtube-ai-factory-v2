export type RunStage12CodecSafeLraFeasibilitySearchCommand = {
  commandType: 'RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH'
  ownerApprovalText: 'RUN STAGE 12 CODEC SAFE LRA FEASIBILITY SEARCH'
  sourceAttemptOrdinal: 3
  sourceCorrectionOrdinal: 2
  historicalFailureCorrectionOrdinal: 3
  sourceSha256: '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'
  parentEvidenceId: '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'
  lraGuardEvidenceId: '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'
  shadowOnly: true
  uploadCorrectedOutput: false
  providerDispatch: 'OFF'
  providerCallCount: 0
  calibration: false
  finalize: false
  productionActivation: false
  release: false
  autoPublish: 'OFF'
}

export type Stage12CodecSafeLraFeasibilityPhase = 'LRA_MAP' | 'TRUE_PEAK_CONTAINMENT'
  | 'LUFS_TRIM' | 'POST_TRIM_TRUE_PEAK' | 'FINAL_VERIFICATION' | 'SAFE_ROLLBACK'

export type Stage12CodecSafeLraFeasibilityPhaseBudget = {
  LRA_MAP: 8
  TRUE_PEAK_CONTAINMENT: 4
  LUFS_TRIM: 3
  POST_TRIM_TRUE_PEAK: 2
  FINAL_VERIFICATION: 1
  SAFE_ROLLBACK: 1
}

export type Stage12CodecSafeLraFeasibilityMeasurement = {
  integratedLufs: number
  integratedLufsExact: string
  truePeakDbtp: number
  truePeakDbtpExact: string
  loudnessRangeLu: number
  loudnessRangeLuExact: string
}

export type Stage12CodecSafeLraFeasibilitySafeRollbackReference =
  Stage12CodecSafeLraFeasibilityMeasurement & {
    candidatePass: 5
    macroDepthDb: number
    integratedTargetLufs: number
    limiterCeilingDbtp: number
    losslessReferenceSha256: string
    audioFrameMd5Sha256: string
  }

export type Stage12CodecSafeLraFeasibilityCandidate =
  Stage12CodecSafeLraFeasibilityMeasurement & {
    candidateOrdinal: number
    phase: Stage12CodecSafeLraFeasibilityPhase
    phaseOrdinal: number
    seedProbeOrdinal: number | null
    macroDepthDb: number
    integratedTargetLufs: number
    limiterCeilingDbtp: number
    targetStepLufs: number
    candidateSha256: string
    audioFrameMd5Sha256: string
    failedPredicates: string[]
    lraFeasible: boolean
    truePeakContained: boolean
    disposition: 'LRA_PROBE' | 'LRA_FEASIBLE_TP_UNCONTAINED' | 'LRA_INFEASIBLE'
      | 'TP_IMPROVING' | 'TP_CONTAINED' | 'TP_NON_IMPROVING' | 'LRA_REGRESSION'
      | 'LUFS_TRIMMED' | 'POST_TRIM_TP_IMPROVING' | 'POST_TRIM_TP_CONTAINED'
      | 'FULL_PASS' | 'FINAL_VERIFICATION_FAILED'
      | 'SAFE_ROLLBACK'
  }

export type Stage12CodecSafeLraFeasibilityFailedProbe = {
  phase: Stage12CodecSafeLraFeasibilityPhase
  phaseOrdinal: number
  seedProbeOrdinal: number | null
  macroDepthDb: number
  integratedTargetLufs: number
  limiterCeilingDbtp: number
  targetStepLufs: number
  failureCode?: 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT'
    | 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE'
  observedMeasurement?: Stage12CodecSafeLraFeasibilityMeasurement & {
    candidateSha256: string
    audioFrameMd5Sha256: string
  }
}

export type Stage12CodecSafeLraFeasibilityRuntimeProvenance = {
  ffmpegVersion: string
  ffmpegBuildFingerprint: string
  libopusEncoderFingerprint: string
}

export type Stage12CodecSafeLraFeasibilityResult = {
  accepted: true
  schemaVersion: 1
  evidenceSemantics: 'CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION'
  boundary: 'POST_OPUS_CODEC_SAFE_LRA_FEASIBILITY'
  lineage: {
    sourceAttemptOrdinal: 3
    sourceCorrectionOrdinal: 2
    historicalFailureCorrectionOrdinal: 3
    sourceSha256: '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'
    parentEvidenceId: '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'
    lraGuardEvidenceId: '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'
  }
  phaseBudget: Stage12CodecSafeLraFeasibilityPhaseBudget
  phaseBudgetUsed: Record<Stage12CodecSafeLraFeasibilityPhase, number>
  candidateTrace: Stage12CodecSafeLraFeasibilityCandidate[]
  failedProbes: Stage12CodecSafeLraFeasibilityFailedProbe[]
  failedProbe: Stage12CodecSafeLraFeasibilityFailedProbe | null
  safeRollbackReference: Stage12CodecSafeLraFeasibilitySafeRollbackReference
  outcome: 'PASS' | 'FAIL'
  terminalReason: 'PASS' | 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED' | 'ENCODE_FAILED'
    | 'MEASUREMENT_FAILED' | 'LINEAGE_DRIFT'
  errorCode: string | null
  selectedCandidateSha256: string | null
  losslessReference: {
    sha256: string
    byteLength: number
    audioFrameMd5Sha256: string
    codec: 'pcm_f32le'
    sampleRateHz: 48000
  } | null
  parentRuntimeProvenance: Stage12CodecSafeLraFeasibilityRuntimeProvenance
  runtimeProvenance: Stage12CodecSafeLraFeasibilityRuntimeProvenance | null
  expectedWorkerImageDigest: string
  workerImageDigest: string
  algorithmFingerprint: string
  thresholdSnapshotSha256: string
  shadowOnly: true
  correctedOutputUploaded: false
  historicalBackfill: false
  providerDispatch: 'OFF'
  providerCallCount: 0
  calibration: false
  finalize: false
  productionActivation: false
  releaseEligible: false
  autoPublish: 'OFF'
}
