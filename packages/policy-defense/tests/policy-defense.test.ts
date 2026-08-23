import { describe, expect, test } from 'vitest'
import {
  assertIncidentFreeze,
  authorizeEmergencyFreeze,
  authorizePublish,
  authorizeUnfreeze,
  disclosureDecision,
  evaluatePolicyChecklist,
  evaluateSelfSimilarity,
  policyWatch,
  POLICY_RUNTIME,
} from '../src/index.js'

const at = '2026-08-23T10:00:00.000Z'
const checks = Array.from({ length: 8 }, (_, index) => ({
  code: `PC${index + 1}` as 'PC1' | 'PC2' | 'PC3' | 'PC4' | 'PC5' | 'PC6' | 'PC7' | 'PC8',
  state: 'PASS' as const, evidenceR2Key: `r2/pc${index + 1}`, evaluatedAt: at,
}))

describe('WP-29 policy defense', () => {
  test('requires all PC1..PC8 and evidence for every PASS', () => {
    expect(evaluatePolicyChecklist(checks).state).toBe('PASS')
    expect(evaluatePolicyChecklist(checks.slice(0, 7)).state).toBe('FAIL')
    expect(() => evaluatePolicyChecklist([{ ...checks[0], evidenceR2Key: null }])).toThrow(/PASS requires evidence/iu)
  })

  test('blocks publish unless checklist, disclosure, prediction, owner and freeze gates pass', () => {
    expect(authorizePublish({ checks, disclosureRecorded: true, predictionSealed: true, activeOwner: true, channelFrozen: false }).authorized).toBe(true)
    expect(authorizePublish({ checks: checks.slice(1), disclosureRecorded: false, predictionSealed: false, activeOwner: false, channelFrozen: true }).failures)
      .toEqual(['POLICY_CHECKLIST_INCOMPLETE', 'DISCLOSURE_DECISION_MISSING', 'SEALED_PREDICTION_MISSING', 'ACTIVE_OWNER_AUTHORIZATION_MISSING', 'CHANNEL_FROZEN'])
  })

  test('defaults disclosure on and requires rationale to switch it off', () => {
    expect(disclosureDecision({ packageId: 'p', decidedBy: 'owner-key', decidedAt: at }).syntheticToggle).toBe(true)
    expect(() => disclosureDecision({ packageId: 'p', syntheticToggle: false, rationaleText: 'short', decidedBy: 'owner-key', decidedAt: at })).toThrow(/requires written rationale/iu)
  })

  test('PC7 reuses WP-17 beat and pHash primitives and checks voice settings', () => {
    const current = { videoId: 'new', beats: ['HOOK', 'MECHANISM'], voiceSettingsHash: 'voice-a', thumbnailPhash: '0000000000000000' }
    const prior = { videoId: 'old', beats: ['HOOK', 'MECHANISM'], voiceSettingsHash: 'voice-a', thumbnailPhash: '0000000000000000' }
    expect(evaluateSelfSimilarity(current, [prior])).toEqual({ pass: false, violations: ['BEAT_TOO_SIMILAR:old', 'THUMBNAIL_TOO_SIMILAR:old', 'VOICE_SETTINGS_REUSED:old'] })
  })

  test('I2+ without the matching freeze is a hard failure; operator may emergency-freeze', () => {
    const incident = { id: 'i', channelId: 'c', level: 'I2' as const, source: 'PLATFORM_NOTICE' as const, detectedAt: at }
    expect(() => assertIncidentFreeze({ incident, openFreezeIncidentId: null })).toThrow(/requires immediate channel freeze/iu)
    expect(() => assertIncidentFreeze({ incident, openFreezeIncidentId: 'i' })).not.toThrow()
    expect(authorizeEmergencyFreeze({ role: 'OPERATOR', active: true })).toBe(true)
    expect(POLICY_RUNTIME.freezeOwnerConfirmHours).toBe(24)
  })

  test('unfreeze is owner-only and requires a promoted learning', () => {
    expect(authorizeUnfreeze({ actor: { role: 'OPERATOR', active: true }, promotedLearningIds: ['learning'] }).authorized).toBe(false)
    expect(authorizeUnfreeze({ actor: { role: 'OWNER', active: true }, promotedLearningIds: [] }).reason).toBe('PROMOTED_INCIDENT_LEARNING_REQUIRED')
    expect(authorizeUnfreeze({ actor: { role: 'OWNER', active: true }, promotedLearningIds: ['learning'] }).authorized).toBe(true)
  })

  test('policy watch creates one deterministic proposal for a simulated official-source diff', () => {
    const base = { sourceKey: 'ypp_monetization' as const, sourceUrl: 'https://support.google.com/youtube/policy', fetchedAt: at, snapshotR2Key: 'r2/policy/current', contentHash: 'a'.repeat(64) }
    expect(policyWatch(base, base)).toEqual({ changed: false, proposal: null })
    const changed = { ...base, fetchedAt: '2026-08-23T11:00:00.000Z', snapshotR2Key: 'r2/policy/new', contentHash: 'b'.repeat(64) }
    expect(policyWatch(base, changed)).toEqual(policyWatch(base, changed))
    expect(policyWatch(base, changed).proposal?.source).toBe('POLICY_WATCH')
  })
})
