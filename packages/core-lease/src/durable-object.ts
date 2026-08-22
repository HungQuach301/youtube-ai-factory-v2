import type {
  ChannelId,
  FencingToken,
  PackageId,
} from '@youtube-ai-factory/contracts'

import {
  DurableLeaseRepository,
} from './durable-repository.js'
import type { DurableObjectStoragePort } from './durable-repository.js'
import { LeaseCoordinator } from './lease-coordinator.js'
import type {
  AcquireResult,
  Clock,
  HeartbeatResult,
  LeaseReconciler,
  LeaseScope,
  ReconcileResult,
  ReleaseResult,
} from './types.js'

export interface DurableObjectContextPort {
  readonly storage: DurableObjectStoragePort
}

function leaseScope(channelId: string, packageId: string): LeaseScope {
  return {
    channelId: channelId as ChannelId,
    packageId: packageId as PackageId,
  }
}

export class DurableLeaseObject {
  private readonly coordinator: LeaseCoordinator

  constructor(
    context: DurableObjectContextPort,
    reconciler: LeaseReconciler,
    clock?: Clock,
  ) {
    this.coordinator = new LeaseCoordinator(
      new DurableLeaseRepository(context.storage),
      reconciler,
      clock,
    )
  }

  acquireLease(channelId: string, packageId: string, holderId: string): Promise<AcquireResult> {
    return this.coordinator.acquire(leaseScope(channelId, packageId), holderId)
  }

  heartbeat(
    channelId: string,
    packageId: string,
    holderId: string,
    token: number,
  ): Promise<HeartbeatResult> {
    return this.coordinator.heartbeat(
      leaseScope(channelId, packageId),
      holderId,
      token as FencingToken,
    )
  }

  releaseLease(
    channelId: string,
    packageId: string,
    holderId: string,
    token: number,
  ): Promise<ReleaseResult> {
    return this.coordinator.release(
      leaseScope(channelId, packageId),
      holderId,
      token as FencingToken,
    )
  }

  reconcileExpired(channelId: string, packageId: string): Promise<ReconcileResult> {
    return this.coordinator.reconcileExpired(leaseScope(channelId, packageId))
  }

  isCurrentWriter(
    channelId: string,
    packageId: string,
    holderId: string,
    token: number,
  ): Promise<boolean> {
    return this.coordinator.isCurrentWriter(
      leaseScope(channelId, packageId),
      holderId,
      token as FencingToken,
    )
  }
}
