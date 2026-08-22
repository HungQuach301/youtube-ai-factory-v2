import { describe, expect, it } from 'vitest'

import type { ChannelId, FencingToken, PackageId } from '@youtube-ai-factory/contracts'

import type { DurableObjectStoragePort, LeaseState } from '../src/index.js'
import { DurableLeaseObject, DurableLeaseRepository } from '../src/index.js'

class MemoryDurableStorage implements DurableObjectStoragePort {
  readonly values = new Map<string, unknown>()

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined
  }

  put<T>(key: string, value: T): void {
    this.values.set(key, value)
  }
}

describe('DurableLeaseRepository', () => {
  it('persists lease state and an append-only event stream in Durable Object storage', async () => {
    const storage = new MemoryDurableStorage()
    const repository = new DurableLeaseRepository(storage)
    const state: LeaseState = {
      scope: {
        channelId: 'channel-a' as ChannelId,
        packageId: 'package-a' as PackageId,
      },
      lastToken: 1 as FencingToken,
      holderId: 'holder-a',
      expiresAtMs: 90_000,
      reconciliation: 'CLEAN',
    }
    const event = {
      id: 'event-1',
      scope: state.scope,
      type: 'ACQUIRE',
      holderId: 'holder-a',
      token: 1 as FencingToken,
      createdAtMs: 0,
    } as const

    await repository.commit(state, event)

    await expect(repository.load(state.scope)).resolves.toEqual(state)
    await expect(repository.listEvents(state.scope)).resolves.toEqual([event])
  })

  it('preserves the active lease when the Durable Object instance restarts', async () => {
    const storage = new MemoryDurableStorage()
    const context = { storage }
    const reconciler = {
      reconcile: () => ({
        status: 'CLEAN' as const,
        orphanedProviderRequestIds: [],
        expiredReservationIds: [],
        unresolvedIds: [],
      }),
    }
    const clock = { nowMs: () => 0 }
    const firstInstance = new DurableLeaseObject(context, reconciler, clock)
    const acquired = await firstInstance.acquireLease('channel-a', 'package-a', 'holder-a')
    expect(acquired.ok).toBe(true)

    const restartedInstance = new DurableLeaseObject(context, reconciler, clock)
    await expect(
      restartedInstance.acquireLease('channel-a', 'package-a', 'holder-b'),
    ).resolves.toEqual({ ok: false, reason: 'LEASE_HELD' })
  })
})
