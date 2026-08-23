import { describe, expect, test } from 'vitest'
import {
  beatSequenceDiff,
  differentiationScore,
  isFresh,
  lintAudienceJob,
  measureAntiCopy,
  phashHamming,
  sharedNgramCount,
} from '../src/index.js'

describe('WP-17 intelligence layer', () => {
  test('fails audience-job lint when the video topic name appears', () => {
    const value = 'When I compare payment options for my business, I want to understand hidden payment rails clearly, so that I can explain the operational tradeoffs to my team'
    expect(lintAudienceJob(value, ['hidden payment rails'])).toEqual({
      valid: false,
      failures: ['AUDIENCE_JOB_CONTAINS_TOPIC:hidden payment rails'],
    })
  })

  test('requires all three audience-job parts with at least five words each', () => {
    expect(lintAudienceJob('When my cash position changes without warning, I want to understand the underlying banking mechanism, so that I can make a better operational decision', [])).toEqual({ valid: true, failures: [] })
    expect(lintAudienceJob('When rates change, I want clarity, so that I can decide', []).valid).toBe(false)
  })

  test('enforces freshness windows by signal kind', () => {
    expect(isFresh('DEMAND_SIGNAL', '2026-06-01T00:00:00Z', '2026-08-23T00:00:00Z')).toBe(true)
    expect(isFresh('DEMAND_SIGNAL', '2026-01-01T00:00:00Z', '2026-08-23T00:00:00Z')).toBe(false)
    expect(isFresh('POLICY', '2020-01-01T00:00:00Z', '2026-08-23T00:00:00Z')).toBe(true)
  })

  test('catches an exact shared 7-gram', () => {
    const phrase = 'money moves through seven hidden settlement accounts overnight'
    expect(sharedNgramCount(`Intro ${phrase} end`, `Reference ${phrase} close`, 7)).toBeGreaterThan(0)
  })

  test('exports deterministic beat-diff and pHash primitives for PC-7', () => {
    expect(beatSequenceDiff(['HOOK', 'MECHANISM', 'PAYOFF'], ['HOOK', 'CASE', 'REVEAL'])).toBeCloseTo(2 / 3)
    expect(phashHamming('0000000000000000', 'ffffffffffffffff')).toBe(64)
  })

  test('measures the four anti-copy dimensions against SSOT thresholds', () => {
    const result = measureAntiCopy({
      script: 'A unique explanation of correspondent banking settlement flow',
      referenceTranscript: 'A different documentary about consumer credit scoring systems',
      beats: ['HOOK', 'MECHANISM', 'CONSEQUENCE'],
      referenceBeats: ['CASE', 'CONFLICT', 'PAYOFF'],
      thumbnailPhash: '0000000000000000',
      referenceThumbnailPhash: 'ffffffffffffffff',
      titleVector: [1, 0],
      referenceTitleVector: [0, 1],
    })
    expect(result.text.pass).toBe(true)
    expect(result.beat.pass).toBe(true)
    expect(result.thumbnail.pass).toBe(true)
    expect(result.title.pass).toBe(true)
  })

  test('computes differentiation distance to the reference centroid without applying the uncalibrated gate', () => {
    expect(differentiationScore([2, 2], [[0, 0], [2, 0]])).toBe(Math.sqrt(5))
  })
})
