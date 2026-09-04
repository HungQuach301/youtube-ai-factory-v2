export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SCHEMA_VERSION = 1
export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_COMMAND =
  'RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH'
export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_OWNER_APPROVAL =
  'RUN STAGE 12 CODEC SAFE LRA FEASIBILITY SEARCH'
export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS =
  'CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION'

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY = /** @type {const} */ ({
  macroDepthMinDb: 10.9,
  macroDepthMaxDb: 14,
  lraMapBudget: 8,
  truePeakContainmentBudget: 4,
  lufsTrimBudget: 3,
  postTrimStabilizationBudget: 2,
  finalVerifyBudget: 1,
  rollbackVerifyBudget: 1,
  maxSeeds: 2,
  truePeakInteriorMarginDb: 0.05,
  integratedBoundaryMarginLu: 0.05,
  maxIntegratedTargetStepLu: 0.25,
  roundDecimals: 6,
})

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER = /** @type {const} */ ([
  14, 12.45, 11.675, 13.225, 11.2875, 12.0625, 12.8375, 13.6125,
])

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PARENT_BINDING = /** @type {const} */ ({
  sourceCorrectedPreMasterSha256:
    '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2',
  codecSafeTruePeakShadowEvidenceId:
    '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb',
  codecSafeLraGuardShadowEvidenceId:
    '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9',
  sourceAttemptOrdinal: 3,
  sourceCorrectionOrdinal: 2,
  historicalFailureCorrectionOrdinal: 3,
  parentGuardTerminalReason: 'BUDGET_EXHAUSTED',
  parentGuardSelectedCandidatePass: 5,
  parentGuardLastCandidatePass: 7,
  parentGuardControllerControls: {
    integratedTargetLufs: -14,
    limiterCeilingDbtp: -2.67,
    targetStepLufs: 0,
  },
  parentGuardFinalMeasurements: {
    integratedLufs: -15.25,
    integratedLufsExact: '-15.25',
    truePeakDbtp: -1.06,
    truePeakDbtpExact: '-1.06',
    loudnessRangeLu: 3.2,
    loudnessRangeLuExact: '3.20',
  },
  parentGuardFailedPredicates: [
    'INTEGRATED_LUFS_BELOW_MIN', 'LOUDNESS_RANGE_LU_BELOW_MIN',
  ],
  parentGuardResponseTrace: [
    { candidatePass: 0, phase: 'ANCHOR_REPRODUCTION', disposition: 'SAFE_ANCHOR',
      macroDepthDb: 7.8, integratedLufs: -15.09, truePeakDbtp: -1.04,
      loudnessRangeLu: 2.8, integratedLufsExact: '-15.09',
      truePeakDbtpExact: '-1.04', loudnessRangeLuExact: '2.80' },
    { candidatePass: 1, phase: 'LRA_BRACKET_SEARCH', disposition: 'REGRESSION_REJECTED',
      macroDepthDb: 10.9, integratedLufs: -15.29, truePeakDbtp: -0.96,
      loudnessRangeLu: 3.5, integratedLufsExact: '-15.29',
      truePeakDbtpExact: '-0.96', loudnessRangeLuExact: '3.50' },
    { candidatePass: 2, phase: 'LRA_BRACKET_SEARCH', disposition: 'LOW_BRACKET',
      macroDepthDb: 9.35, integratedLufs: -15.19, truePeakDbtp: -1.04,
      loudnessRangeLu: 2.9, integratedLufsExact: '-15.19',
      truePeakDbtpExact: '-1.04', loudnessRangeLuExact: '2.90' },
    { candidatePass: 3, phase: 'LRA_BRACKET_SEARCH', disposition: 'LOW_BRACKET',
      macroDepthDb: 10.125, integratedLufs: -15.23, truePeakDbtp: -1.05,
      loudnessRangeLu: 3.1, integratedLufsExact: '-15.23',
      truePeakDbtpExact: '-1.05', loudnessRangeLuExact: '3.10' },
    { candidatePass: 4, phase: 'LRA_BRACKET_SEARCH', disposition: 'LOW_BRACKET',
      macroDepthDb: 10.5125, integratedLufs: -15.24, truePeakDbtp: -1.05,
      loudnessRangeLu: 3.1, integratedLufsExact: '-15.24',
      truePeakDbtpExact: '-1.05', loudnessRangeLuExact: '3.10' },
    { candidatePass: 5, phase: 'LRA_BRACKET_SEARCH', disposition: 'LOW_BRACKET',
      macroDepthDb: 10.70625, integratedLufs: -15.25, truePeakDbtp: -1.06,
      loudnessRangeLu: 3.2, integratedLufsExact: '-15.25',
      truePeakDbtpExact: '-1.06', loudnessRangeLuExact: '3.20' },
    { candidatePass: 6, phase: 'LRA_BRACKET_SEARCH', disposition: 'LOW_BRACKET',
      macroDepthDb: 10.803125, integratedLufs: -15.26, truePeakDbtp: -1.03,
      loudnessRangeLu: 3.2, integratedLufsExact: '-15.26',
      truePeakDbtpExact: '-1.03', loudnessRangeLuExact: '3.20' },
    { candidatePass: 7, phase: 'LRA_BRACKET_SEARCH', disposition: 'REGRESSION_REJECTED',
      macroDepthDb: 10.851563, integratedLufs: -15.29, truePeakDbtp: -0.98,
      loudnessRangeLu: 3.4, integratedLufsExact: '-15.29',
      truePeakDbtpExact: '-0.98', loudnessRangeLuExact: '3.40' },
  ],
})

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES = /** @type {const} */ ([
  'LRA_MAP', 'TP_CONTAINMENT', 'LUFS_TRIM', 'POST_TRIM_STABILIZATION',
  'FINAL_VERIFY', 'ROLLBACK_VERIFY',
])

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ALGORITHM_DESCRIPTOR =
  /** @type {const} */ ({
  algorithmVersion: 'stage12-codec-safe-lra-feasibility-search-v1',
  lraSearch: 'LARGEST_GAP_MIDPOINT_NON_MONOTONIC',
  probeOrder: STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER,
  phaseOrder: STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES,
  seedSelection: 'INTERIOR_MARGIN_THEN_TP_LUFS_DEPTH_ORDINAL',
  truePeakContainment: 'POST_OPUS_DECREASING_CEILING_ONLY',
  integratedTrim: 'RESERVED_NEAREST_INTERIOR_BOUNDARY',
  finalVerification: 'SAME_ENCODED_OPUS_ARTIFACT_SHA256_AND_DECODED_SIGNAL',
  rollback: 'RESERVED_PARENT_GUARD_PASS_5_REPRODUCTION',
  budgetBorrowing: 'FORBIDDEN',
})

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_DISPOSITIONS = /** @type {const} */ ([
  'LRA_BELOW_MIN', 'LRA_FEASIBLE_TP_SAFE', 'LRA_FEASIBLE_TP_UNCONTAINED',
  'LRA_ABOVE_MAX', 'TP_CONTAINED', 'TP_IMPROVING',
  'SEED_REJECTED_NON_IMPROVING', 'SEED_REJECTED_LRA_REGRESSION',
  'LUFS_TRIM_ACCEPTED', 'LUFS_TRIM_COMPLETE', 'SEED_REJECTED_TRIM_REGRESSION',
  'STABILIZATION_CONFIRMED', 'TP_STABILIZING',
  'SEED_REJECTED_STABILIZATION_REGRESSION', 'FINAL_PASS', 'FINAL_FAIL',
  'ROLLBACK_SAFE', 'ROLLBACK_DRIFT',
])

export const STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TERMINAL_REASONS = /** @type {const} */ ([
  'PASS', 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
  'FINAL_SAME_ARTIFACT_VERIFICATION_FAILED', 'SAFE_ROLLBACK_REPRODUCTION_DRIFT',
])
