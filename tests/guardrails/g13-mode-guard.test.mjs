import { describe, expect, it } from 'vitest'

import { assertModeAllowed, protectedOperatePaths } from '../../tools/g13-mode-guard.mjs'

describe('G13 mode guard', () => {
  it.each([
    'packages/contracts/src/thresholds.ts',
    'tests/guardrails/g11-threshold-diff.test.mjs',
    'db/migrations/0008_evolution.sql',
  ])('blocks mode=OPERATE from touching %s', (file) => {
    expect(() => assertModeAllowed(['mode=OPERATE'], [file])).toThrow(/G13/iu)
  })

  it('allows the same protected paths in BUILD and normal paths in OPERATE', () => {
    expect(() => assertModeAllowed(['mode=BUILD'], [...protectedOperatePaths])).not.toThrow()
    expect(() => assertModeAllowed(['mode=OPERATE'], ['OPS-LOG.md'])).not.toThrow()
  })

  it('fails when the PR does not declare exactly one mode', () => {
    expect(() => assertModeAllowed([], ['README.md'])).toThrow(/exactly one mode/iu)
    expect(() => assertModeAllowed(['mode=BUILD', 'mode=OPERATE'], ['README.md']))
      .toThrow(/exactly one mode/iu)
  })
})
