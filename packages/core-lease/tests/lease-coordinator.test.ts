import { describe, expect, it } from 'vitest'

import type { ChannelId, FencingToken, PackageId } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import type {
  Clock,
  LeaseEvent,
  LeaseReconciler,
  LeaseRepository,
  LeaseScope,
  LeaseState,
  ReconciliationReport,
} from '../src/index.js'
import { LeaseCoordinator } from '../src/index.js'

const CHANNEL_A = 'channel-a' as ChannelId
const CHANNEL_B = 'channel-b' as ChannelId
const PACKAGE_A = 'package-a' as PackageId
const PACKAGE_B = 'package-b' as PackageId
const MILLISECONDS_PER_SECOND = 1_000

function scope(channelId = CHANNEL_A, packageId = PACKAGE_A): LeaseScope {
  return { channelId, packageId }
}

function scopeKey(value: LeaseScope): string {
  return `${value.channelId}:${value.packageId}`
}

class ManualClock implements Clock {
  constructor(private currentMs = 0) {}

  nowMs(): number {
    return this.currentMs
  }

  advanceSeconds(seconds: number): void {
    this.currentMs += seconds * MILLISECONDS_PER_SECOND
  }
}

class MemoryLeaseRepository implements LeaseRepository {
  readonly states = new Map<string, LeaseState>()
  readonly events: LeaseEvent[] = []

  load(value: LeaseScope): LeaseState | undefined {
    return this.states.get(scopeKey(value))
  }

  commit(state: LeaseState, event: LeaseEvent): void {
    this.states.set(scopeKey(state.scope), state)
    this.events.push(event)
  }
}

class ControlledReconciler implements LeaseReconciler {
  report: ReconciliationReport = {
    status: 'PENDING',
    orphanedProviderRequestIds: [],
    expiredReservationIds: [],
    unresolvedIds: ['provider-request-1'],
  }

  reconcile(): ReconciliationReport {
    return this.report
  }
}

function createHarness(): {
  readonly clock: ManualClock
  readonly repository: MemoryLeaseRepository
  readonly reconciler: ControlledReconciler
  readonly coordinator: LeaseCoordinator
} {
  const clock = new ManualClock()
  const repository = new MemoryLeaseRepository()
  const reconciler = new ControlledReconciler()
  const coordinator = new LeaseCoordinator(repository, reconciler, clock)
  return { clock, repository, reconciler, coordinator }
}

describe('LeaseCoordinator', () => {
  it('uses a 90 second TTL equal to three heartbeat intervals', async () => {
    const { coordinator } = createHarness()

    expect(thresholds.LEASE.TTL_SEC).toBe(thresholds.LEASE.HEARTBEAT_SEC * 3)
    const acquired = await coordinator.acquire(scope(), 'holder-a')
    expect(acquired.ok).toBe(true)
    if (!acquired.ok) throw new Error('expected acquisition')
    expect(acquired.lease.expiresAtMs).toBe(thresholds.LEASE.TTL_SEC * MILLISECONDS_PER_SECOND)
  })

  it('rejects the old writer after a 120 second GC pause and blocks takeover until reconciliation', async () => {
    const { clock, repository, reconciler, coordinator } = createHarness()
    const first = await coordinator.acquire(scope(), 'holder-a')
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('expected initial acquisition')

    clock.advanceSeconds(120)
    await expect(coordinator.isCurrentWriter(scope(), 'holder-a', first.lease.token)).resolves.toBe(false)
    await expect(coordinator.acquire(scope(), 'holder-b')).resolves.toEqual({
      ok: false,
      reason: 'RECONCILIATION_REQUIRED',
    })

    await expect(coordinator.reconcileExpired(scope())).resolves.toMatchObject({ status: 'PENDING' })
    await expect(coordinator.acquire(scope(), 'holder-b')).resolves.toEqual({
      ok: false,
      reason: 'RECONCILIATION_REQUIRED',
    })

    reconciler.report = {
      status: 'CLEAN',
      orphanedProviderRequestIds: ['provider-request-1'],
      expiredReservationIds: ['reservation-1'],
      unresolvedIds: [],
    }
    await expect(coordinator.reconcileExpired(scope())).resolves.toMatchObject({ status: 'CLEAN' })
    const second = await coordinator.acquire(scope(), 'holder-b')
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error('expected takeover after clean reconciliation')

    expect(second.lease.token).toBeGreaterThan(first.lease.token)
    await expect(coordinator.isCurrentWriter(scope(), 'holder-a', first.lease.token)).resolves.toBe(false)
    await expect(coordinator.isCurrentWriter(scope(), 'holder-b', second.lease.token)).resolves.toBe(true)
    expect(repository.events.map((event) => event.type)).toEqual([
      'ACQUIRE', 'EXPIRE', 'RECONCILED', 'ACQUIRE',
    ])
  })

  it('renews only the exact active holder and fencing token', async () => {
    const { clock, repository, coordinator } = createHarness()
    const acquired = await coordinator.acquire(scope(), 'holder-a')
    if (!acquired.ok) throw new Error('expected acquisition')
    const initialExpiry = acquired.lease.expiresAtMs

    clock.advanceSeconds(thresholds.LEASE.HEARTBEAT_SEC)
    const heartbeat = await coordinator.heartbeat(scope(), 'holder-a', acquired.lease.token)

    expect(heartbeat.ok).toBe(true)
    if (!heartbeat.ok) throw new Error('expected heartbeat')
    expect(heartbeat.lease.expiresAtMs).toBeGreaterThan(initialExpiry)
    await expect(coordinator.heartbeat(scope(), 'holder-b', acquired.lease.token)).resolves.toEqual({
      ok: false,
      reason: 'STALE_WRITER',
    })
    await expect(coordinator.heartbeat(
      scope(),
      'holder-a',
      (acquired.lease.token + 1) as FencingToken,
    )).resolves.toEqual({ ok: false, reason: 'STALE_WRITER' })
    expect(repository.events.map((event) => event.type)).toEqual(['ACQUIRE', 'HEARTBEAT'])
  })

  it('never reuses a fencing token after a clean release', async () => {
    const { coordinator } = createHarness()
    const first = await coordinator.acquire(scope(), 'holder-a')
    if (!first.ok) throw new Error('expected first acquisition')

    await expect(coordinator.release(scope(), 'holder-a', first.lease.token)).resolves.toEqual({ ok: true })
    const second = await coordinator.acquire(scope(), 'holder-a')

    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error('expected second acquisition')
    expect(second.lease.token).toBeGreaterThan(first.lease.token)
  })

  it('scopes leases by channel and package instead of globally', async () => {
    const { coordinator } = createHarness()

    const [first, second] = await Promise.all([
      coordinator.acquire(scope(CHANNEL_A, PACKAGE_A), 'holder-a'),
      coordinator.acquire(scope(CHANNEL_B, PACKAGE_B), 'holder-b'),
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
  })

  it('serializes concurrent acquisition so exactly one holder wins', async () => {
    const { coordinator } = createHarness()
    const attempts = await Promise.all(Array.from(
      { length: 100 },
      (_, index) => coordinator.acquire(scope(), `holder-${index}`),
    ))

    expect(attempts.filter((result) => result.ok)).toHaveLength(1)
    expect(attempts.filter((result) => !result.ok && result.reason === 'LEASE_HELD')).toHaveLength(99)
  })
})
