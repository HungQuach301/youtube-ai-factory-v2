import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

import { canonicalHash, canonicalizeExact } from '../packages/core-hash/dist/index.js'
import { createSyntheticGoldSamples, GoldSetManager } from '../packages/gold-set/dist/index.js'

const EXPECTED_SAMPLE_COUNT = 16
const EXPECTED_DEFECT_CLASS_COUNT = 8
const EXPECTED_NAMESPACE = 'qualification'
const EXPECTED_WORK_PACKAGE = 'G-02E'
const MARKER_PATH = resolve('qualification-runs/gold-set.json')
const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
const MEDIA_DURATION_SEC = 4
const VIDEO_RATE = 30

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const requireInside = (root, path) => {
  const pathFromRoot = relative(root, path)
  if (pathFromRoot === '' || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..') {
    throw new Error(`OUTPUT_PATH_OUTSIDE_ROOT:${path}`)
  }
}

const readMarker = async () => {
  const marker = JSON.parse(await readFile(MARKER_PATH, 'utf8'))
  if (marker.schemaVersion !== 1
    || marker.workPackage !== EXPECTED_WORK_PACKAGE
    || marker.namespace !== EXPECTED_NAMESPACE
    || marker.productionEligible !== false
    || marker.providerDispatch !== 'OFF'
    || typeof marker.createdAt !== 'string') {
    throw new Error('INVALID_GOLD_SET_QUALIFICATION_MARKER')
  }
  return marker
}

const videoFilterFor = (sample) => {
  const { defectClass, tStart, tEnd } = sample.groundTruth
  const variant = sample.id.endsWith('-1') ? 1 : 2
  if (defectClass === 'BLACK_FRAME') {
    return `drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,${tStart},${tEnd})'`
  }
  if (defectClass === 'FREEZE_FRAME') {
    const firstFrame = Math.round(tStart * VIDEO_RATE)
    return `select='if(between(t,${tStart},${tEnd}),eq(n,${firstFrame}),1)'`
  }
  if (defectClass === 'DROP_FRAME') {
    const cadence = variant === 1 ? 2 : 3
    return `select='if(between(t,${tStart},${tEnd}),not(mod(n,${cadence})),1)'`
  }
  if (defectClass === 'MOBILE_LEGIBILITY') {
    const fontSize = variant === 1 ? 8 : 9
    return `drawtext=fontfile=${FONT_PATH}:text='tiny':fontsize=${fontSize}:fontcolor=white:x=20:y=20:enable='between(t,${tStart},${tEnd})'`
  }
  if (defectClass === 'SAFE_ZONE') {
    const x = variant === 1 ? 0 : 'iw-40'
    return `drawbox=x=${x}:y=0:w=40:h=40:color=red:t=fill:enable='between(t,${tStart},${tEnd})'`
  }
  if (defectClass === 'TIMELINE') {
    return `setpts='PTS+if(gte(T,${tStart}),${variant}/TB,0)'`
  }
  return 'null'
}

const audioFilterFor = (sample) => {
  const { defectClass, tStart, tEnd } = sample.groundTruth
  const variant = sample.id.endsWith('-1') ? 1 : 2
  if (defectClass === 'SILENCE') {
    return `volume=enable='between(t,${tStart},${tEnd})':volume=0`
  }
  if (defectClass === 'CLIPPING') {
    const gain = variant === 1 ? 8 : 12
    return `aeval='clip(val(0)*${gain},-1,1)'`
  }
  return 'anull'
}

const ffmpegArguments = (sample, outputPath) => [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=${VIDEO_RATE}:duration=${MEDIA_DURATION_SEC}`,
  '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${MEDIA_DURATION_SEC}`,
  '-filter_complex', `[0:v]${videoFilterFor(sample)}[v];[1:a]${audioFilterFor(sample)}[a]`,
  '-map', '[v]', '-map', '[a]',
  '-t', String(MEDIA_DURATION_SEC),
  '-fps_mode', 'passthrough',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
  '-threads', '1', '-x264-params', 'threads=1:lookahead_threads=1:sync-lookahead=0:scenecut=0:open-gop=0',
  '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '1',
  '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
  '-metadata', 'creation_time=1970-01-01T00:00:00Z', '-movflags', '+faststart',
  outputPath,
]

const probeMedia = (path) => {
  const raw = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path,
  ], { encoding: 'utf8' })
  const probe = JSON.parse(raw)
  const streamTypes = probe.streams.map((stream) => stream.codec_type).sort()
  if (!streamTypes.includes('audio') || !streamTypes.includes('video')) {
    throw new Error(`MEDIA_STREAMS_INVALID:${path}`)
  }
  const durationSec = Number(probe.format.duration)
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error(`MEDIA_DURATION_INVALID:${path}`)
  return { durationSec, streamTypes }
}

const writeCanonicalReadback = async (path, value) => {
  const bytes = Buffer.from(`${canonicalizeExact(value)}\n`, 'utf8')
  await writeFile(path, bytes)
  const readback = await readFile(path)
  if (!readback.equals(bytes)) throw new Error(`READBACK_MISMATCH:${path}`)
  return sha256(readback)
}

const validateSamples = (samples) => {
  if (samples.length !== EXPECTED_SAMPLE_COUNT) throw new Error('SYNTHETIC_SAMPLE_COUNT_MISMATCH')
  const defectCounts = new Map()
  for (const sample of samples) {
    if (!sample.r2Key.startsWith(`${EXPECTED_NAMESPACE}/`) || sample.r2Key.includes('/production/')) {
      throw new Error(`G5_NAMESPACE_ISOLATION:${sample.r2Key}`)
    }
    defectCounts.set(sample.groundTruth.defectClass, (defectCounts.get(sample.groundTruth.defectClass) ?? 0) + 1)
  }
  if (defectCounts.size !== EXPECTED_DEFECT_CLASS_COUNT
    || [...defectCounts.values()].some((count) => count !== 2)) {
    throw new Error('SYNTHETIC_DEFECT_COVERAGE_MISMATCH')
  }
}

const materialize = async (outputArgument) => {
  const outputRoot = resolve(outputArgument)
  const marker = await readMarker()
  const samples = [...createSyntheticGoldSamples(marker.createdAt)].sort((left, right) => left.id.localeCompare(right.id))
  validateSamples(samples)

  const manager = new GoldSetManager()
  for (const sample of samples) manager.append(sample)
  const readiness = manager.readiness()
  if (readiness.ready || readiness.sampleCount !== EXPECTED_SAMPLE_COUNT || readiness.rejectedMasterCount !== 0) {
    throw new Error('GOLD_SET_MUST_REMAIN_NOT_READY')
  }

  await mkdir(outputRoot, { recursive: true })
  const materialized = []
  for (const sample of samples) {
    const outputPath = resolve(outputRoot, sample.r2Key)
    requireInside(outputRoot, outputPath)
    await mkdir(dirname(outputPath), { recursive: true })
    execFileSync('ffmpeg', ffmpegArguments(sample, outputPath), { stdio: 'inherit' })
    const bytes = await readFile(outputPath)
    const probe = probeMedia(outputPath)
    materialized.push({
      ...sample,
      media: {
        relativePath: sample.r2Key,
        sha256: sha256(bytes),
        sizeBytes: bytes.byteLength,
        durationSec: probe.durationSec,
        streamTypes: probe.streamTypes,
      },
    })
  }

  const manifest = {
    schemaVersion: marker.schemaVersion,
    workPackage: marker.workPackage,
    namespace: marker.namespace,
    createdAt: marker.createdAt,
    providerDispatch: marker.providerDispatch,
    productionEligible: marker.productionEligible,
    criticQualificationState: 'NOT_QUALIFIED',
    readiness,
    sampleCount: materialized.length,
    samples: materialized,
  }
  const manifestPath = resolve(outputRoot, 'manifest.json')
  const manifestSha256 = await writeCanonicalReadback(manifestPath, manifest)
  await writeCanonicalReadback(resolve(outputRoot, 'manifest.sha256.json'), {
    algorithm: 'sha256',
    file: 'manifest.json',
    sha256: manifestSha256,
  })
  process.stdout.write(`${canonicalizeExact({ manifestSha256, namespace: manifest.namespace, sampleCount: manifest.sampleCount })}\n`)
}

const verifyOutput = async (outputRoot) => {
  const manifestBytes = await readFile(resolve(outputRoot, 'manifest.json'))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  validateSamples(manifest.samples)
  for (const sample of manifest.samples) {
    const mediaPath = resolve(outputRoot, sample.media.relativePath)
    requireInside(outputRoot, mediaPath)
    const mediaBytes = await readFile(mediaPath)
    if (sha256(mediaBytes) !== sample.media.sha256 || mediaBytes.byteLength !== sample.media.sizeBytes) {
      throw new Error(`MEDIA_READBACK_MISMATCH:${sample.id}`)
    }
  }
  return { manifest, manifestSha256: sha256(manifestBytes) }
}

const verifyReplay = async (firstArgument, replayArgument) => {
  const firstRoot = resolve(firstArgument)
  const replayRoot = resolve(replayArgument)
  const [first, replay] = await Promise.all([verifyOutput(firstRoot), verifyOutput(replayRoot)])
  if (first.manifestSha256 !== replay.manifestSha256
    || canonicalHash(first.manifest) !== canonicalHash(replay.manifest)) {
    throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  }
  const receipt = {
    schemaVersion: 1,
    workPackage: EXPECTED_WORK_PACKAGE,
    namespace: EXPECTED_NAMESPACE,
    accepted: true,
    replayed: true,
    sampleCount: first.manifest.sampleCount,
    firstManifestSha256: first.manifestSha256,
    replayManifestSha256: replay.manifestSha256,
    canonicalManifestHash: canonicalHash(first.manifest),
    providerDispatch: 'OFF',
    productionEligible: false,
    criticQualificationState: 'NOT_QUALIFIED',
  }
  const receiptSha256 = await writeCanonicalReadback(resolve(firstRoot, 'replay-receipt.json'), receipt)
  process.stdout.write(`${canonicalizeExact({ ...receipt, receiptSha256 })}\n`)
}

const args = process.argv.slice(2)
if (args[0] === '--output' && args[1] !== undefined && args.length === 2) {
  await materialize(args[1])
} else if (args[0] === '--verify-replay' && args[1] !== undefined && args[2] !== undefined && args.length === 3) {
  await verifyReplay(args[1], args[2])
} else {
  throw new Error('Usage: --output <dir> | --verify-replay <first-dir> <replay-dir>')
}
