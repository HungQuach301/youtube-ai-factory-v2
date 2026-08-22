import { describe, expect, it } from 'vitest'

import { COMMAND_TYPES, JobEnvelopeSchema, OPERATOR_EMERGENCY_COMMANDS, OWNER_COMMANDS, RETRYABLE, thresholds } from '../src/index.js'

describe('contracts v2', () => {
  it('defines exactly twelve typed commands and owner boundaries', () => {
    expect(COMMAND_TYPES).toHaveLength(12)
    expect(OWNER_COMMANDS).toEqual([
      'AUTHORIZE_RELEASE', 'AUTHORIZE_PUBLISH', 'PROMOTE_LEARNING',
      'PROMOTE_EVOLUTION', 'RETIRE_GOLD_SAMPLE'
    ])
    expect(OPERATOR_EMERGENCY_COMMANDS).toEqual(['FREEZE_CHANNEL'])
  })

  it('only retries transient and rate-limit errors', () => {
    expect(RETRYABLE).toEqual(['TRANSIENT', 'RATE_LIMIT'])
  })

  it('keeps all undecided and uncalibrated values visible', () => {
    expect(thresholds.UNDECIDED.SPEND_CEILING_PER_VIDEO_USD).toBeNull()
    expect(thresholds.UNCALIBRATED).toContain('AUDIO.PHONEME_MISMATCH_BASE')
    expect(thresholds.PROFILE.FULL.routeCount).toBe(4)
    expect(thresholds.PROFILE.REDUCED.routeCount).toBe(2)
  })

  it('rejects a production envelope without a 64-character settings hash', () => {
    const result = JobEnvelopeSchema.safeParse({
      traceId: 'trace', packageId: 'package', stageInstanceId: 'stage', fencingToken: 1,
      capabilityId: 'capability', settingsHash: 'not-a-hash', reservationId: 'reservation',
      namespace: 'production', imageDigest: 'sha256:image', profile: 'FULL', inputs: [],
      spec: {}, outputs: { r2Prefix: 'prod/', expectedArtifacts: [] },
      deadlineAt: '2026-08-22T00:00:00.000Z'
    })
    expect(result.success).toBe(false)
  })
})
