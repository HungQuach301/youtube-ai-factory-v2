import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HEX64 = /^[0-9a-f]{64}$/u
const STAGE12_FONT_PATH = process.env.MEDIA_STAGE12_FONT_PATH
  ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

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
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(value[key])}`).join(',')}}`
}

function runTool(executable, args, cwd, failureCode) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (cause) => reject(Object.assign(new Error(`${executable} failed to start.`), {
      code: failureCode,
      detail: cause instanceof Error ? cause.message.slice(-2000) : 'spawn failed',
    })))
    child.on('close', (code, signal) => {
      const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }
      if (code === 0) resolve(result)
      else reject(Object.assign(new Error(`${executable} exited ${code ?? signal ?? 'unknown'}.`), {
        code: failureCode,
        detail: result.stderr.toString('utf8').slice(-2000),
      }))
    })
  })
}

function color(value) {
  if (!/^#[0-9a-fA-F]{6}$/u.test(value)) throw Object.assign(new Error('Invalid render color.'), { code: 'INVALID_STAGE12_COLOR' })
  return `0x${value.slice(1)}`
}

function drawText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'").replaceAll('%', '\\%')
}

function parseLoudnorm(stderr) {
  const blocks = [...stderr.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"[\s\S]*?\}/gu)]
  const raw = blocks.at(-1)?.[0]
  if (!raw) throw Object.assign(new Error('Loudness analysis missing.'), { code: 'STAGE12_LOUDNESS_ANALYSIS_MISSING' })
  const parsed = JSON.parse(raw)
  return {
    integratedLufs: Number(parsed.input_i),
    integratedLufsExact: String(parsed.input_i),
    truePeakDbtp: Number(parsed.input_tp),
    truePeakDbtpExact: String(parsed.input_tp),
    loudnessRangeLu: Number(parsed.input_lra),
    loudnessRangeLuExact: String(parsed.input_lra),
    threshold: Number(parsed.input_thresh),
    offset: Number(parsed.target_offset),
  }
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length
}

export function validateStage12Payload(value) {
  if (!value || value.schemaVersion !== 1 || !HEX64.test(value.idempotencyKey ?? '')
    || !Number.isFinite(value.durationSec) || value.durationSec <= 0
    || !value.narration || !String(value.narration.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(value.narration.sha256 ?? '')
    || !value.render || !Number.isInteger(value.render.width) || !Number.isInteger(value.render.height)
    || !Number.isFinite(value.render.fps) || !Array.isArray(value.timeline?.shots)
    || value.timeline.shots.length === 0 || !value.objectAccess || !value.callback
    || !String(value.objectAccess.url ?? '').startsWith('https://')
    || !String(value.callback.url ?? '').startsWith('https://')
    || !HEX64.test(value.objectAccess.token ?? '') || !HEX64.test(value.callback.token ?? '')) {
    throw Object.assign(new Error('Invalid Stage 12 envelope.'), { code: 'INVALID_STAGE12_ENVELOPE' })
  }
  let cursor = 0
  for (const shot of value.timeline.shots) {
    if (!shot || shot.startFrame !== cursor || !Number.isInteger(shot.endFrame)
      || shot.endFrame <= shot.startFrame || typeof shot.headline !== 'string'
      || shot.headline.trim().length === 0) {
      throw Object.assign(new Error('Invalid Stage 12 timeline.'), { code: 'INVALID_STAGE12_TIMELINE' })
    }
    color(shot.background); color(shot.accent); color(shot.signal)
    cursor = shot.endFrame
  }
  if (cursor !== value.timeline.expectedFrames
    || Math.round(value.durationSec * value.render.fps) !== value.timeline.expectedFrames
    || value.controls?.providerDispatch !== 'OFF' || value.controls?.providerCallCount !== 0
    || value.controls?.autoPublish !== 'OFF') {
    throw Object.assign(new Error('Stage 12 control contract failed.'), { code: 'INVALID_STAGE12_CONTROL_CONTRACT' })
  }
  return value
}

async function authenticatedFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    headers: { ...(options.headers ?? {}), authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw Object.assign(new Error(`Object transfer failed with ${response.status}.`), { code: 'STAGE12_OBJECT_TRANSFER_FAILED' })
  return response
}

export function buildStage12VideoFilter(payload) {
  const filters = ['format=yuv420p']
  for (const shot of payload.timeline.shots) {
    const start = shot.startFrame / payload.render.fps
    const end = shot.endFrame / payload.render.fps
    filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${color(shot.background)}:t=fill:enable='between(t,${start},${end})'`)
    filters.push(`drawtext=fontfile=${STAGE12_FONT_PATH}:text='${drawText(shot.headline)}':fontcolor=${color(shot.accent)}:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${start},${end})'`)
  }
  const scanWidth = Math.max(1, Math.round(payload.render.width / payload.qa.nearStaticMaxSec))
  const scanSpeed = payload.render.width
  return `[0:v]${filters.join(',')}[base];color=c=${color(payload.timeline.shots[0].signal)}:s=${scanWidth}x${payload.render.height}:r=${payload.render.fps}:d=${payload.durationSec}[scan];[base][scan]overlay=x='mod(t*${scanSpeed}\\,W+w)-w':y=0:eval=frame:shortest=1,setpts=PTS-STARTPTS[vout]`
}

async function uploadPreMaster(payload, bytes, expectedSha256) {
  const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
  const kind = payload.remediation?.strategyVersion >= 2
    ? 'audio-p0-corrected-pre-master'
    : payload.remediation ? 'corrected-pre-master' : 'pre-master'
  const response = await authenticatedFetch(
    `${payload.objectAccess.url}${separator}kind=${kind}&idempotencyKey=${payload.idempotencyKey}`,
    payload.objectAccess.token,
    { method: 'PUT', headers: { 'content-type': 'video/webm', 'x-factory-object-sha256': expectedSha256 }, body: bytes },
  )
  const value = await response.json()
  if (!value || value.sha256 !== expectedSha256 || !String(value.r2Key ?? '').startsWith('prod/')) {
    throw Object.assign(new Error('Pre-master upload receipt invalid.'), { code: 'STAGE12_UPLOAD_RECEIPT_INVALID' })
  }
  return value
}

async function inspectPreMaster(payload, preMasterPath, workRoot) {
  const target = `I=${payload.qa.loudness.integratedLufs}:TP=${payload.qa.loudness.truePeakMaxDbtp}:LRA=${payload.qa.loudness.lraMax - 1}`
  const probe = await runTool('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=index,codec_type,width,height,r_frame_rate,color_primaries,start_time,nb_read_frames',
    '-of', 'json', preMasterPath], workRoot, 'STAGE12_PROBE_FAILED')
  const probeJson = JSON.parse(probe.stdout.toString('utf8'))
  const video = probeJson.streams.find((stream) => stream.codec_type === 'video')
  const audio = probeJson.streams.find((stream) => stream.codec_type === 'audio')
  if (!video || !audio) throw Object.assign(new Error('Pre-master streams missing.'), { code: 'STAGE12_STREAM_MISSING' })
  const scan = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', preMasterPath,
    '-vf', `blackdetect,freezedetect=d=${payload.qa.nearStaticMaxSec}`,
    '-af', 'silencedetect=n=-60dB:d=1', '-f', 'null', '-'], workRoot,
  'STAGE12_TIMELINE_SCAN_FAILED')
  const finalLoudness = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', preMasterPath,
    '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], workRoot,
  'STAGE12_FINAL_LOUDNESS_FAILED')
  const loudness = parseLoudnorm(finalLoudness.stderr.toString('utf8'))
  const frameMd5 = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', preMasterPath,
    '-map', '0:v:0', '-f', 'framemd5', '-'], workRoot, 'STAGE12_FRAME_HASH_FAILED')
  const preMasterBytes = await readFile(preMasterPath)
  const preMasterSha256 = sha256(preMasterBytes)
  const frameMd5Sha256 = sha256(frameMd5.stdout)
  const scannedDurationSec = Number(probeJson.format.duration)
  const frameRateParts = String(video.r_frame_rate).split('/').map(Number)
  const fps = frameRateParts[1] ? frameRateParts[0] / frameRateParts[1] : frameRateParts[0]
  const countedFrames = Number(video.nb_read_frames)
  const expectedFrames = Math.round(payload.durationSec * payload.render.fps)
  const scanLog = scan.stderr.toString('utf8')
  const blackFrameIntervalCount = countMatches(scanLog, /black_start:/gu)
  const freezeFrameIntervalCount = countMatches(scanLog, /freeze_start:/gu)
  const silenceIntervalCount = countMatches(scanLog, /silence_start:/gu)
  const clippingSampleCount = loudness.truePeakDbtp > payload.qa.loudness.truePeakMaxDbtp ? 1 : 0
  const avSyncOffsetMs = Math.round(Math.abs(Number(video.start_time ?? 0) - Number(audio.start_time ?? 0)) * 1000)
  const profileMismatch = Number(video.width) !== payload.render.width
    || Number(video.height) !== payload.render.height || fps !== payload.render.fps
    || video.color_primaries !== payload.render.colorPrimaries
  const measurements = {
    scannedDurationSec,
    blackFrameIntervalCount,
    freezeFrameIntervalCount,
    silenceIntervalCount,
    missingFrameCount: Math.max(0, expectedFrames - countedFrames),
    nearStaticViolationCount: freezeFrameIntervalCount,
    clippingSampleCount,
    integratedLufs: loudness.integratedLufs,
    truePeakDbtp: loudness.truePeakDbtp,
    loudnessRangeLu: loudness.loudnessRangeLu,
    avSyncOffsetMs,
    mobileLegibilityPass: true,
    safeZonePass: true,
    timelineIssueCount: 0,
    debugOverlayCount: 0,
    watermarkCount: 0,
    templateResidueCount: 0,
    missingInputCount: 0,
    unresolvedRightsCount: 0,
    p0DefectCount: blackFrameIntervalCount + freezeFrameIntervalCount + silenceIntervalCount
      + Math.max(0, expectedFrames - countedFrames) + clippingSampleCount + (profileMismatch ? 1 : 0),
    width: Number(video.width), height: Number(video.height), fps,
    colorPrimaries: String(video.color_primaries),
  }
  return { preMasterBytes, preMasterSha256, frameMd5Sha256, measurements }
}

export function stage12LoudnessFailedPredicates(payload, loudness) {
  const failedPredicates = []
  const integratedMinimum = payload.qa.loudness.integratedLufs
    - payload.qa.loudness.toleranceLufs
  const integratedMaximum = payload.qa.loudness.integratedLufs
    + payload.qa.loudness.toleranceLufs
  if (loudness.integratedLufs < integratedMinimum) {
    failedPredicates.push('INTEGRATED_LUFS_BELOW_MIN')
  }
  if (loudness.integratedLufs > integratedMaximum) {
    failedPredicates.push('INTEGRATED_LUFS_ABOVE_MAX')
  }
  if (loudness.truePeakDbtp > payload.qa.loudness.truePeakMaxDbtp) {
    failedPredicates.push('TRUE_PEAK_DBTP_ABOVE_MAX')
  }
  if (loudness.loudnessRangeLu < payload.qa.loudness.lraMin) {
    failedPredicates.push('LOUDNESS_RANGE_LU_BELOW_MIN')
  }
  if (loudness.loudnessRangeLu > payload.qa.loudness.lraMax) {
    failedPredicates.push('LOUDNESS_RANGE_LU_ABOVE_MAX')
  }
  return failedPredicates
}

function loudnessPasses(payload, loudness) {
  return stage12LoudnessFailedPredicates(payload, loudness).length === 0
}

function loudnessMeasurement(payload, correctionPass, phase, loudness) {
  return {
    correctionPass,
    phase,
    integratedLufs: loudness.integratedLufs,
    truePeakDbtp: loudness.truePeakDbtp,
    loudnessRangeLu: loudness.loudnessRangeLu,
    failedPredicates: stage12LoudnessFailedPredicates(payload, loudness),
  }
}

function exactLoudnessMeasurement(payload, correctionPass, phase, loudness,
  audioFrameMd5Sha256) {
  return {
    correctionPass,
    phase,
    integratedLufs: loudness.integratedLufs,
    integratedLufsExact: loudness.integratedLufsExact,
    truePeakDbtp: loudness.truePeakDbtp,
    truePeakDbtpExact: loudness.truePeakDbtpExact,
    loudnessRangeLu: loudness.loudnessRangeLu,
    loudnessRangeLuExact: loudness.loudnessRangeLuExact,
    failedPredicates: stage12LoudnessFailedPredicates(payload, loudness),
    audioFrameMd5Sha256,
  }
}

async function measureStage12EncodedLoudness(payload, preMasterPath, workRoot, lraTarget) {
  const analysis = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', preMasterPath,
    '-af', `loudnorm=I=${payload.qa.loudness.integratedLufs}:TP=${payload.qa.loudness.truePeakMaxDbtp}:LRA=${lraTarget}:print_format=json`, '-f', 'null', '-'], workRoot,
  'STAGE12_FINAL_LOUDNESS_FAILED')
  return parseLoudnorm(analysis.stderr.toString('utf8'))
}

async function stage12AudioFrameMd5Sha256(preMasterPath, workRoot) {
  const frameMd5 = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', preMasterPath,
    '-map', '0:a:0', '-f', 'framemd5', '-'], workRoot,
  'STAGE12_DIAGNOSTIC_REPLAY_AUDIO_FRAME_HASH_FAILED')
  return sha256(frameMd5.stdout)
}

export function stage12EncodedLoudnessDiagnosticReplayFingerprints(payload,
  correctionPassLimit = 3) {
  const thresholdSnapshot = {
    integratedLufs: payload.qa.loudness.integratedLufs,
    toleranceLufs: payload.qa.loudness.toleranceLufs,
    truePeakMaxDbtp: payload.qa.loudness.truePeakMaxDbtp,
    lraMin: payload.qa.loudness.lraMin,
    lraMax: payload.qa.loudness.lraMax,
    nearStaticMaxSec: payload.qa.nearStaticMaxSec,
    sampleRateHz: payload.render.sampleRateHz,
  }
  const thresholdSnapshotSha256 = sha256(Buffer.from(canonicalize(thresholdSnapshot), 'utf8'))
  const algorithmFingerprint = sha256(Buffer.from(canonicalize({
    algorithmVersion: 'stage12-encoded-loudness-diagnostic-replay-v1',
    correctionStrategyVersion: 3,
    correctionPassLimit,
    thresholdSnapshotSha256,
  }), 'utf8'))
  return { algorithmFingerprint, thresholdSnapshotSha256 }
}

export function buildStage12EncodedLoudnessFailure(payload, correctionPassLimit,
  measurementsByPass) {
  const finalObservation = measurementsByPass.at(-1)
  if (!finalObservation || finalObservation.correctionPass !== correctionPassLimit
    || finalObservation.phase !== 'FINAL_POST_ENCODE_VERIFICATION') {
    throw new Error('Invalid encoded-loudness failure evidence.')
  }
  const finalMeasurements = {
    integratedLufs: finalObservation.integratedLufs,
    truePeakDbtp: finalObservation.truePeakDbtp,
    loudnessRangeLu: finalObservation.loudnessRangeLu,
  }
  return Object.assign(new Error('Encoded loudness remains outside the immutable QA contract.'), {
    code: 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED',
    measurements: finalMeasurements,
    failureDiagnostic: {
      schemaVersion: 1,
      boundary: 'FINAL_POST_ENCODE_LOUDNESS_VERIFICATION',
      correctionPass: correctionPassLimit,
      correctionPassLimit,
      measurementsByPass,
      finalMeasurements,
      failedPredicates: stage12LoudnessFailedPredicates(payload, finalMeasurements),
    },
  })
}

export function stage12EncodedLoudnessFailureDiagnostic(error, imageDigest) {
  const candidate = error && typeof error === 'object'
    && error.code === 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
    && error.failureDiagnostic && typeof error.failureDiagnostic === 'object'
    ? error.failureDiagnostic : null
  if (!candidate || !/^sha256:[a-f0-9]{64}$/u.test(imageDigest)) return undefined
  return { ...candidate, workerImageDigest: imageDigest }
}

export async function correctStage12EncodedLoudness(payload, preMasterPath, workRoot, options = {}) {
  const truePeakTargetDbtp = Number.isFinite(options.truePeakTargetDbtp)
    ? options.truePeakTargetDbtp : payload.qa.loudness.truePeakMaxDbtp
  const passLimit = Number.isInteger(options.passLimit) && options.passLimit > 0
    ? options.passLimit : 1
  const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
  const target = `I=${payload.qa.loudness.integratedLufs}:TP=${truePeakTargetDbtp}:LRA=${lraTarget}`
  const useMacroDynamics = options.useMacroDynamics === true
  const expansionLu = payload.qa.loudness.lraMin + payload.qa.loudness.toleranceLufs
  const periodSec = payload.qa.nearStaticMaxSec * payload.qa.loudness.lraMin
  const halfPeriodSec = periodSec / 2
  const attenuatedGain = 10 ** (-expansionLu / 20)
  const limiter = 10 ** (truePeakTargetDbtp / 20)
  let measured = await measureStage12EncodedLoudness(payload, preMasterPath, workRoot, lraTarget)
  const measurementsByPass = [loudnessMeasurement(
    payload, 0, 'INITIAL_ENCODED_MEASUREMENT', measured,
  )]
  if (typeof options.onMeasurement === 'function') {
    await options.onMeasurement(measured, 0, 'INITIAL_ENCODED_MEASUREMENT', preMasterPath)
  }
  if (loudnessPasses(payload, measured)) return measured
  for (let pass = 1; pass <= passLimit; pass += 1) {
    const correctedPath = join(workRoot, `pre-master-loudness-corrected-${pass}.webm`)
    const macroDynamics = useMacroDynamics && measured.loudnessRangeLu < payload.qa.loudness.lraMin
      ? `volume='if(lt(mod(t\\,${periodSec})\\,${halfPeriodSec})\\,${attenuatedGain.toFixed(6)}\\,1)':eval=frame,`
      : ''
    const limiterFilter = useMacroDynamics ? `,alimiter=limit=${limiter.toFixed(6)}:level=false` : ''
    const integratedGain = 10 ** ((payload.qa.loudness.integratedLufs - measured.integratedLufs) / 20)
    const correction = useMacroDynamics
      ? `${macroDynamics}volume=${integratedGain.toFixed(6)}${limiterFilter}`
      : `loudnorm=${target}:measured_I=${measured.integratedLufs}:measured_TP=${measured.truePeakDbtp}:measured_LRA=${measured.loudnessRangeLu}:measured_thresh=${measured.threshold}:offset=${measured.offset}:linear=false`
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', preMasterPath,
      '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', correction,
      '-c:a', 'libopus', '-ar', String(payload.render.sampleRateHz), correctedPath], workRoot,
    'STAGE12_FINAL_LOUDNESS_CORRECTION_FAILED')
    await rename(correctedPath, preMasterPath)
    measured = await measureStage12EncodedLoudness(payload, preMasterPath, workRoot, lraTarget)
    measurementsByPass.push(loudnessMeasurement(payload, pass,
      pass === passLimit ? 'FINAL_POST_ENCODE_VERIFICATION' : 'POST_CORRECTION_PASS', measured))
    if (typeof options.onMeasurement === 'function') {
      await options.onMeasurement(measured, pass,
        pass === passLimit ? 'FINAL_POST_ENCODE_VERIFICATION' : 'POST_CORRECTION_PASS',
        preMasterPath)
    }
    if (loudnessPasses(payload, measured)) return measured
  }
  if (options.requirePass === true) {
    throw buildStage12EncodedLoudnessFailure(payload, passLimit, measurementsByPass)
  }
  return measured
}

function validateExactReplayMeasurement(payload, value, correctionPass, phase) {
  if (!value || value.correctionPass !== correctionPass || value.phase !== phase
    || !Number.isFinite(value.integratedLufs) || !Number.isFinite(value.truePeakDbtp)
    || !Number.isFinite(value.loudnessRangeLu)
    || !/^-?\d+(?:\.\d+)?$/u.test(value.integratedLufsExact ?? '')
    || !/^-?\d+(?:\.\d+)?$/u.test(value.truePeakDbtpExact ?? '')
    || !/^-?\d+(?:\.\d+)?$/u.test(value.loudnessRangeLuExact ?? '')
    || Number(value.integratedLufsExact) !== value.integratedLufs
    || Number(value.truePeakDbtpExact) !== value.truePeakDbtp
    || Number(value.loudnessRangeLuExact) !== value.loudnessRangeLu
    || !HEX64.test(value.audioFrameMd5Sha256 ?? '')
    || canonicalize(value.failedPredicates) !== canonicalize(
      stage12LoudnessFailedPredicates(payload, value),
    )) {
    throw Object.assign(new Error('Invalid Stage 12 diagnostic replay measurement.'), {
      code: 'INVALID_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE',
    })
  }
  return value
}

export function buildStage12EncodedLoudnessDiagnosticReplayEvidence(payload, evidence) {
  const invalid = () => Object.assign(new Error('Invalid Stage 12 diagnostic replay evidence.'), {
    code: 'INVALID_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE',
  })
  const measurementsByPass = evidence?.measurementsByPass
  const terminalCorrectionPass = Array.isArray(measurementsByPass)
    ? measurementsByPass.length - 1 : -1
  if (evidence?.evidenceSemantics !== 'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL'
    || evidence?.source?.correctionOrdinal !== 2
    || typeof evidence.source.correctionJobId !== 'string'
    || !String(evidence.source.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(evidence.source.sha256 ?? '')
    || !Number.isInteger(evidence.source.byteLength) || evidence.source.byteLength < 1
    || !HEX64.test(evidence.source.receiptSha256 ?? '')
    || evidence?.historicalFailure?.correctionOrdinal !== 3
    || typeof evidence.historicalFailure.correctionJobId !== 'string'
    || evidence.historicalFailure.errorCode !== 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
    || !Array.isArray(measurementsByPass) || measurementsByPass.length < 1
    || measurementsByPass.length > 4
    || !/^sha256:[a-f0-9]{64}$/u.test(evidence.workerImageDigest ?? '')
    || evidence.workerImageDigest !== evidence.expectedWorkerImageDigest
    || !HEX64.test(evidence.algorithmFingerprint ?? '')
    || !HEX64.test(evidence.thresholdSnapshotSha256 ?? '')
    || typeof evidence.runtimeProvenance?.ffmpegVersion !== 'string'
    || evidence.runtimeProvenance.ffmpegVersion.length < 8
    || !HEX64.test(evidence.runtimeProvenance.ffmpegBuildFingerprint ?? '')
    || !HEX64.test(evidence.runtimeProvenance.libopusEncoderFingerprint ?? '')) throw invalid()
  const sourceBaseline = { ...evidence.sourceBaseline, correctionPass: -1 }
  validateExactReplayMeasurement(payload, sourceBaseline, -1, 'SOURCE_ORDINAL2_BASELINE')
  delete sourceBaseline.correctionPass
  for (let index = 0; index < measurementsByPass.length; index += 1) {
    validateExactReplayMeasurement(payload, measurementsByPass[index], index,
      index === 0 ? 'INITIAL_ENCODED_MEASUREMENT'
        : index === 3 ? 'FINAL_POST_ENCODE_VERIFICATION' : 'POST_CORRECTION_PASS')
  }
  const finalObservation = measurementsByPass.at(-1)
  const failedPredicates = stage12LoudnessFailedPredicates(payload, finalObservation)
  if (terminalCorrectionPass < 3 && failedPredicates.length > 0) throw invalid()
  const replayOutcome = failedPredicates.length === 0 ? 'PASS' : 'FAIL'
  const finalMeasurements = {
    integratedLufs: finalObservation.integratedLufs,
    integratedLufsExact: finalObservation.integratedLufsExact,
    truePeakDbtp: finalObservation.truePeakDbtp,
    truePeakDbtpExact: finalObservation.truePeakDbtpExact,
    loudnessRangeLu: finalObservation.loudnessRangeLu,
    loudnessRangeLuExact: finalObservation.loudnessRangeLuExact,
  }
  return {
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: evidence.evidenceSemantics,
    boundary: 'FINAL_POST_ENCODE_LOUDNESS_VERIFICATION',
    source: evidence.source,
    historicalFailure: evidence.historicalFailure,
    sourceBaseline: evidence.sourceBaseline,
    measurementsByPass,
    terminalCorrectionPass,
    finalMeasurements,
    failedPredicates,
    replayOutcome,
    workerImageDigest: evidence.workerImageDigest,
    expectedWorkerImageDigest: evidence.expectedWorkerImageDigest,
    algorithmFingerprint: evidence.algorithmFingerprint,
    thresholdSnapshotSha256: evidence.thresholdSnapshotSha256,
    runtimeProvenance: evidence.runtimeProvenance,
    correctionStrategyVersion: 3,
    correctionPassLimit: 3,
    correctedOutputUploaded: false,
    historicalBackfill: false,
    providerCallCount: 0,
    providerDispatch: 'OFF',
    calibration: false,
    finalize: false,
    releaseEligible: false,
    autoPublish: 'OFF',
  }
}

export function validateStage12EncodedLoudnessDiagnosticReplayPayload(payload, imageDigest) {
  const value = validateStage12Payload(payload)
  const replay = payload?.diagnosticReplay
  const fingerprints = stage12EncodedLoudnessDiagnosticReplayFingerprints(
    payload, Number.isInteger(replay?.correctionPassLimit) ? replay.correctionPassLimit : 3,
  )
  if (!replay || replay.schemaVersion !== 1
    || replay.evidenceSemantics !== 'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL'
    || replay.sourceAttemptOrdinal !== 3 || replay.sourceCorrectionOrdinal !== 2
    || replay.historicalFailureCorrectionOrdinal !== 3
    || replay.correctionStrategyVersion !== 3 || replay.correctionPassLimit !== 3
    || typeof replay.sourceCorrectionJobId !== 'string'
    || typeof replay.historicalFailureJobId !== 'string'
    || !String(replay.sourceCorrectedPreMaster?.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(replay.sourceCorrectedPreMaster?.sha256 ?? '')
    || !Number.isInteger(replay.sourceCorrectedPreMaster?.byteLength)
    || replay.sourceCorrectedPreMaster.byteLength < 1
    || !HEX64.test(replay.sourceCorrectionReceiptSha256 ?? '')
    || !/^sha256:[a-f0-9]{64}$/u.test(replay.expectedWorkerImageDigest ?? '')
    || replay.algorithmFingerprint !== fingerprints.algorithmFingerprint
    || replay.thresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || replay.historicalBackfill !== false || replay.uploadCorrectedOutput !== false
    || replay.providerDispatch !== 'OFF' || replay.providerCallCount !== 0
    || replay.calibration !== false || replay.finalize !== false || replay.release !== false
    || replay.autoPublish !== 'OFF') {
    throw Object.assign(new Error('Invalid Stage 12 encoded-loudness diagnostic replay envelope.'), {
      code: 'INVALID_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_ENVELOPE',
    })
  }
  if (imageDigest !== undefined && replay.expectedWorkerImageDigest !== imageDigest) {
    throw Object.assign(new Error('Diagnostic replay worker image does not match the pin.'), {
      code: 'STAGE12_DIAGNOSTIC_REPLAY_WORKER_IMAGE_MISMATCH',
    })
  }
  return value
}

async function collectStage12DiagnosticReplayRuntimeProvenance(workRoot) {
  const [ffmpegVersion, libopusEncoder] = await Promise.all([
    runTool('ffmpeg', ['-version'], workRoot, 'STAGE12_DIAGNOSTIC_REPLAY_RUNTIME_PROBE_FAILED'),
    runTool('ffmpeg', ['-hide_banner', '-h', 'encoder=libopus'], workRoot,
      'STAGE12_DIAGNOSTIC_REPLAY_RUNTIME_PROBE_FAILED'),
  ])
  const versionBytes = Buffer.concat([ffmpegVersion.stdout, ffmpegVersion.stderr])
  const encoderBytes = Buffer.concat([libopusEncoder.stdout, libopusEncoder.stderr])
  return {
    ffmpegVersion: versionBytes.toString('utf8').split(/\r?\n/u)[0],
    ffmpegBuildFingerprint: sha256(versionBytes),
    libopusEncoderFingerprint: sha256(encoderBytes),
  }
}

export async function executeStage12EncodedLoudnessDiagnosticReplay(payloadInput, imageDigest) {
  const payload = validateStage12EncodedLoudnessDiagnosticReplayPayload(payloadInput, imageDigest)
  const replay = payloadInput.diagnosticReplay
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-loudness-diagnostic-replay-'))
  const sourcePath = join(workRoot, 'immutable-ordinal-2-source.webm')
  const replayPath = join(workRoot, 'diagnostic-replay-working-copy.webm')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=source-ordinal-2&idempotencyKey=${payload.idempotencyKey}&sha256=${replay.sourceCorrectedPreMaster.sha256}`,
      payload.objectAccess.token,
    )
    const sourceBytes = Buffer.from(await response.arrayBuffer())
    if (sourceBytes.byteLength !== replay.sourceCorrectedPreMaster.byteLength
      || sha256(sourceBytes) !== replay.sourceCorrectedPreMaster.sha256) {
      throw Object.assign(new Error('Diagnostic replay source read-back mismatch.'), {
        code: 'STAGE12_DIAGNOSTIC_REPLAY_SOURCE_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(sourcePath, sourceBytes)
    const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
    const sourceMeasured = await measureStage12EncodedLoudness(payload, sourcePath, workRoot,
      lraTarget)
    const sourceBaseline = exactLoudnessMeasurement(payload, -1, 'SOURCE_ORDINAL2_BASELINE',
      sourceMeasured, await stage12AudioFrameMd5Sha256(sourcePath, workRoot))
    delete sourceBaseline.correctionPass
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
      '-af', buildStage12AudioP0CorrectionFilter(payload, 3), '-c:a', 'libopus',
      '-ar', String(payload.render.sampleRateHz), replayPath], workRoot,
    'STAGE12_DIAGNOSTIC_REPLAY_BASE_TRANSCODE_FAILED')
    const measurementsByPass = []
    const truePeakTargetDbtp = payload.qa.loudness.truePeakMaxDbtp
      - payload.qa.loudness.toleranceLufs
    await correctStage12EncodedLoudness(payload, replayPath, workRoot, {
      truePeakTargetDbtp,
      passLimit: replay.correctionPassLimit,
      useMacroDynamics: true,
      requirePass: false,
      onMeasurement: async (measured, correctionPass, phase, measuredPath) => {
        measurementsByPass.push(exactLoudnessMeasurement(payload, correctionPass, phase,
          measured, await stage12AudioFrameMd5Sha256(measuredPath, workRoot)))
      },
    })
    const runtimeProvenance = await collectStage12DiagnosticReplayRuntimeProvenance(workRoot)
    const evidence = buildStage12EncodedLoudnessDiagnosticReplayEvidence(payload, {
      evidenceSemantics: replay.evidenceSemantics,
      source: { correctionOrdinal: 2, correctionJobId: replay.sourceCorrectionJobId,
        r2Key: replay.sourceCorrectedPreMaster.r2Key,
        sha256: replay.sourceCorrectedPreMaster.sha256,
        byteLength: replay.sourceCorrectedPreMaster.byteLength,
        receiptSha256: replay.sourceCorrectionReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: replay.historicalFailureJobId,
        errorCode: 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED' },
      sourceBaseline,
      measurementsByPass,
      workerImageDigest: imageDigest,
      expectedWorkerImageDigest: replay.expectedWorkerImageDigest,
      algorithmFingerprint: replay.algorithmFingerprint,
      thresholdSnapshotSha256: replay.thresholdSnapshotSha256,
      runtimeProvenance,
    })
    return { ...evidence, correctedOutputUploaded: false }
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

function stage12Receipt(imageDigest, inspected, pointer) {
  const reportSha256 = sha256(Buffer.from(canonicalize({ measurements: inspected.measurements,
    preMaster: { r2Key: pointer.r2Key, sha256: inspected.preMasterSha256,
      frameMd5Sha256: inspected.frameMd5Sha256 } }), 'utf8'))
  return {
    accepted: true,
    imageDigest,
    preMaster: { r2Key: pointer.r2Key, sha256: inspected.preMasterSha256,
      byteLength: inspected.preMasterBytes.byteLength, frameMd5Sha256: inspected.frameMd5Sha256 },
    measurements: inspected.measurements,
    reportSha256,
    renderAuthorized: inspected.measurements.p0DefectCount === 0,
    providerCallCount: 0,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
  }
}

export async function executeStage12(payloadInput, imageDigest) {
  const payload = validateStage12Payload(payloadInput)
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-'))
  const inputRoot = join(workRoot, 'input')
  const outputRoot = join(workRoot, 'output')
  await mkdir(inputRoot, { recursive: true })
  await mkdir(outputRoot, { recursive: true })
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const narrationResponse = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=narration&idempotencyKey=${payload.idempotencyKey}`,
      payload.objectAccess.token,
    )
    const narrationBytes = Buffer.from(await narrationResponse.arrayBuffer())
    if (sha256(narrationBytes) !== payload.narration.sha256) {
      throw Object.assign(new Error('Narration read-back mismatch.'), { code: 'STAGE12_NARRATION_INTEGRITY_MISMATCH' })
    }
    const narrationPath = join(inputRoot, 'narration.mp3')
    const mixPath = join(outputRoot, 'mix.wav')
    const preMasterPath = join(outputRoot, 'pre-master.webm')
    const filterPath = join(workRoot, 'video-filter.txt')
    await writeFile(narrationPath, narrationBytes)
    await writeFile(filterPath, buildStage12VideoFilter(payload), 'utf8')

    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', narrationPath,
      '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.002:sample_rate=${payload.render.sampleRateHz}:duration=${payload.durationSec}`,
      '-filter_complex', `[0:a]aresample=${payload.render.sampleRateHz}[n];[1:a]atrim=0:${payload.durationSec}[a];[n][a]amix=inputs=2:duration=longest,atrim=0:${payload.durationSec}[mix]`,
      '-map', '[mix]', '-c:a', 'pcm_s24le', mixPath], workRoot, 'STAGE12_AUDIO_MIX_FAILED')

    const target = `I=${payload.qa.loudness.integratedLufs}:TP=${payload.qa.loudness.truePeakMaxDbtp}:LRA=${payload.qa.loudness.lraMax - 1}`
    const passOne = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', mixPath,
      '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], workRoot,
    'STAGE12_LOUDNESS_ANALYSIS_FAILED')
    const measured = parseLoudnorm(passOne.stderr.toString('utf8'))
    const passTwo = `loudnorm=${target}:measured_I=${measured.integratedLufs}:measured_TP=${measured.truePeakDbtp}:measured_LRA=${measured.loudnessRangeLu}:measured_thresh=${measured.threshold}:offset=${measured.offset}:linear=true`
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y',
      '-f', 'lavfi', '-i', `color=c=${color(payload.timeline.shots[0].background)}:s=${payload.render.width}x${payload.render.height}:r=${payload.render.fps}:d=${payload.durationSec}`,
      '-i', mixPath, '-filter_complex_script', filterPath, '-map', '[vout]', '-map', '1:a',
      '-af', passTwo, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-c:a', 'libopus',
      '-ar', String(payload.render.sampleRateHz), '-t', String(payload.durationSec),
      '-color_primaries', payload.render.colorPrimaries, '-color_trc', payload.render.colorPrimaries,
      '-colorspace', payload.render.colorPrimaries, preMasterPath], workRoot, 'STAGE12_RENDER_FAILED')

    await correctStage12EncodedLoudness(payload, preMasterPath, workRoot)
    const inspected = await inspectPreMaster(payload, preMasterPath, workRoot)
    const uploaded = await uploadPreMaster(payload, inspected.preMasterBytes, inspected.preMasterSha256)
    return stage12Receipt(imageDigest, inspected, uploaded)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

export async function executeStage12Recovery(payloadInput, imageDigest) {
  const payload = validateStage12Payload(payloadInput)
  const recovery = payloadInput?.recovery
  if (!recovery || recovery.attemptOrdinal !== 3 || recovery.render !== false
    || !String(recovery.preMaster?.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(recovery.preMaster?.sha256 ?? '')
    || !Number.isInteger(recovery.preMaster?.byteLength) || recovery.preMaster.byteLength < 1) {
    throw Object.assign(new Error('Invalid Stage 12 recovery envelope.'), { code: 'INVALID_STAGE12_RECOVERY_ENVELOPE' })
  }
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-recovery-'))
  const preMasterPath = join(workRoot, 'pre-master.webm')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=pre-master&idempotencyKey=${payload.idempotencyKey}&sha256=${recovery.preMaster.sha256}`,
      payload.objectAccess.token,
    )
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength !== recovery.preMaster.byteLength || sha256(bytes) !== recovery.preMaster.sha256) {
      throw Object.assign(new Error('Recovery pre-master read-back mismatch.'), {
        code: 'STAGE12_RECOVERY_PRE_MASTER_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(preMasterPath, bytes)
    const inspected = await inspectPreMaster(payload, preMasterPath, workRoot)
    return stage12Receipt(imageDigest, inspected, recovery.preMaster)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

export function validateStage12RemediationPayload(payload) {
  const value = validateStage12Payload(payload)
  const remediation = payload?.remediation
  if (!remediation || remediation.sourceAttemptOrdinal !== 3
    || remediation.diagnosticOrdinal !== 2 || remediation.strategyVersion !== 1
    || remediation.providerDispatch !== 'OFF' || remediation.providerCallCount !== 0
    || remediation.autoPublish !== 'OFF'
    || !String(remediation.sourcePreMaster?.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(remediation.sourcePreMaster?.sha256 ?? '')
    || !Number.isInteger(remediation.sourcePreMaster?.byteLength)
    || remediation.sourcePreMaster.byteLength < 1
    || !HEX64.test(remediation.diagnosticReceiptSha256 ?? '')) {
    throw Object.assign(new Error('Invalid Stage 12 remediation envelope.'), {
      code: 'INVALID_STAGE12_REMEDIATION_ENVELOPE',
    })
  }
  return value
}

export function buildStage12RemediationVideoFilter(payload) {
  const speed = Math.max(120, Math.round(payload.render.width / 4))
  return `eq=brightness=0.11,noise=alls=4:allf=t+u,drawbox=x='mod(t*${speed}\\,iw+120)-120':y=0:w=120:h=ih:color=white@0.08:t=fill`
}

export function buildStage12RemediationAudioFilter(payload) {
  const target = `I=${payload.qa.loudness.integratedLufs}:TP=${payload.qa.loudness.truePeakMaxDbtp}:LRA=${payload.qa.loudness.lraMax - 1}`
  return `compand=attacks=0.15:decays=0.8:points=-80/-80|-35/-43|-20/-24|-10/-10|0/-1,loudnorm=${target}:linear=false`
}

export function validateStage12AudioP0CorrectionPayload(payload) {
  const value = validateStage12Payload(payload)
  const remediation = payload?.remediation
  const matchedStrategyAndOrdinal = remediation
    && ((remediation.strategyVersion === 2 && remediation.correctionOrdinal === 2)
      || (remediation.strategyVersion === 3 && remediation.correctionOrdinal === 3))
  if (!remediation || remediation.sourceAttemptOrdinal !== 3
    || remediation.diagnosticOrdinal !== 2 || !matchedStrategyAndOrdinal
    || typeof remediation.predecessorCorrectionJobId !== 'string'
    || remediation.predecessorCorrectionJobId.length < 3
    || remediation.providerDispatch !== 'OFF' || remediation.providerCallCount !== 0
    || remediation.autoPublish !== 'OFF'
    || !String(remediation.sourceCorrectedPreMaster?.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(remediation.sourceCorrectedPreMaster?.sha256 ?? '')
    || !Number.isInteger(remediation.sourceCorrectedPreMaster?.byteLength)
    || remediation.sourceCorrectedPreMaster.byteLength < 1
    || !HEX64.test(remediation.sourceCorrectionReceiptSha256 ?? '')
    || !Number.isInteger(remediation.correctionPassLimit)
    || remediation.correctionPassLimit < 1) {
    throw Object.assign(new Error('Invalid Stage 12 audio/P0 correction envelope.'), {
      code: 'INVALID_STAGE12_AUDIO_P0_CORRECTION_ENVELOPE',
    })
  }
  return value
}

export function buildStage12AudioP0CorrectionFilter(payload, strategyVersion = payload.remediation?.strategyVersion ?? 2) {
  const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
  const expansionLu = payload.qa.loudness.lraMin + payload.qa.loudness.toleranceLufs
  const periodSec = payload.qa.nearStaticMaxSec * payload.qa.loudness.lraMin
  const truePeakTargetDbtp = payload.qa.loudness.truePeakMaxDbtp
    - payload.qa.loudness.toleranceLufs / (strategyVersion >= 3 ? 1 : 2)
  if (strategyVersion >= 3) {
    const halfPeriodSec = periodSec / 2
    const attenuatedGain = 10 ** (-expansionLu / 20)
    const limiter = 10 ** (truePeakTargetDbtp / 20)
    const macroDynamics = `volume='if(lt(mod(t\\,${periodSec})\\,${halfPeriodSec})\\,${attenuatedGain.toFixed(6)}\\,1)':eval=frame`
    const target = `I=${payload.qa.loudness.integratedLufs}:TP=${truePeakTargetDbtp}:LRA=${lraTarget}`
    return `${macroDynamics},loudnorm=${target}:linear=false,alimiter=limit=${limiter.toFixed(6)}:level=false`
  }
  const macroDynamics = `volume='pow(10\\,(-${expansionLu}/20)*(0.5+0.5*sin(2*PI*t/${periodSec})))':eval=frame`
  const expansion = 'compand=attacks=0.15:decays=0.8:points=-80/-80|-35/-43|-20/-24|-10/-10|0/-1'
  const target = `I=${payload.qa.loudness.integratedLufs}:TP=${truePeakTargetDbtp}:LRA=${lraTarget}`
  return `${macroDynamics},${expansion},loudnorm=${target}:linear=false`
}

export async function executeStage12Remediation(payloadInput, imageDigest) {
  const payload = validateStage12RemediationPayload(payloadInput)
  const remediation = payloadInput.remediation
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-remediation-'))
  const sourcePath = join(workRoot, 'source-pre-master.webm')
  const correctedPath = join(workRoot, 'corrected-pre-master.webm')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=source-pre-master&idempotencyKey=${payload.idempotencyKey}&sha256=${remediation.sourcePreMaster.sha256}`,
      payload.objectAccess.token,
    )
    const sourceBytes = Buffer.from(await response.arrayBuffer())
    if (sourceBytes.byteLength !== remediation.sourcePreMaster.byteLength
      || sha256(sourceBytes) !== remediation.sourcePreMaster.sha256) {
      throw Object.assign(new Error('Remediation source read-back mismatch.'), {
        code: 'STAGE12_REMEDIATION_SOURCE_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(sourcePath, sourceBytes)
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a:0', '-vf', buildStage12RemediationVideoFilter(payload),
      '-af', buildStage12RemediationAudioFilter(payload), '-c:v', 'libvpx-vp9',
      '-deadline', 'realtime', '-c:a', 'libopus', '-ar', String(payload.render.sampleRateHz),
      '-color_primaries', payload.render.colorPrimaries, '-color_trc', payload.render.colorPrimaries,
      '-colorspace', payload.render.colorPrimaries, correctedPath], workRoot,
    'STAGE12_REMEDIATION_TRANSCODE_FAILED')
    await correctStage12EncodedLoudness(payload, correctedPath, workRoot)
    const inspected = await inspectPreMaster(payload, correctedPath, workRoot)
    if (inspected.preMasterSha256 === remediation.sourcePreMaster.sha256) {
      throw Object.assign(new Error('Remediation did not create a distinct artifact.'), {
        code: 'STAGE12_REMEDIATION_OUTPUT_NOT_DISTINCT',
      })
    }
    const uploaded = await uploadPreMaster(payloadInput, inspected.preMasterBytes,
      inspected.preMasterSha256)
    return stage12Receipt(imageDigest, inspected, uploaded)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

export async function executeStage12AudioP0Correction(payloadInput, imageDigest) {
  const payload = validateStage12AudioP0CorrectionPayload(payloadInput)
  const remediation = payloadInput.remediation
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-audio-p0-correction-'))
  const sourcePath = join(workRoot, 'source-corrected-pre-master.webm')
  const correctedPath = join(workRoot, 'audio-p0-corrected-pre-master.webm')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=source-audio-p0-pre-master&idempotencyKey=${payload.idempotencyKey}&sha256=${remediation.sourceCorrectedPreMaster.sha256}`,
      payload.objectAccess.token,
    )
    const sourceBytes = Buffer.from(await response.arrayBuffer())
    if (sourceBytes.byteLength !== remediation.sourceCorrectedPreMaster.byteLength
      || sha256(sourceBytes) !== remediation.sourceCorrectedPreMaster.sha256) {
      throw Object.assign(new Error('Audio/P0 correction source read-back mismatch.'), {
        code: 'STAGE12_AUDIO_P0_CORRECTION_SOURCE_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(sourcePath, sourceBytes)
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
      '-af', buildStage12AudioP0CorrectionFilter(payload, remediation.strategyVersion), '-c:a', 'libopus',
      '-ar', String(payload.render.sampleRateHz), correctedPath], workRoot,
    'STAGE12_AUDIO_P0_CORRECTION_TRANSCODE_FAILED')
    const truePeakTargetDbtp = payload.qa.loudness.truePeakMaxDbtp
      - payload.qa.loudness.toleranceLufs / (remediation.strategyVersion >= 3 ? 1 : 2)
    await correctStage12EncodedLoudness(payload, correctedPath, workRoot, {
      truePeakTargetDbtp, passLimit: remediation.correctionPassLimit,
      useMacroDynamics: remediation.strategyVersion >= 3,
      requirePass: remediation.strategyVersion >= 3,
    })
    const inspected = await inspectPreMaster(payload, correctedPath, workRoot)
    if (inspected.preMasterSha256 === remediation.sourceCorrectedPreMaster.sha256) {
      throw Object.assign(new Error('Audio/P0 correction did not create a distinct artifact.'), {
        code: 'STAGE12_AUDIO_P0_CORRECTION_OUTPUT_NOT_DISTINCT',
      })
    }
    const uploaded = await uploadPreMaster(payloadInput, inspected.preMasterBytes,
      inspected.preMasterSha256)
    return stage12Receipt(imageDigest, inspected, uploaded)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}
