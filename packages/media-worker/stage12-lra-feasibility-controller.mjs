import { createHash } from 'node:crypto'

const LATTICE = Object.freeze([14, 12.45, 11.675, 13.225, 11.2875, 12.0625, 12.8375, 13.6125])
const PHASE_BUDGET = Object.freeze({ LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 4,
  LUFS_TRIM: 3, POST_TRIM_TRUE_PEAK: 2, FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1 })

function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('NON_FINITE_FEASIBILITY_VALUE')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value !== 'object' || value === undefined) throw new TypeError('INVALID_FEASIBILITY_VALUE')
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function hash(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export const STAGE12_LRA_FEASIBILITY_POLICY = Object.freeze({
  schemaVersion: 1,
  macroDepthMinDb: 10.9,
  macroDepthMaxDb: 14,
  lattice: LATTICE,
  phaseBudget: PHASE_BUDGET,
  truePeakInteriorDbtp: -1.05,
  maxLufsTrimStepLu: 0.25,
  integratedInteriorMinLufs: -14.95,
  integratedInteriorMaxLufs: -13.05,
})

export function stage12LraFeasibilityFingerprint(thresholds, policy = STAGE12_LRA_FEASIBILITY_POLICY) {
  return hash({ algorithm: 'stage12-codec-safe-lra-feasibility-v1',
    candidateInput: 'IMMUTABLE_CORRECTION_ORDINAL_2', search: 'NON_MONOTONIC_LARGEST_GAP_LATTICE',
    phases: ['LRA_MAP', 'TRUE_PEAK_CONTAINMENT', 'LUFS_TRIM', 'POST_TRIM_TRUE_PEAK',
      'FINAL_VERIFICATION', 'SAFE_ROLLBACK'], thresholds, policy })
}

export function validateStage12LraFeasibilityLineage(input) {
  const hex = /^[a-f0-9]{64}$/u
  if (input?.sourceAttemptOrdinal !== 3 || input?.sourceCorrectionOrdinal !== 2
    || input?.historicalFailureCorrectionOrdinal !== 3
    || input?.sourceSha256 !== '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'
    || input?.parentEvidenceId !== '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'
    || input?.lraGuardEvidenceId !== '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'
    || !hex.test(input?.sourceSha256 ?? '') || input?.shadowOnly !== true
    || input?.uploadCorrectedOutput !== false || input?.providerDispatch !== 'OFF'
    || input?.providerCallCount !== 0 || input?.calibration !== false
    || input?.finalize !== false || input?.productionActivation !== false
    || input?.release !== false || input?.autoPublish !== 'OFF') {
    throw Object.assign(new Error('Invalid Stage 12 feasibility lineage.'),
      { code: 'INVALID_STAGE12_LRA_FEASIBILITY_LINEAGE' })
  }
  return input
}

function predicates(measurement, thresholds) {
  const failed = []
  if (measurement.integratedLufs < thresholds.integratedLufs - thresholds.toleranceLufs)
    failed.push('INTEGRATED_LUFS_BELOW_MIN')
  if (measurement.integratedLufs > thresholds.integratedLufs + thresholds.toleranceLufs)
    failed.push('INTEGRATED_LUFS_ABOVE_MAX')
  if (measurement.truePeakDbtp > thresholds.truePeakMaxDbtp) failed.push('TRUE_PEAK_DBTP_ABOVE_MAX')
  if (measurement.loudnessRangeLu < thresholds.lraMin) failed.push('LOUDNESS_RANGE_LU_BELOW_MIN')
  if (measurement.loudnessRangeLu > thresholds.lraMax) failed.push('LOUDNESS_RANGE_LU_ABOVE_MAX')
  return failed
}

export function buildStage12LraFeasibilityMap(measurements, thresholds) {
  if (!Array.isArray(measurements) || measurements.length > LATTICE.length) throw new Error('INVALID_LRA_MAP')
  return measurements.map((measurement, index) => {
    if (measurement.macroDepthDb !== LATTICE[index]) throw new Error('NON_DETERMINISTIC_LRA_LATTICE')
    return { ...measurement, phase: 'LRA_MAP', probeOrdinal: index,
      lraFeasible: measurement.loudnessRangeLu >= thresholds.lraMin
        && measurement.loudnessRangeLu <= thresholds.lraMax,
      truePeakContained: measurement.truePeakDbtp <= thresholds.truePeakMaxDbtp,
      failedPredicates: predicates(measurement, thresholds) }
  })
}

export function selectStage12LraFeasibilitySeeds(map, thresholds) {
  return map.filter((candidate) => candidate.lraFeasible).sort((left, right) => {
    const margin = (value) => Math.min(value - thresholds.lraMin, thresholds.lraMax - value)
    return margin(right.loudnessRangeLu) - margin(left.loudnessRangeLu)
      || Math.max(0, left.truePeakDbtp - thresholds.truePeakMaxDbtp)
        - Math.max(0, right.truePeakDbtp - thresholds.truePeakMaxDbtp)
      || Math.abs(left.integratedLufs - thresholds.integratedLufs)
        - Math.abs(right.integratedLufs - thresholds.integratedLufs)
      || left.macroDepthDb - right.macroDepthDb || left.probeOrdinal - right.probeOrdinal
  }).slice(0, 2)
}

export function planStage12LraFeasibilityStep(state, thresholds,
  policy = STAGE12_LRA_FEASIBILITY_POLICY) {
  const used = state?.used ?? {}
  const map = buildStage12LraFeasibilityMap(state?.lraMeasurements ?? [], thresholds)
  if (map.length < policy.phaseBudget.LRA_MAP) return { phase: 'LRA_MAP',
    macroDepthDb: policy.lattice[map.length], integratedTargetLufs: thresholds.integratedLufs,
    limiterCeilingDbtp: state.anchorLimiterCeilingDbtp }
  const seeds = selectStage12LraFeasibilitySeeds(map, thresholds)
  if (seeds.length === 0) return { terminal: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
    rollbackToCandidatePass: state.safeRollbackCandidatePass }
  const seed = seeds[state.seedOrdinal ?? 0] ?? seeds[0]
  if ((used.TRUE_PEAK_CONTAINMENT ?? 0) < policy.phaseBudget.TRUE_PEAK_CONTAINMENT
    && !state.truePeakContained) return { phase: 'TRUE_PEAK_CONTAINMENT', seed,
      macroDepthDb: seed.macroDepthDb, integratedTargetLufs: thresholds.integratedLufs,
      limiterCeilingDbtp: Number(((state.currentLimiterCeilingDbtp ?? seed.limiterCeilingDbtp)
        - Math.max(0, seed.truePeakDbtp - policy.truePeakInteriorDbtp)).toFixed(6)) }
  if ((used.LUFS_TRIM ?? 0) < policy.phaseBudget.LUFS_TRIM && !state.lufsContained) {
    const desired = seed.integratedLufs < policy.integratedInteriorMinLufs
      ? policy.integratedInteriorMinLufs : seed.integratedLufs > policy.integratedInteriorMaxLufs
        ? policy.integratedInteriorMaxLufs : seed.integratedLufs
    const delta = Math.max(-policy.maxLufsTrimStepLu,
      Math.min(policy.maxLufsTrimStepLu, desired - (state.currentIntegratedLufs ?? seed.integratedLufs)))
    return { phase: 'LUFS_TRIM', seed, macroDepthDb: seed.macroDepthDb,
      limiterCeilingDbtp: state.currentLimiterCeilingDbtp,
      integratedTargetLufs: Number((state.currentIntegratedTargetLufs + delta).toFixed(6)),
      targetStepLufs: Number(delta.toFixed(6)) }
  }
  if (state.sameArtifactPass === true) return { phase: 'FINAL_VERIFICATION', terminal: 'PASS', seed }
  return { phase: 'SAFE_ROLLBACK', terminal: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
    rollbackToCandidatePass: state.safeRollbackCandidatePass }
}

export function verifyStage12LraFeasibilityCandidate(candidate, thresholds) {
  const failedPredicates = predicates(candidate, thresholds)
  return { pass: failedPredicates.length === 0, failedPredicates,
    candidateSha256: hash(candidate) }
}
