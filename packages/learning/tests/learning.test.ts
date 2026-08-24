import { describe, expect, it } from 'vitest'

import type { Hex64 } from '@youtube-ai-factory/contracts'

import {
  LearningError,
  analyzeDeviation,
  assessLearning,
  calibratePredictionModel,
  ingestYoutubeAnalytics,
  promoteLearning,
  registerExperiment,
  type ActualPerformanceArtifact,
  type AnalyticsIngestInput,
  type ExperimentObservation,
  type PromoteLearningCommandEvidence,
} from '../src/index.js'

const hash = (character: string): Hex64 => character.repeat(64) as Hex64

const retention = (offset = 0) => Array.from({ length: 21 }, (_, index) => ({
  elapsedVideoTimeRatio: index / 20,
  audienceWatchRatio: Math.max(0, 1 - (index / 25) + offset),
  relativeRetentionPerformance: 0.5,
}))

const ingestInput = (overrides: Partial<AnalyticsIngestInput> = {}): AnalyticsIngestInput => ({
  id: 'actual-1', packageId: 'pkg', youtubeVideoId: 'video-1', masterId: 'master-1',
  masterSha256: hash('a'), source: 'YOUTUBE_ANALYTICS_API', simulated: false,
  publishedAt: '2026-08-01T00:00:00.000Z', fetchedAt: '2026-08-15T00:00:00.000Z',
  windowDays: 14, responseEvidenceR2Key: 'analytics/video-1.json', responseSha256: hash('b'),
  binding: {
    packageId: 'pkg', youtubeVideoId: 'video-1', masterId: 'master-1', masterSha256: hash('a'),
    verified: true, verificationEvidenceR2Key: 'publish/video-1-readback.json',
  },
  metrics: {
    retentionCurve: retention(), impressions: 1_000, impressionClickThroughRate: 0.08,
    averageViewDurationSec: 320, averageViewPercentage: 0.53,
    trafficSources: [{ source: 'BROWSE', views: 600 }, { source: 'SEARCH', views: 400 }],
  },
  ...overrides,
})

describe('LRN-02 YouTube Analytics ETL and deviation analysis', () => {
  it('accepts only evidence-backed, non-simulated analytics in the 14–28 day window', () => {
    expect(ingestYoutubeAnalytics(ingestInput()).canonicalHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(() => ingestYoutubeAnalytics(ingestInput({ simulated: true })))
      .toThrow(/SIMULATED_ANALYTICS_FORBIDDEN/u)
    expect(() => ingestYoutubeAnalytics(ingestInput({ windowDays: 13 })))
      .toThrow(/ANALYTICS_WINDOW_INVALID/u)
    expect(() => ingestYoutubeAnalytics(ingestInput({ responseEvidenceR2Key: '' })))
      .toThrow(/ANALYTICS_EVIDENCE_MISSING/u)
  })

  it('binds analytics to the verified YouTube video and exact distribution master checksum', () => {
    expect(() => ingestYoutubeAnalytics(ingestInput({
      binding: { ...ingestInput().binding, masterSha256: hash('c') },
    }))).toThrow(/VIDEO_MASTER_BINDING_MISMATCH/u)
    expect(() => ingestYoutubeAnalytics(ingestInput({
      binding: { ...ingestInput().binding, verified: false },
    }))).toThrow(/VIDEO_BINDING_NOT_VERIFIED/u)
  })

  it('computes retention MAE, beat-boundary error and CTR delta deterministically', () => {
    const actual = ingestYoutubeAnalytics(ingestInput())
    const report = analyzeDeviation({
      packageId: 'pkg', modelVersion: 'v0-flat', canonicalHash: hash('d'), ctrEstimate: 0.06,
      retentionCurve: retention().map((point) => ({
        elapsedPct: point.elapsedVideoTimeRatio * 100,
        predictedRetention: point.audienceWatchRatio - 0.1,
      })),
    }, actual, [0.25, 0.5, 0.75])
    expect(report.retentionMae).toBeCloseTo(0.1)
    expect(report.beatErrors).toHaveLength(3)
    expect(report.beatErrors.every((item) => Math.abs(item.error - 0.1) < 1e-12)).toBe(true)
    expect(report.ctrDelta).toBeCloseTo(0.02)
  })
})

describe('LRN-01 prediction calibration', () => {
  it('requires the contract sample count and creates a new model with lineage', () => {
    const actuals: ActualPerformanceArtifact[] = Array.from({ length: 6 }, (_, index) =>
      ingestYoutubeAnalytics(ingestInput({
        id: `actual-${index}`, youtubeVideoId: `video-${index}`,
        responseEvidenceR2Key: `analytics/video-${index}.json`,
        responseSha256: hash(String((index % 9) + 1)),
        binding: { ...ingestInput().binding, youtubeVideoId: `video-${index}` },
      })))
    expect(() => calibratePredictionModel({
      parentModelVersion: 'v0-flat', actuals: actuals.slice(0, 5),
      observations: actuals.slice(0, 5).flatMap((actual, index) => [{
        analyticsHash: actual.canonicalHash, videoId: actual.youtubeVideoId,
        features: [1, index + 1, (index + 1) ** 2, (index + 1) ** 3], observedRisk: index + 1,
      }]),
    })).toThrow(/CALIBRATION_SAMPLE_SIZE_INSUFFICIENT/u)
    const calibrated = calibratePredictionModel({
      parentModelVersion: 'v0-flat', actuals,
      observations: actuals.flatMap((actual, index) => [
        {
          analyticsHash: actual.canonicalHash, videoId: actual.youtubeVideoId,
          features: [1, index + 1, (index + 1) ** 2, (index + 1) ** 3],
          observedRisk: 1 + (2 * (index + 1)) + (3 * ((index + 1) ** 2)) + (4 * ((index + 1) ** 3)),
        },
        {
          analyticsHash: actual.canonicalHash, videoId: actual.youtubeVideoId,
          features: [index + 2, 1, (index + 2) ** 2, 1],
          observedRisk: (index + 2) + 2 + (3 * ((index + 2) ** 2)) + 4,
        },
      ]),
    })
    expect(calibrated.parentModelVersion).toBe('v0-flat')
    expect(calibrated.modelVersion).not.toBe('v0-flat')
    expect(calibrated.weights).toEqual(expect.objectContaining({
      stateStaleness: expect.any(Number), entityDensity: expect.any(Number),
      openLoopDistance: expect.any(Number), archetypeStaleness: expect.any(Number),
    }))
    expect(calibrated.analyticsHashes).toHaveLength(6)
  })
})

const experiment = () => registerExperiment({
  id: 'experiment-1', channelId: 'channel-1', hypothesis: 'A shorter cold open improves retention.',
  variableTested: 'cold_open_duration', heldConstants: ['pillar', 'voice', 'length'],
  minSampleSize: 3, decisionCriterion: 'same directional beat-boundary effect',
})

const observations = (count: number, direction: ExperimentObservation['direction'] = 'POSITIVE') =>
  Array.from({ length: count }, (_, index): ExperimentObservation => ({
    videoId: `video-${index}`, analyticsHash: hash(String((index % 9) + 1)), direction,
    effect: direction === 'POSITIVE' ? 0.04 : -0.04,
  }))

describe('LRN-03 experiment registry and promotion boundary', () => {
  it('keeps learning insufficient below the experiment sample size or without consistent videos', () => {
    expect(assessLearning({
      id: 'learning-1', experiment: experiment(), scope: 'CHANNEL', channelId: 'channel-1',
      replicatedChannelIds: [], finding: 'Shorter cold opens improve first-quarter retention.',
      observations: observations(2),
    }).status).toBe('INSUFFICIENT_EVIDENCE')
    expect(assessLearning({
      id: 'learning-1', experiment: experiment(), scope: 'CHANNEL', channelId: 'channel-1',
      replicatedChannelIds: [], finding: 'Direction is not consistent.',
      observations: [...observations(2), ...observations(1, 'NEGATIVE')],
    }).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('requires two independent channels for portfolio scope and never carries voice', () => {
    expect(() => assessLearning({
      id: 'learning-portfolio', experiment: experiment(), scope: 'PORTFOLIO', channelId: null,
      replicatedChannelIds: ['channel-1'], finding: 'A structural packaging pattern transfers.',
      observations: observations(3), knowledgeKind: 'STRUCTURE',
    })).toThrow(/PORTFOLIO_REPLICATION_INSUFFICIENT/u)
    expect(() => assessLearning({
      id: 'learning-portfolio', experiment: experiment(), scope: 'PORTFOLIO', channelId: null,
      replicatedChannelIds: ['channel-1', 'channel-2'], finding: 'Copy the voice.',
      observations: observations(3), knowledgeKind: 'VOICE',
    })).toThrow(/VOICE_CANNOT_CROSS_CHANNELS/u)
  })

  it('promotes only READY learning through an executed, signed PROMOTE_LEARNING owner command', () => {
    const ready = assessLearning({
      id: 'learning-1', experiment: experiment(), scope: 'CHANNEL', channelId: 'channel-1',
      replicatedChannelIds: [], finding: 'Shorter cold opens improve first-quarter retention.',
      observations: observations(3), knowledgeKind: 'STRUCTURE',
    })
    const command: PromoteLearningCommandEvidence = {
      id: 'command-1', type: 'PROMOTE_LEARNING', learningId: ready.id,
      ownerIdentity: 'real-human-owner', ownerActive: true, signature: 'signature',
      evidenceHash: hash('e'), executed: true, createdAt: '2026-08-24T00:00:00.000Z',
    }
    expect(promoteLearning(ready, command, {
      kind: 'STANDARD', ref: 'channel-1/production-standard', versionBefore: 3,
    })).toMatchObject({ targetVersionBefore: 3, targetVersionAfter: 4, status: 'PROMOTED' })
    expect(() => promoteLearning({ ...ready, status: 'INSUFFICIENT_EVIDENCE' }, command, {
      kind: 'STANDARD', ref: 'channel-1/production-standard', versionBefore: 3,
    })).toThrow(LearningError)
    expect(() => promoteLearning(ready, { ...command, executed: false }, {
      kind: 'STANDARD', ref: 'channel-1/production-standard', versionBefore: 3,
    })).toThrow(/OWNER_COMMAND_INVALID/u)
  })
})
