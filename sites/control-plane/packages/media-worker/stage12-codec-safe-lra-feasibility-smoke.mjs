import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY,
  STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER,
} from '../contracts/src/stage12-codec-safe-lra-feasibility-policy.mjs'
import {
  measureStage12EncodedLoudness,
  renderStage12CodecSafeCandidate,
  stage12AudioFrameMd5Sha256,
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

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function controlsEqualExcept(left, right, changedKey) {
  return Object.keys(left).every((key) => key === 'phase' || key === changedKey
    || left[key] === right[key]) && left[changedKey] !== right[changedKey]
}

const root = await mkdtemp(join(tmpdir(), 'factory-stage12-lra-feasibility-smoke-'))
const originalFetch = globalThis.fetch
let networkCalls = 0
globalThis.fetch = async () => {
  networkCalls += 1
  throw new Error('Network access is forbidden in the LRA feasibility smoke.')
}

try {
  if (JSON.stringify(STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PROBE_ORDER)
    !== JSON.stringify([14, 12.45, 11.675, 13.225, 11.2875, 12.0625, 12.8375,
      13.6125])) {
    throw new Error('Sealed LRA lattice probe order drifted.')
  }
  const payload = {
    qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
    render: { sampleRateHz: 48_000 },
  }
  const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
  const sourcePath = join(root, 'immutable-lossless-reference.wav')
  await run(['-hide_banner', '-nostdin', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=48000:duration=30',
    '-af', "volume='if(lt(mod(t\\,2)\\,1)\\,0.2\\,0.8)':eval=frame",
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
    '-c:a', 'pcm_f32le', sourcePath], root)
  const immutableSourceSha256 = hash(await readFile(sourcePath))
  const phaseControls = [
    { phase: 'LRA_MAP', macroDepthDb: 14, integratedTargetLufs: -14,
      limiterCeilingDbtp: -2.67 },
    { phase: 'TP_CONTAINMENT', macroDepthDb: 14, integratedTargetLufs: -14,
      limiterCeilingDbtp: -2.92 },
    { phase: 'LUFS_TRIM', macroDepthDb: 14, integratedTargetLufs: -13.75,
      limiterCeilingDbtp: -2.92 },
    { phase: 'POST_TRIM_STABILIZATION', macroDepthDb: 14,
      integratedTargetLufs: -13.75, limiterCeilingDbtp: -3.17 },
  ]
  if (JSON.stringify(phaseControls.map(({ phase }) => phase))
    !== JSON.stringify(STAGE12_CODEC_SAFE_LRA_FEASIBILITY_PHASES.slice(0, 4))
    || !controlsEqualExcept(phaseControls[0], phaseControls[1], 'limiterCeilingDbtp')
    || !controlsEqualExcept(phaseControls[1], phaseControls[2], 'integratedTargetLufs')
    || !controlsEqualExcept(phaseControls[2], phaseControls[3], 'limiterCeilingDbtp')) {
    throw new Error('Feasibility phase controls are not isolated.')
  }
  const rendered = []
  for (const controls of phaseControls) {
    const candidatePath = join(root, `${controls.phase.toLowerCase()}.webm`)
    await renderStage12CodecSafeCandidate(payload, sourcePath, candidatePath, root, controls)
    rendered.push({ controls, candidatePath,
      candidateByteLength: (await stat(candidatePath)).size,
      encodedArtifactSha256: hash(await readFile(candidatePath)),
      audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(candidatePath, root),
      measurement: await measureStage12EncodedLoudness(
        payload, candidatePath, root, lraTarget,
      ) })
  }

  // FINAL_VERIFY remeasures the exact already-encoded stabilization path.
  const selected = rendered.at(-1)
  const verifiedArtifactSha256 = hash(await readFile(selected.candidatePath))
  const verifiedFrameMd5Sha256 = await stage12AudioFrameMd5Sha256(
    selected.candidatePath, root,
  )
  const verifiedMeasurement = await measureStage12EncodedLoudness(
    payload, selected.candidatePath, root, lraTarget,
  )

  // ROLLBACK_VERIFY freshly reproduces sealed parent pass 5 from immutable lossless.
  const rollbackControls = { phase: 'ROLLBACK_VERIFY', macroDepthDb: 10.70625,
    integratedTargetLufs: -14, limiterCeilingDbtp: -2.67 }
  const rollbackPath = join(root, 'safe-rollback-reproduction.webm')
  await renderStage12CodecSafeCandidate(payload, sourcePath, rollbackPath, root,
    rollbackControls)
  const rollbackMeasurement = await measureStage12EncodedLoudness(
    payload, rollbackPath, root, lraTarget,
  )
  const measurements = [...rendered.map(({ measurement }) => measurement),
    verifiedMeasurement, rollbackMeasurement]
  const measurementValues = measurements.flatMap((measurement) => [
    measurement.integratedLufs, measurement.truePeakDbtp, measurement.loudnessRangeLu,
  ])
  if (networkCalls !== 0 || hash(await readFile(sourcePath)) !== immutableSourceSha256
    || rendered.some(({ candidateByteLength }) => candidateByteLength < 1)
    || rendered.some(({ encodedArtifactSha256, audioFrameMd5Sha256 }) =>
      !/^[a-f0-9]{64}$/u.test(encodedArtifactSha256)
        || !/^[a-f0-9]{64}$/u.test(audioFrameMd5Sha256))
    || selected.encodedArtifactSha256 !== verifiedArtifactSha256
    || selected.audioFrameMd5Sha256 !== verifiedFrameMd5Sha256
    || JSON.stringify(selected.measurement) !== JSON.stringify(verifiedMeasurement)
    || rollbackControls.macroDepthDb
      >= STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY.macroDepthMinDb
    || (await stat(rollbackPath)).size < 1
    || measurementValues.some((value) => !Number.isFinite(value))) {
    throw new Error('Stage 12 codec-safe LRA feasibility zero-upload smoke failed.')
  }
  process.stdout.write('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SMOKE_PASS\n')
} finally {
  globalThis.fetch = originalFetch
  await rm(root, { recursive: true, force: true })
}
