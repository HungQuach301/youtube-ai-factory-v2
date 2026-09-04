import { createHash } from 'node:crypto'

import {
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ALGORITHM_DESCRIPTOR,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PARENT_BINDING,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER,
} from '../contracts/src/stage12-codec-safe-lra-feasibility-policy.mjs'

const HEX64 = /^[0-9a-f]{64}$/u
const DECIMAL = /^-?\d+(?:\.\d+)?$/u
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/u
const PHASES = STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite number is not canonicalizable.')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value !== 'object') throw new TypeError('Unsupported canonical value.')
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(value[key])}`).join(',')}}`
}

function fail(code, message) {
  return Object.assign(new Error(message), { code })
}

function stage12FailedPredicates(payload, measured) {
  const failed = []
  const minimum = payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs
  const maximum = payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs
  if (measured.integratedLufs < minimum) failed.push('INTEGRATED_LUFS_BELOW_MIN')
  if (measured.integratedLufs > maximum) failed.push('INTEGRATED_LUFS_ABOVE_MAX')
  if (measured.truePeakDbtp > payload.qa.loudness.truePeakMaxDbtp) {
    failed.push('TRUE_PEAK_DBTP_ABOVE_MAX')
  }
  if (measured.loudnessRangeLu < payload.qa.loudness.lraMin) {
    failed.push('LOUDNESS_RANGE_LU_BELOW_MIN')
  }
  if (measured.loudnessRangeLu > payload.qa.loudness.lraMax) {
    failed.push('LOUDNESS_RANGE_LU_ABOVE_MAX')
  }
  return failed
}

function policyValid(policy) {
  return policy && canonicalize(policy)
    === canonicalize(STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY)
}

function runtimeProvenanceValid(value) {
  return value && typeof value.ffmpegVersion === 'string' && value.ffmpegVersion.length >= 8
    && HEX64.test(value.ffmpegBuildFingerprint ?? '')
    && HEX64.test(value.libopusEncoderFingerprint ?? '')
}

function measurementValid(payload, measured, requireEncodedArtifact = false) {
  return measured && Number.isFinite(measured.integratedLufs)
    && Number.isFinite(measured.truePeakDbtp)
    && Number.isFinite(measured.loudnessRangeLu)
    && DECIMAL.test(measured.integratedLufsExact ?? '')
    && DECIMAL.test(measured.truePeakDbtpExact ?? '')
    && DECIMAL.test(measured.loudnessRangeLuExact ?? '')
    && Number(measured.integratedLufsExact) === measured.integratedLufs
    && Number(measured.truePeakDbtpExact) === measured.truePeakDbtp
    && Number(measured.loudnessRangeLuExact) === measured.loudnessRangeLu
    && HEX64.test(measured.audioFrameMd5Sha256 ?? '')
    && (!requireEncodedArtifact || HEX64.test(measured.encodedArtifactSha256 ?? ''))
    && (!Array.isArray(measured.failedPredicates)
      || canonicalize(measured.failedPredicates)
        === canonicalize(stage12FailedPredicates(payload, measured)))
}

function parentCandidateValid(payload, candidate, candidatePass) {
  return candidate?.candidatePass === candidatePass
    && HEX64.test(candidate.losslessReferenceSha256 ?? '')
    && Number.isFinite(candidate.integratedTargetLufs)
    && Number.isFinite(candidate.limiterCeilingDbtp)
    && Number.isFinite(candidate.macroDepthDb)
    && Number.isFinite(candidate.codecOvershootDb)
    && measurementValid(payload, candidate)
    && candidate.codecOvershootDb === Math.max(0,
      candidate.truePeakDbtp - candidate.limiterCeilingDbtp)
    && canonicalize(candidate.failedPredicates)
      === canonicalize(stage12FailedPredicates(payload, candidate))
}

function referenceValid(payload, replay) {
  const trace = replay?.parentGuardTrace
  const candidates = trace?.candidates
  const binding = STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PARENT_BINDING
  if (!policyValid(replay?.controllerPolicy)
    || replay?.sourceCorrectedPreMaster?.sha256 !== binding.sourceCorrectedPreMasterSha256
    || replay?.codecSafeTruePeakShadowEvidenceId
      !== binding.codecSafeTruePeakShadowEvidenceId
    || replay?.codecSafeLraGuardShadowEvidenceId
      !== binding.codecSafeLraGuardShadowEvidenceId
    || replay?.sourceAttemptOrdinal !== binding.sourceAttemptOrdinal
    || replay?.sourceCorrectionOrdinal !== binding.sourceCorrectionOrdinal
    || replay?.historicalFailureCorrectionOrdinal
      !== binding.historicalFailureCorrectionOrdinal
    || trace?.shadowOutcome !== 'FAIL'
    || trace?.terminalReason !== binding.parentGuardTerminalReason
    || trace?.selectedCandidatePass !== binding.parentGuardSelectedCandidatePass
    || trace?.bestSafeCandidatePass !== binding.parentGuardSelectedCandidatePass
    || !Array.isArray(candidates)
    || candidates.length !== replay.controllerPolicy.lraMapBudget
    || candidates.some((candidate, index) => !parentCandidateValid(payload, candidate, index))
    || candidates.some((candidate) => candidate.integratedTargetLufs
      !== binding.parentGuardControllerControls.integratedTargetLufs
      || candidate.limiterCeilingDbtp
        !== binding.parentGuardControllerControls.limiterCeilingDbtp
      || candidate.targetStepLufs !== binding.parentGuardControllerControls.targetStepLufs)
    || candidates.some((candidate) => candidate.losslessReferenceSha256
      !== replay.parentLosslessReference?.sha256)) return false
  const selected = candidates[trace.selectedCandidatePass]
  const responseTraceMatches = binding.parentGuardResponseTrace.every((expected, index) => {
    const actual = candidates[index]
    return actual?.candidatePass === expected.candidatePass
      && actual.phase === expected.phase && actual.disposition === expected.disposition
      && actual.macroDepthDb === expected.macroDepthDb
      && actual.integratedLufs === expected.integratedLufs
      && actual.truePeakDbtp === expected.truePeakDbtp
      && actual.loudnessRangeLu === expected.loudnessRangeLu
      && actual.integratedLufsExact === expected.integratedLufsExact
      && actual.truePeakDbtpExact === expected.truePeakDbtpExact
      && actual.loudnessRangeLuExact === expected.loudnessRangeLuExact
  })
  return selected.truePeakDbtp <= payload.qa.loudness.truePeakMaxDbtp
    && selected.loudnessRangeLu < payload.qa.loudness.lraMin
    && trace.lastEvaluatedCandidatePass === binding.parentGuardLastCandidatePass
    && canonicalize(trace.finalMeasurements)
      === canonicalize(binding.parentGuardFinalMeasurements)
    && canonicalize(trace.finalMeasurements) === canonicalize({
      integratedLufs: selected.integratedLufs,
      integratedLufsExact: selected.integratedLufsExact,
      truePeakDbtp: selected.truePeakDbtp,
      truePeakDbtpExact: selected.truePeakDbtpExact,
      loudnessRangeLu: selected.loudnessRangeLu,
      loudnessRangeLuExact: selected.loudnessRangeLuExact,
    })
    && canonicalize(trace.failedPredicates)
      === canonicalize(binding.parentGuardFailedPredicates)
    && canonicalize(trace.failedPredicates) === canonicalize(selected.failedPredicates)
    && responseTraceMatches
}

function thresholdSnapshot(payload) {
  return {
    integratedLufs: payload.qa.loudness.integratedLufs,
    toleranceLufs: payload.qa.loudness.toleranceLufs,
    truePeakMaxDbtp: payload.qa.loudness.truePeakMaxDbtp,
    lraMin: payload.qa.loudness.lraMin,
    lraMax: payload.qa.loudness.lraMax,
    nearStaticMaxSec: payload.qa.nearStaticMaxSec,
    sampleRateHz: payload.render.sampleRateHz,
  }
}

export function stage12CodecSafeLraFeasibilityFingerprints(payload, controllerPolicy) {
  if (!policyValid(controllerPolicy)) {
    throw fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY',
      'Stage 12 codec-safe LRA feasibility policy does not match the sealed policy.')
  }
  const thresholdSnapshotSha256 = sha256(Buffer.from(
    canonicalize(thresholdSnapshot(payload)), 'utf8'))
  const controllerPolicySha256 = sha256(Buffer.from(canonicalize(controllerPolicy), 'utf8'))
  const renderKernelFingerprint = sha256(Buffer.from(canonicalize({
    renderKernelVersion: 'stage12-codec-safe-render-kernel-v1',
    losslessCodec: 'pcm_f32le',
    candidateInput: 'CANONICAL_LOSSLESS_REFERENCE',
    macroDynamics: 'ALTERNATING_HALF_PERIOD_V1',
    loudnormMode: 'TWO_PASS_LINEAR_FALSE_WITH_LIMITER',
    sampleRateHz: payload.render.sampleRateHz,
  }), 'utf8'))
  const algorithmFingerprint = sha256(Buffer.from(canonicalize({
    ...STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ALGORITHM_DESCRIPTOR,
    controllerPolicySha256,
    renderKernelFingerprint,
    thresholdSnapshotSha256,
  }), 'utf8'))
  return { algorithmFingerprint, thresholdSnapshotSha256, controllerPolicySha256,
    renderKernelFingerprint }
}

export function stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
  renderKernelFingerprint, runtimeProvenance,
) {
  return sha256(Buffer.from(canonicalize({ renderKernelFingerprint, runtimeProvenance }),
    'utf8'))
}

export function validateStage12CodecSafeLraFeasibilityContract(payload, imageDigest) {
  const replay = payload?.codecSafeLraFeasibilitySearch
  let fingerprints
  try {
    fingerprints = stage12CodecSafeLraFeasibilityFingerprints(
      payload, replay?.controllerPolicy,
    )
  } catch {
    throw fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENVELOPE',
      'Invalid Stage 12 codec-safe LRA feasibility envelope.')
  }
  if (!replay || replay.schemaVersion !== 1
    || replay.evidenceSemantics !== STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS
    || typeof replay.sourceCorrectionJobId !== 'string'
    || typeof replay.historicalFailureJobId !== 'string'
    || typeof replay.diagnosticReplayJobId !== 'string'
    || !HEX64.test(replay.diagnosticReplayEvidenceId ?? '')
    || typeof replay.codecSafeTruePeakShadowJobId !== 'string'
    || !HEX64.test(replay.codecSafeTruePeakShadowEvidenceId ?? '')
    || typeof replay.codecSafeLraGuardShadowJobId !== 'string'
    || !HEX64.test(replay.codecSafeLraGuardShadowEvidenceId ?? '')
    || !String(replay.sourceCorrectedPreMaster?.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(replay.sourceCorrectedPreMaster?.sha256 ?? '')
    || !Number.isInteger(replay.sourceCorrectedPreMaster?.byteLength)
    || replay.sourceCorrectedPreMaster.byteLength < 1
    || !HEX64.test(replay.sourceCorrectionReceiptSha256 ?? '')
    || !IMAGE_DIGEST.test(replay.parentWorkerImageDigest ?? '')
    || !HEX64.test(replay.parentAlgorithmFingerprint ?? '')
    || !HEX64.test(replay.parentControllerPolicySha256 ?? '')
    || !HEX64.test(replay.parentRenderKernelFingerprint ?? '')
    || replay.parentThresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || replay.parentRenderKernelFingerprint !== fingerprints.renderKernelFingerprint
    || !runtimeProvenanceValid(replay.parentRuntimeProvenance)
    || !replay.parentLosslessReference
    || !HEX64.test(replay.parentLosslessReference.sha256 ?? '')
    || !HEX64.test(replay.parentLosslessReference.audioFrameMd5Sha256 ?? '')
    || !Number.isInteger(replay.parentLosslessReference.byteLength)
    || replay.parentLosslessReference.byteLength < 1
    || replay.parentLosslessReference.codec !== 'pcm_f32le'
    || replay.parentLosslessReference.sampleRateHz !== payload.render.sampleRateHz
    || !referenceValid(payload, replay)
    || !IMAGE_DIGEST.test(replay.expectedWorkerImageDigest ?? '')
    || replay.algorithmFingerprint !== fingerprints.algorithmFingerprint
    || replay.thresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || replay.controllerPolicySha256 !== fingerprints.controllerPolicySha256
    || replay.renderKernelFingerprint !== fingerprints.renderKernelFingerprint
    || replay.parentRenderRuntimeFingerprint
      !== stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
        replay.parentRenderKernelFingerprint, replay.parentRuntimeProvenance)
    || replay.historicalBackfill !== false || replay.uploadCorrectedOutput !== false
    || replay.providerDispatch !== 'OFF' || replay.providerCallCount !== 0
    || replay.calibration !== false || replay.finalize !== false || replay.release !== false
    || replay.productionActivation !== false || replay.autoPublish !== 'OFF') {
    throw fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENVELOPE',
      'Invalid Stage 12 codec-safe LRA feasibility envelope.')
  }
  if (imageDigest !== undefined && replay.expectedWorkerImageDigest !== imageDigest) {
    throw fail('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_WORKER_IMAGE_MISMATCH',
      'LRA feasibility worker image does not match the pin.')
  }
  return payload
}

function round(replay, value) {
  return Number(value.toFixed(replay.controllerPolicy.roundDecimals))
}

function fixedPoint(replay, value) {
  return Math.round(value * (10 ** replay.controllerPolicy.roundDecimals))
}

function phaseLimit(replay, phase) {
  const policy = replay.controllerPolicy
  if (phase === 'LRA_MAP') return policy.lraMapBudget
  if (phase === 'TP_CONTAINMENT') return policy.truePeakContainmentBudget
  if (phase === 'LUFS_TRIM') return policy.lufsTrimBudget
  if (phase === 'POST_TRIM_STABILIZATION') return policy.postTrimStabilizationBudget
  if (phase === 'FINAL_VERIFY') return policy.finalVerifyBudget
  return policy.rollbackVerifyBudget
}

function phaseUsed(candidates, phase) {
  return candidates.filter((candidate) => candidate.phase === phase).length
}

function mapDepth(replay, candidates) {
  const policy = replay.controllerPolicy
  const map = candidates.filter((candidate) => candidate.phase === 'LRA_MAP')
  const scale = 10 ** policy.roundDecimals
  const points = [policy.macroDepthMinDb, ...map.map((candidate) => candidate.macroDepthDb)]
    .map((value) => Math.round(value * scale)).sort((left, right) => left - right)
  let derived
  if (map.length === 0) {
    derived = policy.macroDepthMaxDb
  } else {
    let selectedLeft = points[0]
    let selectedGap = -1
    for (let index = 0; index < points.length - 1; index += 1) {
      const gap = points[index + 1] - points[index]
      if (gap > selectedGap) {
        selectedGap = gap
        selectedLeft = points[index]
      }
    }
    derived = round(replay, (selectedLeft + selectedGap / 2) / scale)
  }
  if (derived !== STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER[map.length]) {
    throw fail('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER_DRIFT',
      'Derived LRA feasibility probe order drifted from the sealed order.')
  }
  return derived
}

function rangeDistance(value, minimum, maximum) {
  return value < minimum ? minimum - value : value > maximum ? value - maximum : 0
}

function lraInteriorMargin(payload, candidate) {
  return Math.min(candidate.loudnessRangeLu - payload.qa.loudness.lraMin,
    payload.qa.loudness.lraMax - candidate.loudnessRangeLu)
}

function seeds(payload, replay, candidates) {
  const rank = (candidate) => ({
    interiorMargin: fixedPoint(replay, lraInteriorMargin(payload, candidate)),
    truePeakExcess: fixedPoint(replay,
      Math.max(0, candidate.truePeakDbtp - payload.qa.loudness.truePeakMaxDbtp)),
    integratedTargetError: fixedPoint(replay,
      Math.abs(candidate.integratedLufs - payload.qa.loudness.integratedLufs)),
    macroDepth: fixedPoint(replay, candidate.macroDepthDb),
  })
  return candidates.filter((candidate) => candidate.phase === 'LRA_MAP'
    && candidate.loudnessRangeLu >= payload.qa.loudness.lraMin
    && candidate.loudnessRangeLu <= payload.qa.loudness.lraMax)
    .sort((left, right) => {
      const leftRank = rank(left)
      const rightRank = rank(right)
      return rightRank.interiorMargin - leftRank.interiorMargin
        || leftRank.truePeakExcess - rightRank.truePeakExcess
        || leftRank.integratedTargetError - rightRank.integratedTargetError
        || leftRank.macroDepth - rightRank.macroDepth
        || left.candidateOrdinal - right.candidateOrdinal
    })
    .slice(0, replay.controllerPolicy.maxSeeds)
}

function integratedInterior(payload, replay, value) {
  const minimum = payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs
    + replay.controllerPolicy.integratedBoundaryMarginLu
  const maximum = payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs
    - replay.controllerPolicy.integratedBoundaryMarginLu
  return value >= minimum && value <= maximum
}

function integratedInteriorDistance(payload, replay, value) {
  const minimum = payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs
    + replay.controllerPolicy.integratedBoundaryMarginLu
  const maximum = payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs
    - replay.controllerPolicy.integratedBoundaryMarginLu
  return rangeDistance(value, minimum, maximum)
}

function candidateBase(plan) {
  return {
    candidateOrdinal: plan.candidateOrdinal,
    phase: plan.phase,
    phaseSlot: plan.phaseSlot,
    seedOrdinal: plan.seedOrdinal,
    seedMapCandidateOrdinal: plan.seedMapCandidateOrdinal,
    parentCandidateOrdinal: plan.parentCandidateOrdinal,
    rollbackToCandidateOrdinal: plan.rollbackToCandidateOrdinal,
    losslessReferenceSha256: plan.losslessReferenceSha256,
    integratedTargetLufs: plan.integratedTargetLufs,
    limiterCeilingDbtp: plan.limiterCeilingDbtp,
    macroDepthDb: plan.macroDepthDb,
    targetStepLufs: plan.targetStepLufs,
    ceilingStepDb: plan.ceilingStepDb,
  }
}

function candidateSequenceShapeValid(replay, candidates) {
  const phaseSlots = new Map(PHASES.map((phase) => [phase, 0]))
  for (const [index, candidate] of candidates.entries()) {
    if (candidate.candidateOrdinal !== index || !PHASES.includes(candidate.phase)
      || candidate.losslessReferenceSha256 !== replay.parentLosslessReference.sha256) return false
    const nextSlot = phaseSlots.get(candidate.phase) + 1
    if (candidate.phaseSlot !== nextSlot || nextSlot > phaseLimit(replay, candidate.phase)) {
      return false
    }
    phaseSlots.set(candidate.phase, nextSlot)
    if (index < replay.controllerPolicy.lraMapBudget) {
      if (candidate.phase !== 'LRA_MAP'
        || candidate.macroDepthDb
          !== STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER[index]) return false
    } else if (candidate.phase === 'LRA_MAP') return false
  }
  return true
}

function planForPhase(payload, replay, candidates, phase, seed, seedOrdinal, parent) {
  const phaseSlot = phaseUsed(candidates, phase) + 1
  const internalTruePeak = payload.qa.loudness.truePeakMaxDbtp
    - replay.controllerPolicy.truePeakInteriorMarginDb
  let targetStepLufs = 0
  let ceilingStepDb = 0
  if (phase === 'TP_CONTAINMENT' || phase === 'POST_TRIM_STABILIZATION') {
    ceilingStepDb = Math.max(0, parent.truePeakDbtp - internalTruePeak)
  } else if (phase === 'LUFS_TRIM') {
    const minimum = payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs
      + replay.controllerPolicy.integratedBoundaryMarginLu
    const maximum = payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs
      - replay.controllerPolicy.integratedBoundaryMarginLu
    const desired = parent.integratedLufs < minimum ? minimum
      : parent.integratedLufs > maximum ? maximum : parent.integratedLufs
    targetStepLufs = Math.max(-replay.controllerPolicy.maxIntegratedTargetStepLu,
      Math.min(replay.controllerPolicy.maxIntegratedTargetStepLu,
        desired - parent.integratedLufs))
  }
  targetStepLufs = round(replay, targetStepLufs)
  ceilingStepDb = round(replay, ceilingStepDb)
  return {
    done: false, candidateOrdinal: candidates.length, phase, phaseSlot, seedOrdinal,
    seedMapCandidateOrdinal: seed.candidateOrdinal,
    parentCandidateOrdinal: parent.candidateOrdinal,
    rollbackToCandidateOrdinal: null,
    losslessReferenceSha256: replay.parentLosslessReference.sha256,
    integratedTargetLufs: round(replay, parent.integratedTargetLufs + targetStepLufs),
    limiterCeilingDbtp: round(replay, parent.limiterCeilingDbtp - ceilingStepDb),
    macroDepthDb: parent.macroDepthDb, targetStepLufs, ceilingStepDb,
    comparison: parent,
  }
}

function nextSeedPhase(payload, replay, candidates, seed, seedOrdinal) {
  const chain = candidates.filter((candidate) => candidate.seedOrdinal === seedOrdinal)
  const last = chain.at(-1)
  if (last && (last.disposition.startsWith('SEED_REJECTED_')
    || last.disposition === 'FINAL_FAIL')) return null
  const parent = last ?? seed
  const internalTruePeak = payload.qa.loudness.truePeakMaxDbtp
    - replay.controllerPolicy.truePeakInteriorMarginDb
  let phase
  if (!last) {
    phase = parent.truePeakDbtp > internalTruePeak ? 'TP_CONTAINMENT'
      : integratedInterior(payload, replay, parent.integratedLufs)
        ? 'POST_TRIM_STABILIZATION' : 'LUFS_TRIM'
  } else if (last.disposition === 'TP_IMPROVING') {
    phase = 'TP_CONTAINMENT'
  } else if (last.disposition === 'TP_CONTAINED') {
    phase = integratedInterior(payload, replay, parent.integratedLufs)
      ? 'POST_TRIM_STABILIZATION' : 'LUFS_TRIM'
  } else if (last.disposition === 'LUFS_TRIM_ACCEPTED') {
    phase = 'LUFS_TRIM'
  } else if (last.disposition === 'LUFS_TRIM_COMPLETE') {
    phase = 'POST_TRIM_STABILIZATION'
  } else if (last.disposition === 'TP_STABILIZING') {
    phase = 'POST_TRIM_STABILIZATION'
  } else if (last.disposition === 'STABILIZATION_CONFIRMED') {
    phase = 'FINAL_VERIFY'
  } else {
    return null
  }
  if (phaseUsed(candidates, phase) >= phaseLimit(replay, phase)) return null
  return planForPhase(payload, replay, candidates, phase, seed, seedOrdinal, parent)
}

function rollbackPlan(replay, candidates) {
  if (phaseUsed(candidates, 'ROLLBACK_VERIFY') >= phaseLimit(replay, 'ROLLBACK_VERIFY')) {
    throw fail('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TRACE_INCOMPLETE',
      'Stage 12 feasibility rollback budget is exhausted without a terminal candidate.')
  }
  const safe = replay.parentGuardTrace.candidates[replay.parentGuardTrace.selectedCandidatePass]
  return {
    done: false, candidateOrdinal: candidates.length, phase: 'ROLLBACK_VERIFY',
    phaseSlot: phaseUsed(candidates, 'ROLLBACK_VERIFY') + 1,
    seedOrdinal: null, seedMapCandidateOrdinal: null, parentCandidateOrdinal: null,
    rollbackToCandidateOrdinal: null,
    losslessReferenceSha256: replay.parentLosslessReference.sha256,
    integratedTargetLufs: safe.integratedTargetLufs,
    limiterCeilingDbtp: safe.limiterCeilingDbtp,
    macroDepthDb: safe.macroDepthDb, targetStepLufs: 0, ceilingStepDb: 0,
    comparison: safe,
  }
}

export function planStage12CodecSafeLraFeasibilityCandidate(payload, replay, candidates) {
  if (!referenceValid(payload, replay) || !Array.isArray(candidates)
    || !candidateSequenceShapeValid(replay, candidates)) {
    throw fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_CONTROLLER',
      'Invalid Stage 12 LRA feasibility planner input.')
  }
  const last = candidates.at(-1)
  if (last?.disposition === 'FINAL_PASS' || last?.phase === 'ROLLBACK_VERIFY') {
    return { done: true, ...finalizeStage12CodecSafeLraFeasibilityTrace(
      payload, replay, candidates) }
  }
  const mapUsed = phaseUsed(candidates, 'LRA_MAP')
  if (mapUsed < replay.controllerPolicy.lraMapBudget) {
    const safe = replay.parentGuardTrace.candidates[replay.parentGuardTrace.selectedCandidatePass]
    return {
      done: false, candidateOrdinal: candidates.length, phase: 'LRA_MAP',
      phaseSlot: mapUsed + 1, seedOrdinal: null, seedMapCandidateOrdinal: null,
      parentCandidateOrdinal: null, rollbackToCandidateOrdinal: null,
      losslessReferenceSha256: replay.parentLosslessReference.sha256,
      integratedTargetLufs: payload.qa.loudness.integratedLufs,
      limiterCeilingDbtp: safe.limiterCeilingDbtp,
      macroDepthDb: mapDepth(replay, candidates), targetStepLufs: 0, ceilingStepDb: 0,
      comparison: null,
    }
  }
  const rankedSeeds = seeds(payload, replay, candidates)
  for (let seedOrdinal = 0; seedOrdinal < rankedSeeds.length; seedOrdinal += 1) {
    const plan = nextSeedPhase(payload, replay, candidates, rankedSeeds[seedOrdinal], seedOrdinal)
    if (plan) return plan
  }
  return rollbackPlan(replay, candidates)
}

function sameSignalReproduction(left, right) {
  return left.integratedTargetLufs === right.integratedTargetLufs
    && left.limiterCeilingDbtp === right.limiterCeilingDbtp
    && left.macroDepthDb === right.macroDepthDb
    && left.integratedLufsExact === right.integratedLufsExact
    && left.truePeakDbtpExact === right.truePeakDbtpExact
    && left.loudnessRangeLuExact === right.loudnessRangeLuExact
    && left.audioFrameMd5Sha256 === right.audioFrameMd5Sha256
}

function sameFinalArtifact(left, right) {
  return sameSignalReproduction(left, right)
    && left.encodedArtifactSha256 === right.encodedArtifactSha256
}

export function classifyStage12CodecSafeLraFeasibilityCandidate(
  payload, replay, plan, measured,
) {
  if (plan?.done !== false || !referenceValid(payload, replay)
    || !measurementValid(payload, measured, true)) {
    throw fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_MEASUREMENT',
      'Invalid Stage 12 LRA feasibility measurement.')
  }
  const failedPredicates = stage12FailedPredicates(payload, measured)
  const internalTruePeak = payload.qa.loudness.truePeakMaxDbtp
    - replay.controllerPolicy.truePeakInteriorMarginDb
  const comparison = plan.comparison
  let disposition
  if (plan.phase === 'LRA_MAP') {
    disposition = measured.loudnessRangeLu < payload.qa.loudness.lraMin
      ? 'LRA_BELOW_MIN' : measured.loudnessRangeLu > payload.qa.loudness.lraMax
        ? 'LRA_ABOVE_MAX' : measured.truePeakDbtp <= payload.qa.loudness.truePeakMaxDbtp
          ? 'LRA_FEASIBLE_TP_SAFE' : 'LRA_FEASIBLE_TP_UNCONTAINED'
  } else if (plan.phase === 'TP_CONTAINMENT') {
    disposition = measured.loudnessRangeLu < payload.qa.loudness.lraMin
      || measured.loudnessRangeLu > payload.qa.loudness.lraMax
      ? 'SEED_REJECTED_LRA_REGRESSION' : measured.truePeakDbtp <= internalTruePeak
        ? 'TP_CONTAINED' : measured.truePeakDbtp < comparison.truePeakDbtp
          ? 'TP_IMPROVING' : 'SEED_REJECTED_NON_IMPROVING'
  } else if (plan.phase === 'LUFS_TRIM') {
    const regressed = measured.loudnessRangeLu < payload.qa.loudness.lraMin
      || measured.loudnessRangeLu > payload.qa.loudness.lraMax
      || integratedInteriorDistance(payload, replay, measured.integratedLufs)
        >= integratedInteriorDistance(payload, replay, comparison.integratedLufs)
    disposition = regressed ? 'SEED_REJECTED_TRIM_REGRESSION'
      : integratedInterior(payload, replay, measured.integratedLufs)
        ? 'LUFS_TRIM_COMPLETE' : 'LUFS_TRIM_ACCEPTED'
  } else if (plan.phase === 'POST_TRIM_STABILIZATION') {
    const regression = measured.loudnessRangeLu < payload.qa.loudness.lraMin
      || measured.loudnessRangeLu > payload.qa.loudness.lraMax
      || !integratedInterior(payload, replay, measured.integratedLufs)
    disposition = regression ? 'SEED_REJECTED_STABILIZATION_REGRESSION'
      : plan.ceilingStepDb > 0 && measured.truePeakDbtp < comparison.truePeakDbtp
        ? measured.truePeakDbtp <= internalTruePeak
          ? 'STABILIZATION_CONFIRMED' : 'TP_STABILIZING'
        : plan.ceilingStepDb === 0 && measured.truePeakDbtp <= internalTruePeak
          && sameSignalReproduction({ ...plan, ...measured }, comparison)
          ? 'STABILIZATION_CONFIRMED' : 'SEED_REJECTED_STABILIZATION_REGRESSION'
  } else if (plan.phase === 'FINAL_VERIFY') {
    disposition = failedPredicates.length === 0
      && sameFinalArtifact({ ...plan, ...measured }, comparison) ? 'FINAL_PASS' : 'FINAL_FAIL'
  } else {
    disposition = sameSignalReproduction({ ...plan, ...measured }, comparison)
      ? 'ROLLBACK_SAFE' : 'ROLLBACK_DRIFT'
  }
  return {
    ...candidateBase(plan), disposition,
    codecOvershootDb: Math.max(0, measured.truePeakDbtp - plan.limiterCeilingDbtp),
    integratedLufs: measured.integratedLufs,
    integratedLufsExact: measured.integratedLufsExact,
    truePeakDbtp: measured.truePeakDbtp,
    truePeakDbtpExact: measured.truePeakDbtpExact,
    loudnessRangeLu: measured.loudnessRangeLu,
    loudnessRangeLuExact: measured.loudnessRangeLuExact,
    failedPredicates,
    encodedArtifactSha256: measured.encodedArtifactSha256,
    audioFrameMd5Sha256: measured.audioFrameMd5Sha256,
  }
}

function budgetLedger(replay, candidates) {
  const ledger = {}
  let totalLimit = 0
  let totalUsed = 0
  for (const phase of PHASES) {
    const limit = phaseLimit(replay, phase)
    const used = phaseUsed(candidates, phase)
    ledger[phase] = { limit, used, remaining: limit - used }
    totalLimit += limit
    totalUsed += used
  }
  ledger.TOTAL = { limit: totalLimit, used: totalUsed, remaining: totalLimit - totalUsed }
  return ledger
}

function safeRollback(replay, verificationCandidateOrdinal) {
  const safe = replay.parentGuardTrace.candidates[replay.parentGuardTrace.selectedCandidatePass]
  return {
    parentCandidatePass: safe.candidatePass,
    losslessReferenceSha256: safe.losslessReferenceSha256,
    integratedTargetLufs: safe.integratedTargetLufs,
    limiterCeilingDbtp: safe.limiterCeilingDbtp,
    macroDepthDb: safe.macroDepthDb,
    integratedLufs: safe.integratedLufs,
    integratedLufsExact: safe.integratedLufsExact,
    truePeakDbtp: safe.truePeakDbtp,
    truePeakDbtpExact: safe.truePeakDbtpExact,
    loudnessRangeLu: safe.loudnessRangeLu,
    loudnessRangeLuExact: safe.loudnessRangeLuExact,
    audioFrameMd5Sha256: safe.audioFrameMd5Sha256,
    verificationCandidateOrdinal,
  }
}

export function finalizeStage12CodecSafeLraFeasibilityTrace(payload, replay, candidates) {
  if (!referenceValid(payload, replay) || !Array.isArray(candidates)
    || candidates.length < 1 || !candidateSequenceShapeValid(replay, candidates)) {
    throw fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TRACE',
      'Invalid Stage 12 LRA feasibility trace.')
  }
  const last = candidates.at(-1)
  if (last.disposition !== 'FINAL_PASS' && last.phase !== 'ROLLBACK_VERIFY') {
    throw fail('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_TRACE_INCOMPLETE',
      'Stage 12 LRA feasibility trace is not terminal.')
  }
  const passed = last.disposition === 'FINAL_PASS'
  const rollbackDrift = last.disposition === 'ROLLBACK_DRIFT'
  const finalFailed = candidates.some((candidate) => candidate.disposition === 'FINAL_FAIL')
  const terminalReason = passed ? 'PASS' : rollbackDrift
    ? 'SAFE_ROLLBACK_REPRODUCTION_DRIFT' : finalFailed
      ? 'FINAL_SAME_ARTIFACT_VERIFICATION_FAILED'
      : 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED'
  return {
    shadowOutcome: passed ? 'PASS' : 'FAIL',
    terminalReason,
    lastEvaluatedCandidateOrdinal: last.candidateOrdinal,
    selectedSeedOrdinal: passed ? last.seedOrdinal : null,
    selectedCandidateOrdinal: passed ? last.parentCandidateOrdinal : last.candidateOrdinal,
    verifiedCandidateOrdinal: passed ? last.parentCandidateOrdinal : null,
    budgetLedger: budgetLedger(replay, candidates),
    safeRollback: safeRollback(replay,
      last.phase === 'ROLLBACK_VERIFY' ? last.candidateOrdinal : null),
    finalMeasurements: {
      integratedLufs: last.integratedLufs,
      integratedLufsExact: last.integratedLufsExact,
      truePeakDbtp: last.truePeakDbtp,
      truePeakDbtpExact: last.truePeakDbtpExact,
      loudnessRangeLu: last.loudnessRangeLu,
      loudnessRangeLuExact: last.loudnessRangeLuExact,
    },
    failedPredicates: last.failedPredicates,
  }
}

export function buildStage12CodecSafeLraFeasibilityEvidence(payload, evidence) {
  const suppliedReplay = evidence?.replay
  const replay = payload?.codecSafeLraFeasibilitySearch
  const candidates = evidence?.candidates
  const invalid = () => fail('INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE',
    'Invalid Stage 12 codec-safe LRA feasibility evidence.')
  try {
    validateStage12CodecSafeLraFeasibilityContract(payload, evidence?.workerImageDigest)
  } catch {
    throw invalid()
  }
  try {
    if (canonicalize(suppliedReplay) !== canonicalize(replay)) throw invalid()
  } catch {
    throw invalid()
  }
  let fingerprints
  try {
    fingerprints = stage12CodecSafeLraFeasibilityFingerprints(
      payload, replay?.controllerPolicy)
  } catch {
    throw invalid()
  }
  if (evidence?.evidenceSemantics !== STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE_SEMANTICS
    || !referenceValid(payload, replay)
    || evidence?.source?.correctionOrdinal !== replay.sourceCorrectionOrdinal
    || evidence.source.correctionJobId !== replay.sourceCorrectionJobId
    || evidence.source.r2Key !== replay.sourceCorrectedPreMaster.r2Key
    || evidence.source.sha256 !== replay.sourceCorrectedPreMaster.sha256
    || evidence.source.byteLength !== replay.sourceCorrectedPreMaster.byteLength
    || evidence.source.receiptSha256 !== replay.sourceCorrectionReceiptSha256
    || evidence?.historicalFailure?.correctionOrdinal
      !== replay.historicalFailureCorrectionOrdinal
    || evidence.historicalFailure.correctionJobId !== replay.historicalFailureJobId
    || evidence.historicalFailure.errorCode !== 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
    || evidence?.diagnosticReplay?.jobId !== replay.diagnosticReplayJobId
    || evidence.diagnosticReplay.evidenceId !== replay.diagnosticReplayEvidenceId
    || evidence?.parentTruePeakShadow?.jobId !== replay.codecSafeTruePeakShadowJobId
    || evidence.parentTruePeakShadow.evidenceId
      !== replay.codecSafeTruePeakShadowEvidenceId
    || evidence?.parentLraGuard?.jobId !== replay.codecSafeLraGuardShadowJobId
    || evidence.parentLraGuard.evidenceId !== replay.codecSafeLraGuardShadowEvidenceId
    || canonicalize(evidence.parentGuardTrace) !== canonicalize(replay.parentGuardTrace)
    || !evidence.losslessReference
    || canonicalize(evidence.losslessReference)
      !== canonicalize(replay.parentLosslessReference)
    || !Array.isArray(candidates) || candidates.length < 1
    || candidates.length > PHASES.reduce((total, phase) =>
      total + phaseLimit(replay, phase), 0)
    || !IMAGE_DIGEST.test(evidence.workerImageDigest ?? '')
    || evidence.workerImageDigest !== replay.expectedWorkerImageDigest
    || evidence.expectedWorkerImageDigest !== replay.expectedWorkerImageDigest
    || evidence.algorithmFingerprint !== replay.algorithmFingerprint
    || evidence.algorithmFingerprint !== fingerprints.algorithmFingerprint
    || evidence.thresholdSnapshotSha256 !== replay.thresholdSnapshotSha256
    || evidence.thresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || evidence.controllerPolicySha256 !== replay.controllerPolicySha256
    || evidence.controllerPolicySha256 !== fingerprints.controllerPolicySha256
    || evidence.renderKernelFingerprint !== replay.renderKernelFingerprint
    || evidence.renderKernelFingerprint !== fingerprints.renderKernelFingerprint
    || !runtimeProvenanceValid(evidence.runtimeProvenance)
    || canonicalize(evidence.runtimeProvenance)
      !== canonicalize(replay.parentRuntimeProvenance)
    || evidence.renderRuntimeFingerprint
      !== stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
        evidence.renderKernelFingerprint, evidence.runtimeProvenance)) throw invalid()
  const accepted = []
  for (const candidate of candidates) {
    let plan
    try {
      plan = planStage12CodecSafeLraFeasibilityCandidate(payload, replay, accepted)
    } catch {
      throw invalid()
    }
    if (plan.done || candidate.candidateOrdinal !== plan.candidateOrdinal) throw invalid()
    let expected
    try {
      expected = classifyStage12CodecSafeLraFeasibilityCandidate(payload, replay, plan, candidate)
    } catch {
      throw invalid()
    }
    if (canonicalize(expected) !== canonicalize(candidate)) throw invalid()
    accepted.push(candidate)
  }
  let terminal
  try {
    terminal = finalizeStage12CodecSafeLraFeasibilityTrace(payload, replay, accepted)
  } catch {
    throw invalid()
  }
  return {
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: evidence.evidenceSemantics,
    boundary: 'POST_OPUS_LRA_FEASIBILITY_SEARCH',
    source: evidence.source,
    historicalFailure: evidence.historicalFailure,
    diagnosticReplay: evidence.diagnosticReplay,
    parentTruePeakShadow: evidence.parentTruePeakShadow,
    parentLraGuard: evidence.parentLraGuard,
    losslessReference: evidence.losslessReference,
    parentGuardTrace: replay.parentGuardTrace,
    controllerPolicy: replay.controllerPolicy,
    candidates: accepted,
    ...terminal,
    workerImageDigest: evidence.workerImageDigest,
    expectedWorkerImageDigest: evidence.expectedWorkerImageDigest,
    parentWorkerImageDigest: replay.parentWorkerImageDigest,
    algorithmFingerprint: evidence.algorithmFingerprint,
    thresholdSnapshotSha256: evidence.thresholdSnapshotSha256,
    controllerPolicySha256: evidence.controllerPolicySha256,
    renderKernelFingerprint: evidence.renderKernelFingerprint,
    parentRenderKernelFingerprint: replay.parentRenderKernelFingerprint,
    parentRenderRuntimeFingerprint: replay.parentRenderRuntimeFingerprint,
    renderRuntimeFingerprint: evidence.renderRuntimeFingerprint,
    parentRuntimeProvenance: replay.parentRuntimeProvenance,
    runtimeProvenance: evidence.runtimeProvenance,
    correctedOutputUploaded: false,
    historicalBackfill: false,
    providerCallCount: 0,
    providerDispatch: 'OFF',
    calibration: false,
    finalize: false,
    releaseEligible: false,
    productionActivation: false,
    autoPublish: 'OFF',
  }
}
