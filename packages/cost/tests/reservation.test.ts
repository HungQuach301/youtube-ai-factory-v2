import { describe, expect, it } from 'vitest'

import type {
  CapabilityId,
  PackageId,
  ReservationId,
  StageInstanceId,
} from '@youtube-ai-factory/contracts'

import { CostReservationLedger } from '../src/index.js'
import type {
  CostControlError,
  ReservationRequest,
  SpendCeiling,
} from '../src/index.js'

const PACKAGE_ID = 'package-1' as PackageId
const STAGE_ID = 'stage-1' as StageInstanceId
const CAPABILITY_ID = 'capability-1' as CapabilityId
const START = '2026-08-23T00:00:00.000Z'
const EXPIRY = '2026-08-23T00:05:00.000Z'

function ceilings(limit = 10): SpendCeiling[] {
  return [
    { namespace: 'production', scope: 'PORTFOLIO', scopeRef: 'portfolio-1', ceilingUsd: limit },
    { namespace: 'production', scope: 'CHANNEL', scopeRef: 'channel-1', ceilingUsd: limit },
    { namespace: 'production', scope: 'PACKAGE', scopeRef: PACKAGE_ID, ceilingUsd: limit },
    { namespace: 'production', scope: 'STAGE', scopeRef: STAGE_ID, ceilingUsd: limit },
  ]
}

function request(index: number, estimatedCostUsd = 1): ReservationRequest {
  return {
    id: `reservation-${index}` as ReservationId,
    packageId: PACKAGE_ID,
    stageInstanceId: STAGE_ID,
    capabilityId: CAPABILITY_ID,
    namespace: 'production',
    estimatedCostUsd,
    scopes: {
      portfolio: 'portfolio-1',
      channel: 'channel-1',
      package: PACKAGE_ID,
      stage: STAGE_ID,
    },
    createdAt: START,
    expiresAt: EXPIRY,
  }
}

describe('CostReservationLedger', () => {
  it('admits exactly 10 of 50 concurrent dispatch intents when every ceiling can fund only 10', async () => {
    const ledger = new CostReservationLedger(ceilings())
    let transportCalls = 0
    const decisions = await Promise.all(Array.from({ length: 50 }, async (_value, index) => {
      const decision = await ledger.reserve(request(index))
      if (decision.ok) transportCalls += 1
      return decision
    }))

    const admitted = decisions.filter((decision) => decision.ok)
    const denied = decisions.filter((decision) => !decision.ok)
    expect(admitted).toHaveLength(10)
    expect(denied).toHaveLength(40)
    expect(denied.every((decision) => decision.errorClass === 'BUDGET_DENIED')).toBe(true)
    expect(transportCalls).toBe(10)
    expect(ledger.getUtilization('production', 'PACKAGE', PACKAGE_ID)).toBe(10)
  })

  it('rejects when a stricter hierarchical ceiling would be exceeded', async () => {
    const configured = ceilings(10).map((ceiling) => (
      ceiling.scope === 'CHANNEL' ? { ...ceiling, ceilingUsd: 1 } : ceiling
    ))
    const ledger = new CostReservationLedger(configured)

    await expect(ledger.reserve(request(1))).resolves.toMatchObject({ ok: true })
    await expect(ledger.reserve(request(2))).resolves.toEqual({
      ok: false,
      errorClass: 'BUDGET_DENIED',
      deniedScopes: ['CHANNEL:channel-1'],
    })
  })

  it('keeps production and qualification utilization isolated', async () => {
    const ledger = new CostReservationLedger([
      ...ceilings(1),
      { namespace: 'qualification', scope: 'PORTFOLIO', scopeRef: 'qualification-1', ceilingUsd: 2 },
    ])
    await expect(ledger.reserve(request(1))).resolves.toMatchObject({ ok: true })
    await expect(ledger.reserve({
      id: 'reservation-2' as ReservationId,
      packageId: PACKAGE_ID,
      capabilityId: CAPABILITY_ID,
      namespace: 'qualification',
      scopes: { portfolio: 'qualification-1' },
      estimatedCostUsd: 2,
      createdAt: START,
      expiresAt: EXPIRY,
    })).resolves.toMatchObject({ ok: true })
    expect(ledger.getUtilization('production', 'PORTFOLIO', 'portfolio-1')).toBe(1)
    expect(ledger.getUtilization('qualification', 'PORTFOLIO', 'qualification-1')).toBe(2)
  })

  it('fails closed when a production request omits a mandatory hierarchical scope', async () => {
    const ledger = new CostReservationLedger(ceilings())
    await expect(ledger.reserve({
      ...request(1),
      scopes: { portfolio: 'portfolio-1' },
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('settles only HELD reservations, records actual cost and releases the unused hold', async () => {
    const ledger = new CostReservationLedger(ceilings(10))
    const decision = await ledger.reserve(request(1, 8))
    if (!decision.ok) throw new Error('fixture reservation was denied')

    await expect(ledger.settle(decision.reservation.id, 5, 'PRODUCTION', START))
      .resolves.toMatchObject({ amountUsd: 5, kind: 'PRODUCTION' })
    expect(ledger.getUtilization('production', 'PACKAGE', PACKAGE_ID)).toBe(5)
    await expect(ledger.settle(decision.reservation.id, 5, 'PRODUCTION', START))
      .resolves.toMatchObject({ amountUsd: 5 })
    await expect(ledger.settle(decision.reservation.id, 6, 'PRODUCTION', START))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('rejects actual cost above the reserved maximum', async () => {
    const ledger = new CostReservationLedger(ceilings(10))
    const decision = await ledger.reserve(request(1, 5))
    if (!decision.ok) throw new Error('fixture reservation was denied')
    await expect(ledger.settle(decision.reservation.id, 6, 'PRODUCTION', START))
      .rejects.toMatchObject({ code: 'ACTUAL_EXCEEDS_RESERVATION' })
  })

  it('rejects a ledger kind that crosses the reservation namespace boundary', async () => {
    const ledger = new CostReservationLedger(ceilings(10))
    const decision = await ledger.reserve(request(1, 5))
    if (!decision.ok) throw new Error('fixture reservation was denied')
    await expect(ledger.settle(decision.reservation.id, 5, 'QUALIFICATION', START))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('enforces G8 in memory before a terminal provider retry can be recorded', async () => {
    const ledger = new CostReservationLedger(ceilings(10))
    const decision = await ledger.reserve(request(1, 5))
    if (!decision.ok) throw new Error('fixture reservation was denied')
    await ledger.registerProviderRequest({
      id: 'provider-request-1',
      reservationId: decision.reservation.id,
      idempotencyKey: 'a'.repeat(64),
      requestR2Key: 'evidence/provider/request-1.json',
      errorClass: 'SCHEMA_VIOLATION',
      attemptOrdinal: 1,
      createdAt: START,
    })
    await expect(ledger.registerProviderRequest({
      id: 'provider-request-2',
      reservationId: decision.reservation.id,
      idempotencyKey: 'b'.repeat(64),
      requestR2Key: 'evidence/provider/request-2.json',
      attemptOrdinal: 2,
      createdAt: START,
    })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('expires HELD reservations, orphans open requests and blocks the package', async () => {
    const ledger = new CostReservationLedger(ceilings(10))
    const decision = await ledger.reserve(request(1, 4))
    if (!decision.ok) throw new Error('fixture reservation was denied')
    await ledger.registerProviderRequest({
      id: 'provider-request-1',
      reservationId: decision.reservation.id,
      idempotencyKey: 'a'.repeat(64),
      requestR2Key: 'evidence/provider/request.json',
      attemptOrdinal: 1,
      createdAt: START,
    })

    await expect(ledger.reconcileOrphans(PACKAGE_ID, '2026-08-23T00:06:00.000Z')).resolves.toEqual({
      packageId: PACKAGE_ID,
      reservationIds: [decision.reservation.id],
      providerRequestIds: ['provider-request-1'],
      estimatedCostUsd: 4,
      blocksPackage: true,
    })
    await expect(ledger.reserve(request(2))).rejects.toMatchObject({
      name: 'CostControlError',
      code: 'RECONCILIATION_REQUIRED',
    } satisfies Partial<CostControlError>)
    expect(ledger.getUtilization('production', 'PACKAGE', PACKAGE_ID)).toBe(4)
  })

  it('computes unit economics from settled ledger entries without inventing denominators', async () => {
    const ledger = new CostReservationLedger(ceilings(20))
    const first = await ledger.reserve(request(1, 5))
    const second = await ledger.reserve(request(2, 3))
    if (!first.ok || !second.ok) throw new Error('fixture reservation was denied')
    await ledger.settle(first.reservation.id, 4, 'PRODUCTION', START)
    await ledger.settle(second.reservation.id, 2, 'REJECTED_CANDIDATE', START)

    expect(ledger.unitEconomics(PACKAGE_ID, { sealedArtifactCount: 3, publishedVideoCount: 1 })).toEqual({
      totalCostUsd: 6,
      productionCostUsd: 4,
      qualificationCostUsd: 0,
      rejectedCandidateCostUsd: 2,
      costPerSealedArtifactUsd: 2,
      costPerPublishedVideoUsd: 6,
      tournamentShare: 2 / 6,
      orphanRate: 0,
    })
    expect(ledger.unitEconomics(PACKAGE_ID, { sealedArtifactCount: 0, publishedVideoCount: 0 }))
      .toMatchObject({ costPerSealedArtifactUsd: null, costPerPublishedVideoUsd: null })
  })
})
