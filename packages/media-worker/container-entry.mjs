import { spawn } from 'node:child_process'
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildToolInvocation, MediaWorkerRuntime } from './dist/index.js'
import {
  stage12CallbackErrorCode,
  stage12CallbackTransportErrorCode,
  stage12WorkerErrorCode,
} from './stage12-callback-error.mjs'
import { executeStage12, executeStage12AudioP0Correction,
  executeStage12CodecSafeLraFeasibilitySearch,
  executeStage12CodecSafeLraGuardShadowReplay,
  executeStage12CodecSafeTruePeakShadowReplay,
  executeStage12EncodedLoudnessDiagnosticReplay, executeStage12Recovery,
  executeStage12Remediation, stage12EncodedLoudnessFailureDiagnostic,
  validateStage12AudioP0CorrectionPayload,
  validateStage12CodecSafeLraFeasibilityPayload,
  validateStage12CodecSafeLraGuardShadowPayload,
  validateStage12CodecSafeTruePeakShadowPayload,
  validateStage12EncodedLoudnessDiagnosticReplayPayload,
  validateStage12Payload, validateStage12RemediationPayload } from './stage12-runtime.mjs'

const IMAGE_DIGEST = process.env.MEDIA_IMAGE_DIGEST
if (!IMAGE_DIGEST?.match(/^sha256:[a-f0-9]{64}$/u)) {
  throw new Error('MEDIA_IMAGE_DIGEST must be the immutable digest of the running image.')
}
const JOB_DISPATCH_ENABLED = process.env.MEDIA_JOB_DISPATCH_ENABLED === 'true'
const STAGE10_ENABLED = process.env.MEDIA_STAGE10_ENABLED === 'true'
const STAGE12_ENABLED = process.env.MEDIA_STAGE12_ENABLED === 'true'
const STAGE10_VERIFY_KEY = process.env.MEDIA_STAGE10_VERIFY_KEY
const TTS_BATCH_SIZE = 2
const TTS_REQUEST_TIMEOUT_MS = 120_000
const CALLBACK_REQUEST_TIMEOUT_MS = 30_000
const CALIBRATION_FLOOR = Number(process.env.MEDIA_CALIBRATION_ERROR_FLOOR)
const CALIBRATION_THRESHOLD = Number(process.env.MEDIA_CALIBRATION_THRESHOLD)
const CALIBRATION_SHA256 = process.env.MEDIA_CALIBRATION_EVIDENCE_SHA256
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const SEAM_THRESHOLD = 0.005
const STAGE10_EXECUTION_CACHE_LIMIT = 8
const stage10Executions = new Map()
const stage10Jobs = new Map()
const stage12Jobs = new Map()
const PYTHON_RUNTIME_MARKER = '/app/runtime-verification/stage10-python.json'
const STAGE12_FONT_PATH = process.env.MEDIA_STAGE12_FONT_PATH
  ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

function pythonRuntimeVerified() {
  try {
    const marker = JSON.parse(readFileSync(PYTHON_RUNTIME_MARKER, 'utf8'))
    return marker?.schemaVersion === 1
      && marker?.runtimeUser === 'node'
      && marker?.nltkData === '/usr/local/share/nltk_data'
      && Number.isInteger(marker?.phonemeCount)
      && marker.phonemeCount > 0
  } catch {
    return false
  }
}

const PYTHON_RUNTIME_VERIFIED = pythonRuntimeVerified()

function stage10Ready() {
  return STAGE10_ENABLED
    && PYTHON_RUNTIME_VERIFIED
    && typeof STAGE10_VERIFY_KEY === 'string'
    && typeof ELEVENLABS_API_KEY === 'string'
    && Number.isFinite(CALIBRATION_FLOOR)
    && Number.isFinite(CALIBRATION_THRESHOLD)
    && CALIBRATION_THRESHOLD >= CALIBRATION_FLOOR
    && /^sha256:[a-f0-9]{64}$/u.test(CALIBRATION_SHA256 ?? '')
}

function stage12Ready() {
  return STAGE12_ENABLED && typeof STAGE10_VERIFY_KEY === 'string'
    && existsSync(STAGE12_FONT_PATH)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function run(executable, args, cwd, deadlineAt, input, failureCode = 'MEDIA_TOOL_FAILED') {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    const remainingMs = Date.parse(deadlineAt) - Date.now()
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      child.kill('SIGKILL')
      reject(Object.assign(new Error('Media job deadline has expired.'), { code: 'DEADLINE_EXCEEDED' }))
      return
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), remainingMs)
    if (input) child.stdin.end(input)
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', () => {
      clearTimeout(timer)
      reject(Object.assign(new Error(`${executable} failed to start.`), { code: failureCode }))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (signal === 'SIGKILL' && Date.now() >= Date.parse(deadlineAt)) {
        reject(Object.assign(new Error('Media tool exceeded its deadline.'), { code: 'DEADLINE_EXCEEDED' }))
        return
      }
      if (code === 0) {
        resolve(Buffer.concat(stdout))
        return
      }
      reject(Object.assign(new Error(`${executable} exited ${code ?? signal ?? 'unknown'}.`), {
        code: failureCode,
      }))
    })
  })
}

function accessMap(entries) {
  if (!Array.isArray(entries)) throw new Error('Object access must be an array.')
  return new Map(entries.map((entry) => {
    if (typeof entry?.key !== 'string') throw new Error('Object access key is required.')
    return [entry.key, entry]
  }))
}

async function processJob(message) {
  const access = accessMap(message?.access?.objects)
  const commandUrl = message?.access?.commandUrl
  if (typeof commandUrl !== 'string' || !commandUrl.startsWith('https://')) throw new Error('A scoped HTTPS command URL is required.')
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-media-'))
  const inputRoot = join(workRoot, 'input')
  const outputRoot = join(workRoot, 'output')
  await mkdir(inputRoot, { recursive: true })
  await mkdir(outputRoot, { recursive: true })
  const started = performance.now()
  const ports = {
    imageDigest: IMAGE_DIGEST,
    clock: { now: () => new Date(), monotonicMs: () => performance.now() - started },
    objectStore: {
      async get(key) {
        const entry = access.get(key)
        if (typeof entry?.readUrl !== 'string') return null
        const response = await fetch(entry.readUrl, { method: 'GET', redirect: 'error' })
        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
      },
      async putImmutable(key, bytes) {
        const entry = access.get(key)
        if (typeof entry?.writeUrl !== 'string') throw new Error(`No scoped write URL for ${key}`)
        const response = await fetch(entry.writeUrl, { method: 'PUT', body: bytes, redirect: 'error' })
        if (!response.ok) throw new Error(`Object write failed with status ${response.status}`)
      },
    },
    executor: {
      async execute(spec, inputs, deadlineAt) {
        await Promise.all(inputs.map(async (input) => writeFile(join(inputRoot, String(input.index)), input.bytes)))
        const invocation = buildToolInvocation(spec)
        const containerOutput = join(outputRoot, spec.artifactName)
        const args = invocation.args.map((arg) => arg.replace('/work/input/', `${inputRoot}/`).replace('/work/output/', `${outputRoot}/`))
        const stdout = await run(invocation.executable, args, workRoot, deadlineAt)
        const bytes = spec.operation === 'PROBE' ? stdout : await readFile(containerOutput)
        return [{ name: spec.artifactName, bytes: new Uint8Array(bytes) }]
      },
    },
    completionPublisher: {
      async publish(completion) {
        const response = await fetch(commandUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(completion), redirect: 'error',
        })
        if (!response.ok) throw new Error(`Control-plane command failed with status ${response.status}`)
      },
    },
  }
  try {
    return await new MediaWorkerRuntime(ports).consume(message.envelope)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { code: 'BODY_TOO_LARGE' })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function verifyStage10Request(request, body) {
  const timestamp = request.headers['x-factory-timestamp']
  const signature = request.headers['x-factory-signature']
  if (typeof timestamp !== 'string' || typeof signature !== 'string') return false
  const timestampMs = Date.parse(timestamp)
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) return false
  const message = Buffer.from(`${timestamp}\n${sha256(body)}`, 'utf8')
  const publicKey = createPublicKey({
    key: Buffer.from(STAGE10_VERIFY_KEY, 'base64'), format: 'der', type: 'spki',
  })
  return verifySignature(null, message, publicKey, Buffer.from(signature, 'base64'))
}

function validateStage10Payload(value) {
  if (!value || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/u.test(value.idempotencyKey ?? '')) {
    throw Object.assign(new Error('Invalid Stage 10 envelope.'), { code: 'INVALID_STAGE10_ENVELOPE' })
  }
  if (value.candidatesPerSegment !== 2 || value.maxProviderCalls !== 12) {
    throw Object.assign(new Error('Stage 10 must use the bounded REDUCED tournament.'), { code: 'INVALID_TOURNAMENT_WIDTH' })
  }
  if (!Array.isArray(value.segments) || value.segments.length !== 6) {
    throw Object.assign(new Error('Exactly six sealed segments are required.'), { code: 'INVALID_SEGMENT_COUNT' })
  }
  const ids = new Set()
  let charactersPerRoute = 0
  for (const segment of value.segments) {
    if (!/^beat-0[1-6]$/u.test(segment?.segmentId ?? '') || ids.has(segment.segmentId)
      || typeof segment.text !== 'string' || segment.text.trim().length < 20 || segment.text.length > 4000
      || !Number.isInteger(segment.pauseAfterMs) || segment.pauseAfterMs < 100 || segment.pauseAfterMs > 2000) {
      throw Object.assign(new Error('Invalid sealed segment.'), { code: 'INVALID_SEGMENT' })
    }
    ids.add(segment.segmentId)
    charactersPerRoute += segment.text.length
  }
  if (charactersPerRoute * 2 > value.maxTotalCharacters || value.maxTotalCharacters > 24000) {
    throw Object.assign(new Error('Character ceiling exceeded.'), { code: 'CHARACTER_CEILING_EXCEEDED' })
  }
  const voice = value.voice
  if (!voice || typeof voice.voiceId !== 'string' || typeof voice.modelId !== 'string'
    || voice.outputFormat !== 'mp3_44100_128' || typeof voice.settings !== 'object') {
    throw Object.assign(new Error('Invalid qualified voice binding.'), { code: 'INVALID_VOICE_BINDING' })
  }
  if (value.callback !== undefined && (!value.callback
    || typeof value.callback.url !== 'string' || !value.callback.url.startsWith('https://')
    || !/^[a-f0-9]{64}$/u.test(value.callback.token ?? ''))) {
    throw Object.assign(new Error('Invalid durable callback.'), { code: 'INVALID_STAGE10_CALLBACK' })
  }
  return value
}

function seedFor(idempotencyKey, segmentId, route) {
  return createHash('sha256').update(`${idempotencyKey}\0${segmentId}\0${route}`).digest().readUInt32BE(0)
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

async function synthesizeCandidate(payload, segment, route, filePath) {
  const seed = seedFor(payload.idempotencyKey, segment.segmentId, route)
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(payload.voice.voiceId)}?output_format=${payload.voice.outputFormat}`,
    {
      method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(TTS_REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text: segment.text,
        model_id: payload.voice.modelId,
        voice_settings: payload.voice.settings,
        seed,
        previous_text: segment.previousText,
        next_text: segment.nextText,
      }),
    },
  )
  if (!response.ok) {
    throw Object.assign(new Error(`ElevenLabs returned ${response.status}.`), { code: 'TTS_PROVIDER_FAILED' })
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 512) throw Object.assign(new Error('TTS output was empty.'), { code: 'TTS_OUTPUT_EMPTY' })
  await writeFile(filePath, bytes)
  return {
    route, seed, bytes,
    providerRequestId: response.headers.get('request-id') ?? response.headers.get('x-request-id') ?? 'UNAVAILABLE',
  }
}

function applyFade(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
  const width = Math.min(882, Math.floor(samples.length / 2))
  for (let index = 0; index < width; index += 1) {
    const gain = index / width
    samples[index] = Math.round(samples[index] * gain)
    samples[samples.length - 1 - index] = Math.round(samples[samples.length - 1 - index] * gain)
  }
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
}

async function buildNarration(workRoot, champions, segments, deadlineAt) {
  const parts = []
  let maxJump = 0
  for (let index = 0; index < champions.length; index += 1) {
    const candidate = champions[index]
    const pcm = applyFade(await run('ffmpeg', [
      '-v', 'error', '-i', candidate.filePath, '-f', 's16le', '-ac', '1', '-ar', '44100', 'pipe:1',
    ], workRoot, deadlineAt, undefined, 'FFMPEG_DECODE_FAILED'))
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
    maxJump = Math.max(maxJump, Math.abs(samples[0] ?? 0), Math.abs(samples[samples.length - 1] ?? 0))
    parts.push(pcm)
    if (index < champions.length - 1) {
      parts.push(Buffer.alloc(Math.round(44100 * segments[index].pauseAfterMs / 1000) * 2))
    }
  }
  const seamScore = maxJump / 32768
  const rawPath = join(workRoot, 'narration.raw')
  const outputPath = join(workRoot, 'narration.mp3')
  await writeFile(rawPath, Buffer.concat(parts))
  await run('ffmpeg', [
    '-v', 'error', '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', rawPath,
    '-codec:a', 'libmp3lame', '-b:a', '128k', '-y', outputPath,
  ], workRoot, deadlineAt, undefined, 'FFMPEG_ENCODE_FAILED')
  const bytes = await readFile(outputPath)
  return { bytes, seamScore }
}

async function processStage10(payload) {
  if (!stage10Ready()) throw Object.assign(new Error('Stage 10 worker is not calibrated.'), { code: 'STAGE10_NOT_READY' })
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage10-'))
  const deadlineAt = new Date(Date.now() + 40 * 60 * 1000).toISOString()
  try {
    const candidates = []
    const observerItems = []
    let totalCharacters = 0
    const plans = payload.segments.flatMap((segment) => ['A', 'B'].map((route) => ({ segment, route })))
    for (let offset = 0; offset < plans.length; offset += TTS_BATCH_SIZE) {
      const batch = await Promise.all(plans.slice(offset, offset + TTS_BATCH_SIZE).map(async ({ segment, route }) => {
        const takeId = `${segment.segmentId}-take-${route.toLowerCase()}`
        const filePath = join(workRoot, `${takeId}.mp3`)
        const synthesized = await synthesizeCandidate(payload, segment, route, filePath)
        return { takeId, segment, route, filePath, synthesized }
      }))
      for (const { takeId, segment, filePath, synthesized } of batch) {
        totalCharacters += segment.text.length
        candidates.push({ takeId, segmentId: segment.segmentId, filePath, ...synthesized })
        observerItems.push({ id: takeId, audioPath: filePath, transcript: segment.text })
      }
    }
    const observerInput = join(workRoot, 'observer-input.json')
    const observerOutput = join(workRoot, 'observer-output.json')
    await writeFile(observerInput, JSON.stringify({ items: observerItems }))
    await run('python3', [
      '/app/scripts/whisperx-phoneme-observer.py', '--input', observerInput,
      '--output', observerOutput, '--model', 'small.en',
    ], workRoot, deadlineAt, undefined, 'WHISPERX_OBSERVER_FAILED')
    const observed = JSON.parse(await readFile(observerOutput, 'utf8'))
    const observedById = new Map(observed.items.map((item) => [item.id, item]))
    for (const candidate of candidates) {
      const item = observedById.get(candidate.takeId)
      if (!item) throw Object.assign(new Error('Observer output incomplete.'), { code: 'OBSERVER_OUTPUT_INCOMPLETE' })
      candidate.phonemeEdits = editDistance(item.referencePhonemes, item.observedPhonemes)
      candidate.referencePhonemes = item.referencePhonemes.length
      candidate.phonemeMismatchRate = candidate.phonemeEdits / item.referencePhonemes.length
      candidate.observedTranscript = item.observedTranscript
      candidate.eligible = candidate.phonemeMismatchRate <= CALIBRATION_THRESHOLD
    }
    const champions = []
    const rejected = []
    for (const segment of payload.segments) {
      const pool = candidates.filter((candidate) => candidate.segmentId === segment.segmentId)
      const eligible = pool.filter((candidate) => candidate.eligible)
        .sort((left, right) => left.phonemeMismatchRate - right.phonemeMismatchRate || left.seed - right.seed)
      if (!eligible.length) throw Object.assign(new Error(`No eligible take for ${segment.segmentId}.`), { code: 'PHONEME_MISMATCH_GATE_FAILED' })
      champions.push(eligible[0])
      rejected.push(...pool.filter((candidate) => candidate.takeId !== eligible[0].takeId))
    }
    const narration = await buildNarration(workRoot, champions, payload.segments, deadlineAt)
    if (narration.seamScore > SEAM_THRESHOLD) {
      throw Object.assign(new Error('Narration seam gate failed.'), { code: 'SEAM_SCORE_GATE_FAILED' })
    }
    const serializeCandidate = (candidate) => ({
      takeId: candidate.takeId,
      segmentId: candidate.segmentId,
      route: candidate.route,
      seed: candidate.seed,
      audioBase64: candidate.bytes.toString('base64'),
      audioSha256: sha256(candidate.bytes),
      providerRequestId: candidate.providerRequestId,
      phonemeEdits: candidate.phonemeEdits,
      referencePhonemes: candidate.referencePhonemes,
      phonemeMismatchRate: candidate.phonemeMismatchRate,
      observedTranscript: candidate.observedTranscript,
      eligible: candidate.eligible,
    })
    return {
      accepted: true,
      imageDigest: IMAGE_DIGEST,
      calibration: {
        observer: 'whisperx@3.4.2/small.en/cpu-int8',
        errorFloor: CALIBRATION_FLOOR,
        threshold: CALIBRATION_THRESHOLD,
        evidenceSha256: CALIBRATION_SHA256,
      },
      champions: champions.map(serializeCandidate),
      rejected: rejected.map(serializeCandidate),
      narration: {
        audioBase64: narration.bytes.toString('base64'),
        audioSha256: sha256(narration.bytes),
        seamScore: narration.seamScore,
        seamThreshold: SEAM_THRESHOLD,
      },
      providerCallCount: candidates.length,
      totalCharacters,
      gateResults: [
        { gate: 'M1_PHONEME_MISMATCH', state: 'PASS', evidence: `all champions <= ${CALIBRATION_THRESHOLD}` },
        { gate: 'M1_SEAM_SCORE', state: 'PASS', evidence: `${narration.seamScore} <= ${SEAM_THRESHOLD}` },
      ],
    }
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

async function processStage10Idempotent(payload) {
  const existing = stage10Executions.get(payload.idempotencyKey)
  if (existing) return existing

  const execution = processStage10(payload)
  stage10Executions.set(payload.idempotencyKey, execution)
  try {
    const result = await execution
    while (stage10Executions.size > STAGE10_EXECUTION_CACHE_LIMIT) {
      const oldestKey = stage10Executions.keys().next().value
      stage10Executions.delete(oldestKey)
    }
    return result
  } catch (error) {
    if (stage10Executions.get(payload.idempotencyKey) === execution) {
      stage10Executions.delete(payload.idempotencyKey)
    }
    throw error
  }
}

async function publishStage10Callback(callback, idempotencyKey, result) {
  const response = await fetch(callback.url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(CALLBACK_REQUEST_TIMEOUT_MS),
    headers: {
      'authorization': `Bearer ${callback.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ idempotencyKey, result }),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`Stage 10 callback returned ${response.status}.`), {
      code: 'STAGE10_CALLBACK_FAILED',
    })
  }
}

function stage10ErrorCode(error) {
  const candidate = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'STAGE10_FAILED'
  return /^[A-Z0-9_:.-]{1,160}$/u.test(candidate) ? candidate : 'STAGE10_FAILED'
}

async function publishStage10Failure(callback, idempotencyKey, error) {
  const response = await fetch(callback.url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(CALLBACK_REQUEST_TIMEOUT_MS),
    headers: {
      'authorization': `Bearer ${callback.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ idempotencyKey, errorCode: stage10ErrorCode(error) }),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`Stage 10 failure callback returned ${response.status}.`), {
      code: 'STAGE10_FAILURE_CALLBACK_FAILED',
    })
  }
}

function startStage10Job(payload) {
  const existing = stage10Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  if (!payload.callback) {
    throw Object.assign(new Error('Durable callback is required.'), { code: 'STAGE10_CALLBACK_REQUIRED' })
  }
  const job = { status: 'PENDING' }
  stage10Jobs.set(payload.idempotencyKey, job)
  void processStage10Idempotent(payload)
    .then(async (result) => {
      await publishStage10Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      try {
        await publishStage10Failure(payload.callback, payload.idempotencyKey, error)
      } catch (callbackError) {
        console.error('STAGE10_FAILURE_CALLBACK_FAILED', stage10ErrorCode(callbackError))
      }
    })
  return job.status
}

async function publishStage12Callback(callback, idempotencyKey, result) {
  let response
  try {
    response = await fetch(callback.url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(CALLBACK_REQUEST_TIMEOUT_MS),
      headers: { authorization: `Bearer ${callback.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey, result }),
    })
  } catch (error) {
    throw Object.assign(new Error('Stage 12 callback transport failed.'), {
      code: stage12CallbackTransportErrorCode(error),
      cause: error,
    })
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const candidate = typeof body?.error === 'string' ? body.error : ''
    const code = stage12CallbackErrorCode(candidate, response.status)
    throw Object.assign(new Error(`Stage 12 callback returned ${response.status}.`), { code })
  }
}

async function publishStage12Failure(callback, idempotencyKey, error) {
  const failureDiagnostic = stage12EncodedLoudnessFailureDiagnostic(error, IMAGE_DIGEST)
  const response = await fetch(callback.url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(CALLBACK_REQUEST_TIMEOUT_MS),
    headers: { authorization: `Bearer ${callback.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey, errorCode: stage12WorkerErrorCode(error),
      ...(failureDiagnostic ? { failureDiagnostic } : {}) }),
  })
  if (!response.ok) throw Object.assign(new Error(`Stage 12 failure callback returned ${response.status}.`), { code: 'STAGE12_FAILURE_CALLBACK_FAILED' })
}

function startStage12Job(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  if (!payload.callback || !payload.objectAccess) {
    throw Object.assign(new Error('Stage 12 durable endpoints are required.'), { code: 'STAGE12_ENDPOINTS_REQUIRED' })
  }
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_JOB_FAILED', JSON.stringify({
        code: stage12WorkerErrorCode(error),
        detail: typeof error?.detail === 'string' ? error.detail.slice(-2000) : null,
      }))
      try {
        await publishStage12Failure(payload.callback, payload.idempotencyKey, error)
      } catch (callbackError) {
        console.error('STAGE12_FAILURE_CALLBACK_FAILED', stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12RecoveryJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  if (!payload.callback || !payload.objectAccess || payload.recovery?.render !== false) {
    throw Object.assign(new Error('Stage 12 recovery endpoints are required.'), {
      code: 'STAGE12_RECOVERY_ENDPOINTS_REQUIRED',
    })
  }
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12Recovery(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_RECOVERY_FAILED', JSON.stringify({
        code: stage12WorkerErrorCode(error),
        detail: typeof error?.detail === 'string' ? error.detail.slice(-2000) : null,
      }))
      try {
        await publishStage12Failure(payload.callback, payload.idempotencyKey, error)
      } catch (callbackError) {
        console.error('STAGE12_RECOVERY_FAILURE_CALLBACK_FAILED', stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12DiagnosticJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  if (!payload.callback || !payload.objectAccess || payload.recovery?.render !== false
    || payload.diagnostic?.sourceAttemptOrdinal !== 3
    || payload.diagnostic?.generation !== false || payload.diagnostic?.publish !== false) {
    throw Object.assign(new Error('Stage 12 diagnostic endpoints are required.'), {
      code: 'STAGE12_DIAGNOSTIC_ENDPOINTS_REQUIRED',
    })
  }
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12Recovery(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_DIAGNOSTIC_FAILED', JSON.stringify({
        code: stage12WorkerErrorCode(error),
        detail: typeof error?.detail === 'string' ? error.detail.slice(-2000) : null,
      }))
      try {
        await publishStage12Failure(payload.callback, payload.idempotencyKey, error)
      } catch (callbackError) {
        console.error('STAGE12_DIAGNOSTIC_FAILURE_CALLBACK_FAILED', stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12RemediationJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  validateStage12RemediationPayload(payload)
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12Remediation(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_REMEDIATION_FAILED', stage12WorkerErrorCode(error))
      try { await publishStage12Failure(payload.callback, payload.idempotencyKey, error) }
      catch (callbackError) {
        console.error('STAGE12_REMEDIATION_FAILURE_CALLBACK_FAILED', stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12AudioP0CorrectionJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  validateStage12AudioP0CorrectionPayload(payload)
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12AudioP0Correction(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_AUDIO_P0_CORRECTION_FAILED', JSON.stringify({
        trace_id: payload.idempotencyKey,
        errorCode: stage12WorkerErrorCode(error),
        failureDiagnostic: stage12EncodedLoudnessFailureDiagnostic(error, IMAGE_DIGEST) ?? null,
      }))
      try { await publishStage12Failure(payload.callback, payload.idempotencyKey, error) }
      catch (callbackError) {
        console.error('STAGE12_AUDIO_P0_CORRECTION_FAILURE_CALLBACK_FAILED',
          stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12EncodedLoudnessDiagnosticReplayJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  validateStage12EncodedLoudnessDiagnosticReplayPayload(payload, IMAGE_DIGEST)
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12EncodedLoudnessDiagnosticReplay(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_FAILED', JSON.stringify({
        trace_id: payload.idempotencyKey,
        errorCode: stage12WorkerErrorCode(error),
      }))
      try { await publishStage12Failure(payload.callback, payload.idempotencyKey, error) }
      catch (callbackError) {
        console.error('STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_CALLBACK_FAILED',
          stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12CodecSafeTruePeakShadowJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  validateStage12CodecSafeTruePeakShadowPayload(payload, IMAGE_DIGEST)
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12CodecSafeTruePeakShadowReplay(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY_FAILED', JSON.stringify({
        trace_id: payload.idempotencyKey,
        errorCode: stage12WorkerErrorCode(error),
      }))
      try { await publishStage12Failure(payload.callback, payload.idempotencyKey, error) }
      catch (callbackError) {
        console.error('STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_CALLBACK_FAILED',
          stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12CodecSafeLraGuardShadowJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  validateStage12CodecSafeLraGuardShadowPayload(payload, IMAGE_DIGEST)
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12CodecSafeLraGuardShadowReplay(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY_FAILED', JSON.stringify({
        trace_id: payload.idempotencyKey,
        errorCode: stage12WorkerErrorCode(error),
      }))
      try { await publishStage12Failure(payload.callback, payload.idempotencyKey, error) }
      catch (callbackError) {
        console.error('STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_CALLBACK_FAILED',
          stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

function startStage12CodecSafeLraFeasibilitySearchJob(payload) {
  const existing = stage12Jobs.get(payload.idempotencyKey)
  if (existing) return existing.status
  validateStage12CodecSafeLraFeasibilityPayload(payload, IMAGE_DIGEST)
  const job = { status: 'PENDING' }
  stage12Jobs.set(payload.idempotencyKey, job)
  void executeStage12CodecSafeLraFeasibilitySearch(payload, IMAGE_DIGEST)
    .then(async (result) => {
      await publishStage12Callback(payload.callback, payload.idempotencyKey, result)
      job.status = 'READY'
    })
    .catch(async (error) => {
      job.status = 'FAILED'
      console.error('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_FAILED', JSON.stringify({
        trace_id: payload.idempotencyKey,
        errorCode: stage12WorkerErrorCode(error),
      }))
      try { await publishStage12Failure(payload.callback, payload.idempotencyKey, error) }
      catch (callbackError) {
        console.error('STAGE12_CODEC_SAFE_LRA_FEASIBILITY_CALLBACK_FAILED',
          stage12WorkerErrorCode(callbackError))
      }
    })
  return job.status
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      ok: true,
      imageDigest: IMAGE_DIGEST,
      jobDispatchEnabled: JOB_DISPATCH_ENABLED,
      stage10Enabled: STAGE10_ENABLED,
      stage10Ready: stage10Ready(),
      stage12Enabled: STAGE12_ENABLED,
      stage12Ready: stage12Ready(),
      encodedLoudnessDiagnosticReplayReady: stage12Ready(),
      codecSafeTruePeakShadowReady: stage12Ready(),
      codecSafeLraGuardShadowReady: stage12Ready(),
      codecSafeLraFeasibilitySearchReady: stage12Ready(),
      stage12FontVerified: existsSync(STAGE12_FONT_PATH),
      pythonRuntimeVerified: PYTHON_RUNTIME_VERIFIED,
      calibrationEvidenceSha256: CALIBRATION_SHA256 ?? null,
    }))
    return
  }
  if (request.method === 'POST' && request.url === '/stage10/narrate') {
    if (!STAGE10_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE10_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const result = await processStage10Idempotent(validateStage10Payload(JSON.parse(body.toString('utf8'))))
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'STAGE10_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST' && request.url === '/stage10/start') {
    if (!STAGE10_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE10_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage10Payload(JSON.parse(body.toString('utf8')))
      const jobStatus = startStage10Job(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true,
        jobStatus,
        idempotencyKey: payload.idempotencyKey,
        imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'STAGE10_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST' && request.url === '/stage12/start') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12Payload(JSON.parse(body.toString('utf8')))
      const jobStatus = startStage12Job(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey, imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'STAGE12_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST' && request.url === '/stage12/recover') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12Payload(JSON.parse(body.toString('utf8')))
      if (payload.recovery?.attemptOrdinal !== 3 || payload.recovery?.render !== false) {
        throw Object.assign(new Error('Invalid recovery envelope.'), { code: 'INVALID_STAGE12_RECOVERY_ENVELOPE' })
      }
      const jobStatus = startStage12RecoveryJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey, imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_RECOVERY_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST' && request.url === '/stage12/diagnostic') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12Payload(JSON.parse(body.toString('utf8')))
      if (payload.recovery?.attemptOrdinal !== 3 || payload.recovery?.render !== false
        || payload.diagnostic?.sourceAttemptOrdinal !== 3
        || payload.diagnostic?.generation !== false || payload.diagnostic?.publish !== false) {
        throw Object.assign(new Error('Invalid diagnostic envelope.'), { code: 'INVALID_STAGE12_DIAGNOSTIC_ENVELOPE' })
      }
      const jobStatus = startStage12DiagnosticJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey, imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_DIAGNOSTIC_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST' && request.url === '/stage12/remediate') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12RemediationPayload(JSON.parse(body.toString('utf8')))
      const jobStatus = startStage12RemediationJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey, imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_REMEDIATION_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST' && request.url === '/stage12/audio-p0-correct') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12AudioP0CorrectionPayload(JSON.parse(body.toString('utf8')))
      const jobStatus = startStage12AudioP0CorrectionJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey, imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_AUDIO_P0_CORRECTION_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST'
    && request.url === '/stage12/encoded-loudness-diagnostic-replay') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' })
        .end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' })
          .end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12EncodedLoudnessDiagnosticReplayPayload(
        JSON.parse(body.toString('utf8')), IMAGE_DIGEST,
      )
      const jobStatus = startStage12EncodedLoudnessDiagnosticReplayJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey,
        imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST'
    && request.url === '/stage12/codec-safe-true-peak-shadow-replay') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' })
        .end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' })
          .end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12CodecSafeTruePeakShadowPayload(
        JSON.parse(body.toString('utf8')), IMAGE_DIGEST,
      )
      const jobStatus = startStage12CodecSafeTruePeakShadowJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey,
        imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST'
    && request.url === '/stage12/codec-safe-lra-guard-shadow-replay') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' })
        .end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' })
          .end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12CodecSafeLraGuardShadowPayload(
        JSON.parse(body.toString('utf8')), IMAGE_DIGEST,
      )
      const jobStatus = startStage12CodecSafeLraGuardShadowJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey,
        imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method === 'POST'
    && request.url === '/stage12/codec-safe-lra-feasibility-search') {
    if (!STAGE12_ENABLED) {
      response.writeHead(503, { 'content-type': 'application/json' })
        .end('{"ok":false,"code":"STAGE12_DISABLED"}')
      return
    }
    try {
      const body = await readBody(request)
      if (!verifyStage10Request(request, body)) {
        response.writeHead(401, { 'content-type': 'application/json' })
          .end('{"ok":false,"code":"INVALID_SIGNATURE"}')
        return
      }
      const payload = validateStage12CodecSafeLraFeasibilityPayload(
        JSON.parse(body.toString('utf8')), IMAGE_DIGEST,
      )
      const jobStatus = startStage12CodecSafeLraFeasibilitySearchJob(payload)
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
        accepted: true, jobStatus, idempotencyKey: payload.idempotencyKey,
        imageDigest: IMAGE_DIGEST,
      }))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code) : 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_START_FAILED'
      response.writeHead(422, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: false, code }))
    }
    return
  }
  if (request.method !== 'POST' || request.url !== '/jobs') {
    response.writeHead(404).end()
    return
  }
  if (!JOB_DISPATCH_ENABLED) {
    response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"JOB_DISPATCH_DISABLED"}')
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  try {
    const result = await processJob(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result))
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'WORKER_FAILED'
    response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
  }
})

server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0')
