import { describe, expect, it } from 'vitest'

import {
  MediaSpecError,
  buildDuckingFilter,
  buildLoudnormPlan,
  buildMasterPlan,
  buildOtioTimeline,
  captionsFromAlignment,
  evaluatePhonemeMismatch,
  filterSourceCandidates,
  planCompositions,
  planNarrationRequests,
  planNarrationRetry,
  validateAudioCues,
  validateEditQa,
  validateMasterEvidence,
} from '../src/index.js'

const hash = (value: string): string => value.repeat(64)

describe('MED-01 source acquisition', () => {
  it('allows byte acquisition only after metadata and rights eligibility', () => {
    const base = {
      durationMs: 12_000, width: 1920, height: 1080, fps: 30,
      licenseType: 'COMMERCIAL', licenseUrl: 'https://license.test/record',
      monetizationAllowed: true, editorialOnly: false, hasWatermark: false,
      provenanceRef: 'snapshot/source', perceptualHash: null,
    }
    const report = filterSourceCandidates({
      shotDurationMs: 8_000,
      durationMarginMs: 1_000,
      aspectRatio: 16 / 9,
      candidateTarget: 6,
      candidates: [
        { ...base, id: 'eligible' },
        { ...base, id: 'watermarked', hasWatermark: true },
        { ...base, id: 'editorial', editorialOnly: true },
        { ...base, id: 'missing-rights', licenseUrl: null },
      ],
    })
    expect(report.bytesAllowedCandidateIds).toEqual(['eligible'])
    expect(report.rejected.map((item) => item.candidateId)).toEqual(['watermarked', 'editorial', 'missing-rights'])
  })
})

describe('MED-02 compositor', () => {
  it('prefers render-once/filter-graph and scopes expensive engines', () => {
    const plan = planCompositions('REDUCED', [
      { id: 'simple', critical: true, motions: ['PAN_ZOOM', 'TIMED_OVERLAY'], variantCount: 1 },
      { id: 'chart', critical: false, motions: ['PATH_CHART_MORPH'], variantCount: 1 },
    ])
    expect(plan.items[0]?.engine).toBe('RENDER_ONCE_FFMPEG')
    expect(plan.items[0]?.renderPixelPasses).toBe(1)
    expect(plan.items[1]?.engine).toBe('HEADLESS_CHROMIUM')
    expect(plan.renderPerFrameCount).toBe(0)
  })
})

describe('MED-03 narration', () => {
  const sectionText = 'A'.repeat(320)
  const context = 'C'.repeat(220)

  it('stitches sequential requests and retries only failed sections', () => {
    const requests = planNarrationRequests([
      { id: 's0', index: 0, text: sectionText, previousContext: '', nextContext: context },
      { id: 's1', index: 1, text: sectionText, previousContext: context, nextContext: '' },
    ], hash('a'), { s0: 'request-0' })
    expect(requests[1]?.previousRequestId).toBe('request-0')
    expect(planNarrationRetry(requests, ['s1']).map((item) => item.sectionId)).toEqual(['s1'])
  })

  it('keeps phoneme mismatch warning-only until a measured floor exists', () => {
    expect(evaluatePhonemeMismatch(0.30, null)).toEqual({ state: 'WARNING_UNCALIBRATED', threshold: null })
    expect(evaluatePhonemeMismatch(0.03, 0.02)).toEqual({ state: 'PASS', threshold: 0.04 })
    expect(evaluatePhonemeMismatch(0.05, 0.02).state).toBe('FAIL')
  })
})

describe('MED-04 audio mix', () => {
  it('keeps Track G ambience-only and fails closed for unlicensed music', () => {
    expect(() => validateAudioCues('ambience_only', [{
      id: 'music', kind: 'MUSIC', assetId: 'asset', function: 'curiosity',
      monetizationAllowed: true, licenseEvidenceHash: hash('b'),
    }])).toThrow(MediaSpecError)
    expect(() => validateAudioCues('ambience_only', [
      { id: 'ambience', kind: 'AMBIENCE', assetId: 'owned-ambience', function: 'orientation', monetizationAllowed: true, licenseEvidenceHash: hash('c') },
      { id: 'silence', kind: 'SILENCE', assetId: null, function: 'silence', monetizationAllowed: false, licenseEvidenceHash: null },
    ])).not.toThrow()
  })

  it('always emits measured two-pass loudnorm and bounded ducking', () => {
    const plan = buildLoudnormPlan({ integratedLufs: -18, truePeakDbtp: -2, lra: 6, threshold: -28, offset: 4 })
    expect(plan.map((item) => item.pass)).toEqual([1, 2])
    expect(plan[1]?.args.join(' ')).toContain('linear=true')
    expect(buildDuckingFilter({ duckDb: 8, attackMs: 120, releaseMs: 500 })).toContain('sidechaincompress')
  })
})

describe('MED-05 edit and captions', () => {
  const words = Array.from({ length: 7 }, (_, index) => ({
    text: 'word' + index,
    startMs: index * 500,
    endMs: index * 500 + 400,
    alignmentEvidenceRef: 'align-' + index,
  }))

  it('derives caption timing from forced-alignment evidence and seals OTIO', () => {
    expect(captionsFromAlignment(words).map((event) => event.text.split(' ').length)).toEqual([5, 2])
    const plan = buildOtioTimeline(4_000, [
      { id: 'c0', sourceRef: 'composition/0', startMs: 0, endMs: 2_000 },
      { id: 'c1', sourceRef: 'composition/1', startMs: 2_000, endMs: 4_000 },
    ], words)
    expect(plan.schema).toBe('OTIO.1')
    expect(plan.timelineHash).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('fails deterministic QA on residue instead of relying on a critic', () => {
    expect(() => validateEditQa({
      duplicateRate: 0, nearStaticViolationCount: 1,
      debugOverlayCount: 0, watermarkCount: 0, templateResidueCount: 0,
    })).toThrow(/NEAR_STATIC_PRESENT/u)
  })
})

describe('MED-06 master', () => {
  it('plans archival before distribution and verifies both storage readbacks', () => {
    const plan = buildMasterPlan('pkg')
    expect(plan.archival.videoCodec).toBe('ffv1')
    expect(plan.distribution.derivedFromMasterId).toBe(plan.archival.id)
    expect(() => validateMasterEvidence({
      fileSha256: hash('d'), streamFrameMd5: '0, 0, abc',
      r2ReadbackSha256: hash('d'), driveReadbackSha256: hash('d'), durationDeltaFrames: 1,
    })).not.toThrow()
  })
})
