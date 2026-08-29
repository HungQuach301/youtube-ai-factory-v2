import { describe, expect, it } from 'vitest'

import type { AssuranceRunResult } from '../src/index.js'
import { resolveAssuranceLaneEligibility } from '../src/index.js'

const result = (overrides: Partial<AssuranceRunResult> = {}): AssuranceRunResult => ({
  runId: 'g02i-1b-test',
  mode: 'WARNING_ONLY',
  gateState: 'NOT_EVALUATED',
  verdict: 'NOT_RUN',
  providerCallCount: 0,
  blockers: ['RUBRIC_ANCHOR_MISSING:OVERALL'],
  dimensionScores: {},
  borderlineDimensions: [],
  criticEvidence: [],
  p0Count: 0,
  criticalP1Count: 0,
  ...overrides,
})

describe('G-02I-1B Track G assurance bootstrap resolver', () => {
  it('allows zero-provider prequalification gaps only in WARNING_ONLY qualification', () => {
    expect(resolveAssuranceLaneEligibility(result())).toEqual({
      qualificationLaneEligible: true,
      releaseEligible: false,
      warnings: ['RUBRIC_ANCHOR_MISSING:OVERALL'],
      hardBlockers: [],
    })
  })

  it('keeps the same missing anchor as a hard Production blocker', () => {
    expect(resolveAssuranceLaneEligibility(result({ mode: 'HARD_GATE' }))).toEqual({
      qualificationLaneEligible: false,
      releaseEligible: false,
      warnings: [],
      hardBlockers: ['RUBRIC_ANCHOR_MISSING:OVERALL'],
    })
  })

  it('never releases a scored warning-only result', () => {
    expect(resolveAssuranceLaneEligibility(result({
      verdict: 'PASS',
      blockers: ['M2_WARNING_ONLY_NOT_A_RELEASE_GATE'],
    }))).toMatchObject({ qualificationLaneEligible: true, releaseEligible: false })
  })

  it('releases only a clean HARD_GATE PASS', () => {
    expect(resolveAssuranceLaneEligibility(result({
      mode: 'HARD_GATE', gateState: 'PASS', verdict: 'PASS', blockers: [],
    }))).toEqual({
      qualificationLaneEligible: true,
      releaseEligible: true,
      warnings: [],
      hardBlockers: [],
    })
  })

  it('fails closed for unknown warning blockers or dispatched bootstrap calls', () => {
    expect(resolveAssuranceLaneEligibility(result({ blockers: ['UNKNOWN_BLOCKER'] })))
      .toMatchObject({ qualificationLaneEligible: false, releaseEligible: false })
    expect(resolveAssuranceLaneEligibility(result({ providerCallCount: 1 })))
      .toMatchObject({ qualificationLaneEligible: false, releaseEligible: false })
  })
})
