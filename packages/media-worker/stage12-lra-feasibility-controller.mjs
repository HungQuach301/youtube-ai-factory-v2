import { createHash } from 'node:crypto'

const LATTICE = Object.freeze([14, 12.45, 11.675, 13.225, 11.2875, 12.0625, 12.8375, 13.6125])
const PHASE_BUDGET = Object.freeze({ LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 4,
  LUFS_TRIM: 3, POST_TRIM_TRUE_PEAK: 2, FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1 })
const SAFE_ROLLBACK_CONTROLS = Object.freeze({ candidatePass: 5, macroDepthDb: 10.70625,
  integratedTargetLufs: -14, limiterCeilingDbtp: -2.67 })
const SAFE_ROLLBACK_MEASUREMENT = Object.freeze({ integratedLufs: -15.25,
  integratedLufsExact: '-15.25', truePeakDbtp: -1.06, truePeakDbtpExact: '-1.06',
  loudnessRangeLu: 3.2, loudnessRangeLuExact: '3.20' })
const EXACT_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u
const HEX64 = /^[a-f0-9]{64}$/u
const SAFE_ROLLBACK_KEYS = Object.freeze(['candidatePass', 'macroDepthDb',
  'integratedTargetLufs', 'limiterCeilingDbtp', 'losslessReferenceSha256',
  'integratedLufs', 'integratedLufsExact', 'truePeakDbtp', 'truePeakDbtpExact',
  'loudnessRangeLu', 'loudnessRangeLuExact', 'audioFrameMd5Sha256'])

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
  return hash({ algorithm: 'stage12-codec-safe-lra-feasibility-v2',
    candidateInput: 'IMMUTABLE_CORRECTION_ORDINAL_2', search: 'NON_MONOTONIC_LARGEST_GAP_LATTICE',
    terminalPolicy: 'TWO_SEEDS_SINGLE_FINAL_THEN_ROLLBACK',
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
  const exactPairs = [['integratedLufsExact', 'integratedLufs'],
    ['truePeakDbtpExact', 'truePeakDbtp'],
    ['loudnessRangeLuExact', 'loudnessRangeLu']]
  if (!measurement || !['integratedLufs', 'truePeakDbtp', 'loudnessRangeLu']
    .every((key) => Number.isFinite(measurement[key]))
    || !exactPairs.every(([exact, numeric]) => typeof measurement[exact] === 'string'
      && EXACT_DECIMAL.test(measurement[exact])
      && Number(measurement[exact]) === measurement[numeric])
    || !HEX64.test(measurement.candidateSha256 ?? '')
    || !HEX64.test(measurement.audioFrameMd5Sha256 ?? '')) {
    throw Object.assign(new Error('Invalid Stage 12 feasibility probe measurement.'),
      { code: 'STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID' })
  }
  return {
    integratedLufs: measurement.integratedLufs,
    integratedLufsExact: measurement.integratedLufsExact,
    truePeakDbtp: measurement.truePeakDbtp,
    truePeakDbtpExact: measurement.truePeakDbtpExact,
    loudnessRangeLu: measurement.loudnessRangeLu,
    loudnessRangeLuExact: measurement.loudnessRangeLuExact,
    candidateSha256: measurement.candidateSha256,
    audioFrameMd5Sha256: measurement.audioFrameMd5Sha256,
  }
}

function sameMeasurement(left, right) {
  return ['integratedLufs', 'truePeakDbtp', 'loudnessRangeLu']
    .every((key) => left[key] === right[key])
    && ['integratedLufsExact', 'truePeakDbtpExact', 'loudnessRangeLuExact']
      .every((key) => left[key] === right[key])
}

function requireSafeRollbackReference(value, thresholds) {
  if (!value || canonical(Object.keys(value).sort()) !== canonical([...SAFE_ROLLBACK_KEYS].sort())
    || value.candidatePass !== SAFE_ROLLBACK_CONTROLS.candidatePass
    || value.macroDepthDb !== SAFE_ROLLBACK_CONTROLS.macroDepthDb
    || value.integratedTargetLufs !== SAFE_ROLLBACK_CONTROLS.integratedTargetLufs
    || value.limiterCeilingDbtp !== SAFE_ROLLBACK_CONTROLS.limiterCeilingDbtp
    || !HEX64.test(value.losslessReferenceSha256 ?? '')
    || !HEX64.test(value.audioFrameMd5Sha256 ?? '')
    || !sameMeasurement(value, SAFE_ROLLBACK_MEASUREMENT)
    || !['integratedLufsExact', 'truePeakDbtpExact', 'loudnessRangeLuExact']
      .every((key) => EXACT_DECIMAL.test(value[key]) && Number(value[key]) === value[
        key.replace('Exact', '')])
    || value.truePeakDbtp > thresholds.truePeakMaxDbtp) {
    throw Object.assign(new Error('Invalid immutable Stage 12 safe rollback reference.'),
      { code: 'INVALID_STAGE12_LRA_FEASIBILITY_SAFE_ROLLBACK_REFERENCE' })
  }
  return Object.freeze({ ...value })
}

function phaseDisposition(phase, measurement, thresholds, policy) {
  if (phase === 'SAFE_ROLLBACK') return 'SAFE_ROLLBACK'
  if (!lraFeasible(measurement, thresholds)) return 'LRA_REGRESSION'
  if (phase === 'LRA_MAP') return measurement.truePeakDbtp > thresholds.truePeakMaxDbtp
    ? 'LRA_FEASIBLE_TP_UNCONTAINED' : 'LRA_PROBE'
  if (phase === 'TRUE_PEAK_CONTAINMENT') {
    return measurement.truePeakDbtp <= policy.truePeakInteriorDbtp
      ? 'TP_CONTAINED' : 'TP_IMPROVING'
  }
  if (phase === 'LUFS_TRIM') return 'LUFS_TRIMMED'
  if (phase === 'POST_TRIM_TRUE_PEAK') {
    return measurement.truePeakDbtp <= policy.truePeakInteriorDbtp
      ? 'POST_TRIM_TP_CONTAINED' : 'POST_TRIM_TP_IMPROVING'
  }
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
  if (!thresholds || typeof probe !== 'function'
    || policy.lattice.length !== policy.phaseBudget.LRA_MAP) {
    throw Object.assign(new Error('Invalid Stage 12 feasibility controller input.'),
      { code: 'INVALID_STAGE12_LRA_FEASIBILITY_CONTROLLER_INPUT' })
  }
  const safeRollback = requireSafeRollbackReference(input?.safeRollbackReference, thresholds)
  const used = phaseBudgetUsed()
  const candidateTrace = []
  const failedProbes = []
  const evaluate = async (phase, controller, seedProbeOrdinal = null, disposition = null) => {
    if (used[phase] >= policy.phaseBudget[phase]) {
      throw Object.assign(new Error(`Stage 12 feasibility ${phase} budget exhausted.`),
        { code: 'STAGE12_LRA_FEASIBILITY_PHASE_BUDGET_EXHAUSTED' })
    }
    const phaseOrdinal = used[phase]
    used[phase] += 1
    const failedProbe = { phase, phaseOrdinal, seedProbeOrdinal,
      macroDepthDb: controller.macroDepthDb,
      integratedTargetLufs: controller.integratedTargetLufs,
      limiterCeilingDbtp: controller.limiterCeilingDbtp,
      targetStepLufs: controller.targetStepLufs ?? 0 }
    let measurement
    try {
      measurement = requireProbeMeasurement(await probe({ ...controller, phase,
        phaseOrdinal, seedProbeOrdinal }))
    } catch (error) {
      failedProbes.push(failedProbe)
      if (typeof error === 'object' && error !== null) {
        error.feasibilityState = { candidateTrace: [...candidateTrace],
          phaseBudgetUsed: { ...used }, failedProbes: [...failedProbes], failedProbe }
      }
      throw error
    }
    if (phase === 'FINAL_VERIFICATION') {
      const reference = controller.sameArtifactReference
      if (!reference || measurement.candidateSha256 !== reference.candidateSha256
        || measurement.audioFrameMd5Sha256 !== reference.audioFrameMd5Sha256
        || !sameMeasurement(measurement, reference)) {
        const error = Object.assign(new Error('Stage 12 final verification artifact drifted.'),
          { code: 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT' })
        const finalFailure = { ...failedProbe,
          failureCode: error.code, observedMeasurement: { ...measurement } }
        failedProbes.push(finalFailure)
        error.feasibilityState = { candidateTrace: [...candidateTrace],
          phaseBudgetUsed: { ...used }, failedProbes: [...failedProbes],
          failedProbe: finalFailure }
        throw error
      }
    }
    const identityConflict = candidateTrace.find((candidate) =>
      (candidate.candidateSha256 === measurement.candidateSha256
        || candidate.audioFrameMd5Sha256 === measurement.audioFrameMd5Sha256)
      && (candidate.candidateSha256 !== measurement.candidateSha256
        || candidate.audioFrameMd5Sha256 !== measurement.audioFrameMd5Sha256
        || !sameMeasurement(candidate, measurement)))
    if (identityConflict) {
      const error = Object.assign(new Error('Stage 12 feasibility artifact measurement drifted.'),
        { code: 'STAGE12_LRA_FEASIBILITY_MEASUREMENT_IDENTITY_DRIFT' })
      failedProbes.push(failedProbe)
      error.feasibilityState = { candidateTrace: [...candidateTrace],
        phaseBudgetUsed: { ...used }, failedProbes: [...failedProbes], failedProbe }
      throw error
    }
    if (phase === 'SAFE_ROLLBACK'
      && (measurement.audioFrameMd5Sha256 !== safeRollback.audioFrameMd5Sha256
        || !sameMeasurement(measurement, safeRollback)
        || measurement.truePeakDbtp > thresholds.truePeakMaxDbtp)) {
      const error = Object.assign(new Error('Stage 12 safe rollback candidate drifted.'),
        { code: 'STAGE12_LRA_FEASIBILITY_MEASUREMENT_SAFE_ROLLBACK_DRIFT' })
      failedProbes.push(failedProbe)
      error.feasibilityState = { candidateTrace: [...candidateTrace],
        phaseBudgetUsed: { ...used }, failedProbes: [...failedProbes], failedProbe }
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
      disposition: disposition ?? phaseDisposition(phase, measurement, thresholds, policy) }
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
  let terminalFailedProbe = null
  seedLoop: for (const seed of seeds) {
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
    if (rejected || current.truePeakDbtp > policy.truePeakInteriorDbtp
      || !verifyStage12LraFeasibilityCandidate(current, thresholds).pass) continue

    if (used.FINAL_VERIFICATION >= policy.phaseBudget.FINAL_VERIFICATION) {
      break seedLoop
    }

    let verified
    try {
      verified = await evaluate('FINAL_VERIFICATION', { ...controller,
        targetStepLufs: 0, sameArtifactReference: {
          candidateSha256: current.candidateSha256,
          audioFrameMd5Sha256: current.audioFrameMd5Sha256,
          integratedLufs: current.integratedLufs,
          integratedLufsExact: current.integratedLufsExact,
          truePeakDbtp: current.truePeakDbtp,
          truePeakDbtpExact: current.truePeakDbtpExact,
          loudnessRangeLu: current.loudnessRangeLu,
          loudnessRangeLuExact: current.loudnessRangeLuExact,
        } }, seed.probeOrdinal)
    } catch (error) {
      if (!['STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT',
        'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE'].includes(error?.code)) throw error
      terminalFailedProbe = { ...error.feasibilityState.failedProbe,
        failureCode: error.code }
      failedProbes[failedProbes.length - 1] = terminalFailedProbe
      break seedLoop
    }
    if (verified.truePeakDbtp <= policy.truePeakInteriorDbtp
      && verifyStage12LraFeasibilityCandidate(verified, thresholds).pass) {
      verified.disposition = 'FULL_PASS'
      return { outcome: 'PASS', terminalReason: 'PASS',
        selectedCandidateSha256: verified.candidateSha256,
        phaseBudgetUsed: used, candidateTrace, failedProbes, failedProbe: null,
        safeRollbackReference: safeRollback }
    }
    verified.disposition = 'FINAL_VERIFICATION_FAILED'
    break seedLoop
  }

  const rollback = await evaluate('SAFE_ROLLBACK', {
    macroDepthDb: safeRollback.macroDepthDb,
    integratedTargetLufs: safeRollback.integratedTargetLufs,
    limiterCeilingDbtp: safeRollback.limiterCeilingDbtp,
    targetStepLufs: 0,
  }, null, 'SAFE_ROLLBACK')
  return { outcome: 'FAIL', terminalReason: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
    selectedCandidateSha256: rollback.candidateSha256,
    phaseBudgetUsed: used, candidateTrace, failedProbes,
    failedProbe: terminalFailedProbe,
    safeRollbackReference: safeRollback }
}
