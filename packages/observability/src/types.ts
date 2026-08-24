import type { ErrorClass, GateState } from '@youtube-ai-factory/contracts'

export type TraceEventType =
  | 'STAGE_ATTEMPT_STARTED'
  | 'PROVIDER_REQUESTED'
  | 'PROVIDER_RESPONDED'
  | 'COST_SETTLED'
  | 'OUTPUT_SEALED'
  | 'GATE_EVALUATED'
  | 'STAGE_ATTEMPT_COMPLETED'

export interface TraceEvent {
  readonly id: string
  readonly traceId: string
  readonly sequence: number
  readonly packageId: string
  readonly stageInstanceId: string
  readonly eventType: TraceEventType
  readonly spanId?: string | undefined
  readonly reservationId?: string | undefined
  readonly requestR2Key?: string | undefined
  readonly responseR2Key?: string | undefined
  readonly latencyMs?: number | undefined
  readonly errorClass?: ErrorClass | null | undefined
  readonly costUsd?: number | undefined
  readonly outputId?: string | undefined
  readonly outputR2Key?: string | undefined
  readonly outputSha256?: string | undefined
  readonly gateCode?: string | undefined
  readonly gateState?: GateState | undefined
  readonly outcome?: 'SUCCEEDED' | 'FAILED' | undefined
  readonly occurredAt: string
  readonly evidenceR2Key: string
}

export interface ReconstructedProviderCall {
  readonly spanId: string
  readonly reservationId: string
  readonly requestR2Key: string
  readonly responseR2Key: string
  readonly latencyMs: number
  readonly errorClass: ErrorClass | null
  readonly costUsd: number
}

export interface ReconstructedOutput {
  readonly outputId: string
  readonly outputR2Key: string
  readonly outputSha256: string
}

export interface ReconstructedTrace {
  readonly traceId: string
  readonly packageId: string
  readonly stageInstanceId: string
  readonly outcome: 'SUCCEEDED' | 'FAILED'
  readonly events: readonly TraceEvent[]
  readonly providerCalls: readonly ReconstructedProviderCall[]
  readonly outputs: readonly ReconstructedOutput[]
  readonly totalCostUsd: number
  readonly canonicalHash: string
}

export interface MetricInput {
  readonly providerCalls: readonly {
    readonly capabilityId: string
    readonly stageCode: string
    readonly packageId: string
    readonly channelId: string
    readonly provider: string
    readonly latencyMs: number
    readonly errorClass: ErrorClass | null
    readonly costUsd: number
  }[]
  readonly stages: readonly { readonly stageCode: string; readonly firstPass: boolean }[]
  readonly sealedArtifactCount: number
  readonly producedArtifactCount: number
  readonly p0EscapeCount: number
  readonly criticVariances: readonly number[]
  readonly capabilityBindings: readonly { readonly state: 'QUALIFIED' | 'REGISTERED' | 'REVOKED' }[]
  readonly blockedDispatches: readonly { readonly reason: string }[]
  readonly reservations: readonly { readonly state: 'HELD' | 'SETTLED' | 'EXPIRED' | 'ORPHANED' }[]
  readonly leases: readonly { readonly expired: boolean }[]
  readonly queueDepth: number
  readonly attentionMinutesThisWeek: number
  readonly humanQueueAgesHours: readonly number[]
  readonly proposals: readonly { readonly status: string }[]
  readonly escapedDefects: readonly { readonly defectClass: string }[]
}

export interface MinimumMetrics {
  readonly latency: {
    readonly byCapability: Readonly<Record<string, Percentiles>>
    readonly byStage: Readonly<Record<string, Percentiles>>
  }
  readonly errors: {
    readonly byClass: Readonly<Record<string, number>>
    readonly byProvider: Readonly<Record<string, number>>
  }
  readonly cost: {
    readonly totalUsd: number
    readonly byStageUsd: Readonly<Record<string, number>>
    readonly byPackageUsd: Readonly<Record<string, number>>
    readonly byChannelUsd: Readonly<Record<string, number>>
    readonly costPerSealedArtifactUsd: number | null
  }
  readonly quality: {
    readonly firstPassYieldByStage: Readonly<Record<string, number>>
    readonly p0EscapeCount: number
    readonly criticVarianceMax: number | null
  }
  readonly capability: {
    readonly qualified: number
    readonly total: number
    readonly blockedDispatchesByReason: Readonly<Record<string, number>>
  }
  readonly operations: {
    readonly orphanReservationRate: number | null
    readonly leaseExpiryRate: number | null
    readonly queueDepth: number
  }
  readonly attention: {
    readonly weeklyMinutes: number
    readonly oldestHumanQueueAgeHours: number | null
  }
  readonly evolution: {
    readonly proposalsByStatus: Readonly<Record<string, number>>
    readonly escapedFailureDensityByDefectClass: Readonly<Record<string, number | null>>
  }
}

export interface Percentiles {
  readonly p50: number
  readonly p95: number
  readonly p99: number
}

export type MandatoryAlertCode =
  | 'SPEND_CEILING_80_PERCENT'
  | 'SCHEMA_VIOLATION_RATE_EXCEEDED'
  | 'CRITIC_VARIANCE_EXCEEDED'
  | 'CAPABILITY_REVOKED'
  | 'ORPHAN_RESERVATION_OVER_24H'
  | 'HUMAN_QUEUE_OVER_48H'

export interface MandatoryAlert {
  readonly code: MandatoryAlertCode
  readonly severity: 'WARNING' | 'CRITICAL'
  readonly subjects: readonly string[]
  readonly observed: number
  readonly threshold: number
  readonly thresholdSource: string
}

export interface OperatorWorkspaceInput {
  readonly effectiveState: 'READY' | 'BLOCKED' | 'AWAITING_HUMAN' | 'FROZEN'
  readonly nextValidActions: readonly { readonly id: string; readonly label: string }[]
  readonly gates: readonly { readonly code: string; readonly state: GateState }[]
  readonly candidateKind: 'QUALIFICATION_FIXTURE' | 'RELEASE_CANDIDATE'
  readonly standardVersion: string
  readonly spentUsd: number
  readonly ceilingUsd: number
  readonly priorWork: readonly { readonly id: string; readonly label: string }[]
  readonly humanQueue: readonly {
    readonly id: string
    readonly touchpoint: string
    readonly packageId: string | null
    readonly enqueuedAt: string
  }[]
  readonly decisions: readonly {
    readonly id: string
    readonly decisionType: 'D1' | 'D2' | 'D3' | 'D4' | 'D5'
    readonly diffR2Key: string
    readonly rationaleText: string
    readonly createdAt: string
  }[]
  readonly attention: { readonly usedMinutes: number; readonly ceilingMinutes: number }
  readonly incident: { readonly level: 'I0' | 'I1' | 'I2' | 'I3'; readonly channelFrozen: boolean } | null
}
