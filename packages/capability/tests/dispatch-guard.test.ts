import { describe, expect, it } from 'vitest'

import type {
  ArchetypeId,
  CapabilityId,
  CostEstimate,
  DispatchExecutionContext,
  FencingToken,
  Hex64,
  PackageId,
  ReservationId,
  StageInstanceId,
  TraceId,
} from '@youtube-ai-factory/contracts'

import {
  CapabilityDispatchGuard,
  CapabilityRegistry,
  MemoryDispatchBlockLog,
  computeSettingsHash,
} from '../src/index.js'
import type {
  DispatchBlockedError,
  DispatchCostPort,
  DispatchEvidencePort,
  DispatchLeasePort,
} from '../src/index.js'

const CAPABILITY_ID = 'capability-v1' as CapabilityId
const ARCHETYPE_ID = 'text-critical' as ArchetypeId
const RESERVATION_ID = 'reservation-1' as ReservationId
const REGISTERED_HASH = computeSettingsHash({
  modelSnapshot: 'gpt-5.6-2026-08-01',
  temperature: 0.2,
  topP: 0.9,
  seed: 7,
  systemPrompt: 'Return evidence-bound JSON.',
  responseFormat: { type: 'json_schema', name: 'fixture' },
})
const CONTEXT: DispatchExecutionContext = {
  fencingToken: 9 as FencingToken,
  packageId: 'package-1' as PackageId,
  stageInstanceId: 'stage-1' as StageInstanceId,
  traceId: 'trace-1' as TraceId,
  namespace: 'production',
  reservationId: RESERVATION_ID,
  portfolioRef: 'portfolio-1',
  channelRef: 'channel-1',
  createdAt: '2026-08-23T00:00:00.000Z',
  expiresAt: '2026-08-23T00:05:00.000Z',
}
const ESTIMATE: CostEstimate = {
  maxCostUsd: 1,
  basis: 'token_count',
  detail: { input_tokens: 10, max_output_tokens: 20 },
}

function registry(state: 'QUALIFIED' | 'REGISTERED' = 'QUALIFIED'): CapabilityRegistry {
  return new CapabilityRegistry({
    capabilities: [{
      id: CAPABILITY_ID,
      code: 'SCRIPT_JSON',
      kind: 'TEXT',
      version: '1.0.0',
      provider: 'fixture-provider',
      modelSnapshot: 'gpt-5.6-2026-08-01',
      settingsHash: REGISTERED_HASH,
      status: 'ACTIVE',
      createdAt: CONTEXT.createdAt,
    }],
    archetypes: [{
      id: ARCHETYPE_ID,
      code: 'TEXT_CRITICAL',
      domain: 'TEXT',
      criticality: 'CRITICAL',
      minFirstPassYield: 1,
    }],
    bindings: [{
      capabilityId: CAPABILITY_ID,
      archetypeId: ARCHETYPE_ID,
      qualificationState: state,
      qualificationRunId: state === 'QUALIFIED' ? 'run-pass-1' : null,
      qualifiedAt: state === 'QUALIFIED' ? CONTEXT.createdAt : null,
    }],
  })
}

function ports(events: string[], reservationOk = true): {
  lease: DispatchLeasePort
  cost: DispatchCostPort
  evidence: DispatchEvidencePort
} {
  return {
    lease: {
      async isCurrent() {
        events.push('fencing')
        return true
      },
    },
    cost: {
      async reserve() {
        events.push('reserve')
        return reservationOk
          ? { ok: true, reservationId: RESERVATION_ID }
          : { ok: false, errorClass: 'BUDGET_DENIED' }
      },
      async registerProviderRequest() {
        events.push('register-request')
      },
      async settle(input) {
        events.push(`settle:${input.actualCostUsd}`)
      },
    },
    evidence: {
      async snapshotRequest() {
        events.push('snapshot-request')
        return { r2Key: 'prod/evidence/request.json.gz' }
      },
      async snapshotResponse() {
        events.push('snapshot-response')
        return { r2Key: 'prod/evidence/response.json.gz' }
      },
    },
  }
}

function input(requestSettingsHash: Hex64 = REGISTERED_HASH) {
  return {
    capabilityId: CAPABILITY_ID,
    capabilityVersion: '1.0.0',
    adapterSettingsHash: REGISTERED_HASH,
    requestSettingsHash,
    archetypeId: ARCHETYPE_ID,
    request: { prompt: 'fixture' },
    estimate: ESTIMATE,
    idempotencyKey: 'b'.repeat(64) as Hex64,
    context: CONTEXT,
  }
}

describe('CapabilityDispatchGuard', () => {
  it('runs the mandatory nine-step sequence before returning the provider response', async () => {
    const events: string[] = []
    const dependencies = ports(events)
    const blocks = new MemoryDispatchBlockLog()
    const guard = new CapabilityDispatchGuard(registry(), dependencies.lease, dependencies.cost, dependencies.evidence, blocks)

    await expect(guard.execute(input(), async () => {
      events.push('transport')
      return { response: { output: 'ok' }, actualCostUsd: 0.8 }
    })).resolves.toEqual({ output: 'ok' })

    expect(events).toEqual([
      'fencing',
      'reserve',
      'snapshot-request',
      'register-request',
      'transport',
      'snapshot-response',
      'settle:0.8',
    ])
    expect(blocks.list()).toHaveLength(0)
  })

  it('changes the settings hash for a one-character system-prompt change and blocks zero-spend', async () => {
    const changed = computeSettingsHash({
      modelSnapshot: 'gpt-5.6-2026-08-01',
      temperature: 0.2,
      topP: 0.9,
      seed: 7,
      systemPrompt: 'Return evidence-bound JSON!',
      responseFormat: { type: 'json_schema', name: 'fixture' },
    })
    expect(changed).not.toBe(REGISTERED_HASH)

    const events: string[] = []
    const dependencies = ports(events)
    const blocks = new MemoryDispatchBlockLog()
    const guard = new CapabilityDispatchGuard(registry(), dependencies.lease, dependencies.cost, dependencies.evidence, blocks)
    let transports = 0

    await expect(guard.execute(input(changed), async () => {
      transports += 1
      return { response: { output: 'must not run' }, actualCostUsd: 1 }
    })).rejects.toMatchObject({
      name: 'DispatchBlockedError',
      reason: 'SETTINGS_HASH_MISMATCH',
      step: 2,
    } satisfies Partial<DispatchBlockedError>)
    expect(events).toEqual([])
    expect(transports).toBe(0)
    expect(blocks.list()).toMatchObject([{ reason: 'SETTINGS_HASH_MISMATCH', zeroSpend: true }])
  })

  it('blocks an unqualified binding before fencing, reservation or transport', async () => {
    const events: string[] = []
    const dependencies = ports(events)
    const blocks = new MemoryDispatchBlockLog()
    const guard = new CapabilityDispatchGuard(registry('REGISTERED'), dependencies.lease, dependencies.cost, dependencies.evidence, blocks)

    await expect(guard.execute(input(), async () => ({ response: 'no', actualCostUsd: 1 })))
      .rejects.toMatchObject({ reason: 'BINDING_NOT_QUALIFIED', step: 1 })
    expect(events).toEqual([])
  })

  it('blocks a stale fencing token before reservation', async () => {
    const events: string[] = []
    const dependencies = ports(events)
    dependencies.lease.isCurrent = async () => {
      events.push('fencing')
      return false
    }
    const guard = new CapabilityDispatchGuard(registry(), dependencies.lease, dependencies.cost, dependencies.evidence, new MemoryDispatchBlockLog())

    await expect(guard.execute(input(), async () => ({ response: 'no', actualCostUsd: 1 })))
      .rejects.toMatchObject({ reason: 'STALE_FENCING_TOKEN', step: 3 })
    expect(events).toEqual(['fencing'])
  })

  it('converts a denied reservation into an audited zero-spend block', async () => {
    const events: string[] = []
    const dependencies = ports(events, false)
    const blocks = new MemoryDispatchBlockLog()
    const guard = new CapabilityDispatchGuard(registry(), dependencies.lease, dependencies.cost, dependencies.evidence, blocks)

    await expect(guard.execute(input(), async () => ({ response: 'no', actualCostUsd: 1 })))
      .rejects.toMatchObject({ reason: 'BUDGET_DENIED', step: 4 })
    expect(events).toEqual(['fencing', 'reserve'])
    expect(blocks.list()[0]).toMatchObject({ reason: 'BUDGET_DENIED', zeroSpend: true })
  })
})

describe('CapabilityRegistry', () => {
  it('keeps an old qualified version dispatchable during shadow qualification of a new version', () => {
    const active = registry()
    active.registerCapability({
      id: 'capability-v2' as CapabilityId,
      code: 'SCRIPT_JSON',
      kind: 'TEXT',
      version: '2.0.0',
      provider: 'fixture-provider',
      modelSnapshot: 'gpt-5.6-2026-08-15',
      settingsHash: 'c'.repeat(64) as Hex64,
      status: 'ACTIVE',
      createdAt: CONTEXT.createdAt,
    })
    active.bind({
      capabilityId: 'capability-v2' as CapabilityId,
      archetypeId: ARCHETYPE_ID,
      qualificationState: 'QUALIFICATION_RUNNING',
      qualificationRunId: null,
      qualifiedAt: null,
    })

    expect(active.authorize(CAPABILITY_ID, '1.0.0', ARCHETYPE_ID).ok).toBe(true)
    expect(active.authorize('capability-v2' as CapabilityId, '2.0.0', ARCHETYPE_ID))
      .toMatchObject({ ok: false, reason: 'BINDING_NOT_QUALIFIED' })
  })

  it.each(['latest', 'default', 'gpt-latest', 'gpt_default'])('rejects non-snapshot model alias %s', (modelSnapshot) => {
    const active = new CapabilityRegistry()
    expect(() => active.registerCapability({
      id: 'bad-capability' as CapabilityId,
      code: 'BAD',
      kind: 'TEXT',
      version: '1.0.0',
      provider: 'fixture-provider',
      modelSnapshot,
      settingsHash: 'd'.repeat(64) as Hex64,
      status: 'ACTIVE',
      createdAt: CONTEXT.createdAt,
    })).toThrow(/snapshot/iu)
  })
})
