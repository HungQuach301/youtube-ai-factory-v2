import { describe, expect, it } from 'vitest'

import type { StrictnessDirection } from '@youtube-ai-factory/contracts'

import {
  StandardPolicyError,
  applyRegistryChange,
  classifyRuleChange,
  detectStandardDrift,
  resolveStandard,
  validateGateEvaluation,
} from '../src/index.js'

describe('standard inheritance', () => {
  it('resolves four scopes and lets a child tighten every supported rule kind', () => {
    const resolved = resolveStandard([
      {
        scope: 'PORTFOLIO', scopeRef: null, version: 1,
        rules: {
          evidenceCount: { kind: 'MINIMUM', value: 1 },
          maxDefects: { kind: 'MAXIMUM', value: 3 },
          evidenceRequired: { kind: 'REQUIRED', value: false },
          allowedRoutes: { kind: 'ALLOWLIST', values: ['SOURCE', 'MAKE', 'HYBRID'] },
        },
      },
      {
        scope: 'CHANNEL', scopeRef: 'channel-1', version: 2,
        rules: {
          evidenceCount: { kind: 'MINIMUM', value: 2 },
          evidenceRequired: { kind: 'REQUIRED', value: true },
        },
      },
      {
        scope: 'PILLAR', scopeRef: 'pillar-1', version: 3,
        rules: { maxDefects: { kind: 'MAXIMUM', value: 2 } },
      },
      {
        scope: 'EPISODE', scopeRef: 'episode-1', version: 4,
        rules: { allowedRoutes: { kind: 'ALLOWLIST', values: ['SOURCE', 'MAKE'] } },
      },
    ])

    expect(resolved.rules).toEqual({
      evidenceCount: { kind: 'MINIMUM', value: 2 },
      maxDefects: { kind: 'MAXIMUM', value: 2 },
      evidenceRequired: { kind: 'REQUIRED', value: true },
      allowedRoutes: { kind: 'ALLOWLIST', values: ['SOURCE', 'MAKE'] },
    })
    expect(resolved.lineage.map(({ scope }) => scope)).toEqual([
      'PORTFOLIO', 'CHANNEL', 'PILLAR', 'EPISODE',
    ])
  })

  it.each([
    ['MINIMUM', { kind: 'MINIMUM', value: 3 }, { kind: 'MINIMUM', value: 2 }],
    ['MAXIMUM', { kind: 'MAXIMUM', value: 3 }, { kind: 'MAXIMUM', value: 4 }],
    ['REQUIRED', { kind: 'REQUIRED', value: true }, { kind: 'REQUIRED', value: false }],
    ['ALLOWLIST', { kind: 'ALLOWLIST', values: ['A'] }, { kind: 'ALLOWLIST', values: ['A', 'B'] }],
  ] as const)('rejects an Episode %s rule that loosens its Channel ancestor', (_kind, channelRule, episodeRule) => {
    expect(() => resolveStandard([
      { scope: 'CHANNEL', scopeRef: 'channel-1', version: 1, rules: { gate: channelRule } },
      { scope: 'EPISODE', scopeRef: 'episode-1', version: 2, rules: { gate: episodeRule } },
    ])).toThrowError(expect.objectContaining({ code: 'CHILD_STANDARD_RELAXATION' }))
  })

  it('rejects missing ancestors and out-of-order scope input', () => {
    expect(() => resolveStandard([
      { scope: 'EPISODE', scopeRef: 'episode-1', version: 1, rules: {} },
      { scope: 'CHANNEL', scopeRef: 'channel-1', version: 1, rules: {} },
    ])).toThrowError(expect.objectContaining({ code: 'INVALID_SCOPE_ORDER' }))
  })
})

describe('G11 registry changes', () => {
  it.each([
    [{ kind: 'MINIMUM', value: 2 }, { kind: 'MINIMUM', value: 3 }, 'TIGHTEN'],
    [{ kind: 'MAXIMUM', value: 2 }, { kind: 'MAXIMUM', value: 3 }, 'RELAX'],
    [{ kind: 'REQUIRED', value: true }, undefined, 'RELAX'],
    [{ kind: 'ALLOWLIST', values: ['A'] }, { kind: 'ALLOWLIST', values: ['A'] }, 'NEUTRAL'],
  ] as const)('classifies strictness structurally', (before, after, expected) => {
    expect(classifyRuleChange(before, after)).toBe(expected as StrictnessDirection)
  })

  it('accepts TIGHTEN without owner promotion', () => {
    expect(applyRegistryChange(
      { kind: 'MINIMUM', value: 2 },
      { kind: 'MINIMUM', value: 3 },
    ).direction).toBe('TIGHTEN')
  })

  it('rejects RELAX unless a promoted owner-signed evolution is supplied', () => {
    expect(() => applyRegistryChange(
      { kind: 'MAXIMUM', value: 2 },
      { kind: 'MAXIMUM', value: 3 },
    )).toThrowError(expect.objectContaining({ code: 'RELAX_REQUIRES_PROMOTION' }))

    expect(() => applyRegistryChange(
      { kind: 'MAXIMUM', value: 2 },
      { kind: 'MAXIMUM', value: 3 },
      { status: 'PROMOTED', ownerIdentity: '', evidenceR2Key: 'evidence/evolution.json' },
    )).toThrowError(expect.objectContaining({ code: 'RELAX_REQUIRES_PROMOTION' }))

    expect(applyRegistryChange(
      { kind: 'MAXIMUM', value: 2 },
      { kind: 'MAXIMUM', value: 3 },
      { status: 'PROMOTED', ownerIdentity: 'owner-1', evidenceR2Key: 'evidence/evolution.json' },
    ).direction).toBe('RELAX')
  })
})

describe('gate policy and standard drift', () => {
  it('supports all four gate states but never permits M0 WAIVED', () => {
    for (const state of ['PASS', 'FAIL', 'NOT_EVALUATED'] as const) {
      expect(validateGateEvaluation({ tier: 'M0', state })).toEqual({ valid: true })
    }
    expect(() => validateGateEvaluation({
      tier: 'M0', state: 'WAIVED', waiverOwner: 'owner', waiverExpiresAt: '2026-09-01',
    })).toThrowError(expect.objectContaining({ code: 'M0_WAIVER_FORBIDDEN' }))
  })

  it('requires active owner and a future expiry for M1/M2 waivers', () => {
    expect(() => validateGateEvaluation({ tier: 'M1', state: 'WAIVED' }))
      .toThrowError(expect.objectContaining({ code: 'WAIVER_AUTHORIZATION_REQUIRED' }))
    expect(validateGateEvaluation({
      tier: 'M1', state: 'WAIVED', waiverOwner: 'owner', ownerActive: true,
      waiverExpiresAt: '2026-09-01T00:00:00Z', evaluatedAt: '2026-08-23T00:00:00Z',
    })).toEqual({ valid: true })
  })

  it('does not evaluate M2 until M0 and M1 are clean', () => {
    expect(() => validateGateEvaluation({
      tier: 'M2', state: 'PASS', prerequisiteStates: ['PASS', 'FAIL'],
    })).toThrowError(expect.objectContaining({ code: 'M2_PREREQUISITES_NOT_CLEAN' }))
  })

  it('blocks freeze on configured drift and fails closed when the threshold is UNDECIDED', () => {
    expect(detectStandardDrift([3, 5, 4], 1)).toEqual({
      code: 'STANDARD_DRIFT', minVersion: 3, maxVersion: 5, spread: 2,
      threshold: 1, blocksFreeze: true,
    })
    expect(detectStandardDrift([3, 3], 0)).toBeNull()
    expect(detectStandardDrift([3], null)).toEqual(expect.objectContaining({
      code: 'STANDARD_DRIFT', threshold: 'UNDECIDED', blocksFreeze: true,
    }))
  })
})

it('returns stable error codes for policy failures', () => {
  const error = new StandardPolicyError('M0_WAIVER_FORBIDDEN', 'blocked')
  expect(error).toMatchObject({ name: 'StandardPolicyError', code: 'M0_WAIVER_FORBIDDEN' })
})
