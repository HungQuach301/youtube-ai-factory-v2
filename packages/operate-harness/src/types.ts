export type OperateGuardrail =
  | 'NO_SEALED_BOUNDARY_EDITS'
  | 'NO_OWNER_COMMANDS'
  | 'NO_SELF_RELAX'
  | 'GUARDED_DISPATCH_ONLY'
  | 'SINGLE_TASK'

export interface OperateSessionStartInput {
  readonly mode: 'OPERATE'
  readonly task: {
    readonly kind: 'DAILY_SCAN' | 'WEEKLY_REPORT' | 'ORPHAN_RECONCILIATION' | 'GATE_FAIL_TRIAGE' | 'POLICY_INCIDENT_RESPONSE'
    readonly description: string
  }
  readonly recentEntryIdsNewestFirst: readonly string[]
  readonly loadedEntryIds: readonly string[]
  readonly blockedLogRead: boolean
  readonly incidentRegisterRead: boolean
  readonly activePolicyIncident: boolean
  readonly recitedGuardrails: readonly OperateGuardrail[]
}

export interface OperateSessionStart {
  readonly mode: 'OPERATE'
  readonly task: OperateSessionStartInput['task']
  readonly loadedEntryIds: readonly string[]
  readonly guardrails: readonly OperateGuardrail[]
  readonly awaitingOperatorConfirmation: true
  readonly providerCostUsd: 0
  readonly stateWrites: readonly []
}

export interface OrphanReservation {
  readonly reservationId: string
  readonly packageId: string
  readonly leaseId: string
  readonly leaseExpiredAt: string
  readonly providerRequestIds: readonly string[]
  readonly reconciledAt: string | null
}

export interface GateFailure {
  readonly evaluationId: string
  readonly packageId: string
  readonly tier: 'M1' | 'M2'
  readonly reason: string
  readonly sourceStageCode: string
  readonly rootStageCode: string
  readonly evaluatedAt: string
  readonly evidenceR2Key: string
  readonly borderline: boolean
  readonly variance: number | null
  readonly criticCapabilityId: string | null
}

export interface OpenPackageSpend {
  readonly packageId: string
  readonly status: 'OPEN' | 'RUNNING' | 'HELD'
  readonly actualSpendUsd: number
  readonly spendCeilingUsd: number
}

export interface PolicyIncidentForScan {
  readonly incidentId: string
  readonly channelId: string
  readonly level: 'I1' | 'I2' | 'I3' | 'I4'
  readonly status: 'OPEN' | 'RESOLVED'
  readonly detectedAt: string
  readonly evidenceR2Key: string
  readonly channelFrozen: boolean
}

export interface DailyScanInput {
  readonly windowStart: string
  readonly asOf: string
  readonly orphanReservations: readonly OrphanReservation[]
  readonly gateFailures: readonly GateFailure[]
  readonly packages: readonly OpenPackageSpend[]
  readonly incidents: readonly PolicyIncidentForScan[]
}

export interface OperationalIssue {
  readonly id: string
  readonly kind: 'POLICY_INCIDENT' | 'ORPHAN_RESERVATION' | 'GATE_FAIL' | 'SPEND_ALERT'
  readonly sourceId: string
  readonly packageId: string | null
  readonly evidenceRefs: readonly string[]
  readonly priority: 1 | 2 | 3 | 4
}

export type OperateAction =
  | {
      readonly kind: 'HALT_FOR_POLICY_INCIDENT'
      readonly issueId: string
      readonly incidentId: string
      readonly channelId: string
      readonly requiresHumanDirection: true
    }
  | {
      readonly kind: 'RECONCILE_ORPHAN'
      readonly issueId: string
      readonly reservationId: string
      readonly providerRequestIds: readonly string[]
      readonly blockNewLeaseUntilClean: true
    }
  | {
      readonly kind: 'PROPOSE_REOPEN_ROOT_STAGE'
      readonly issueId: string
      readonly packageId: string
      readonly rootStageCode: string
      readonly waiveAllowed: false
      readonly requiresOperatorConfirmation: true
    }
  | {
      readonly kind: 'RERUN_BORDERLINE_M2'
      readonly issueId: string
      readonly evaluationId: string
      readonly sampleCount: number
      readonly aggregate: 'MEDIAN'
      readonly waiveAllowed: false
    }
  | {
      readonly kind: 'FLAG_CRITIC_REQUALIFICATION'
      readonly issueId: string
      readonly capabilityId: string
      readonly excludeVerdict: true
    }
  | {
      readonly kind: 'SPEND_ALERT'
      readonly issueId: string
      readonly packageId: string
      readonly spendRatio: number
      readonly ceilingChangeAllowed: false
      readonly requiresOwnerDecision: true
    }

export interface DailyScanReport {
  readonly id: string
  readonly windowStart: string
  readonly asOf: string
  readonly haltedByPolicyIncident: boolean
  readonly issues: readonly OperationalIssue[]
  readonly actions: readonly OperateAction[]
  readonly providerCostUsd: 0
  readonly autoCommands: readonly []
  readonly stateWrites: readonly []
}

export interface OpsLogEntry {
  readonly sessionId: string
  readonly mode: 'OPERATE'
  readonly task: string
  readonly openedAt: string
  readonly closedAt: string
  readonly guardrails: readonly OperateGuardrail[]
  readonly traceIds: readonly string[]
  readonly exceptions: readonly string[]
  readonly pendingHumanDecisions: readonly string[]
}

export interface CommandLogRecord {
  readonly id: string
  readonly traceId: string
  readonly commandType: string
  readonly createdAt: string
}

export interface OpsLogAudit {
  readonly clean: boolean
  readonly unloggedCommandIds: readonly string[]
  readonly unknownTraceIds: readonly string[]
  readonly duplicateLoggedTraceIds: readonly string[]
  readonly invalidSessionIds: readonly string[]
}

export interface WeeklyReportInput {
  readonly windowStart: string
  readonly windowEnd: string
  readonly firstPassYieldByStage: readonly { readonly stageCode: string, readonly yield: number }[]
  readonly costPerVideo: readonly { readonly packageId: string, readonly actualUsd: number, readonly ceilingUsd: number }[]
  readonly humanQueue: readonly { readonly touchpoint: string, readonly itemId: string, readonly ageHours: number }[]
  readonly learningStatusCounts: Readonly<Record<string, number>>
  readonly policyWatchSummary: string
  readonly opsLogAudit: OpsLogAudit
}

export interface WeeklyOwnerReport extends WeeklyReportInput {
  readonly id: string
  readonly readOnly: true
  readonly providerCostUsd: 0
  readonly stateWrites: readonly []
}
