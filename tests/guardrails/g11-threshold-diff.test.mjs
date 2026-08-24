import { describe, expect, it } from 'vitest'

import { analyzeThresholdDiff, validatePromotionEvidence } from '../../tools/g11-threshold-diff.mjs'

const before = `
export const QUALITY = {
  SCORE_MIN: 90,
  DEFECT_MAX: 2,
  RANGE: { min: 10, max: 20 },
  ENABLED: true,
} as const
`

describe('G11 threshold diff', () => {
  it('classifies structural tightening without promotion evidence', () => {
    const after = before
      .replace('SCORE_MIN: 90', 'SCORE_MIN: 94')
      .replace('DEFECT_MAX: 2', 'DEFECT_MAX: 1')
      .replace('min: 10', 'min: 12')
      .replace('max: 20', 'max: 18')

    expect(analyzeThresholdDiff(before, after)).toEqual([
      expect.objectContaining({ path: 'QUALITY.DEFECT_MAX', direction: 'TIGHTEN' }),
      expect.objectContaining({ path: 'QUALITY.RANGE.max', direction: 'TIGHTEN' }),
      expect.objectContaining({ path: 'QUALITY.RANGE.min', direction: 'TIGHTEN' }),
      expect.objectContaining({ path: 'QUALITY.SCORE_MIN', direction: 'TIGHTEN' }),
    ])
  })

  it('detects every known and ambiguous relaxation fail closed', () => {
    const after = before
      .replace('SCORE_MIN: 90', 'SCORE_MIN: 80')
      .replace('DEFECT_MAX: 2', 'DEFECT_MAX: 3')
      .replace('ENABLED: true', 'ENABLED: false')

    expect(analyzeThresholdDiff(before, after).filter((change) => change.direction === 'RELAX'))
      .toEqual([
        expect.objectContaining({ path: 'QUALITY.DEFECT_MAX' }),
        expect.objectContaining({ path: 'QUALITY.ENABLED' }),
        expect.objectContaining({ path: 'QUALITY.SCORE_MIN' }),
      ])
  })

  it('rejects RELAX without exact promoted owner evidence', () => {
    const after = before.replace('SCORE_MIN: 90', 'SCORE_MIN: 80')
    const changes = analyzeThresholdDiff(before, after)

    expect(() => validatePromotionEvidence({ before, after, changes, evidence: null }))
      .toThrow(/RELAX requires promotion evidence/iu)
    expect(() => validatePromotionEvidence({
      before,
      after,
      changes,
      evidence: {
        proposalId: 'proposal', promotionId: 'promotion', status: 'PROMOTED',
        strictnessDirection: 'RELAX', ownerIdentity: 'owner', ownerSignature: 'signature',
        evidenceR2Key: 'evidence/evolution/proposal.json', evidenceHash: 'a'.repeat(64),
        beforeSourceSha256: '0'.repeat(64), afterSourceSha256: '0'.repeat(64),
        changedPaths: ['QUALITY.SCORE_MIN'],
      },
    })).toThrow(/source hash/iu)
  })
})
