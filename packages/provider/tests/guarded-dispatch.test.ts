import { describe, expect, it, vi } from 'vitest'

import type {
  ArchetypeId,
  CapabilityId,
  DispatchGuardRuntime,
  ErrorClass,
  FencingToken,
  GuardedDispatchContext,
  Hex64,
  PackageId,
  ProviderAdapter,
  ReservationId,
  StageInstanceId,
  TraceId,
} from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'
import type { ProviderDispatchError } from '../src/index.js'

import {
  estimateTokenCost,
  guardedDispatch,
} from '../src/index.js'

const CAPABILITY_ID = 'capability-1' as CapabilityId
const ARCHETYPE_ID = 'archetype-1' as ArchetypeId
const SETTINGS_HASH = 'a'.repeat(64) as Hex64
const PASS_THROUGH_GUARD: DispatchGuardRuntime = {
  async execute(_input, transport) {
    return (await transport()).response
  },
}
const CONTEXT: GuardedDispatchContext = {
  fencingToken: 7 as FencingToken,
  packageId: 'package-1' as PackageId,
  stageInstanceId: 'stage-instance-1' as StageInstanceId,
  traceId: 'trace-1' as TraceId,
  namespace: 'production',
  reservationId: 'reservation-1' as ReservationId,
  portfolioRef: 'portfolio-1',
  channelRef: 'channel-1',
  createdAt: '2026-08-23T00:00:00.000Z',
  expiresAt: '2026-08-23T00:05:00.000Z',
  requestSettingsHash: SETTINGS_HASH,
  dispatchGuard: PASS_THROUGH_GUARD,
}

interface Request { readonly prompt: string, readonly maxOutputTokens: number }
interface Response { readonly output: string }

function adapter(
  dispatch: ProviderAdapter<Request, Response>['dispatch'],
  normalizeError: ProviderAdapter<Request, Response>['normalizeError'] = () => 'PROVIDER_ERROR',
  estimateCost: ProviderAdapter<Request, Response>['estimateCost'] = () => ({
    maxCostUsd: 0.01,
    basis: 'token_count',
    detail: { input_tokens: 1, max_output_tokens: 4 },
  }),
): ProviderAdapter<Request, Response> {
  return {
    capabilityId: CAPABILITY_ID,
    version: 'provider-fixture-v1',
    settingsHash: SETTINGS_HASH,
    estimateCost,
    dispatch,
    actualCost: () => 0.008,
    normalizeError,
  }
}

describe('guardedDispatch', () => {
  it('estimates before dispatch and reuses one deterministic idempotency key', async () => {
    const events: string[] = []
    const keys: Hex64[] = []
    const fixture = adapter(
      async (_request, idempotencyKey) => {
        events.push('dispatch')
        keys.push(idempotencyKey)
        return { output: 'complete' }
      },
      undefined,
      () => {
        events.push('estimate')
        return { maxCostUsd: 0.01, basis: 'token_count', detail: { input_tokens: 1 } }
      },
    )

    await expect(guardedDispatch(
      fixture,
      ARCHETYPE_ID,
      { prompt: 'hello', maxOutputTokens: 4 },
      CONTEXT,
    )).resolves.toEqual({ output: 'complete' })
    expect(events).toEqual(['estimate', 'dispatch'])
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/u)

    await guardedDispatch(fixture, ARCHETYPE_ID, { prompt: 'hello', maxOutputTokens: 4 }, CONTEXT)
    expect(keys[1]).toBe(keys[0])
  })

  it.each(['TRANSIENT', 'RATE_LIMIT'] as const)(
    'retries %s only up to the configured attempt limit with the same idempotency key',
    async (errorClass) => {
      vi.useFakeTimers()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const keys: Hex64[] = []
      let attempts = 0
      const fixture = adapter(
        async (_request, key) => {
          attempts += 1
          keys.push(key)
          if (attempts < thresholds.RETRY.MAX_ATTEMPTS) throw new Error(errorClass)
          return { output: 'recovered' }
        },
        () => errorClass,
      )

      const result = guardedDispatch(
        fixture,
        ARCHETYPE_ID,
        { prompt: 'retry', maxOutputTokens: 4 },
        CONTEXT,
      )
      await vi.runAllTimersAsync()
      await expect(result).resolves.toEqual({ output: 'recovered' })
      expect(attempts).toBe(thresholds.RETRY.MAX_ATTEMPTS)
      expect(new Set(keys).size).toBe(1)
      vi.restoreAllMocks()
      vi.useRealTimers()
    },
  )

  it.each([
    'SCHEMA_VIOLATION',
    'RIGHTS_DENIED',
    'BUDGET_DENIED',
    'CONTENT_FILTERED',
    'PROVIDER_ERROR',
  ] as const)('never retries terminal %s', async (errorClass) => {
    let attempts = 0
    const fixture = adapter(
      async () => {
        attempts += 1
        throw new Error(errorClass)
      },
      () => errorClass,
    )

    await expect(guardedDispatch(
      fixture,
      ARCHETYPE_ID,
      { prompt: 'terminal', maxOutputTokens: 4 },
      CONTEXT,
    )).rejects.toMatchObject({
      name: 'ProviderDispatchError',
      errorClass,
      attempts: 1,
    } satisfies Partial<ProviderDispatchError>)
    expect(attempts).toBe(1)
  })

  it('fails closed when cost estimation is invalid without touching the provider', async () => {
    let dispatches = 0
    const fixture = adapter(
      async () => {
        dispatches += 1
        return { output: 'must not run' }
      },
      undefined,
      () => ({ maxCostUsd: Number.NaN, basis: 'token_count', detail: {} }),
    )

    await expect(guardedDispatch(
      fixture,
      ARCHETYPE_ID,
      { prompt: 'invalid estimate', maxOutputTokens: 4 },
      CONTEXT,
    )).rejects.toMatchObject({ errorClass: 'PROVIDER_ERROR', attempts: 0 })
    expect(dispatches).toBe(0)
  })

  it('fails closed when an adapter returns an unknown runtime cost basis', async () => {
    let dispatches = 0
    const fixture = adapter(
      async () => {
        dispatches += 1
        return { output: 'must not run' }
      },
      undefined,
      () => ({ maxCostUsd: 0.01, basis: 'guess' as 'token_count', detail: {} }),
    )

    await expect(guardedDispatch(
      fixture,
      ARCHETYPE_ID,
      { prompt: 'invalid basis', maxOutputTokens: 4 },
      CONTEXT,
    )).rejects.toMatchObject({ errorClass: 'PROVIDER_ERROR', attempts: 0 })
    expect(dispatches).toBe(0)
  })

  it('fails closed when an adapter returns an unknown runtime error class', async () => {
    let dispatches = 0
    const fixture = adapter(
      async () => {
        dispatches += 1
        throw new Error('unknown')
      },
      () => 'NOT_A_CONTRACT_CLASS' as ErrorClass,
    )

    await expect(guardedDispatch(
      fixture,
      ARCHETYPE_ID,
      { prompt: 'unknown class', maxOutputTokens: 4 },
      CONTEXT,
    )).rejects.toMatchObject({ errorClass: 'PROVIDER_ERROR', attempts: 1 })
    expect(dispatches).toBe(1)
  })
})

describe('exact token cost estimation', () => {
  it('uses the tokenizer count and configured output ceiling instead of character guesses', () => {
    let counted = 0
    const estimate = estimateTokenCost(
      { prompt: 'length is not token count', maxOutputTokens: 8 },
      {
        countTokens(input) {
          expect(input).toBe('length is not token count')
          counted += 1
          return 5
        },
      },
      { inputUsdPerToken: 0.002, outputUsdPerToken: 0.004 },
    )

    expect(counted).toBe(1)
    expect(estimate).toEqual({
      maxCostUsd: 0.042,
      basis: 'token_count',
      detail: {
        input_tokens: 5,
        max_output_tokens: 8,
        input_cost_usd: 0.01,
        max_output_cost_usd: 0.032,
      },
    })
  })

  it.each([-1, 1.5, Number.NaN])('rejects invalid tokenizer count %s', (count) => {
    expect(() => estimateTokenCost(
      { prompt: 'invalid', maxOutputTokens: 8 },
      { countTokens: () => count },
      { inputUsdPerToken: 0.002, outputUsdPerToken: 0.004 },
    )).toThrow(/token count/iu)
  })
})

it('does not expose a raw dispatch function from the provider package', async () => {
  const publicApi: Record<string, unknown> = await import('../src/index.js')
  expect(publicApi).not.toHaveProperty('dispatch')
})
