import { describe, expect, it, vi } from 'vitest'

import type { CapabilityId, Hex64 } from '@youtube-ai-factory/contracts'

import { createElevenLabsTtsAdapter } from '../src/adapters/elevenlabs-tts.js'

const CONFIG = {
  apiKey: 'secret-not-part-of-identity',
  capabilityId: 'tts-elevenlabs-narrator' as CapabilityId,
  version: 'elevenlabs-tts-v1',
  voiceId: 'voice-qualified',
  modelId: 'eleven_multilingual_v2',
  voiceSettings: {
    stability: 0.7,
    similarityBoost: 0.75,
    style: 0,
    useSpeakerBoost: true,
    speed: 1.02,
  },
  outputFormat: 'mp3_44100_128',
  usdPer1000Chars: 0.1,
}

describe('ElevenLabs TTS adapter', () => {
  it('pins voice, model and settings and preserves long-form continuity', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new Uint8Array([1, 2, 3]),
      { status: 200, headers: { 'request-id': 'request-2' } },
    ))
    const adapter = createElevenLabsTtsAdapter(CONFIG, { fetch: fetchMock })
    const response = await adapter.dispatch({
      text: 'Settlement transfers final value.',
      previousText: 'ignored when request IDs are present',
      previousRequestIds: ['request-1'],
      nextText: 'The ledger records the consequence.',
    }, 'a'.repeat(64) as Hex64)

    expect(response).toEqual({
      audio: new Uint8Array([1, 2, 3]),
      requestId: 'request-2',
      billedCharacters: 33,
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/text-to-speech/voice-qualified?output_format=mp3_44100_128')
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe(CONFIG.apiKey)
    expect(JSON.parse(String(init?.body))).toEqual({
      text: 'Settlement transfers final value.',
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.7,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
        speed: 1.02,
      },
      previous_request_ids: ['request-1'],
      next_text: 'The ledger records the consequence.',
    })
  })

  it('estimates and reports the exact configured character cost ceiling', () => {
    const adapter = createElevenLabsTtsAdapter(CONFIG)
    const estimate = adapter.estimateCost({ text: '1234567890' })
    expect(estimate).toEqual({
      maxCostUsd: 0.001,
      basis: 'char_count',
      detail: { characters: 10, usd_per_1000_chars: 0.1 },
    })
    expect(adapter.actualCost({
      audio: new Uint8Array(),
      requestId: null,
      billedCharacters: 10,
    })).toBe(estimate.maxCostUsd)
  })

  it('keeps the API key out of the immutable settings identity', () => {
    const first = createElevenLabsTtsAdapter(CONFIG)
    const second = createElevenLabsTtsAdapter({ ...CONFIG, apiKey: 'rotated-secret' })
    expect(first.settingsHash).toBe(second.settingsHash)
    expect(first.settingsHash).toMatch(/^[a-f0-9]{64}$/u)
  })

  it.each([
    [429, 'rate_limit_exceeded', 'RATE_LIMIT'],
    [503, 'provider_unavailable', 'TRANSIENT'],
    [403, 'voice_not_permitted', 'RIGHTS_DENIED'],
    [400, 'quota_exceeded', 'BUDGET_DENIED'],
    [422, 'invalid_request', 'SCHEMA_VIOLATION'],
  ] as const)('normalizes HTTP %s/%s to %s', async (status, providerStatus, expected) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      detail: { status: providerStatus, message: 'provider rejected request' },
    }), { status, headers: { 'content-type': 'application/json' } }))
    const adapter = createElevenLabsTtsAdapter(CONFIG, { fetch: fetchMock })
    let caught: unknown
    try {
      await adapter.dispatch({ text: 'test' }, 'b'.repeat(64) as Hex64)
    } catch (error) {
      caught = error
    }
    expect(adapter.normalizeError(caught)).toBe(expected)
  })

  it('fails closed before transport for empty text or more than three continuity IDs', () => {
    const fetchMock = vi.fn<typeof fetch>()
    const adapter = createElevenLabsTtsAdapter(CONFIG, { fetch: fetchMock })
    expect(() => adapter.estimateCost({ text: '   ' })).toThrow(/must not be empty/iu)
    expect(() => adapter.estimateCost({
      text: 'valid',
      previousRequestIds: ['1', '2', '3', '4'],
    })).toThrow(/one to three/iu)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
