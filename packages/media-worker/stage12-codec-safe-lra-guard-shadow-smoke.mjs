import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  executeStage12CodecSafeLraGuardShadowReplay,
  executeStage12CodecSafeTruePeakShadowReplay,
  stage12CodecSafeLraGuardFingerprints,
  stage12CodecSafeTruePeakFingerprints,
} from './stage12-runtime.mjs'

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stderr = []
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(Buffer.concat(stderr).toString('utf8').slice(-4000))))
  })
}

function canonicalize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(value[key])}`).join(',')}}`
}

const hash = (value) => createHash('sha256').update(value).digest('hex')
const root = await mkdtemp(join(tmpdir(), 'factory-stage12-codec-safe-lra-guard-smoke-'))
const originalFetch = globalThis.fetch
try {
  const sourcePath = join(root, 'ordinal-2-source.webm')
  const durationSec = 24
  await run(['-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=640x360:r=30:d=${durationSec}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${durationSec}`,
    '-af', 'volume=0.35',
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-c:a', 'libopus', '-ar', '48000',
    sourcePath], root)
  const sourceBytes = await readFile(sourcePath)
  const sourceSha256 = hash(sourceBytes)
  const imageDigest = `sha256:${'8'.repeat(64)}`
  const payload = {
    schemaVersion: 1,
    idempotencyKey: hash('codec-safe-lra-guard-parent-smoke'),
    packageId: 'package-smoke',
    stageInstanceId: 'stage12-smoke',
    durationSec,
    narration: { r2Key: 'prod/narration.mp3', sha256: hash('narration') },
    render: { width: 640, height: 360, fps: 30, sampleRateHz: 48000 },
    timeline: { expectedFrames: durationSec * 30, shots: [{ startFrame: 0,
      endFrame: durationSec * 30, headline: 'Codec-safe LRA guard shadow',
      background: '#071816', accent: '#71f6c5', signal: '#ffb84d' }] },
    qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
    controls: { providerDispatch: 'OFF', providerCallCount: 0, autoPublish: 'OFF' },
    objectAccess: { url: 'https://factory.invalid/codec-safe-source',
      token: hash('object-token') },
    callback: { url: 'https://factory.invalid/codec-safe-callback',
      token: hash('callback-token') },
  }
  const parentFingerprints = stage12CodecSafeTruePeakFingerprints(payload, 3)
  payload.codecSafeShadowReplay = {
    schemaVersion: 1,
    evidenceSemantics: 'CODEC_SAFE_SHADOW_NOT_CORRECTION',
    sourceAttemptOrdinal: 3,
    sourceCorrectionOrdinal: 2,
    historicalFailureCorrectionOrdinal: 3,
    correctionPassLimit: 3,
    sourceCorrectionJobId: 'correction-2',
    historicalFailureJobId: 'correction-3',
    diagnosticReplayJobId: 'diagnostic-replay-1',
    diagnosticReplayEvidenceId: hash('diagnostic-replay-evidence'),
    sourceCorrectedPreMaster: { r2Key: `prod/audio-p0/${sourceSha256}.webm`,
      sha256: sourceSha256, byteLength: sourceBytes.byteLength },
    sourceCorrectionReceiptSha256: hash('ordinal-2-receipt'),
    expectedWorkerImageDigest: imageDigest,
    ...parentFingerprints,
    historicalBackfill: false,
    uploadCorrectedOutput: false,
    providerDispatch: 'OFF',
    providerCallCount: 0,
    calibration: false,
    finalize: false,
    release: false,
    productionActivation: false,
    autoPublish: 'OFF',
  }
  let sourceReads = 0
  let writes = 0
  globalThis.fetch = async (_url, options = {}) => {
    if ((options.method ?? 'GET') !== 'GET') {
      writes += 1
      return new Response(null, { status: 405 })
    }
    sourceReads += 1
    return new Response(sourceBytes, { status: 200,
      headers: { 'content-type': 'video/webm' } })
  }
  const parent = await executeStage12CodecSafeTruePeakShadowReplay(payload, imageDigest)
  const anchorReference = parent.candidates.find((candidate) => candidate.candidatePass === 1)
  if (!anchorReference || anchorReference.truePeakDbtp > -1
    || anchorReference.loudnessRangeLu >= 4) {
    throw new Error(`Smoke parent did not expose a true-peak-safe low-LRA anchor: ${JSON.stringify(parent)}`)
  }
  const highBracketReference = {
    ...anchorReference,
    candidatePass: 3,
    macroDepthDb: Math.max(14, anchorReference.macroDepthDb + 1),
    codecOvershootDb: Math.max(0, 4.22 - anchorReference.limiterCeilingDbtp),
    integratedLufs: -14.94,
    integratedLufsExact: '-14.94',
    truePeakDbtp: 4.22,
    truePeakDbtpExact: '4.22',
    loudnessRangeLu: 14.4,
    loudnessRangeLuExact: '14.40',
    failedPredicates: ['TRUE_PEAK_DBTP_ABOVE_MAX', 'LOUDNESS_RANGE_LU_ABOVE_MAX'],
    audioFrameMd5Sha256: hash('synthetic-high-bracket-frame'),
  }
  const controllerPolicy = { maxCandidateCount: 8,
    codecOvershootRegressionMaxDb: 0.25,
    integratedBoundaryMarginLu: 0.05,
    maxIntegratedTargetStepLu: 0.25 }
  const guardFingerprints = stage12CodecSafeLraGuardFingerprints(payload, controllerPolicy)
  if (parent.thresholdSnapshotSha256 !== guardFingerprints.thresholdSnapshotSha256) {
    throw new Error('Stage 12 LRA guard threshold snapshot drifted from the parent shadow.')
  }
  const parentRenderRuntimeFingerprint = hash(canonicalize({
    renderKernelFingerprint: guardFingerprints.renderKernelFingerprint,
    runtimeProvenance: parent.runtimeProvenance,
  }))
  payload.idempotencyKey = hash('codec-safe-lra-guard-smoke')
  payload.codecSafeLraGuardShadowReplay = {
    schemaVersion: 1,
    evidenceSemantics: 'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION',
    sourceAttemptOrdinal: 3,
    sourceCorrectionOrdinal: 2,
    historicalFailureCorrectionOrdinal: 3,
    sourceCorrectionJobId: parent.source.correctionJobId,
    historicalFailureJobId: parent.historicalFailure.correctionJobId,
    diagnosticReplayJobId: parent.diagnosticReplay.jobId,
    diagnosticReplayEvidenceId: parent.diagnosticReplay.evidenceId,
    codecSafeTruePeakShadowJobId: 'codec-safe-parent-job',
    codecSafeTruePeakShadowEvidenceId: hash('codec-safe-parent-evidence'),
    sourceCorrectedPreMaster: { r2Key: parent.source.r2Key,
      sha256: parent.source.sha256, byteLength: parent.source.byteLength },
    sourceCorrectionReceiptSha256: parent.source.receiptSha256,
    parentWorkerImageDigest: parent.workerImageDigest,
    parentAlgorithmFingerprint: parent.algorithmFingerprint,
    parentThresholdSnapshotSha256: parent.thresholdSnapshotSha256,
    parentLosslessReference: parent.losslessReference,
    parentRuntimeProvenance: parent.runtimeProvenance,
    anchorReference,
    highBracketReference,
    controllerPolicy,
    expectedWorkerImageDigest: imageDigest,
    ...guardFingerprints,
    parentRenderRuntimeFingerprint,
    historicalBackfill: false,
    uploadCorrectedOutput: false,
    providerDispatch: 'OFF',
    providerCallCount: 0,
    calibration: false,
    finalize: false,
    release: false,
    productionActivation: false,
    autoPublish: 'OFF',
  }
  const result = await executeStage12CodecSafeLraGuardShadowReplay(payload, imageDigest)
  if (sourceReads !== 2 || writes !== 0 || result.shadowOutcome !== 'PASS'
    || result.terminalReason !== 'PASS' || result.failedPredicates.length !== 0
    || result.candidates[0].disposition !== 'SAFE_ANCHOR'
    || result.candidates[0].audioFrameMd5Sha256 !== anchorReference.audioFrameMd5Sha256
    || result.correctedOutputUploaded !== false || result.historicalBackfill !== false
    || result.productionActivation !== false || result.providerCallCount !== 0
    || result.providerDispatch !== 'OFF' || result.autoPublish !== 'OFF'
    || result.source.sha256 !== sourceSha256 || result.workerImageDigest !== imageDigest
    || result.parentWorkerImageDigest !== parent.workerImageDigest
    || result.parentRenderRuntimeFingerprint !== parentRenderRuntimeFingerprint
    || result.renderRuntimeFingerprint !== parentRenderRuntimeFingerprint
    || canonicalize(result.runtimeProvenance) !== canonicalize(parent.runtimeProvenance)
    || result.candidates.length > controllerPolicy.maxCandidateCount
    || result.candidates.some((candidate, index) => candidate.candidatePass !== index
      || candidate.losslessReferenceSha256 !== result.losslessReference.sha256
      || Math.abs(candidate.targetStepLufs) > controllerPolicy.maxIntegratedTargetStepLu)
    || result.finalMeasurements.truePeakDbtp > -1
    || result.finalMeasurements.integratedLufs < -15
    || result.finalMeasurements.integratedLufs > -13
    || result.finalMeasurements.loudnessRangeLu < 4
    || result.finalMeasurements.loudnessRangeLu > 8
    || ('preMaster' in result)) {
    throw new Error(`Stage 12 codec-safe LRA guard shadow smoke failed: ${JSON.stringify(result)}`)
  }
  process.stdout.write('STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_SMOKE_PASS\n')
} finally {
  globalThis.fetch = originalFetch
  await rm(root, { recursive: true, force: true })
}
