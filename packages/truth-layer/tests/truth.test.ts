import { describe, expect, test } from 'vitest'
import { defineTerminology, lintAdvice, parseNumbers, validateClaimEvidence } from '../src/index.js'

const blocked = [
  'You should buy this stock.', 'You need to sell before Friday.', 'You must invest now.',
  'I recommend buying the fund.', 'Consider investing in this token.', 'Many people have chosen to move into gold.',
  'Many people chosen to sell dollars.', 'The best move is to buy now.', 'The best choice is to invest.',
  'Smart investors are buying bonds.', 'Smart investors have been selling cash.',
  'If you want to increase returns, buy this.', 'If you want to maximize profit, invest here.',
  'If you want to boost returns, sell first.', 'To make money, buy the dip.', 'To make money invest in this.',
  'Double your money with this method.', 'Guaranteed return every month.', 'Guaranteed returns are available.',
  'This is risk-free profit.', 'You cannot lose with this strategy.', "You can't lose here.", 'It is a sure win.',
  'Bạn nên mua tài sản này.', 'Bạn cần bán ngay.', 'Hãy đầu tư hôm nay.',
  'I recommend selling the position.', 'Consider buying the asset.', 'The best move is to sell.',
  'If you want to maximise returns, buy this.', 'Risk free profit is promised.', 'Sure win for every investor.',
] as const

const allowed = [
  'This mechanism moves funds through three ledgers.',
  'Some analysts argue that rates may decline.',
  'Historically, the index fell after similar shocks.',
  'The chart describes a correlation, not a recommendation.',
] as const

describe('WP-16 truth layer', () => {
  test('advice lint catches 100% of an adversarial set of at least 30 samples', () => {
    expect(blocked).toHaveLength(32)
    expect(blocked.every((value) => lintAdvice(value).length > 0)).toBe(true)
    expect(allowed.every((value) => lintAdvice(value).length === 0)).toBe(true)
  })

  test('parses numeric claims without any model or provider dependency', () => {
    expect(parseNumbers('About $1.5m, over 4.2%, and 25 bps.')).toEqual([
      { raw: 'About $1.5m', value: 1_500_000, unit: 'NUMBER', currency: 'USD', qualifier: 'ABOUT' },
      { raw: 'over 4.2%', value: 4.2, unit: 'PERCENT', currency: null, qualifier: 'MORE_THAN' },
      { raw: '25 bps', value: 25, unit: 'BASIS_POINT', currency: null, qualifier: 'EXACT' },
    ])
  })

  test('requires a T1/T2 primary source for a critical claim', () => {
    const claim = { id: 'claim', type: 'FACT', criticality: 'CRITICAL', text: 'A fact', asOfDate: null, jurisdiction: null }
    const source = { id: 'source', tier: 3, url: 'https://example.com', snapshotR2Key: 'r2/source', contentHash: 'a'.repeat(64), fetchedAt: '2026-08-23T00:00:00.000Z' }
    expect(validateClaimEvidence(claim, [source], [{ claimId: 'claim', sourceId: 'source', role: 'PRIMARY' }]).valid).toBe(false)
    expect(validateClaimEvidence(claim, [{ ...source, tier: 2 }], [{ claimId: 'claim', sourceId: 'source', role: 'PRIMARY' }]).valid).toBe(true)
  })

  test('requires both IPA and ARPAbet terminology', () => {
    expect(defineTerminology({ term: 'EBITDA', plainMeaning: 'Operating earnings proxy', institutionalRole: null, ipa: '/iːbɪtdə/', arpabet: 'IY B IH T D AH' }).term).toBe('EBITDA')
  })
})
