import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { describe, expect, test } from 'vitest'

import {
  DesignError,
  assertInheritedVoice,
  assertRouteFrozen,
  classifyMotion,
  planTtsSegments,
  routeVisual,
  sealChannelIdentity,
  sealSoundscape,
  sealVisualGrammar,
} from '../src/index.js'

const settings = { speed: 1.02, stability: 0.7 }
const identityInput = {
  channelId: 'channel-1',
  version: 1,
  scope: 'channel' as const,
  voice: {
    voiceId: 'voice-primary',
    model: 'model-qualified',
    settings,
    settingsHash: canonicalHash(settings),
    pronunciationLexiconRef: 'r2://lexicon/v1',
    fingerprintR2Key: 'identity/channel-1/voice-fingerprint.wav',
    fingerprintDurationSec: 30,
  },
  visual: {
    palette: ['#101820', '#f2aa4c'],
    typeScale: [16, 24, 40],
    motionLanguage: 'State transitions lead camera movement.',
    layoutGrid: '12-column safe-zone grid.',
    lowerThirdSpec: 'One line, mobile-safe.',
    safeZoneSpec: 'Keep critical content within 90 percent center.',
  },
  music: {
    genreRange: [],
    instrumentation: [],
    tempoRangeBpm: { min: 60, max: 120 },
    cueLibraryRef: null,
  },
  terminology: { ledgerRef: 'r2://terminology/v1' },
  packaging: {
    thumbnailStyleSpec: 'Single mechanism, one focal contrast.',
    titlePatternConstraints: ['No unsupported certainty.'],
  },
}

describe('WP-19 design layer', () => {
  test('seals channel identity and rejects per-video voice drift without owner exception', () => {
    const identity = sealChannelIdentity(identityInput)
    expect(identity.identityHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(() => assertInheritedVoice(identity, {
      voiceId: 'voice-other',
      model: identity.voice.model,
      settingsHash: identity.voice.settingsHash,
      ownerExceptionHash: null,
    })).toThrowError(DesignError)
    expect(() => assertInheritedVoice(identity, {
      voiceId: identity.voice.voiceId,
      model: identity.voice.model,
      settingsHash: identity.voice.settingsHash,
      ownerExceptionHash: null,
    })).not.toThrow()
  })

  test('cuts TTS only at safe sentence boundaries outside entity, number and causal spans', () => {
    const sentence = 'Authorization records a reversible promise before settlement transfers final value across the network. '
    const text = sentence.repeat(11).trim()
    const entityText = 'settlement transfers final value'
    const entityStart = text.indexOf(entityText)
    const numberText = 'reversible promise'
    const numberStart = text.indexOf(numberText)
    const forcedBoundary = sentence.repeat(7).trimEnd().length
    const spans = [
      { start: entityStart, end: entityStart + entityText.length, kind: 'ENTITY' as const },
      { start: numberStart, end: numberStart + numberText.length, kind: 'NUMBER' as const },
      { start: forcedBoundary - 10, end: forcedBoundary + 10, kind: 'CAUSAL_CLAUSE' as const },
    ]
    const segments = planTtsSegments({ text, protectedSpans: spans })
    expect(segments.length).toBeGreaterThan(1)
    expect(segments[0]!.end).not.toBe(forcedBoundary)
    for (const segment of segments.slice(0, -1)) {
      expect('.!?').toContain(text[segment.end - 1])
      expect(spans.some((span) => segment.end > span.start && segment.end < span.end)).toBe(false)
    }
    expect(segments.map((segment) => segment.text).join(' ')).toBe(text)
  })

  test('keeps music fail-closed while the production provider is unconfigured', () => {
    const identity = sealChannelIdentity(identityInput)
    const validInput = {
      identityHash: identity.identityHash,
      voiceSettingsHash: identity.voice.settingsHash,
      narratorVoiceId: identity.voice.voiceId,
      providerSpeed: 1.02,
      provider: null,
      musicMode: 'ambience_only' as const,
      cues: [
        { id: 'ambience-1', assetKind: 'AMBIENCE' as const, function: 'orientation' as const, assetRef: 'r2://ambience/room.wav' },
        { id: 'silence-1', assetKind: 'SILENCE' as const, function: 'silence' as const, assetRef: null },
      ],
    }
    expect(sealSoundscape(validInput).soundscapeHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(() => sealSoundscape({
      ...validInput,
      cues: [{ id: 'music-1', assetKind: 'MUSIC', function: 'payoff', assetRef: 'r2://music/a.wav' }],
    })).toThrowError(DesignError)
  })

  test('routes every claim deterministically', () => {
    expect(routeVisual({
      claimKind: 'MECHANISM', observableReferent: false,
      requiresObservableEvidence: false, requiresAuthoredExplanation: true,
    })).toBe('MAKE')
    expect(routeVisual({
      claimKind: 'FACT', observableReferent: true,
      requiresObservableEvidence: true, requiresAuthoredExplanation: false,
    })).toBe('SOURCE')
    expect(routeVisual({
      claimKind: 'FACT', observableReferent: true,
      requiresObservableEvidence: true, requiresAuthoredExplanation: true,
    })).toBe('HYBRID')
  })

  test('motion classifier is total and the three classes are disjoint', () => {
    const outputs = new Set<string>()
    for (const authoredLayerStateChange of [false, true]) {
      for (const sourceLocalSemanticMotion of [false, true]) {
        for (const globalCameraMotion of [false, true]) {
          outputs.add(classifyMotion({ authoredLayerStateChange, sourceLocalSemanticMotion, globalCameraMotion }))
        }
      }
    }
    expect(outputs).toEqual(new Set(['CAMERA_ONLY', 'LAYERED_SEMANTIC', 'SOURCE_SEMANTIC']))
    expect(classifyMotion({
      authoredLayerStateChange: true,
      sourceLocalSemanticMotion: true,
      globalCameraMotion: true,
    })).toBe('LAYERED_SEMANTIC')
  })

  test('seals visual grammar and prevents route changes after Stage 07B', () => {
    const identity = sealChannelIdentity(identityInput)
    const grammar = sealVisualGrammar({
      identityHash: identity.identityHash,
      shots: [{
        shotId: 'shot-1',
        route: 'HYBRID',
        motionClass: 'LAYERED_SEMANTIC',
        archetype: 'source_authored_hybrid',
      }],
    })
    expect(grammar.visualGrammarHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(() => assertRouteFrozen('HYBRID', 'SOURCE')).toThrowError(DesignError)
  })
})
