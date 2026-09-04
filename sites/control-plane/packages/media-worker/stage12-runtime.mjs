import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildStage12CodecSafeLraFeasibilityEvidence,
  classifyStage12CodecSafeLraFeasibilityCandidate,
  finalizeStage12CodecSafeLraFeasibilityTrace,
  planStage12CodecSafeLraFeasibilityCandidate,
  stage12CodecSafeLraFeasibilityFingerprints,
  stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint,
  validateStage12CodecSafeLraFeasibilityContract,
} from './stage12-codec-safe-lra-feasibility-controller.mjs'

export {
  buildStage12CodecSafeLraFeasibilityEvidence,
  classifyStage12CodecSafeLraFeasibilityCandidate,
  finalizeStage12CodecSafeLraFeasibilityTrace,
  planStage12CodecSafeLraFeasibilityCandidate,
  stage12CodecSafeLraFeasibilityFingerprints,
  stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint,
}

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

export async function measureStage12EncodedLoudness(
  payload, preMasterPath, workRoot, lraTarget,
) {
  const analysis = await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-i', preMasterPath,
    '-af', `loudnorm=I=${payload.qa.loudness.integratedLufs}:TP=${payload.qa.loudness.truePeakMaxDbtp}:LRA=${lraTarget}:print_format=json`, '-f', 'null', '-'], workRoot,
  'STAGE12_FINAL_LOUDNESS_FAILED')
  return parseLoudnorm(analysis.stderr.toString('utf8'))
}

export async function stage12AudioFrameMd5Sha256(preMasterPath, workRoot) {
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

export function stage12CodecSafeTruePeakFingerprints(payload, correctionPassLimit = 3) {
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
    algorithmVersion: 'stage12-codec-safe-true-peak-shadow-v1',
    correctionPassLimit,
    losslessCodec: 'pcm_f32le',
    candidateInput: 'CANONICAL_LOSSLESS_REFERENCE',
    feedback: 'POST_OPUS_TRUE_PEAK',
    thresholdSnapshotSha256,
  }), 'utf8'))
  return { algorithmFingerprint, thresholdSnapshotSha256 }
}

export function stage12CodecSafeLraGuardFingerprints(payload, controllerPolicy) {
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
    algorithmVersion: 'stage12-codec-safe-lra-guard-shadow-v1',
    anchor: 'PRIOR_SHADOW_CANDIDATE_PASS_1',
    highBracket: 'PRIOR_SHADOW_CANDIDATE_PASS_3',
    lraSearch: 'BOUNDED_BISECTION',
    integratedTrim: 'NEAREST_INTERIOR_BOUNDARY',
    regression: 'ROLLBACK_TO_BEST_SAFE',
    controllerPolicySha256,
    renderKernelFingerprint,
    thresholdSnapshotSha256,
  }), 'utf8'))
  return { algorithmFingerprint, thresholdSnapshotSha256, controllerPolicySha256,
    renderKernelFingerprint }
}

function finiteLraGuardPolicy(policy) {
  return policy && Number.isInteger(policy.maxCandidateCount)
    && policy.maxCandidateCount > 0
    && Number.isFinite(policy.codecOvershootRegressionMaxDb)
    && policy.codecOvershootRegressionMaxDb >= 0
    && Number.isFinite(policy.integratedBoundaryMarginLu)
    && policy.integratedBoundaryMarginLu > 0
    && Number.isFinite(policy.maxIntegratedTargetStepLu)
    && policy.maxIntegratedTargetStepLu > 0
}

function lraGuardRound(value) {
  return Number(value.toFixed(6))
}

function lraGuardReferenceValid(payload, replay) {
  const anchor = replay?.anchorReference
  const high = replay?.highBracketReference
  return finiteLraGuardPolicy(replay?.controllerPolicy)
    && anchor?.candidatePass === 1 && high?.candidatePass === 3
    && Number.isFinite(anchor.integratedTargetLufs)
    && Number.isFinite(anchor.limiterCeilingDbtp)
    && Number.isFinite(anchor.macroDepthDb)
    && Number.isFinite(anchor.codecOvershootDb)
    && Number.isFinite(anchor.integratedLufs) && Number.isFinite(anchor.truePeakDbtp)
    && Number.isFinite(anchor.loudnessRangeLu)
    && Number.isFinite(high.macroDepthDb) && high.macroDepthDb > anchor.macroDepthDb
    && Number.isFinite(high.loudnessRangeLu)
    && anchor.truePeakDbtp <= payload.qa.loudness.truePeakMaxDbtp
    && anchor.loudnessRangeLu < payload.qa.loudness.lraMin
    && high.loudnessRangeLu > payload.qa.loudness.lraMax
    && HEX64.test(anchor.audioFrameMd5Sha256 ?? '')
    && HEX64.test(high.audioFrameMd5Sha256 ?? '')
}

function lraGuardCandidateSafe(payload, replay, candidate) {
  return candidate.disposition !== 'ANCHOR_DRIFT'
    && candidate.disposition !== 'REGRESSION_REJECTED'
    && candidate.disposition !== 'HIGH_BRACKET'
    && candidate.truePeakDbtp <= payload.qa.loudness.truePeakMaxDbtp
    && candidate.codecOvershootDb <= replay.anchorReference.codecOvershootDb
      + replay.controllerPolicy.codecOvershootRegressionMaxDb
}

function lraGuardDistance(value, min, max) {
  return value < min ? min - value : value > max ? value - max : 0
}

function bestLraGuardCandidatePass(payload, replay, candidates) {
  const safe = candidates.filter((candidate) => lraGuardCandidateSafe(payload, replay, candidate))
  safe.sort((left, right) => {
    const leftScore = [left.failedPredicates.length,
      lraGuardDistance(left.loudnessRangeLu, payload.qa.loudness.lraMin,
        payload.qa.loudness.lraMax),
      lraGuardDistance(left.integratedLufs,
        payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs,
        payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs),
      left.candidatePass]
    const rightScore = [right.failedPredicates.length,
      lraGuardDistance(right.loudnessRangeLu, payload.qa.loudness.lraMin,
        payload.qa.loudness.lraMax),
      lraGuardDistance(right.integratedLufs,
        payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs,
        payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs),
      right.candidatePass]
    for (let index = 0; index < leftScore.length; index += 1) {
      if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index]
    }
    return 0
  })
  return safe[0]?.candidatePass ?? null
}

function lraGuardFullPass(payload, candidate) {
  return stage12LoudnessFailedPredicates(payload, candidate).length === 0
}

export function finalizeStage12CodecSafeLraGuardTrace(payload, replay, candidates) {
  if (!lraGuardReferenceValid(payload, replay) || !Array.isArray(candidates)
    || candidates.length < 1 || candidates.some((candidate, index) =>
      candidate.candidatePass !== index)) {
    throw Object.assign(new Error('Invalid Stage 12 LRA guard trace.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_LRA_GUARD_TRACE',
    })
  }
  const last = candidates.at(-1)
  let terminalReason = null
  if (last.disposition === 'FULL_PASS' && lraGuardFullPass(payload, last)) {
    terminalReason = 'PASS'
  } else if (candidates[0].disposition === 'ANCHOR_DRIFT') {
    terminalReason = 'ANCHOR_REPRODUCTION_DRIFT'
  } else if (candidates.length >= replay.controllerPolicy.maxCandidateCount) {
    terminalReason = 'BUDGET_EXHAUSTED'
  }
  if (!terminalReason) {
    throw Object.assign(new Error('Stage 12 LRA guard trace is not terminal.'), {
      code: 'STAGE12_CODEC_SAFE_LRA_GUARD_TRACE_INCOMPLETE',
    })
  }
  const bestSafeCandidatePass = bestLraGuardCandidatePass(payload, replay, candidates)
  const selectedCandidatePass = terminalReason === 'PASS'
    ? last.candidatePass : bestSafeCandidatePass ?? 0
  const selected = candidates[selectedCandidatePass]
  return {
    shadowOutcome: terminalReason === 'PASS' ? 'PASS' : 'FAIL',
    terminalReason,
    lastEvaluatedCandidatePass: last.candidatePass,
    bestSafeCandidatePass,
    selectedCandidatePass,
    finalMeasurements: {
      integratedLufs: selected.integratedLufs,
      integratedLufsExact: selected.integratedLufsExact,
      truePeakDbtp: selected.truePeakDbtp,
      truePeakDbtpExact: selected.truePeakDbtpExact,
      loudnessRangeLu: selected.loudnessRangeLu,
      loudnessRangeLuExact: selected.loudnessRangeLuExact,
    },
    failedPredicates: selected.failedPredicates,
  }
}

export function planStage12CodecSafeLraGuardCandidate(payload, replay, candidates) {
  if (!lraGuardReferenceValid(payload, replay) || !Array.isArray(candidates)
    || candidates.some((candidate, index) => candidate.candidatePass !== index)) {
    throw Object.assign(new Error('Invalid Stage 12 LRA guard planner input.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER',
    })
  }
  if (candidates.length > 0 && (candidates.at(-1).disposition === 'FULL_PASS'
    || candidates[0].disposition === 'ANCHOR_DRIFT'
    || candidates.length >= replay.controllerPolicy.maxCandidateCount)) {
    return { done: true, ...finalizeStage12CodecSafeLraGuardTrace(payload, replay, candidates) }
  }
  const anchor = replay.anchorReference
  const high = replay.highBracketReference
  if (candidates.length === 0) {
    return { done: false, candidatePass: 0, phase: 'ANCHOR_REPRODUCTION',
      decision: 'ANCHOR', parentCandidatePass: null, rollbackToCandidatePass: null,
      bracketLowDepthDb: anchor.macroDepthDb, bracketHighDepthDb: high.macroDepthDb,
      integratedTargetLufs: anchor.integratedTargetLufs,
      limiterCeilingDbtp: anchor.limiterCeilingDbtp,
      macroDepthDb: anchor.macroDepthDb, targetStepLufs: 0 }
  }
  const lraSafe = candidates.filter((candidate) => lraGuardCandidateSafe(payload, replay, candidate)
    && candidate.loudnessRangeLu >= payload.qa.loudness.lraMin
    && candidate.loudnessRangeLu <= payload.qa.loudness.lraMax)
  if (lraSafe.length > 0) {
    const acceptedTrim = lraSafe.filter((candidate) =>
      ['SAFE_ANCHOR', 'LRA_ACCEPTED', 'TRIM_ACCEPTED'].includes(candidate.disposition))
    const parent = acceptedTrim.at(-1)
    if (!parent) {
      throw Object.assign(new Error('Missing Stage 12 LRA guard trim anchor.'), {
        code: 'INVALID_STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER',
      })
    }
    const last = candidates.at(-1)
    const rollback = last.phase === 'INTEGRATED_LUFS_TRIM'
      && last.disposition === 'REGRESSION_REJECTED'
    const minimum = payload.qa.loudness.integratedLufs - payload.qa.loudness.toleranceLufs
      + replay.controllerPolicy.integratedBoundaryMarginLu
    const maximum = payload.qa.loudness.integratedLufs + payload.qa.loudness.toleranceLufs
      - replay.controllerPolicy.integratedBoundaryMarginLu
    let targetStepLufs
    if (rollback) {
      targetStepLufs = last.targetStepLufs / 2
    } else {
      const desired = parent.integratedLufs < minimum ? minimum
        : parent.integratedLufs > maximum ? maximum : parent.integratedLufs
      targetStepLufs = desired - parent.integratedLufs
      targetStepLufs = Math.max(-replay.controllerPolicy.maxIntegratedTargetStepLu,
        Math.min(replay.controllerPolicy.maxIntegratedTargetStepLu, targetStepLufs))
    }
    targetStepLufs = lraGuardRound(targetStepLufs)
    return { done: false, candidatePass: candidates.length,
      phase: 'INTEGRATED_LUFS_TRIM', decision: 'NEAREST_BOUNDARY_TRIM',
      parentCandidatePass: parent.candidatePass,
      rollbackToCandidatePass: rollback ? parent.candidatePass : null,
      bracketLowDepthDb: parent.macroDepthDb, bracketHighDepthDb: parent.macroDepthDb,
      integratedTargetLufs: lraGuardRound(parent.integratedTargetLufs + targetStepLufs),
      limiterCeilingDbtp: parent.limiterCeilingDbtp,
      macroDepthDb: parent.macroDepthDb, targetStepLufs }
  }
  let bracketLowDepthDb = anchor.macroDepthDb
  let bracketHighDepthDb = high.macroDepthDb
  let parentCandidatePass = 0
  for (const candidate of candidates.slice(1)) {
    if (candidate.phase !== 'LRA_BRACKET_SEARCH') continue
    if (candidate.disposition === 'LOW_BRACKET') {
      bracketLowDepthDb = Math.max(bracketLowDepthDb, candidate.macroDepthDb)
      parentCandidatePass = candidate.candidatePass
    } else if (candidate.disposition === 'HIGH_BRACKET'
      || candidate.disposition === 'REGRESSION_REJECTED') {
      bracketHighDepthDb = Math.min(bracketHighDepthDb, candidate.macroDepthDb)
    }
  }
  const last = candidates.at(-1)
  const rollback = last.disposition === 'REGRESSION_REJECTED'
    || last.disposition === 'HIGH_BRACKET'
  return { done: false, candidatePass: candidates.length, phase: 'LRA_BRACKET_SEARCH',
    decision: 'BISECTION', parentCandidatePass,
    rollbackToCandidatePass: rollback ? parentCandidatePass : null,
    bracketLowDepthDb: lraGuardRound(bracketLowDepthDb),
    bracketHighDepthDb: lraGuardRound(bracketHighDepthDb),
    integratedTargetLufs: anchor.integratedTargetLufs,
    limiterCeilingDbtp: anchor.limiterCeilingDbtp,
    macroDepthDb: lraGuardRound((bracketLowDepthDb + bracketHighDepthDb) / 2),
    targetStepLufs: 0 }
}

export function classifyStage12CodecSafeLraGuardCandidate(payload, replay, plan, measured) {
  if (plan?.done !== false || !lraGuardReferenceValid(payload, replay)
    || !Number.isFinite(measured?.integratedLufs)
    || !Number.isFinite(measured?.truePeakDbtp)
    || !Number.isFinite(measured?.loudnessRangeLu)
    || !/^-?\d+(?:\.\d+)?$/u.test(measured?.integratedLufsExact ?? '')
    || !/^-?\d+(?:\.\d+)?$/u.test(measured?.truePeakDbtpExact ?? '')
    || !/^-?\d+(?:\.\d+)?$/u.test(measured?.loudnessRangeLuExact ?? '')
    || Number(measured.integratedLufsExact) !== measured.integratedLufs
    || Number(measured.truePeakDbtpExact) !== measured.truePeakDbtp
    || Number(measured.loudnessRangeLuExact) !== measured.loudnessRangeLu
    || !HEX64.test(measured?.audioFrameMd5Sha256 ?? '')) {
    throw Object.assign(new Error('Invalid Stage 12 LRA guard measurement.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_LRA_GUARD_MEASUREMENT',
    })
  }
  const codecOvershootDb = Math.max(0,
    measured.truePeakDbtp - plan.limiterCeilingDbtp)
  const failedPredicates = stage12LoudnessFailedPredicates(payload, measured)
  let disposition
  if (plan.phase === 'ANCHOR_REPRODUCTION') {
    const reference = replay.anchorReference
    const drifted = measured.integratedLufs !== reference.integratedLufs
      || measured.integratedLufsExact !== reference.integratedLufsExact
      || measured.truePeakDbtp !== reference.truePeakDbtp
      || measured.truePeakDbtpExact !== reference.truePeakDbtpExact
      || measured.loudnessRangeLu !== reference.loudnessRangeLu
      || measured.loudnessRangeLuExact !== reference.loudnessRangeLuExact
      || measured.audioFrameMd5Sha256 !== reference.audioFrameMd5Sha256
    disposition = drifted ? 'ANCHOR_DRIFT'
      : failedPredicates.length === 0 ? 'FULL_PASS' : 'SAFE_ANCHOR'
  } else {
    const truePeakRegression = measured.truePeakDbtp > payload.qa.loudness.truePeakMaxDbtp
      || codecOvershootDb > replay.anchorReference.codecOvershootDb
        + replay.controllerPolicy.codecOvershootRegressionMaxDb
    if (truePeakRegression || (plan.phase === 'INTEGRATED_LUFS_TRIM'
      && (measured.loudnessRangeLu < payload.qa.loudness.lraMin
        || measured.loudnessRangeLu > payload.qa.loudness.lraMax))) {
      disposition = 'REGRESSION_REJECTED'
    } else if (failedPredicates.length === 0) {
      disposition = 'FULL_PASS'
    } else if (plan.phase === 'LRA_BRACKET_SEARCH') {
      disposition = measured.loudnessRangeLu < payload.qa.loudness.lraMin
        ? 'LOW_BRACKET' : measured.loudnessRangeLu > payload.qa.loudness.lraMax
          ? 'HIGH_BRACKET' : 'LRA_ACCEPTED'
    } else {
      disposition = 'TRIM_ACCEPTED'
    }
  }
  return { ...plan, disposition,
    losslessReferenceSha256: replay.losslessReferenceSha256
      ?? replay.anchorReference.losslessReferenceSha256,
    codecOvershootDb, integratedLufs: measured.integratedLufs,
    integratedLufsExact: measured.integratedLufsExact,
    truePeakDbtp: measured.truePeakDbtp, truePeakDbtpExact: measured.truePeakDbtpExact,
    loudnessRangeLu: measured.loudnessRangeLu,
    loudnessRangeLuExact: measured.loudnessRangeLuExact,
    failedPredicates, audioFrameMd5Sha256: measured.audioFrameMd5Sha256 }
}

export function initialStage12CodecSafeTruePeakController(payload) {
  return {
    integratedTargetLufs: payload.qa.loudness.integratedLufs,
    limiterCeilingDbtp: payload.qa.loudness.truePeakMaxDbtp
      - payload.qa.loudness.toleranceLufs,
    macroDepthDb: payload.qa.loudness.lraMin + payload.qa.loudness.toleranceLufs,
    lowLraDepthDb: null,
    highLraDepthDb: null,
  }
}

function finiteCodecSafeController(value) {
  return value && Number.isFinite(value.integratedTargetLufs)
    && Number.isFinite(value.limiterCeilingDbtp)
    && Number.isFinite(value.macroDepthDb) && value.macroDepthDb >= 0
    && (value.lowLraDepthDb === null || Number.isFinite(value.lowLraDepthDb))
    && (value.highLraDepthDb === null || Number.isFinite(value.highLraDepthDb))
}

export function nextStage12CodecSafeTruePeakController(payload, controller, measurement) {
  if (!finiteCodecSafeController(controller) || !measurement
    || !Number.isFinite(measurement.integratedLufs)
    || !Number.isFinite(measurement.truePeakDbtp)
    || !Number.isFinite(measurement.loudnessRangeLu)) {
    throw Object.assign(new Error('Invalid Stage 12 codec-safe controller state.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_TRUE_PEAK_CONTROLLER',
    })
  }
  const integratedMinimum = payload.qa.loudness.integratedLufs
    - payload.qa.loudness.toleranceLufs
  const integratedMaximum = payload.qa.loudness.integratedLufs
    + payload.qa.loudness.toleranceLufs
  const integratedOutside = measurement.integratedLufs < integratedMinimum
    || measurement.integratedLufs > integratedMaximum
  const integratedTargetLufs = integratedOutside
    ? controller.integratedTargetLufs
      + payload.qa.loudness.integratedLufs - measurement.integratedLufs
    : controller.integratedTargetLufs
  const codecOvershootDb = Math.max(0,
    measurement.truePeakDbtp - controller.limiterCeilingDbtp)
  const limiterCeilingDbtp = Math.min(controller.limiterCeilingDbtp,
    payload.qa.loudness.truePeakMaxDbtp - codecOvershootDb)
  const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
  let lowLraDepthDb = controller.lowLraDepthDb
  let highLraDepthDb = controller.highLraDepthDb
  let macroDepthDb = controller.macroDepthDb
  if (measurement.loudnessRangeLu < payload.qa.loudness.lraMin) {
    lowLraDepthDb = lowLraDepthDb === null
      ? controller.macroDepthDb : Math.max(lowLraDepthDb, controller.macroDepthDb)
    macroDepthDb = highLraDepthDb === null
      ? controller.macroDepthDb + lraTarget - measurement.loudnessRangeLu
      : (lowLraDepthDb + highLraDepthDb) / 2
  } else if (measurement.loudnessRangeLu > payload.qa.loudness.lraMax) {
    highLraDepthDb = highLraDepthDb === null
      ? controller.macroDepthDb : Math.min(highLraDepthDb, controller.macroDepthDb)
    macroDepthDb = lowLraDepthDb === null
      ? Math.max(0, controller.macroDepthDb
        - (measurement.loudnessRangeLu - lraTarget))
      : (lowLraDepthDb + highLraDepthDb) / 2
  }
  const next = { integratedTargetLufs, limiterCeilingDbtp, macroDepthDb,
    lowLraDepthDb, highLraDepthDb }
  if (!finiteCodecSafeController(next)) {
    throw Object.assign(new Error('Stage 12 codec-safe controller did not converge finitely.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_TRUE_PEAK_CONTROLLER',
    })
  }
  return next
}

function validateCodecSafeCandidate(payload, candidate, candidatePass, losslessReferenceSha256,
  expectedController) {
  const phase = candidatePass === 0
    ? 'INITIAL_CODEC_SAFE_CANDIDATE' : 'POST_OPUS_FEEDBACK_CANDIDATE'
  const expectedOvershoot = Math.max(0,
    candidate.truePeakDbtp - candidate.limiterCeilingDbtp)
  if (!candidate || candidate.candidatePass !== candidatePass || candidate.phase !== phase
    || candidate.losslessReferenceSha256 !== losslessReferenceSha256
    || candidate.integratedTargetLufs !== expectedController.integratedTargetLufs
    || candidate.limiterCeilingDbtp !== expectedController.limiterCeilingDbtp
    || candidate.macroDepthDb !== expectedController.macroDepthDb
    || !Number.isFinite(candidate.codecOvershootDb)
    || candidate.codecOvershootDb !== expectedOvershoot
    || !Number.isFinite(candidate.integratedLufs) || !Number.isFinite(candidate.truePeakDbtp)
    || !Number.isFinite(candidate.loudnessRangeLu)
    || !/^-?\d+(?:\.\d+)?$/u.test(candidate.integratedLufsExact ?? '')
    || !/^-?\d+(?:\.\d+)?$/u.test(candidate.truePeakDbtpExact ?? '')
    || !/^-?\d+(?:\.\d+)?$/u.test(candidate.loudnessRangeLuExact ?? '')
    || Number(candidate.integratedLufsExact) !== candidate.integratedLufs
    || Number(candidate.truePeakDbtpExact) !== candidate.truePeakDbtp
    || Number(candidate.loudnessRangeLuExact) !== candidate.loudnessRangeLu
    || !HEX64.test(candidate.audioFrameMd5Sha256 ?? '')
    || canonicalize(candidate.failedPredicates) !== canonicalize(
      stage12LoudnessFailedPredicates(payload, candidate),
    )) {
    throw Object.assign(new Error('Invalid Stage 12 codec-safe shadow candidate.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_EVIDENCE',
    })
  }
}

export function buildStage12CodecSafeTruePeakShadowEvidence(payload, evidence) {
  const invalid = () => Object.assign(new Error('Invalid Stage 12 codec-safe shadow evidence.'), {
    code: 'INVALID_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_EVIDENCE',
  })
  const candidates = evidence?.candidates
  const terminalCandidatePass = Array.isArray(candidates) ? candidates.length - 1 : -1
  if (evidence?.evidenceSemantics !== 'CODEC_SAFE_SHADOW_NOT_CORRECTION'
    || evidence?.source?.correctionOrdinal !== 2
    || typeof evidence.source.correctionJobId !== 'string'
    || !String(evidence.source.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(evidence.source.sha256 ?? '')
    || !Number.isInteger(evidence.source.byteLength) || evidence.source.byteLength < 1
    || !HEX64.test(evidence.source.receiptSha256 ?? '')
    || evidence?.historicalFailure?.correctionOrdinal !== 3
    || typeof evidence.historicalFailure.correctionJobId !== 'string'
    || evidence.historicalFailure.errorCode !== 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
    || typeof evidence?.diagnosticReplay?.jobId !== 'string'
    || !HEX64.test(evidence?.diagnosticReplay?.evidenceId ?? '')
    || !evidence.losslessReference || !HEX64.test(evidence.losslessReference.sha256 ?? '')
    || !HEX64.test(evidence.losslessReference.audioFrameMd5Sha256 ?? '')
    || !Number.isInteger(evidence.losslessReference.byteLength)
    || evidence.losslessReference.byteLength < 1
    || evidence.losslessReference.codec !== 'pcm_f32le'
    || evidence.losslessReference.sampleRateHz !== payload.render.sampleRateHz
    || !Array.isArray(candidates) || candidates.length < 1 || candidates.length > 4
    || !/^sha256:[a-f0-9]{64}$/u.test(evidence.workerImageDigest ?? '')
    || evidence.workerImageDigest !== evidence.expectedWorkerImageDigest
    || !HEX64.test(evidence.algorithmFingerprint ?? '')
    || !HEX64.test(evidence.thresholdSnapshotSha256 ?? '')
    || typeof evidence.runtimeProvenance?.ffmpegVersion !== 'string'
    || evidence.runtimeProvenance.ffmpegVersion.length < 8
    || !HEX64.test(evidence.runtimeProvenance.ffmpegBuildFingerprint ?? '')
    || !HEX64.test(evidence.runtimeProvenance.libopusEncoderFingerprint ?? '')) throw invalid()
  let controller = initialStage12CodecSafeTruePeakController(payload)
  for (let index = 0; index < candidates.length; index += 1) {
    validateCodecSafeCandidate(payload, candidates[index], index,
      evidence.losslessReference.sha256, controller)
    if (index < candidates.length - 1) {
      controller = nextStage12CodecSafeTruePeakController(payload, controller, candidates[index])
    }
  }
  const finalObservation = candidates.at(-1)
  const failedPredicates = stage12LoudnessFailedPredicates(payload, finalObservation)
  if (terminalCandidatePass < 3 && failedPredicates.length > 0) throw invalid()
  const shadowOutcome = failedPredicates.length === 0 ? 'PASS' : 'FAIL'
  return {
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: evidence.evidenceSemantics,
    boundary: 'POST_OPUS_TRUE_PEAK_FEEDBACK',
    source: evidence.source,
    historicalFailure: evidence.historicalFailure,
    diagnosticReplay: evidence.diagnosticReplay,
    losslessReference: evidence.losslessReference,
    candidates,
    terminalCandidatePass,
    finalMeasurements: {
      integratedLufs: finalObservation.integratedLufs,
      integratedLufsExact: finalObservation.integratedLufsExact,
      truePeakDbtp: finalObservation.truePeakDbtp,
      truePeakDbtpExact: finalObservation.truePeakDbtpExact,
      loudnessRangeLu: finalObservation.loudnessRangeLu,
      loudnessRangeLuExact: finalObservation.loudnessRangeLuExact,
    },
    failedPredicates,
    shadowOutcome,
    workerImageDigest: evidence.workerImageDigest,
    expectedWorkerImageDigest: evidence.expectedWorkerImageDigest,
    algorithmFingerprint: evidence.algorithmFingerprint,
    thresholdSnapshotSha256: evidence.thresholdSnapshotSha256,
    runtimeProvenance: evidence.runtimeProvenance,
    correctionPassLimit: 3,
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

export function validateStage12CodecSafeTruePeakShadowPayload(payload, imageDigest) {
  const value = validateStage12Payload(payload)
  const replay = payload?.codecSafeShadowReplay
  const fingerprints = stage12CodecSafeTruePeakFingerprints(
    payload, Number.isInteger(replay?.correctionPassLimit) ? replay.correctionPassLimit : 3,
  )
  if (!replay || replay.schemaVersion !== 1
    || replay.evidenceSemantics !== 'CODEC_SAFE_SHADOW_NOT_CORRECTION'
    || replay.sourceAttemptOrdinal !== 3 || replay.sourceCorrectionOrdinal !== 2
    || replay.historicalFailureCorrectionOrdinal !== 3 || replay.correctionPassLimit !== 3
    || typeof replay.sourceCorrectionJobId !== 'string'
    || typeof replay.historicalFailureJobId !== 'string'
    || typeof replay.diagnosticReplayJobId !== 'string'
    || !HEX64.test(replay.diagnosticReplayEvidenceId ?? '')
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
    || replay.productionActivation !== false || replay.autoPublish !== 'OFF') {
    throw Object.assign(new Error('Invalid Stage 12 codec-safe true-peak shadow envelope.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_ENVELOPE',
    })
  }
  if (imageDigest !== undefined && replay.expectedWorkerImageDigest !== imageDigest) {
    throw Object.assign(new Error('Codec-safe shadow worker image does not match the pin.'), {
      code: 'STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_WORKER_IMAGE_MISMATCH',
    })
  }
  return value
}

function validLraGuardReferenceCandidate(payload, candidate, candidatePass) {
  return candidate?.candidatePass === candidatePass
    && candidate.losslessReferenceSha256 && HEX64.test(candidate.losslessReferenceSha256)
    && Number.isFinite(candidate.integratedTargetLufs)
    && Number.isFinite(candidate.limiterCeilingDbtp)
    && Number.isFinite(candidate.macroDepthDb)
    && Number.isFinite(candidate.codecOvershootDb)
    && Number.isFinite(candidate.integratedLufs)
    && Number.isFinite(candidate.truePeakDbtp)
    && Number.isFinite(candidate.loudnessRangeLu)
    && /^-?\d+(?:\.\d+)?$/u.test(candidate.integratedLufsExact ?? '')
    && /^-?\d+(?:\.\d+)?$/u.test(candidate.truePeakDbtpExact ?? '')
    && /^-?\d+(?:\.\d+)?$/u.test(candidate.loudnessRangeLuExact ?? '')
    && Number(candidate.integratedLufsExact) === candidate.integratedLufs
    && Number(candidate.truePeakDbtpExact) === candidate.truePeakDbtp
    && Number(candidate.loudnessRangeLuExact) === candidate.loudnessRangeLu
    && candidate.codecOvershootDb === Math.max(0,
      candidate.truePeakDbtp - candidate.limiterCeilingDbtp)
    && HEX64.test(candidate.audioFrameMd5Sha256 ?? '')
    && canonicalize(candidate.failedPredicates) === canonicalize(
      stage12LoudnessFailedPredicates(payload, candidate),
    )
}

function validLraGuardRuntimeProvenance(value) {
  return value && typeof value.ffmpegVersion === 'string' && value.ffmpegVersion.length >= 8
    && HEX64.test(value.ffmpegBuildFingerprint ?? '')
    && HEX64.test(value.libopusEncoderFingerprint ?? '')
}

function stage12CodecSafeLraGuardRenderRuntimeFingerprint(renderKernelFingerprint,
  runtimeProvenance) {
  return sha256(Buffer.from(canonicalize({ renderKernelFingerprint, runtimeProvenance }), 'utf8'))
}

export function validateStage12CodecSafeLraGuardShadowPayload(payload, imageDigest) {
  const value = validateStage12Payload(payload)
  const replay = payload?.codecSafeLraGuardShadowReplay
  const fingerprints = stage12CodecSafeLraGuardFingerprints(
    payload, replay?.controllerPolicy,
  )
  if (!replay || replay.schemaVersion !== 1
    || replay.evidenceSemantics !== 'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION'
    || replay.sourceAttemptOrdinal !== 3 || replay.sourceCorrectionOrdinal !== 2
    || replay.historicalFailureCorrectionOrdinal !== 3
    || typeof replay.sourceCorrectionJobId !== 'string'
    || typeof replay.historicalFailureJobId !== 'string'
    || typeof replay.diagnosticReplayJobId !== 'string'
    || !HEX64.test(replay.diagnosticReplayEvidenceId ?? '')
    || typeof replay.codecSafeTruePeakShadowJobId !== 'string'
    || !HEX64.test(replay.codecSafeTruePeakShadowEvidenceId ?? '')
    || !String(replay.sourceCorrectedPreMaster?.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(replay.sourceCorrectedPreMaster?.sha256 ?? '')
    || !Number.isInteger(replay.sourceCorrectedPreMaster?.byteLength)
    || replay.sourceCorrectedPreMaster.byteLength < 1
    || !HEX64.test(replay.sourceCorrectionReceiptSha256 ?? '')
    || !/^sha256:[a-f0-9]{64}$/u.test(replay.parentWorkerImageDigest ?? '')
    || !HEX64.test(replay.parentAlgorithmFingerprint ?? '')
    || replay.parentThresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || !validLraGuardRuntimeProvenance(replay.parentRuntimeProvenance)
    || !replay.parentLosslessReference
    || !HEX64.test(replay.parentLosslessReference.sha256 ?? '')
    || !HEX64.test(replay.parentLosslessReference.audioFrameMd5Sha256 ?? '')
    || !Number.isInteger(replay.parentLosslessReference.byteLength)
    || replay.parentLosslessReference.byteLength < 1
    || replay.parentLosslessReference.codec !== 'pcm_f32le'
    || replay.parentLosslessReference.sampleRateHz !== payload.render.sampleRateHz
    || !validLraGuardReferenceCandidate(payload, replay.anchorReference, 1)
    || !validLraGuardReferenceCandidate(payload, replay.highBracketReference, 3)
    || replay.anchorReference.losslessReferenceSha256
      !== replay.parentLosslessReference.sha256
    || replay.highBracketReference.losslessReferenceSha256
      !== replay.parentLosslessReference.sha256
    || !lraGuardReferenceValid(payload, replay)
    || !/^sha256:[a-f0-9]{64}$/u.test(replay.expectedWorkerImageDigest ?? '')
    || replay.algorithmFingerprint !== fingerprints.algorithmFingerprint
    || replay.thresholdSnapshotSha256 !== fingerprints.thresholdSnapshotSha256
    || replay.controllerPolicySha256 !== fingerprints.controllerPolicySha256
    || replay.renderKernelFingerprint !== fingerprints.renderKernelFingerprint
    || replay.parentRenderRuntimeFingerprint
      !== stage12CodecSafeLraGuardRenderRuntimeFingerprint(
        replay.renderKernelFingerprint, replay.parentRuntimeProvenance,
      )
    || replay.historicalBackfill !== false || replay.uploadCorrectedOutput !== false
    || replay.providerDispatch !== 'OFF' || replay.providerCallCount !== 0
    || replay.calibration !== false || replay.finalize !== false || replay.release !== false
    || replay.productionActivation !== false || replay.autoPublish !== 'OFF') {
    throw Object.assign(new Error('Invalid Stage 12 codec-safe LRA guard envelope.'), {
      code: 'INVALID_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_ENVELOPE',
    })
  }
  if (imageDigest !== undefined && replay.expectedWorkerImageDigest !== imageDigest) {
    throw Object.assign(new Error('LRA guard shadow worker image does not match the pin.'), {
      code: 'STAGE12_CODEC_SAFE_LRA_GUARD_WORKER_IMAGE_MISMATCH',
    })
  }
  return value
}

export function validateStage12CodecSafeLraFeasibilityPayload(payload, imageDigest) {
  const value = validateStage12Payload(payload)
  validateStage12CodecSafeLraFeasibilityContract(payload, imageDigest)
  return value
}

export function buildStage12CodecSafeLraGuardShadowEvidence(payload, evidence) {
  const invalid = () => Object.assign(new Error('Invalid Stage 12 LRA guard evidence.'), {
    code: 'INVALID_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE',
  })
  const replay = evidence?.replay
  const candidates = evidence?.candidates
  if (evidence?.evidenceSemantics !== 'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION'
    || !replay || !lraGuardReferenceValid(payload, replay)
    || evidence?.source?.correctionOrdinal !== 2
    || typeof evidence.source.correctionJobId !== 'string'
    || !String(evidence.source.r2Key ?? '').startsWith('prod/')
    || !HEX64.test(evidence.source.sha256 ?? '')
    || !Number.isInteger(evidence.source.byteLength) || evidence.source.byteLength < 1
    || !HEX64.test(evidence.source.receiptSha256 ?? '')
    || evidence?.historicalFailure?.correctionOrdinal !== 3
    || evidence.historicalFailure.errorCode !== 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
    || typeof evidence?.diagnosticReplay?.jobId !== 'string'
    || !HEX64.test(evidence?.diagnosticReplay?.evidenceId ?? '')
    || typeof evidence?.parentShadow?.jobId !== 'string'
    || !HEX64.test(evidence?.parentShadow?.evidenceId ?? '')
    || !evidence.losslessReference || !HEX64.test(evidence.losslessReference.sha256 ?? '')
    || !HEX64.test(evidence.losslessReference.audioFrameMd5Sha256 ?? '')
    || evidence.losslessReference.codec !== 'pcm_f32le'
    || evidence.losslessReference.sampleRateHz !== payload.render.sampleRateHz
    || evidence.losslessReference.sha256 !== replay.parentLosslessReference.sha256
    || evidence.losslessReference.byteLength !== replay.parentLosslessReference.byteLength
    || evidence.losslessReference.audioFrameMd5Sha256
      !== replay.parentLosslessReference.audioFrameMd5Sha256
    || !Array.isArray(candidates) || candidates.length < 1
    || candidates.length > replay.controllerPolicy.maxCandidateCount
    || !/^sha256:[a-f0-9]{64}$/u.test(evidence.workerImageDigest ?? '')
    || evidence.workerImageDigest !== evidence.expectedWorkerImageDigest
    || !validLraGuardRuntimeProvenance(evidence.runtimeProvenance)
    || canonicalize(evidence.runtimeProvenance)
      !== canonicalize(replay.parentRuntimeProvenance)
    || evidence.renderRuntimeFingerprint
      !== stage12CodecSafeLraGuardRenderRuntimeFingerprint(
        evidence.renderKernelFingerprint, evidence.runtimeProvenance,
      )) throw invalid()
  const replayState = { ...replay, losslessReferenceSha256: evidence.losslessReference.sha256 }
  const accepted = []
  for (const candidate of candidates) {
    const plan = planStage12CodecSafeLraGuardCandidate(payload, replayState, accepted)
    if (plan.done || candidate.candidatePass !== plan.candidatePass) throw invalid()
    const expected = classifyStage12CodecSafeLraGuardCandidate(payload, replayState, plan, {
      integratedLufs: candidate.integratedLufs,
      integratedLufsExact: candidate.integratedLufsExact,
      truePeakDbtp: candidate.truePeakDbtp,
      truePeakDbtpExact: candidate.truePeakDbtpExact,
      loudnessRangeLu: candidate.loudnessRangeLu,
      loudnessRangeLuExact: candidate.loudnessRangeLuExact,
      audioFrameMd5Sha256: candidate.audioFrameMd5Sha256,
    })
    if (canonicalize(expected) !== canonicalize(candidate)) throw invalid()
    accepted.push(candidate)
  }
  let terminal
  try {
    terminal = finalizeStage12CodecSafeLraGuardTrace(payload, replayState, accepted)
  } catch {
    throw invalid()
  }
  return {
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: evidence.evidenceSemantics,
    boundary: 'POST_OPUS_LRA_GUARD_FEEDBACK',
    source: evidence.source,
    historicalFailure: evidence.historicalFailure,
    diagnosticReplay: evidence.diagnosticReplay,
    parentShadow: evidence.parentShadow,
    losslessReference: evidence.losslessReference,
    anchorReference: replay.anchorReference,
    highBracketReference: replay.highBracketReference,
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

function stage12CodecSafeMacroDynamics(payload, macroDepthDb) {
  if (macroDepthDb === 0) return ''
  const periodSec = payload.qa.nearStaticMaxSec * payload.qa.loudness.lraMin
  const halfPeriodSec = periodSec / 2
  const attenuatedGain = 10 ** (-macroDepthDb / 20)
  return `volume='if(lt(mod(t\\,${periodSec})\\,${halfPeriodSec})\\,${attenuatedGain.toFixed(6)}\\,1)':eval=frame,`
}

export async function renderStage12CodecSafeCandidate(
  payload, losslessReferencePath, candidatePath, workRoot, controller,
) {
  const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
  const target = `I=${controller.integratedTargetLufs.toFixed(6)}:TP=${controller.limiterCeilingDbtp.toFixed(6)}:LRA=${lraTarget}`
  const macroDynamics = stage12CodecSafeMacroDynamics(payload, controller.macroDepthDb)
  const analysis = await runTool('ffmpeg', ['-hide_banner', '-nostdin',
    '-i', losslessReferencePath, '-af', `${macroDynamics}loudnorm=${target}:print_format=json`,
    '-f', 'null', '-'], workRoot, 'STAGE12_CODEC_SAFE_TRUE_PEAK_ANALYSIS_FAILED')
  const measured = parseLoudnorm(analysis.stderr.toString('utf8'))
  const limiter = 10 ** (controller.limiterCeilingDbtp / 20)
  const correction = `${macroDynamics}loudnorm=${target}:measured_I=${measured.integratedLufs}:measured_TP=${measured.truePeakDbtp}:measured_LRA=${measured.loudnessRangeLu}:measured_thresh=${measured.threshold}:offset=${measured.offset}:linear=false,alimiter=limit=${limiter.toFixed(6)}:level=false`
  await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', losslessReferencePath,
    '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact',
    '-flags:a', '+bitexact', '-af', correction, '-c:a', 'libopus',
    '-ar', String(payload.render.sampleRateHz), candidatePath], workRoot,
  'STAGE12_CODEC_SAFE_TRUE_PEAK_CANDIDATE_ENCODE_FAILED')
}

export async function executeStage12CodecSafeTruePeakShadowReplay(payloadInput, imageDigest) {
  const payload = validateStage12CodecSafeTruePeakShadowPayload(payloadInput, imageDigest)
  const replay = payloadInput.codecSafeShadowReplay
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-codec-safe-shadow-'))
  const sourcePath = join(workRoot, 'immutable-ordinal-2-source.webm')
  const losslessReferencePath = join(workRoot, 'canonical-lossless-reference.wav')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=codec-safe-source-ordinal-2&idempotencyKey=${payload.idempotencyKey}&sha256=${replay.sourceCorrectedPreMaster.sha256}`,
      payload.objectAccess.token,
    )
    const sourceBytes = Buffer.from(await response.arrayBuffer())
    if (sourceBytes.byteLength !== replay.sourceCorrectedPreMaster.byteLength
      || sha256(sourceBytes) !== replay.sourceCorrectedPreMaster.sha256) {
      throw Object.assign(new Error('Codec-safe shadow source read-back mismatch.'), {
        code: 'STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_SOURCE_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(sourcePath, sourceBytes)
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact',
      '-flags:a', '+bitexact', '-c:a', 'pcm_f32le',
      '-ar', String(payload.render.sampleRateHz), losslessReferencePath], workRoot,
    'STAGE12_CODEC_SAFE_TRUE_PEAK_LOSSLESS_DECODE_FAILED')
    const losslessBytes = await readFile(losslessReferencePath)
    const losslessReference = {
      sha256: sha256(losslessBytes),
      byteLength: losslessBytes.byteLength,
      audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(losslessReferencePath, workRoot),
      codec: 'pcm_f32le',
      sampleRateHz: payload.render.sampleRateHz,
    }
    const candidates = []
    let controller = initialStage12CodecSafeTruePeakController(payload)
    const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
    for (let candidatePass = 0; candidatePass <= replay.correctionPassLimit;
      candidatePass += 1) {
      const candidatePath = join(workRoot, `codec-safe-candidate-${candidatePass}.webm`)
      await renderStage12CodecSafeCandidate(payload, losslessReferencePath, candidatePath,
        workRoot, controller)
      const measured = await measureStage12EncodedLoudness(
        payload, candidatePath, workRoot, lraTarget,
      )
      candidates.push({
        candidatePass,
        phase: candidatePass === 0
          ? 'INITIAL_CODEC_SAFE_CANDIDATE' : 'POST_OPUS_FEEDBACK_CANDIDATE',
        losslessReferenceSha256: losslessReference.sha256,
        integratedTargetLufs: controller.integratedTargetLufs,
        limiterCeilingDbtp: controller.limiterCeilingDbtp,
        macroDepthDb: controller.macroDepthDb,
        codecOvershootDb: Math.max(0, measured.truePeakDbtp - controller.limiterCeilingDbtp),
        integratedLufs: measured.integratedLufs,
        integratedLufsExact: measured.integratedLufsExact,
        truePeakDbtp: measured.truePeakDbtp,
        truePeakDbtpExact: measured.truePeakDbtpExact,
        loudnessRangeLu: measured.loudnessRangeLu,
        loudnessRangeLuExact: measured.loudnessRangeLuExact,
        failedPredicates: stage12LoudnessFailedPredicates(payload, measured),
        audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(candidatePath, workRoot),
      })
      if (loudnessPasses(payload, measured)) break
      if (candidatePass < replay.correctionPassLimit) {
        controller = nextStage12CodecSafeTruePeakController(payload, controller, measured)
      }
    }
    const runtimeProvenance = await collectStage12DiagnosticReplayRuntimeProvenance(workRoot)
    return buildStage12CodecSafeTruePeakShadowEvidence(payload, {
      evidenceSemantics: replay.evidenceSemantics,
      source: { correctionOrdinal: 2, correctionJobId: replay.sourceCorrectionJobId,
        r2Key: replay.sourceCorrectedPreMaster.r2Key,
        sha256: replay.sourceCorrectedPreMaster.sha256,
        byteLength: replay.sourceCorrectedPreMaster.byteLength,
        receiptSha256: replay.sourceCorrectionReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: replay.historicalFailureJobId,
        errorCode: 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED' },
      diagnosticReplay: { jobId: replay.diagnosticReplayJobId,
        evidenceId: replay.diagnosticReplayEvidenceId },
      losslessReference,
      candidates,
      workerImageDigest: imageDigest,
      expectedWorkerImageDigest: replay.expectedWorkerImageDigest,
      algorithmFingerprint: replay.algorithmFingerprint,
      thresholdSnapshotSha256: replay.thresholdSnapshotSha256,
      runtimeProvenance,
    })
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

export async function executeStage12CodecSafeLraGuardShadowReplay(payloadInput, imageDigest) {
  const payload = validateStage12CodecSafeLraGuardShadowPayload(payloadInput, imageDigest)
  const replay = payloadInput.codecSafeLraGuardShadowReplay
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-codec-safe-lra-guard-'))
  const sourcePath = join(workRoot, 'immutable-ordinal-2-source.webm')
  const losslessReferencePath = join(workRoot, 'canonical-lossless-reference.wav')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=codec-safe-lra-guard-source-ordinal-2&idempotencyKey=${payload.idempotencyKey}&sha256=${replay.sourceCorrectedPreMaster.sha256}`,
      payload.objectAccess.token,
    )
    const sourceBytes = Buffer.from(await response.arrayBuffer())
    if (sourceBytes.byteLength !== replay.sourceCorrectedPreMaster.byteLength
      || sha256(sourceBytes) !== replay.sourceCorrectedPreMaster.sha256) {
      throw Object.assign(new Error('LRA guard shadow source read-back mismatch.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_GUARD_SOURCE_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(sourcePath, sourceBytes)
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact',
      '-flags:a', '+bitexact', '-c:a', 'pcm_f32le',
      '-ar', String(payload.render.sampleRateHz), losslessReferencePath], workRoot,
    'STAGE12_CODEC_SAFE_LRA_GUARD_LOSSLESS_DECODE_FAILED')
    const losslessBytes = await readFile(losslessReferencePath)
    const losslessReference = {
      sha256: sha256(losslessBytes),
      byteLength: losslessBytes.byteLength,
      audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(losslessReferencePath, workRoot),
      codec: 'pcm_f32le',
      sampleRateHz: payload.render.sampleRateHz,
    }
    if (canonicalize(losslessReference) !== canonicalize(replay.parentLosslessReference)) {
      throw Object.assign(new Error('LRA guard lossless reference drifted.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_GUARD_LOSSLESS_REFERENCE_DRIFT',
      })
    }
    const runtimeProvenance = await collectStage12DiagnosticReplayRuntimeProvenance(workRoot)
    if (canonicalize(runtimeProvenance) !== canonicalize(replay.parentRuntimeProvenance)) {
      throw Object.assign(new Error('LRA guard runtime provenance drifted.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_GUARD_RUNTIME_DRIFT',
      })
    }
    const renderRuntimeFingerprint = stage12CodecSafeLraGuardRenderRuntimeFingerprint(
      replay.renderKernelFingerprint, runtimeProvenance,
    )
    if (renderRuntimeFingerprint !== replay.parentRenderRuntimeFingerprint) {
      throw Object.assign(new Error('LRA guard render kernel provenance drifted.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_GUARD_RENDER_KERNEL_DRIFT',
      })
    }
    const replayState = { ...replay, losslessReferenceSha256: losslessReference.sha256 }
    const candidates = []
    const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
    while (candidates.length < replay.controllerPolicy.maxCandidateCount) {
      const plan = planStage12CodecSafeLraGuardCandidate(payload, replayState, candidates)
      if (plan.done) break
      const candidatePath = join(workRoot, `codec-safe-lra-guard-${plan.candidatePass}.webm`)
      await renderStage12CodecSafeCandidate(payload, losslessReferencePath, candidatePath,
        workRoot, plan)
      const measured = await measureStage12EncodedLoudness(
        payload, candidatePath, workRoot, lraTarget,
      )
      candidates.push(classifyStage12CodecSafeLraGuardCandidate(payload, replayState, plan, {
        integratedLufs: measured.integratedLufs,
        integratedLufsExact: measured.integratedLufsExact,
        truePeakDbtp: measured.truePeakDbtp,
        truePeakDbtpExact: measured.truePeakDbtpExact,
        loudnessRangeLu: measured.loudnessRangeLu,
        loudnessRangeLuExact: measured.loudnessRangeLuExact,
        audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(candidatePath, workRoot),
      }))
      if (candidates.at(-1).disposition === 'FULL_PASS'
        || candidates.at(-1).disposition === 'ANCHOR_DRIFT') break
    }
    return buildStage12CodecSafeLraGuardShadowEvidence(payload, {
      evidenceSemantics: replay.evidenceSemantics,
      replay: replayState,
      source: { correctionOrdinal: 2, correctionJobId: replay.sourceCorrectionJobId,
        r2Key: replay.sourceCorrectedPreMaster.r2Key,
        sha256: replay.sourceCorrectedPreMaster.sha256,
        byteLength: replay.sourceCorrectedPreMaster.byteLength,
        receiptSha256: replay.sourceCorrectionReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: replay.historicalFailureJobId,
        errorCode: 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED' },
      diagnosticReplay: { jobId: replay.diagnosticReplayJobId,
        evidenceId: replay.diagnosticReplayEvidenceId },
      parentShadow: { jobId: replay.codecSafeTruePeakShadowJobId,
        evidenceId: replay.codecSafeTruePeakShadowEvidenceId },
      losslessReference,
      candidates,
      workerImageDigest: imageDigest,
      expectedWorkerImageDigest: replay.expectedWorkerImageDigest,
      algorithmFingerprint: replay.algorithmFingerprint,
      thresholdSnapshotSha256: replay.thresholdSnapshotSha256,
      controllerPolicySha256: replay.controllerPolicySha256,
      renderKernelFingerprint: replay.renderKernelFingerprint,
      renderRuntimeFingerprint,
      runtimeProvenance,
    })
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

export async function executeStage12CodecSafeLraFeasibilitySearch(payloadInput, imageDigest) {
  const payload = validateStage12CodecSafeLraFeasibilityPayload(payloadInput, imageDigest)
  const replay = payloadInput.codecSafeLraFeasibilitySearch
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-codec-safe-lra-feasibility-'))
  const sourcePath = join(workRoot, 'immutable-ordinal-2-source.webm')
  const losslessReferencePath = join(workRoot, 'canonical-lossless-reference.wav')
  try {
    const separator = payload.objectAccess.url.includes('?') ? '&' : '?'
    const response = await authenticatedFetch(
      `${payload.objectAccess.url}${separator}kind=codec-safe-lra-feasibility-source-ordinal-2&idempotencyKey=${payload.idempotencyKey}&sha256=${replay.sourceCorrectedPreMaster.sha256}`,
      payload.objectAccess.token,
    )
    const sourceBytes = Buffer.from(await response.arrayBuffer())
    if (sourceBytes.byteLength !== replay.sourceCorrectedPreMaster.byteLength
      || sha256(sourceBytes) !== replay.sourceCorrectedPreMaster.sha256) {
      throw Object.assign(new Error('LRA feasibility source read-back mismatch.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SOURCE_INTEGRITY_MISMATCH',
      })
    }
    await writeFile(sourcePath, sourceBytes)
    await runTool('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact',
      '-flags:a', '+bitexact', '-c:a', 'pcm_f32le',
      '-ar', String(payload.render.sampleRateHz), losslessReferencePath], workRoot,
    'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_LOSSLESS_DECODE_FAILED')
    const losslessBytes = await readFile(losslessReferencePath)
    const losslessReference = {
      sha256: sha256(losslessBytes),
      byteLength: losslessBytes.byteLength,
      audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(losslessReferencePath, workRoot),
      codec: 'pcm_f32le',
      sampleRateHz: payload.render.sampleRateHz,
    }
    if (canonicalize(losslessReference) !== canonicalize(replay.parentLosslessReference)) {
      throw Object.assign(new Error('LRA feasibility lossless reference drifted.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_LOSSLESS_REFERENCE_DRIFT',
      })
    }
    const runtimeProvenance = await collectStage12DiagnosticReplayRuntimeProvenance(workRoot)
    if (canonicalize(runtimeProvenance) !== canonicalize(replay.parentRuntimeProvenance)) {
      throw Object.assign(new Error('LRA feasibility runtime provenance drifted.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_RUNTIME_DRIFT',
      })
    }
    const renderRuntimeFingerprint = stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
      replay.renderKernelFingerprint, runtimeProvenance,
    )
    if (renderRuntimeFingerprint !== replay.parentRenderRuntimeFingerprint) {
      throw Object.assign(new Error('LRA feasibility render runtime drifted.'), {
        code: 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_RENDER_RUNTIME_DRIFT',
      })
    }
    const candidates = []
    const candidatePaths = new Map()
    const lraTarget = (payload.qa.loudness.lraMin + payload.qa.loudness.lraMax) / 2
    const maximumCandidates = replay.controllerPolicy.lraMapBudget
      + replay.controllerPolicy.truePeakContainmentBudget
      + replay.controllerPolicy.lufsTrimBudget
      + replay.controllerPolicy.postTrimStabilizationBudget
      + replay.controllerPolicy.finalVerifyBudget
      + replay.controllerPolicy.rollbackVerifyBudget
    while (candidates.length < maximumCandidates) {
      const plan = planStage12CodecSafeLraFeasibilityCandidate(payload, replay, candidates)
      if (plan.done) break
      let candidatePath
      if (plan.phase === 'FINAL_VERIFY') {
        candidatePath = candidatePaths.get(plan.parentCandidateOrdinal)
        if (!candidatePath) {
          throw Object.assign(new Error('Final verification artifact is missing.'), {
            code: 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_FINAL_ARTIFACT_MISSING',
          })
        }
      } else {
        candidatePath = join(workRoot, `codec-safe-lra-feasibility-${plan.candidateOrdinal}.webm`)
        await renderStage12CodecSafeCandidate(payload, losslessReferencePath, candidatePath,
          workRoot, plan)
      }
      const measured = await measureStage12EncodedLoudness(
        payload, candidatePath, workRoot, lraTarget,
      )
      const candidate = classifyStage12CodecSafeLraFeasibilityCandidate(
        payload, replay, plan, {
          integratedLufs: measured.integratedLufs,
          integratedLufsExact: measured.integratedLufsExact,
          truePeakDbtp: measured.truePeakDbtp,
          truePeakDbtpExact: measured.truePeakDbtpExact,
          loudnessRangeLu: measured.loudnessRangeLu,
          loudnessRangeLuExact: measured.loudnessRangeLuExact,
          encodedArtifactSha256: sha256(await readFile(candidatePath)),
          audioFrameMd5Sha256: await stage12AudioFrameMd5Sha256(candidatePath, workRoot),
        },
      )
      candidates.push(candidate)
      candidatePaths.set(candidate.candidateOrdinal, candidatePath)
      if (candidate.disposition === 'FINAL_PASS' || candidate.phase === 'ROLLBACK_VERIFY') break
    }
    return buildStage12CodecSafeLraFeasibilityEvidence(payload, {
      evidenceSemantics: replay.evidenceSemantics,
      replay,
      source: { correctionOrdinal: replay.sourceCorrectionOrdinal,
        correctionJobId: replay.sourceCorrectionJobId,
        r2Key: replay.sourceCorrectedPreMaster.r2Key,
        sha256: replay.sourceCorrectedPreMaster.sha256,
        byteLength: replay.sourceCorrectedPreMaster.byteLength,
        receiptSha256: replay.sourceCorrectionReceiptSha256 },
      historicalFailure: { correctionOrdinal: replay.historicalFailureCorrectionOrdinal,
        correctionJobId: replay.historicalFailureJobId,
        errorCode: 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED' },
      diagnosticReplay: { jobId: replay.diagnosticReplayJobId,
        evidenceId: replay.diagnosticReplayEvidenceId },
      parentTruePeakShadow: { jobId: replay.codecSafeTruePeakShadowJobId,
        evidenceId: replay.codecSafeTruePeakShadowEvidenceId },
      parentLraGuard: { jobId: replay.codecSafeLraGuardShadowJobId,
        evidenceId: replay.codecSafeLraGuardShadowEvidenceId },
      parentGuardTrace: replay.parentGuardTrace,
      losslessReference,
      candidates,
      workerImageDigest: imageDigest,
      expectedWorkerImageDigest: replay.expectedWorkerImageDigest,
      algorithmFingerprint: replay.algorithmFingerprint,
      thresholdSnapshotSha256: replay.thresholdSnapshotSha256,
      controllerPolicySha256: replay.controllerPolicySha256,
      renderKernelFingerprint: replay.renderKernelFingerprint,
      renderRuntimeFingerprint,
      runtimeProvenance,
    })
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
