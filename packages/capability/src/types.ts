import type {
  ArchetypeId,
  CapabilityId,
  CapabilityState,
  DispatchExecutionContext,
  ErrorClass,
  Hex64,
  ReservationId,
  R2Key,
} from '@youtube-ai-factory/contracts'

export type CapabilityStatus = 'ACTIVE' | 'SUPERSEDED' | 'REVOKED'
export type CapabilityKind = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'CONTROL'
export type ArchetypeDomain = 'VISUAL' | 'AUDIO' | 'TEXT' | 'CONTROL'

export interface CapabilitySettings {
  readonly modelSnapshot: string
  readonly temperature: number
  readonly topP: number
  readonly seed: number
  readonly systemPrompt: string
  readonly responseFormat: unknown
}

export interface CapabilityRecord {
  readonly id: CapabilityId
  readonly code: string
  readonly kind: CapabilityKind
  readonly version: string
  readonly provider: string
  readonly modelSnapshot: string
  readonly settingsHash: Hex64
  readonly status: CapabilityStatus
  readonly createdAt: string
}

export interface ArchetypeRecord {
  readonly id: ArchetypeId
  readonly code: string
  readonly domain: ArchetypeDomain
  readonly criticality: 'CRITICAL' | 'HIGH' | 'NORMAL'
  readonly minFirstPassYield: number
}

export interface CapabilityBinding {
  readonly capabilityId: CapabilityId
  readonly archetypeId: ArchetypeId
  readonly qualificationState: CapabilityState
  readonly qualifiedAt: string | null
  readonly qualificationRunId: string | null
}

export interface RegistrySnapshot {
  readonly capabilities?: readonly CapabilityRecord[]
  readonly archetypes?: readonly ArchetypeRecord[]
  readonly bindings?: readonly CapabilityBinding[]
}

export type DispatchAuthorization =
  | { readonly ok: true, readonly capability: CapabilityRecord, readonly binding: CapabilityBinding }
  | { readonly ok: false, readonly reason: 'CAPABILITY_NOT_ACTIVE' | 'BINDING_NOT_QUALIFIED' }

export type DispatchBlockReason =
  | 'CAPABILITY_NOT_ACTIVE'
  | 'BINDING_NOT_QUALIFIED'
  | 'SETTINGS_HASH_MISMATCH'
  | 'STALE_FENCING_TOKEN'
  | 'BUDGET_DENIED'

export interface DispatchBlockRecord {
  readonly id: string
  readonly traceId: string
  readonly packageId: string
  readonly stageInstanceId: string
  readonly capabilityId: string
  readonly archetypeId: string
  readonly step: 1 | 2 | 3 | 4
  readonly reason: DispatchBlockReason
  readonly requestSettingsHash: Hex64
  readonly registrySettingsHash: Hex64 | null
  readonly zeroSpend: true
  readonly createdAt: string
}

export interface DispatchBlockLog {
  append(record: DispatchBlockRecord): Promise<void>
}

export interface DispatchLeasePort {
  isCurrent(context: DispatchExecutionContext): Promise<boolean>
}

export interface CostReservationInput {
  readonly reservationId: ReservationId
  readonly capabilityId: CapabilityId
  readonly archetypeId: ArchetypeId
  readonly estimatedCostUsd: number
  readonly context: DispatchExecutionContext
}

export type CostReservationResult =
  | { readonly ok: true, readonly reservationId: ReservationId }
  | { readonly ok: false, readonly errorClass: Extract<ErrorClass, 'BUDGET_DENIED'> }

export interface ProviderRequestRegistration {
  readonly reservationId: ReservationId
  readonly idempotencyKey: Hex64
  readonly requestR2Key: R2Key | string
  readonly createdAt: string
}

export interface CostSettlementInput {
  readonly reservationId: ReservationId
  readonly namespace: DispatchExecutionContext['namespace']
  readonly actualCostUsd: number
  readonly createdAt: string
}

export interface DispatchCostPort {
  reserve(input: CostReservationInput): Promise<CostReservationResult>
  registerProviderRequest(input: ProviderRequestRegistration): Promise<void>
  settle(input: CostSettlementInput): Promise<void>
}

export interface DispatchEvidenceReference { readonly r2Key: R2Key | string }

export interface DispatchEvidencePort {
  snapshotRequest(input: {
    readonly request: unknown
    readonly idempotencyKey: Hex64
    readonly context: DispatchExecutionContext
  }): Promise<DispatchEvidenceReference>
  snapshotResponse(input: {
    readonly response: unknown
    readonly idempotencyKey: Hex64
    readonly context: DispatchExecutionContext
  }): Promise<DispatchEvidenceReference>
}
