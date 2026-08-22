import type {
  ChannelId,
  FencingToken,
  PackageId,
} from '@youtube-ai-factory/contracts'

export type MaybePromise<T> = T | Promise<T>

export interface LeaseScope {
  readonly channelId: ChannelId
  readonly packageId: PackageId
}

export interface ActiveLease {
  readonly scope: LeaseScope
  readonly holderId: string
  readonly token: FencingToken
  readonly expiresAtMs: number
}

export type ReconciliationState = 'CLEAN' | 'REQUIRED'

export interface LeaseState {
  readonly scope: LeaseScope
  readonly lastToken: FencingToken
  readonly holderId: string | null
  readonly expiresAtMs: number | null
  readonly reconciliation: ReconciliationState
}

export type LeaseEventType = 'ACQUIRE' | 'HEARTBEAT' | 'RELEASE' | 'EXPIRE' | 'RECONCILED'

export interface LeaseEvent {
  readonly id: string
  readonly scope: LeaseScope
  readonly type: LeaseEventType
  readonly holderId: string | null
  readonly token: FencingToken
  readonly createdAtMs: number
}

export interface LeaseRepository {
  load(scope: LeaseScope): MaybePromise<LeaseState | undefined>
  commit(state: LeaseState, event: LeaseEvent): MaybePromise<void>
}

export interface Clock {
  nowMs(): number
}

export interface ReconciliationReport {
  readonly status: 'CLEAN' | 'PENDING'
  readonly orphanedProviderRequestIds: readonly string[]
  readonly expiredReservationIds: readonly string[]
  readonly unresolvedIds: readonly string[]
}

export interface LeaseReconciler {
  reconcile(scope: LeaseScope, expiredLease: ActiveLease): MaybePromise<ReconciliationReport>
}

export type AcquireResult =
  | { readonly ok: true; readonly lease: ActiveLease }
  | { readonly ok: false; readonly reason: 'LEASE_HELD' | 'RECONCILIATION_REQUIRED' }

export type HeartbeatResult =
  | { readonly ok: true; readonly lease: ActiveLease }
  | { readonly ok: false; readonly reason: 'NO_ACTIVE_LEASE' | 'LEASE_EXPIRED' | 'STALE_WRITER' }

export type ReleaseResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'NO_ACTIVE_LEASE' | 'LEASE_EXPIRED' | 'STALE_WRITER' }

export type ReconcileResult = ReconciliationReport | { readonly status: 'NOT_REQUIRED' }
