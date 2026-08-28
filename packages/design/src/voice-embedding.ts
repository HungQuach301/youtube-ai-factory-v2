import { streamHash } from '@youtube-ai-factory/core-hash'

export const VOICE_EMBEDDING_ALGORITHM = 'log-goertzel-voiceprint-v1' as const

export interface VoiceEmbedding {
  readonly schemaVersion: 1
  readonly algorithm: typeof VOICE_EMBEDDING_ALGORITHM
  readonly sourceAudioSha256: string
  readonly sampleRateHz: 16000
  readonly frameSize: 400
  readonly hopSize: 160
  readonly dimensions: 64
  readonly vector: readonly number[]
}

const SAMPLE_RATE = 16_000
const FRAME_SIZE = 400
const HOP_SIZE = 160
const BAND_COUNT = 32
const MIN_HZ = 80
const MAX_HZ = 7_600

function frequencies(): readonly number[] {
  return Array.from({ length: BAND_COUNT }, (_, index) => {
    const position = index / (BAND_COUNT - 1)
    return MIN_HZ * ((MAX_HZ / MIN_HZ) ** position)
  })
}

function l2Normalize(values: readonly number[]): readonly number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0) throw new Error('VOICE_EMBEDDING_ZERO_MAGNITUDE')
  return values.map((value) => Number((value / magnitude).toFixed(8)))
}

export async function buildVoiceEmbedding(
  pcm: Int16Array,
  sourceAudioBytes: Uint8Array,
): Promise<VoiceEmbedding> {
  if (pcm.length < SAMPLE_RATE * 3) throw new Error('VOICE_EMBEDDING_AUDIO_TOO_SHORT')
  const bandHz = frequencies()
  const sums = new Float64Array(BAND_COUNT)
  const sumSquares = new Float64Array(BAND_COUNT)
  let frames = 0

  for (let offset = 0; offset + FRAME_SIZE <= pcm.length; offset += HOP_SIZE) {
    for (let band = 0; band < BAND_COUNT; band += 1) {
      const omega = (2 * Math.PI * bandHz[band]!) / SAMPLE_RATE
      const coefficient = 2 * Math.cos(omega)
      let previous = 0
      let previousTwo = 0
      for (let index = 0; index < FRAME_SIZE; index += 1) {
        const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (FRAME_SIZE - 1))
        const sample = (pcm[offset + index]! / 32_768) * window
        const current = sample + coefficient * previous - previousTwo
        previousTwo = previous
        previous = current
      }
      const power = previousTwo * previousTwo + previous * previous
        - coefficient * previous * previousTwo
      const logPower = Math.log1p(Math.max(0, power))
      sums[band] = sums[band]! + logPower
      sumSquares[band] = sumSquares[band]! + logPower * logPower
    }
    frames += 1
  }
  if (frames === 0) throw new Error('VOICE_EMBEDDING_NO_FRAMES')

  const vector: number[] = []
  for (let band = 0; band < BAND_COUNT; band += 1) {
    const mean = sums[band]! / frames
    const variance = Math.max(0, (sumSquares[band]! / frames) - mean * mean)
    vector.push(mean, Math.sqrt(variance))
  }

  return {
    schemaVersion: 1,
    algorithm: VOICE_EMBEDDING_ALGORITHM,
    sourceAudioSha256: await streamHash([sourceAudioBytes]),
    sampleRateHz: SAMPLE_RATE,
    frameSize: FRAME_SIZE,
    hopSize: HOP_SIZE,
    dimensions: 64,
    vector: l2Normalize(vector),
  }
}
