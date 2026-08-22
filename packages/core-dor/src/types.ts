import type {
  ArchetypeId,
  ChannelId,
  EligibilityState,
  GateState,
  GateTier,
  ImmutabilityState,
  PackageId,
  R2Key,
  StageInstanceId,
} from '@youtube-ai-factory/contracts'

export type MaybePromise<T> = T | Promise<T>

export type DoRCondition =
  | 'LEASE_VALID'
  | 'PARENTS_READY'
  | 'MANDATORY_GATES_PASS'
  | 'CAPABILITIES_QUALIFIED'
  | 'NO_ACTIVE_PROVIDER_REQUESTS'
  | 'NO_UNRECONCILED_LEASES'
  | 'BUDGET_AVAILABLE'
  | 'INPUTS_NOT_QUARANTINED'
  | 'NO_CONFLICTING_PROVIDER_REQUESTS'
  | 'CHANNEL_NOT_FROZEN'
  | 'HUMAN_DECISIONS_SUFFICIENT'

export interface CapabilityRequirement {
  capabilityCode: string
  requiredArchetypes: readonly ArchetypeId[]
  expectedSettingsHash: string
}

export interface DoRRequest {
  stageInstanceId: StageInstanceId
  packageId: PackageId
  channelId: ChannelId
  stageOrdinal: number
  requiredStandardVersion: number
  estimatedCostUsd: number
  requiredCapabilities: readonly CapabilityRequirement[]
}

export interface ParentEvidence {
  artifactId: string
  immutabilityState: ImmutabilityState
  eligibilityState: EligibilityState
  standardVersion: number
}

export interface GateEvidence {
  gateCode: string
  tier: GateTier
  state: GateState
  evidenceR2Key: R2Key | null
}

export interface CapabilityEvidence {
  capabilityCode: string
  qualified: boolean
  qualifiedArchetypes: readonly ArchetypeId[]
  settingsHash: string
}

export interface DoREvidenceSnapshot {
  leaseValid: boolean | null
  parents: ParentEvidence[]
  gates: GateEvidence[]
  capabilities: CapabilityEvidence[]
  activeProviderRequestCount: number | null
  unreconciledExpiredLeaseCount: number | null
  availableBudgetUsd: number | null
  quarantinedInputHashes: string[] | null
  conflictingProviderRequestCount: number | null
  channelFrozen: boolean | null
  humanDecisionCount: number | null
}

export interface DoREvidenceRepository {
  loadEvidence(request: DoRRequest): MaybePromise<DoREvidenceSnapshot>
}
