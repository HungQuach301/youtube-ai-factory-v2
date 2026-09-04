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

export type Stage12CodecSafeLraFeasibilityResult = {
  evidenceSemantics: 'CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION'
  outcome: 'PASS' | 'FAIL'
  terminalReason: 'PASS' | 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED' | 'ENCODE_FAILED'
    | 'MEASUREMENT_FAILED' | 'LINEAGE_DRIFT'
  selectedCandidateSha256: string | null
  correctedOutputUploaded: false
  providerCallCount: 0
  calibration: false
  finalize: false
  productionActivation: false
  releaseEligible: false
  autoPublish: 'OFF'
}
