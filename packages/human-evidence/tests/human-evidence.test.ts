import { describe, expect, test } from 'vitest'
import {
  authorizeAttention,
  evaluateEditorialImprint,
  generateEvidenceReport,
  lintDecisionDiversity,
  queueAgeAlert,
} from '../src/index.js'

const actor = { identity: 'owner-key-01', displayName: 'Test Owner', role: 'OWNER' as const, isService: false as const, active: true }
const makeDecision = (id: string, packageId: string, decisionType: 'D1' | 'D2' | 'D3' = 'D1') => ({
  id, channelId: 'channel', packageId, decisionType, actorIdentity: actor.identity,
  artifactBeforeId: null, artifactAfterId: `after-${id}`, diffR2Key: `r2/diff/${id}`,
  rationaleText: 'A substantive editorial rationale written by the human reviewer.',
  createdAt: '2026-08-23T10:00:00.000Z',
})

describe('WP-28 human touchpoints and evidence', () => {
  test('fails closed when the explicit human allowlist is missing', () => {
    expect(() => evaluateEditorialImprint({ packageId: 'p', actors: [], decisions: [], artifactSeals: [] }))
      .toThrow(/allowlist is required/iu)
  })

  test('blocks Stage 14 readiness when decisions are missing or same-type', () => {
    const one = makeDecision('1', 'p')
    expect(evaluateEditorialImprint({ packageId: 'p', actors: [actor], decisions: [one], artifactSeals: [] }).failures)
      .toContain('MIN_HUMAN_DECISIONS')
    const sameType = [one, makeDecision('2', 'p')]
    const seals = sameType.map((decision) => ({ artifactId: decision.artifactAfterId, sealedAt: '2026-08-23T10:05:00.000Z' }))
    expect(evaluateEditorialImprint({ packageId: 'p', actors: [actor], decisions: sameType, artifactSeals: seals }).failures)
      .toContain('MIN_DISTINCT_DECISION_TYPES')
  })

  test('passes only with two types, active humans, rationale, diff and post-decision seals', () => {
    const decisions = [makeDecision('1', 'p', 'D1'), makeDecision('2', 'p', 'D2')]
    const artifactSeals = decisions.map((decision) => ({ artifactId: decision.artifactAfterId, sealedAt: '2026-08-23T10:05:00.000Z' }))
    expect(evaluateEditorialImprint({ packageId: 'p', actors: [actor], decisions, artifactSeals }).state).toBe('PASS')
    expect(evaluateEditorialImprint({ packageId: 'p', actors: [{ ...actor, active: false }], decisions, artifactSeals }).state).toBe('FAIL')
  })

  test('warns for mechanical rationale and decision-type patterns across five videos', () => {
    const decisions = Array.from({ length: 5 }, (_, index) => makeDecision(String(index), `p${index}`, 'D3'))
    expect(lintDecisionDiversity(decisions)).toEqual([
      'REPEATED_RATIONALE_PATTERN',
      'INSUFFICIENT_DECISION_TYPE_DIVERSITY',
    ])
  })

  test('enforces the confirmed 300-minute weekly ceiling and 48-hour queue alert', () => {
    const entries = [{ id: 'a', actorIdentity: actor.identity, touchpoint: 'HP02' as const, packageId: 'p', minutesSpent: 290, weekStart: '2026-08-17', createdAt: '2026-08-23T10:00:00.000Z' }]
    expect(authorizeAttention({ entries, weekStart: '2026-08-17', projectedMinutes: 10 }).authorized).toBe(true)
    expect(authorizeAttention({ entries, weekStart: '2026-08-17', projectedMinutes: 11 }).reason).toBe('OWNER_WEEKLY_ATTENTION_CEILING_EXCEEDED')
    expect(queueAgeAlert('2026-08-21T10:00:00.000Z', '2026-08-23T10:00:00.000Z')).toBe(true)
  })

  test('generates a deterministic evidence report entirely from injected D1/R2 records', () => {
    const input = {
      channelId: 'channel', window: { from: '2026-08-23T00:00:00.000Z', to: '2026-08-24T00:00:00.000Z' },
      decisions: [makeDecision('1', 'p', 'D1'), makeDecision('2', 'p', 'D2')],
      releaseAuthorizations: [{ packageId: 'p', actorIdentity: actor.identity, at: '2026-08-23T11:00:00.000Z' }],
      publishAuthorizations: [{ packageId: 'p', actorIdentity: actor.identity, at: '2026-08-23T12:00:00.000Z' }],
      disclosureDecisions: [{ packageId: 'p', enabled: true, at: '2026-08-23T11:30:00.000Z' }],
      differentiation: [{ packageId: 'p', score: 0.42 }], sourcedClaimRatios: [{ packageId: 'p', tierOneTwoRatio: 1 }],
    }
    expect(generateEvidenceReport(input)).toEqual(generateEvidenceReport(input))
    expect(generateEvidenceReport(input).content).toContain('"autoPublishedCount":0')
  })
})
