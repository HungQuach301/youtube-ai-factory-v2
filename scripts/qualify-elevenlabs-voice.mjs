import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  buildVoiceQualificationPlan,
  createElevenLabsTtsAdapter,
  guardedDispatch,
  qualificationCharacterCount,
} from '@youtube-ai-factory/provider'

const CHANNEL_ID = 'ai-era-money-defense'
const MODEL_ID = 'eleven_multilingual_v2'
const OUTPUT_FORMAT = 'mp3_44100_128'
const MAX_COST_USD = 1.5
const USD_PER_1000_CHARS = 0.1
const VOICE_SETTINGS = Object.freeze({
  stability: 0.7,
  similarityBoost: 0.75,
  style: 0,
  useSpeakerBoost: true,
  speed: 1.02,
})

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function ffprobeDuration(path) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ], { encoding: 'utf8' }).trim())
}

function volumeMetrics(path) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', path,
    '-af', 'volumedetect', '-f', 'null', '-',
  ], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`ffmpeg volume analysis failed: ${result.stderr}`)
  }
  const output = result.stderr
  const mean = /mean_volume:\s*(-?[\d.]+) dB/u.exec(output)?.[1]
  const max = /max_volume:\s*(-?[\d.]+) dB/u.exec(output)?.[1]
  return {
    meanVolumeDb: mean === undefined ? null : Number(mean),
    maxVolumeDb: max === undefined ? null : Number(max),
  }
}

function assertAudioMetrics(metrics, name) {
  if (!Number.isFinite(metrics.durationSec) || metrics.durationSec < 3) {
    throw new Error(`${name} duration is invalid.`)
  }
  if (metrics.meanVolumeDb === null || metrics.maxVolumeDb === null) {
    throw new Error(`${name} volume metrics are unavailable.`)
  }
  if (metrics.meanVolumeDb < -45 || metrics.maxVolumeDb > 0) {
    throw new Error(`${name} failed silence/clipping limits.`)
  }
}

async function main() {
  const apiKey = requiredEnvironment('ELEVENLABS_API_KEY')
  const voiceId = requiredEnvironment('ELEVENLABS_VOICE_ID')
  const outDir = resolve(process.env.QUALIFICATION_OUTPUT_DIR ?? 'voice-qualification-output')
  const sourceDir = resolve(outDir, 'source')
  const wavDir = resolve(outDir, 'wav')
  await Promise.all([mkdir(sourceDir, { recursive: true }), mkdir(wavDir, { recursive: true })])

  const plan = buildVoiceQualificationPlan()
  const plannedCostUsd = (qualificationCharacterCount(plan) * USD_PER_1000_CHARS) / 1_000
  if (plannedCostUsd > MAX_COST_USD) throw new Error('Qualification plan exceeds the cost ceiling.')

  const adapter = createElevenLabsTtsAdapter({
    apiKey,
    capabilityId: 'tts-elevenlabs-ai-era-money-defense',
    version: 'elevenlabs-tts-v1',
    voiceId,
    modelId: MODEL_ID,
    voiceSettings: VOICE_SETTINGS,
    outputFormat: OUTPUT_FORMAT,
    usdPer1000Chars: USD_PER_1000_CHARS,
  })

  let estimatedCostUsd = 0
  let actualCostUsd = 0
  const requestEvidence = []
  const guard = {
    async execute(input, transport) {
      if (input.context.namespace !== 'qualification') throw new Error('Qualification namespace required.')
      if (input.adapterSettingsHash !== adapter.settingsHash
        || input.requestSettingsHash !== adapter.settingsHash) {
        throw new Error('Voice settings hash mismatch.')
      }
      if (estimatedCostUsd + input.estimate.maxCostUsd > MAX_COST_USD) {
        throw new Error('Qualification cost reservation denied.')
      }
      estimatedCostUsd += input.estimate.maxCostUsd
      const startedAt = new Date().toISOString()
      const result = await transport()
      actualCostUsd += result.actualCostUsd
      if (actualCostUsd > MAX_COST_USD) throw new Error('Qualification actual cost exceeded ceiling.')
      requestEvidence.push({
        archetype: input.archetypeId,
        idempotencyKey: input.idempotencyKey,
        estimatedCostUsd: input.estimate.maxCostUsd,
        actualCostUsd: result.actualCostUsd,
        startedAt,
        completedAt: new Date().toISOString(),
      })
      return result.response
    },
  }

  const generated = []
  for (const [index, sample] of plan.entries()) {
    const response = await guardedDispatch(adapter, sample.archetype, {
      text: sample.text,
      ...(sample.previousText === undefined ? {} : { previousText: sample.previousText }),
      ...(sample.nextText === undefined ? {} : { nextText: sample.nextText }),
    }, {
      fencingToken: 1,
      packageId: `voice-qualification-${CHANNEL_ID}`,
      stageInstanceId: `voice-qualification-${index + 1}`,
      traceId: `voice-qualification-${CHANNEL_ID}-${index + 1}`,
      namespace: 'qualification',
      reservationId: `voice-qualification-reservation-${index + 1}`,
      portfolioRef: 'youtube-ai-factory-v2',
      channelRef: CHANNEL_ID,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1_000).toISOString(),
      requestSettingsHash: adapter.settingsHash,
      dispatchGuard: guard,
    })

    const mp3Path = resolve(sourceDir, `${sample.fileStem}.mp3`)
    const wavPath = resolve(wavDir, `${sample.fileStem}.wav`)
    await writeFile(mp3Path, response.audio)
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', mp3Path,
      '-ar', '44100', '-ac', '1', wavPath,
    ])
    const wav = await readFile(wavPath)
    const volume = volumeMetrics(wavPath)
    const metrics = { durationSec: ffprobeDuration(wavPath), ...volume }
    assertAudioMetrics(metrics, sample.fileStem)
    generated.push({
      archetype: sample.archetype,
      fileStem: sample.fileStem,
      requestId: response.requestId,
      sourceSha256: sha256(response.audio),
      wavSha256: sha256(wav),
      metrics,
    })
  }

  const fingerprintSource = plan.find((sample) => sample.fingerprintSource)
  if (fingerprintSource === undefined) throw new Error('Fingerprint source is missing.')
  const fingerprintPath = resolve(outDir, 'voice-fingerprint-30s.wav')
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', resolve(wavDir, `${fingerprintSource.fileStem}.wav`),
    '-af', 'apad=pad_dur=30', '-t', '30',
    '-ar', '44100', '-ac', '1', fingerprintPath,
  ])
  const fingerprint = await readFile(fingerprintPath)
  const fingerprintDurationSec = ffprobeDuration(fingerprintPath)
  if (Math.abs(fingerprintDurationSec - 30) > 0.01) {
    throw new Error('Fingerprint duration is not exactly 30 seconds.')
  }

  const evidence = {
    schemaVersion: 1,
    state: 'PROVIDER_GENERATED_PENDING_PERCEPTUAL_QA',
    namespace: 'qualification',
    channelId: CHANNEL_ID,
    voiceId,
    model: MODEL_ID,
    outputFormat: OUTPUT_FORMAT,
    voiceSettings: VOICE_SETTINGS,
    settingsHash: adapter.settingsHash,
    capabilityId: adapter.capabilityId,
    capabilityVersion: adapter.version,
    plannedCostUsd,
    estimatedCostUsd,
    actualCostUsd,
    maxCostUsd: MAX_COST_USD,
    fingerprint: {
      file: 'voice-fingerprint-30s.wav',
      durationSec: fingerprintDurationSec,
      sha256: sha256(fingerprint),
    },
    generated,
    requests: requestEvidence,
    productionEligible: false,
    pending: ['PERCEPTUAL_QA', 'VOICE_EMBEDDING', 'R2_QUALIFICATION_EVIDENCE'],
    generatedAt: new Date().toISOString(),
  }
  await writeFile(resolve(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({
    state: evidence.state,
    samples: generated.length,
    fingerprintDurationSec,
    estimatedCostUsd,
    actualCostUsd,
    settingsHash: adapter.settingsHash,
  })}\n`)
}

await main()
