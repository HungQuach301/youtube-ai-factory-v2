import { describe, expect, it } from 'vitest'

import {
  measureBlackFrames,
  measureClipping,
  measureDropFrames,
  measureDuplicate,
  measureForcedAlignment,
  measureFreezeFrames,
  measureLoudness,
  measureMobileLegibility,
  measureNearStatic,
  measureSafeZone,
  measureSeam,
  measureSemanticMotion,
  measureSilence,
  measureStreamProfile,
  measureTimeline,
  runDeterministicMeasurements,
} from '../src/index.js'

describe('MSR-01 deterministic measurements', () => {
  it('01 BLACK_FRAME parses known FFmpeg blackdetect intervals', () => {
    expect(measureBlackFrames('black_start=1.25 black_end=2.75')).toEqual({
      intervals: [{ startSec: 1.25, endSec: 2.75 }],
      totalDurationSec: 1.5,
    })
  })

  it('02 FREEZE_FRAME parses known FFmpeg freezedetect intervals', () => {
    expect(measureFreezeFrames('freeze_start=4 freeze_end=7.5')).toEqual({
      intervals: [{ startSec: 4, endSec: 7.5 }],
      totalDurationSec: 3.5,
    })
  })

  it('03 SILENCE parses known FFmpeg silencedetect intervals', () => {
    expect(measureSilence('silence_start=8.5 silence_end=9')).toEqual({
      intervals: [{ startSec: 8.5, endSec: 9 }],
      totalDurationSec: 0.5,
    })
  })

  it('04 CLIPPING preserves known astats peak and flat-factor evidence', () => {
    expect(measureClipping({ peakDb: -0.2, flatFactor: 0.03 })).toEqual({
      peakDb: -0.2,
      flatFactor: 0.03,
    })
  })

  it('05 LOUDNESS preserves known ebur128 metrics', () => {
    expect(measureLoudness({ integratedLufs: -14, truePeakDbtp: -1.2, loudnessRangeLu: 6 })).toEqual({
      integratedLufs: -14,
      truePeakDbtp: -1.2,
      loudnessRangeLu: 6,
    })
  })

  it('06 DROP_FRAME compares counted frames with duration times fps', () => {
    expect(measureDropFrames({ durationSec: 10, fps: 30, countedFrames: 298 })).toEqual({
      expectedFrames: 300,
      countedFrames: 298,
      missingFrames: 2,
    })
  })

  it('07 STREAM_PROFILE returns the known probe profile without inference', () => {
    const profile = {
      videoCodec: 'vp9', audioCodec: 'opus', pixelFormat: 'yuv420p',
      colorPrimaries: 'bt709', width: 1920, height: 1080, fps: 30,
    }
    expect(measureStreamProfile(profile)).toEqual(profile)
  })

  it('08 FORCED_ALIGNMENT computes phoneme edit distance but does not evaluate a gate', () => {
    expect(measureForcedAlignment({
      expectedPhonemes: ['k', 'ae', 't'],
      observedPhonemes: ['k', 'eh', 't'],
    })).toEqual({
      expectedCount: 3,
      observedCount: 3,
      editDistance: 1,
      phonemeMismatchRate: 1 / 3,
      gateEvaluated: false,
    })
  })

  it('09 SEAM computes cross-correlation, MFCC distance and F0 continuity', () => {
    const result = measureSeam({
      leftSamples: [-1, 0, 1], rightSamples: [-2, 0, 2],
      leftF0Hz: 100, rightF0Hz: 200, mfccDistance: 0.25,
    })
    expect(result.correlation).toBeCloseTo(1)
    expect(result.mfccDistance).toBe(0.25)
    expect(result.f0StepSemitone).toBeCloseTo(12)
  })

  it('10 SEMANTIC_MOTION removes global motion from dense-flow energy', () => {
    expect(measureSemanticMotion({ globalEnergy: [1, 2], denseEnergy: [3, 5] })).toEqual({
      residualEnergyMean: 2.5,
      residualEnergyMax: 3,
    })
  })

  it('11 DUPLICATE computes known pHash duplicate-pair ratio', () => {
    expect(measureDuplicate([
      '0000000000000000',
      '0000000000000001',
      'ffffffffffffffff',
    ])).toEqual({
      sampleCount: 3,
      pairCount: 3,
      duplicatePairCount: 1,
      duplicatePairRatio: 1 / 3,
    })
  })

  it('12 NEAR_STATIC reports the known interval above SSIM and duration thresholds', () => {
    const samples = Array.from({ length: 17 }, (_, index) => ({ atSec: index * 0.5, ssim: 0.99 }))
    expect(measureNearStatic(samples)).toEqual({
      intervals: [{ startSec: 0, endSec: 8 }],
      totalDurationSec: 8,
      longestDurationSec: 8,
    })
  })

  it('13 MOBILE_LEGIBILITY applies x-height and WCAG contrast floors', () => {
    expect(measureMobileLegibility([
      { id: 'title', xHeightPxAtQaScale: 12, contrastRatio: 5, largeText: false },
      { id: 'caption', xHeightPxAtQaScale: 9, contrastRatio: 4.6, largeText: false },
      { id: 'label', xHeightPxAtQaScale: 11, contrastRatio: 2.8, largeText: true },
    ])).toEqual({ passed: false, failedElementIds: ['caption', 'label'] })
  })

  it('14 SAFE_ZONE detects known bounding boxes outside compositor metadata', () => {
    expect(measureSafeZone({
      safeRect: { x: 100, y: 100, width: 1720, height: 880 },
      elements: [
        { id: 'inside', x: 110, y: 110, width: 100, height: 50 },
        { id: 'outside', x: 50, y: 110, width: 100, height: 50 },
      ],
    })).toEqual({ passed: false, outsideElementIds: ['outside'] })
  })

  it('15 TIMELINE_LINT detects known gap and overlap intervals', () => {
    expect(measureTimeline({
      durationSec: 10,
      fps: 30,
      segments: [
        { id: 'a', startSec: 0, endSec: 4 },
        { id: 'b', startSec: 3.5, endSec: 6 },
        { id: 'c', startSec: 7, endSec: 10 },
      ],
    })).toEqual({
      gaps: [{ startSec: 6, endSec: 7 }],
      overlaps: [{ startSec: 3.5, endSec: 4 }],
      issueCount: 2,
    })
  })

  it('control wrapper validates the boundary and emits exactly fifteen immutable evidence hashes', () => {
    const bundle = runDeterministicMeasurements({
      blackFrameLog: '',
      freezeFrameLog: '',
      silenceLog: '',
      clipping: { peakDb: -1.1, flatFactor: 0 },
      loudness: { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 6 },
      dropFrame: { durationSec: 1, fps: 30, countedFrames: 30 },
      streamProfile: {
        videoCodec: 'vp9', audioCodec: 'opus', pixelFormat: 'yuv420p',
        colorPrimaries: 'bt709', width: 1920, height: 1080, fps: 30,
      },
      forcedAlignment: { expectedPhonemes: ['k'], observedPhonemes: ['k'] },
      seam: {
        leftSamples: [-1, 0, 1], rightSamples: [-1, 0, 1],
        leftF0Hz: 100, rightF0Hz: 100, mfccDistance: 0,
      },
      semanticMotion: { globalEnergy: [1], denseEnergy: [2] },
      duplicate: { perceptualHashes: ['0000000000000000'] },
      nearStatic: { samples: [{ atSec: 0, ssim: 0.5 }] },
      mobileLegibility: { elements: [] },
      safeZone: { safeRect: { x: 0, y: 0, width: 1920, height: 1080 }, elements: [] },
      timeline: { durationSec: 1, fps: 30, segments: [{ id: 'a', startSec: 0, endSec: 1 }] },
    })

    expect(bundle.evidence).toHaveLength(15)
    expect(bundle.measurements.evidenceHashes).toHaveLength(15)
    expect(new Set(bundle.measurements.evidenceHashes)).toHaveLength(15)
    expect(bundle.measurements.values).toHaveProperty('phoneme_mismatch_rate', 0)
    expect(bundle.evidence.find((item) => item.code === 'FORCED_ALIGNMENT')).toMatchObject({
      value: { gateEvaluated: false },
    })
  })
})
