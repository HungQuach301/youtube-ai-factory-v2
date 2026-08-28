import { describe, expect, it } from 'vitest'

import { sealChannelIdentity } from '../src/index.js'

describe('qualified ElevenLabs voice identity', () => {
  it('seals the exact nested provider settings used by the approved fingerprint', () => {
    const identity = sealChannelIdentity({
      channelId: 'channel_ai_era_money_defense_v1',
      version: 2,
      scope: 'channel',
      voice: {
        voiceId: 'KXyrWqXTuK63FlJ9XZ33',
        model: 'eleven_multilingual_v2',
        settings: {
          provider: 'elevenlabs',
          capabilityId: 'tts-elevenlabs-ai-era-money-defense',
          version: 'elevenlabs-tts-v1',
          voiceId: 'KXyrWqXTuK63FlJ9XZ33',
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
        },
        settingsHash: '5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9',
        pronunciationLexiconRef: 'lexicon/ai-era-money-defense/en-US/v1',
        fingerprintR2Key: 'qual/identity/channel_ai_era_money_defense_v1/voice/fingerprint.flac',
        fingerprintDurationSec: 30,
      },
      visual: {
        palette: ['#111111'],
        typeScale: [1],
        motionLanguage: 'documentary',
        layoutGrid: '12-column',
        lowerThirdSpec: 'v1',
        safeZoneSpec: 'v1',
      },
      music: {
        genreRange: ['documentary'],
        instrumentation: ['ambient'],
        tempoRangeBpm: { min: 60, max: 90 },
        cueLibraryRef: null,
      },
      terminology: { ledgerRef: 'ledger/ai-era-money-defense/v1' },
      packaging: {
        thumbnailStyleSpec: 'evidence-led',
        titlePatternConstraints: ['truth before urgency'],
      },
    })
    expect(identity.voice.settingsHash)
      .toBe('5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9')
  })
})
