import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeStage12CodecSafeTruePeakShadowReplay,
  stage12CodecSafeTruePeakFingerprints } from './stage12-runtime.mjs'

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

const hash = (value) => createHash('sha256').update(value).digest('hex')
const root = await mkdtemp(join(tmpdir(), 'factory-stage12-codec-safe-shadow-smoke-'))
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
    idempotencyKey: hash('codec-safe-true-peak-shadow-smoke'),
    packageId: 'package-smoke',
    stageInstanceId: 'stage12-smoke',
    durationSec,
    narration: { r2Key: 'prod/narration.mp3', sha256: hash('narration') },
    render: { width: 640, height: 360, fps: 30, sampleRateHz: 48000 },
    timeline: { expectedFrames: durationSec * 30, shots: [{ startFrame: 0,
      endFrame: durationSec * 30, headline: 'Codec-safe true peak shadow',
      background: '#071816', accent: '#71f6c5', signal: '#ffb84d' }] },
    qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
    controls: { providerDispatch: 'OFF', providerCallCount: 0, autoPublish: 'OFF' },
    objectAccess: { url: 'https://factory.invalid/codec-safe-shadow-source',
      token: hash('object-token') },
    callback: { url: 'https://factory.invalid/codec-safe-shadow-callback',
      token: hash('callback-token') },
  }
  const fingerprints = stage12CodecSafeTruePeakFingerprints(payload, 3)
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
    ...fingerprints,
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
  const result = await executeStage12CodecSafeTruePeakShadowReplay(payload, imageDigest)
  if (sourceReads !== 1 || writes !== 0 || result.shadowOutcome !== 'PASS'
    || result.failedPredicates.length !== 0 || result.correctedOutputUploaded !== false
    || result.historicalBackfill !== false || result.productionActivation !== false
    || result.providerCallCount !== 0 || result.providerDispatch !== 'OFF'
    || result.autoPublish !== 'OFF' || result.source.sha256 !== sourceSha256
    || result.workerImageDigest !== imageDigest || result.expectedWorkerImageDigest !== imageDigest
    || result.algorithmFingerprint !== fingerprints.algorithmFingerprint
    || result.thresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || result.losslessReference.codec !== 'pcm_f32le'
    || result.losslessReference.sampleRateHz !== 48000
    || !result.candidates.every((candidate, index) => candidate.candidatePass === index
      && candidate.losslessReferenceSha256 === result.losslessReference.sha256
      && Number(candidate.integratedLufsExact) === candidate.integratedLufs
      && Number(candidate.truePeakDbtpExact) === candidate.truePeakDbtp
      && Number(candidate.loudnessRangeLuExact) === candidate.loudnessRangeLu)
    || result.finalMeasurements.truePeakDbtp > -1
    || result.finalMeasurements.integratedLufs < -15
    || result.finalMeasurements.integratedLufs > -13
    || result.finalMeasurements.loudnessRangeLu < 4
    || result.finalMeasurements.loudnessRangeLu > 8
    || result.candidates.some((candidate, index) => index > 0
      && candidate.limiterCeilingDbtp > result.candidates[index - 1].limiterCeilingDbtp)
    || !/^[a-f0-9]{64}$/u.test(result.runtimeProvenance.ffmpegBuildFingerprint)
    || !/^[a-f0-9]{64}$/u.test(result.runtimeProvenance.libopusEncoderFingerprint)
    || ('preMaster' in result)) {
    throw new Error(`Stage 12 codec-safe true-peak shadow smoke failed: ${JSON.stringify(result)}`)
  }
  process.stdout.write('STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_SMOKE_PASS\n')
} finally {
  globalThis.fetch = originalFetch
  await rm(root, { recursive: true, force: true })
}
