import type { GateState, GateTier, StrictnessDirection } from '@youtube-ai-factory/contracts'

export type StandardScope = 'PORTFOLIO' | 'CHANNEL' | 'PILLAR' | 'EPISODE'

export type StandardRule =
  | { readonly kind: 'MINIMUM', readonly value: number }
  | { readonly kind: 'MAXIMUM', readonly value: number }
  | { readonly kind: 'REQUIRED', readonly value: boolean }
  | { readonly kind: 'ALLOWLIST', readonly values: readonly string[] }

export interface StandardLayer {
  readonly scope: StandardScope
  readonly scopeRef: string | null
  readonly version: number
  readonly rules: Readonly<Record<string, StandardRule>>
}

export interface ResolvedStandard {
  readonly rules: Readonly<Record<string, StandardRule>>
  readonly lineage: readonly StandardLayer[]
}

export interface EvolutionAuthorization {
  readonly status: 'PROMOTED'
  readonly ownerIdentity: string
  readonly evidenceR2Key: string
}

export interface RegistryChange {
  readonly direction: StrictnessDirection
  readonly rule: StandardRule | undefined
}

export interface GateEvaluationInput {
  readonly tier: GateTier
  readonly state: GateState
  readonly waiverOwner?: string
  readonly ownerActive?: boolean
  readonly waiverExpiresAt?: string
  readonly evaluatedAt?: string
  readonly prerequisiteStates?: readonly GateState[]
}

export interface StandardDrift {
  readonly code: 'STANDARD_DRIFT'
  readonly minVersion: number | null
  readonly maxVersion: number | null
  readonly spread: number | null
  readonly threshold: number | 'UNDECIDED'
  readonly blocksFreeze: true
}

export type StandardPolicyErrorCode =
  | 'CHILD_STANDARD_RELAXATION'
  | 'INVALID_SCOPE_ORDER'
  | 'INVALID_STANDARD_VERSION'
  | 'RELAX_REQUIRES_PROMOTION'
  | 'M0_WAIVER_FORBIDDEN'
  | 'WAIVER_AUTHORIZATION_REQUIRED'
  | 'M2_PREREQUISITES_NOT_CLEAN'
  | 'INVALID_DRIFT_THRESHOLD'
