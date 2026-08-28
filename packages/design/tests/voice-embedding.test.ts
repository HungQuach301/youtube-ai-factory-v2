import { describe, expect, it } from 'vitest'

import { buildVoiceEmbedding } from '../src/index.js'

function tone(hz: number): Int16Array {
  const sampleRate = 16_000
  return Int16Array.from({ length: sampleRate * 3 }, (_, index) =>
    Math.round(Math.sin((2 * Math.PI * hz * index) / sampleRate) * 16_000))
}

describe('voice embedding', () => {
  it('creates a deterministic finite 64-dimensional embedding from real PCM', async () => {
    const pcm = tone(220)
    const bytes = new Uint8Array(pcm.buffer)
    const first = await buildVoiceEmbedding(pcm, bytes)
    const second = await buildVoiceEmbedding(pcm, bytes)
    expect(first).toEqual(second)
    expect(first.dimensions).toBe(64)
    expect(first.vector).toHaveLength(64)
    expect(first.vector.every(Number.isFinite)).toBe(true)
    expect(first.sourceAudioSha256).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('changes when the acoustic source changes and rejects short audio', async () => {
    const low = tone(180)
    const high = tone(440)
    expect((await buildVoiceEmbedding(low, new Uint8Array(low.buffer))).vector)
      .not.toEqual((await buildVoiceEmbedding(high, new Uint8Array(high.buffer))).vector)
    await expect(buildVoiceEmbedding(new Int16Array(100), new Uint8Array(200)))
      .rejects.toThrow('VOICE_EMBEDDING_AUDIO_TOO_SHORT')
  })
})
