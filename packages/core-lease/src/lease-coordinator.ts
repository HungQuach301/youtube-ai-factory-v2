import { thresholds } from '@youtube-ai-factory/contracts'
import type { FencingToken } from '@youtube-ai-factory/contracts'

import type {
  AcquireResult,
  ActiveLease,
  Clock,
  HeartbeatResult,
  LeaseEvent,
  LeaseEventType,
  LeaseReconciler,
  LeaseRepository,
  LeaseScope,
  LeaseState,
  MaybePromise,
  ReconcileResult,
  ReconciliationReport,
  ReleaseResult,
} from './types.js'

const MILLISECONDS_PER_SECOND = 1_000
const INITIAL_FENCING_TOKEN = 0 as FencingToken
const NEXT_TOKEN_INCREMENT = 1

const systemClock: Clock = { nowMs: () => Date.now() }
const defaultEventId = (): string => crypto.randomUUID()

function emptyState(scope: LeaseScope): LeaseState {
  return {
    scope,
    lastToken: INITIAL_FENCING_TOKEN,
    holderId: null,
    expiresAtMs: null,
    reconciliation: 'CLEAN',
  }
}

function activeLease(state: LeaseState): ActiveLease | undefined {
  if (state.holderId === null || state.expiresAtMs === null) return undefined
  return {
    scope: state.scope,
    holderId: state.holderId,
    token: state.lastToken,
    expiresAtMs: state.expiresAtMs,
  }
}

export class LeaseCoordinator {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly repository: LeaseRepository,
    private readonly reconciler: LeaseReconciler,
    private readonly clock: Clock = systemClock,
    private readonly eventId: () => string = defaultEventId,
  ) {}

  acquire(scope: LeaseScope, holderId: string): Promise<AcquireResult> {
    return this.serialize(async () => {
      const state = await this.loadAndExpire(scope)
      if (state.reconciliation === 'REQUIRED') {
        return { ok: false, reason: 'RECONCILIATION_REQUIRED' }
      }
      const current = activeLease(state)
      if (current !== undefined) {
        return current.holderId === holderId
          ? { ok: true, lease: current }
          : { ok: false, reason: 'LEASE_HELD' }
      }

      const nowMs = this.clock.nowMs()
      const token = (state.lastToken + NEXT_TOKEN_INCREMENT) as FencingToken
      const nextState: LeaseState = {
        ...state,
        lastToken: token,
        holderId,
        expiresAtMs: nowMs + thresholds.LEASE.TTL_SEC * MILLISECONDS_PER_SECOND,
      }
      await this.repository.commit(nextState, this.event(nextState, 'ACQUIRE', holderId, nowMs))
      const lease = activeLease(nextState)
      if (lease === undefined) throw new Error('lease state must be active after acquisition')
      return { ok: true, lease }
    })
  }

  heartbeat(scope: LeaseScope, holderId: string, token: FencingToken): Promise<HeartbeatResult> {
    return this.serialize(async () => {
      const state = await this.loadAndExpire(scope)
      if (state.reconciliation === 'REQUIRED') return { ok: false, reason: 'LEASE_EXPIRED' }
      const current = activeLease(state)
      if (current === undefined) return { ok: false, reason: 'NO_ACTIVE_LEASE' }
      if (current.holderId !== holderId || current.token !== token) {
        return { ok: false, reason: 'STALE_WRITER' }
      }

      const nowMs = this.clock.nowMs()
      const nextState: LeaseState = {
        ...state,
        expiresAtMs: nowMs + thresholds.LEASE.TTL_SEC * MILLISECONDS_PER_SECOND,
      }
      await this.repository.commit(nextState, this.event(nextState, 'HEARTBEAT', holderId, nowMs))
      const lease = activeLease(nextState)
      if (lease === undefined) throw new Error('lease state must be active after heartbeat')
      return { ok: true, lease }
    })
  }

  release(scope: LeaseScope, holderId: string, token: FencingToken): Promise<ReleaseResult> {
    return this.serialize(async () => {
      const state = await this.loadAndExpire(scope)
      if (state.reconciliation === 'REQUIRED') return { ok: false, reason: 'LEASE_EXPIRED' }
      const current = activeLease(state)
      if (current === undefined) return { ok: false, reason: 'NO_ACTIVE_LEASE' }
      if (current.holderId !== holderId || current.token !== token) {
        return { ok: false, reason: 'STALE_WRITER' }
      }

      const nowMs = this.clock.nowMs()
      const nextState: LeaseState = { ...state, holderId: null, expiresAtMs: null }
      await this.repository.commit(nextState, this.event(nextState, 'RELEASE', holderId, nowMs))
      return { ok: true }
    })
  }

  reconcileExpired(scope: LeaseScope): Promise<ReconcileResult> {
    return this.serialize(async () => {
      const state = await this.loadAndExpire(scope)
      const expiredLease = activeLease(state)
      if (state.reconciliation !== 'REQUIRED' || expiredLease === undefined) {
        return { status: 'NOT_REQUIRED' }
      }

      const report = await this.reconciler.reconcile(scope, expiredLease)
      if (!this.isClean(report)) return { ...report, status: 'PENDING' }

      const nowMs = this.clock.nowMs()
      const nextState: LeaseState = {
        ...state,
        holderId: null,
        expiresAtMs: null,
        reconciliation: 'CLEAN',
      }
      await this.repository.commit(
        nextState,
        this.event(nextState, 'RECONCILED', expiredLease.holderId, nowMs),
      )
      return report
    })
  }

  isCurrentWriter(scope: LeaseScope, holderId: string, token: FencingToken): Promise<boolean> {
    return this.serialize(async () => {
      const state = await this.loadAndExpire(scope)
      const current = activeLease(state)
      return state.reconciliation === 'CLEAN'
        && current !== undefined
        && current.holderId === holderId
        && current.token === token
    })
  }

  private async loadAndExpire(scope: LeaseScope): Promise<LeaseState> {
    const state = (await this.repository.load(scope)) ?? emptyState(scope)
    const current = activeLease(state)
    const nowMs = this.clock.nowMs()
    if (current === undefined || state.reconciliation === 'REQUIRED' || nowMs < current.expiresAtMs) {
      return state
    }

    const expiredState: LeaseState = { ...state, reconciliation: 'REQUIRED' }
    await this.repository.commit(
      expiredState,
      this.event(expiredState, 'EXPIRE', current.holderId, nowMs),
    )
    return expiredState
  }

  private event(
    state: LeaseState,
    type: LeaseEventType,
    holderId: string | null,
    createdAtMs: number,
  ): LeaseEvent {
    return {
      id: this.eventId(),
      scope: state.scope,
      type,
      holderId,
      token: state.lastToken,
      createdAtMs,
    }
  }

  private isClean(report: ReconciliationReport): boolean {
    return report.status === 'CLEAN' && report.unresolvedIds.length === 0
  }

  private serialize<T>(operation: () => MaybePromise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}
