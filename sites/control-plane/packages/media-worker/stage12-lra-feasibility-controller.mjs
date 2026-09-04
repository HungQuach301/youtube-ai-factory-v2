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

export function stage12LraFeasibilityHash(value) {
  return hash(value)
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

export function stage12LraFeasibilityThresholdSnapshot(thresholds) {
  return hash(thresholds)
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

function phaseBudgetUsed() {
  return { LRA_MAP: 0, TRUE_PEAK_CONTAINMENT: 0, LUFS_TRIM: 0,
    POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 0 }
}

function lraFeasible(candidate, thresholds) {
  return candidate.loudnessRangeLu >= thresholds.lraMin
    && candidate.loudnessRangeLu <= thresholds.lraMax
}

function lufsInterior(candidate, policy) {
  return candidate.integratedLufs >= policy.integratedInteriorMinLufs
    && candidate.integratedLufs <= policy.integratedInteriorMaxLufs
}

function requireProbeMeasurement(measurement) {
  if (!measurement || !['integratedLufs', 'truePeakDbtp', 'loudnessRangeLu']
    .every((key) => Number.isFinite(measurement[key]))
    || !['integratedLufsExact', 'truePeakDbtpExact', 'loudnessRangeLuExact']
      .every((key) => typeof measurement[key] === 'string' && measurement[key].length > 0)
    || !/^[a-f0-9]{64}$/u.test(measurement.candidateSha256 ?? '')
    || !/^[a-f0-9]{64}$/u.test(measurement.audioFrameMd5Sha256 ?? '')) {
    throw Object.assign(new Error('Invalid Stage 12 feasibility probe measurement.'),
      { code: 'STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID' })
  }
  return measurement
}

function phaseDisposition(phase, measurement, thresholds) {
  if (phase === 'SAFE_ROLLBACK') return 'SAFE_ROLLBACK'
  if (!lraFeasible(measurement, thresholds)) return 'LRA_REGRESSION'
  if (phase === 'LRA_MAP') return measurement.truePeakDbtp > thresholds.truePeakMaxDbtp
    ? 'LRA_FEASIBLE_TP_UNCONTAINED' : 'LRA_PROBE'
  if (phase === 'TRUE_PEAK_CONTAINMENT') return 'TP_CONTAINED'
  if (phase === 'LUFS_TRIM') return 'LUFS_TRIMMED'
  if (phase === 'POST_TRIM_TRUE_PEAK') return 'POST_TRIM_TP_CONTAINED'
  return 'FULL_PASS'
}

/**
 * Execute the deterministic phase ledger around a caller-supplied post-Opus probe.
 * The callback must create every candidate from the same immutable lossless source.
 */
export async function runStage12LraFeasibilityController(input) {
  const policy = input?.policy ?? STAGE12_LRA_FEASIBILITY_POLICY
  const thresholds = input?.thresholds
  const probe = input?.probe
  const safeRollback = input?.safeRollbackCandidate
  if (!thresholds || typeof probe !== 'function' || !safeRollback
    || policy.lattice.length !== policy.phaseBudget.LRA_MAP) {
    throw Object.assign(new Error('Invalid Stage 12 feasibility controller input.'),
      { code: 'INVALID_STAGE12_LRA_FEASIBILITY_CONTROLLER_INPUT' })
  }
  const used = phaseBudgetUsed()
  const candidateTrace = []
  const evaluate = async (phase, controller, seedProbeOrdinal = null, disposition = null) => {
    if (used[phase] >= policy.phaseBudget[phase]) {
      throw Object.assign(new Error(`Stage 12 feasibility ${phase} budget exhausted.`),
        { code: 'STAGE12_LRA_FEASIBILITY_PHASE_BUDGET_EXHAUSTED' })
    }
    const phaseOrdinal = used[phase]
    used[phase] += 1
    let measurement
    try {
      measurement = requireProbeMeasurement(await probe({ ...controller, phase,
        phaseOrdinal, seedProbeOrdinal }))
    } catch (error) {
      if (typeof error === 'object' && error !== null) {
        error.feasibilityState = { candidateTrace: [...candidateTrace],
          phaseBudgetUsed: { ...used } }
      }
      throw error
    }
    const verification = verifyStage12LraFeasibilityCandidate(measurement, thresholds)
    const candidate = { candidateOrdinal: candidateTrace.length, phase, phaseOrdinal,
      seedProbeOrdinal, macroDepthDb: controller.macroDepthDb,
      integratedTargetLufs: controller.integratedTargetLufs,
      limiterCeilingDbtp: controller.limiterCeilingDbtp,
      targetStepLufs: controller.targetStepLufs ?? 0,
      ...measurement, failedPredicates: verification.failedPredicates,
      lraFeasible: lraFeasible(measurement, thresholds),
      truePeakContained: measurement.truePeakDbtp <= thresholds.truePeakMaxDbtp,
      disposition: disposition ?? phaseDisposition(phase, measurement, thresholds) }
    candidateTrace.push(candidate)
    return candidate
  }

  const mapCandidates = []
  for (const macroDepthDb of policy.lattice) {
    const candidate = await evaluate('LRA_MAP', { macroDepthDb,
      integratedTargetLufs: thresholds.integratedLufs,
      limiterCeilingDbtp: input.anchorLimiterCeilingDbtp, targetStepLufs: 0 })
    if (!candidate.lraFeasible) candidate.disposition = 'LRA_INFEASIBLE'
    mapCandidates.push(candidate)
  }
  const seeds = selectStage12LraFeasibilitySeeds(mapCandidates.map((candidate) => ({
    ...candidate, probeOrdinal: candidate.phaseOrdinal,
  })), thresholds)
  for (const seed of seeds) {
    let current = seed
    let controller = { macroDepthDb: seed.macroDepthDb,
      integratedTargetLufs: seed.integratedTargetLufs,
      limiterCeilingDbtp: seed.limiterCeilingDbtp, targetStepLufs: 0 }
    let rejected = false

    while (current.truePeakDbtp > policy.truePeakInteriorDbtp
      && used.TRUE_PEAK_CONTAINMENT < policy.phaseBudget.TRUE_PEAK_CONTAINMENT) {
      const previousTruePeak = current.truePeakDbtp
      const correction = Math.max(0.01, previousTruePeak - policy.truePeakInteriorDbtp)
      controller = { ...controller,
        limiterCeilingDbtp: Number((controller.limiterCeilingDbtp - correction).toFixed(6)),
        targetStepLufs: 0 }
      const contained = await evaluate('TRUE_PEAK_CONTAINMENT', controller,
        seed.probeOrdinal)
      if (!contained.lraFeasible) {
        contained.disposition = 'LRA_REGRESSION'; rejected = true; break
      }
      if (contained.truePeakDbtp >= previousTruePeak) {
        contained.disposition = 'TP_NON_IMPROVING'; rejected = true; break
      }
      current = contained
    }
    if (rejected || current.truePeakDbtp > policy.truePeakInteriorDbtp) continue

    while (!lufsInterior(current, policy)
      && used.LUFS_TRIM < policy.phaseBudget.LUFS_TRIM) {
      const desired = current.integratedLufs < policy.integratedInteriorMinLufs
        ? policy.integratedInteriorMinLufs : policy.integratedInteriorMaxLufs
      const delta = Math.max(-policy.maxLufsTrimStepLu,
        Math.min(policy.maxLufsTrimStepLu, desired - current.integratedLufs))
      controller = { ...controller,
        integratedTargetLufs: Number((controller.integratedTargetLufs + delta).toFixed(6)),
        targetStepLufs: Number(delta.toFixed(6)) }
      const trimmed = await evaluate('LUFS_TRIM', controller, seed.probeOrdinal)
      if (!trimmed.lraFeasible) {
        trimmed.disposition = 'LRA_REGRESSION'; rejected = true; break
      }
      current = trimmed
    }
    if (rejected || !lufsInterior(current, policy)) continue

    while (current.truePeakDbtp > policy.truePeakInteriorDbtp
      && used.POST_TRIM_TRUE_PEAK < policy.phaseBudget.POST_TRIM_TRUE_PEAK) {
      const previousTruePeak = current.truePeakDbtp
      const correction = Math.max(0.01, previousTruePeak - policy.truePeakInteriorDbtp)
      controller = { ...controller,
        limiterCeilingDbtp: Number((controller.limiterCeilingDbtp - correction).toFixed(6)),
        targetStepLufs: 0 }
      const contained = await evaluate('POST_TRIM_TRUE_PEAK', controller,
        seed.probeOrdinal)
      if (!contained.lraFeasible) {
        contained.disposition = 'LRA_REGRESSION'; rejected = true; break
      }
      if (contained.truePeakDbtp >= previousTruePeak) {
        contained.disposition = 'TP_NON_IMPROVING'; rejected = true; break
      }
      current = contained
    }
    if (rejected || !verifyStage12LraFeasibilityCandidate(current, thresholds).pass) continue

    const verified = await evaluate('FINAL_VERIFICATION', { ...controller,
      targetStepLufs: 0 }, seed.probeOrdinal)
    if (verifyStage12LraFeasibilityCandidate(verified, thresholds).pass) {
      verified.disposition = 'FULL_PASS'
      return { outcome: 'PASS', terminalReason: 'PASS',
        selectedCandidateSha256: verified.candidateSha256,
        phaseBudgetUsed: used, candidateTrace }
    }
    verified.disposition = 'FINAL_VERIFICATION_FAILED'
  }

  const rollback = await evaluate('SAFE_ROLLBACK', {
    macroDepthDb: safeRollback.macroDepthDb,
    integratedTargetLufs: safeRollback.integratedTargetLufs,
    limiterCeilingDbtp: safeRollback.limiterCeilingDbtp,
    targetStepLufs: 0,
  }, null, 'SAFE_ROLLBACK')
  return { outcome: 'FAIL', terminalReason: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
    selectedCandidateSha256: rollback.candidateSha256,
    phaseBudgetUsed: used, candidateTrace }
}
