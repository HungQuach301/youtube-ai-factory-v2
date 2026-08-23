import type {
  CapabilityId,
  ErrorClass,
  PackageId,
  ReservationId,
  StageInstanceId,
} from '@youtube-ai-factory/contracts'

export type CostNamespace = 'production' | 'qualification' | 'staging'
export type CostScope = 'PORTFOLIO' | 'CHANNEL' | 'PACKAGE' | 'STAGE'
export type ReservationState = 'HELD' | 'SETTLED' | 'EXPIRED' | 'ORPHANED'
export type ProviderRequestState = 'OPEN' | 'COMPLETED' | 'FAILED' | 'ORPHANED'
export type CostKind = 'PRODUCTION' | 'QUALIFICATION' | 'REJECTED_CANDIDATE'

export interface SpendCeiling {
  readonly namespace: CostNamespace
  readonly scope: CostScope
  readonly scopeRef: string
  readonly ceilingUsd: number
  readonly windowStart?: string
  readonly windowEnd?: string
}

export interface ReservationScopes {
  readonly portfolio: string
  readonly channel?: string
  readonly package?: PackageId
  readonly stage?: StageInstanceId
}

export interface ReservationRequest {
  readonly id: ReservationId
  readonly packageId: PackageId
  readonly stageInstanceId?: StageInstanceId
  readonly capabilityId: CapabilityId
  readonly namespace: CostNamespace
  readonly estimatedCostUsd: number
  readonly scopes: ReservationScopes
  readonly expiresAt: string
  readonly createdAt: string
}

export interface Reservation {
  readonly id: ReservationId
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId | null
  readonly capabilityId: CapabilityId
  readonly namespace: CostNamespace
  readonly estimatedCostUsd: number
  readonly actualCostUsd: number | null
  readonly state: ReservationState
  readonly expiresAt: string
  readonly createdAt: string
}

export type ReservationDecision =
  | { readonly ok: true, readonly reservation: Reservation }
  | {
    readonly ok: false
    readonly errorClass: Extract<ErrorClass, 'BUDGET_DENIED'>
    readonly deniedScopes: readonly string[]
  }

export interface ProviderRequestRecord {
  readonly id: string
  readonly reservationId: ReservationId
  readonly idempotencyKey: string
  readonly requestR2Key: string
  readonly responseR2Key?: string
  readonly actualCostUsd?: number
  readonly latencyMs?: number
  readonly errorClass?: ErrorClass
  readonly attemptOrdinal: number
  readonly createdAt: string
}

export interface CostLedgerEntry {
  readonly id: string
  readonly reservationId: ReservationId
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId | null
  readonly capabilityId: CapabilityId
  readonly namespace: CostNamespace
  readonly amountUsd: number
  readonly kind: CostKind
  readonly createdAt: string
}

export interface OrphanReport {
  readonly packageId: PackageId
  readonly reservationIds: readonly ReservationId[]
  readonly providerRequestIds: readonly string[]
  readonly estimatedCostUsd: number
  readonly blocksPackage: boolean
}

export interface UnitEconomicsDenominators {
  readonly sealedArtifactCount: number
  readonly publishedVideoCount: number
}

export interface UnitEconomics {
  readonly totalCostUsd: number
  readonly productionCostUsd: number
  readonly qualificationCostUsd: number
  readonly rejectedCandidateCostUsd: number
  readonly costPerSealedArtifactUsd: number | null
  readonly costPerPublishedVideoUsd: number | null
  readonly tournamentShare: number | null
  readonly orphanRate: number
}

export type CostControlErrorCode =
  | 'INVALID_INPUT'
  | 'DUPLICATE_RESERVATION'
  | 'RESERVATION_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'ACTUAL_EXCEEDS_RESERVATION'
  | 'RECONCILIATION_REQUIRED'
