import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import type {
  CommandLogRecord,
  DailyScanInput,
  DailyScanReport,
  OperateAction,
  OperateGuardrail,
  OperateSessionStart,
  OperateSessionStartInput,
  OperationalIssue,
  OpsLogAudit,
  OpsLogEntry,
  WeeklyOwnerReport,
  WeeklyReportInput,
} from './types.js'

export * from './types.js'

export type OperateHarnessErrorCode =
  | 'SESSION_START_INVALID'
  | 'OPERATE_INCIDENT_PRIORITY_VIOLATION'
  | 'DAILY_SCAN_INPUT_INVALID'
  | 'OPS_LOG_ENTRY_INVALID'
  | 'OPS_LOG_NOT_APPEND_ONLY'
  | 'WEEKLY_REPORT_INPUT_INVALID'

export class OperateHarnessError extends Error {
  override readonly name = 'OperateHarnessError'

  constructor(readonly code: OperateHarnessErrorCode, readonly failures: readonly string[] = []) {
    super(`${code}${failures.length === 0 ? '' : `: ${failures.join('; ')}`}`)
  }
}

export const REQUIRED_OPERATE_GUARDRAILS = [
  'NO_SEALED_BOUNDARY_EDITS',
  'NO_OWNER_COMMANDS',
  'NO_SELF_RELAX',
  'GUARDED_DISPATCH_ONLY',
  'SINGLE_TASK',
] as const satisfies readonly OperateGuardrail[]

function nonEmpty(value: string): boolean {
  return value.trim().length > 0
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every(nonEmpty) && new Set(values).size === values.length
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function stableId(prefix: string, payload: unknown): string {
  return `${prefix}-${canonicalHash(payload).slice(0, 24)}`
}

export function openOperateSession(input: OperateSessionStartInput): OperateSessionStart {
  const expectedEntries = input.recentEntryIdsNewestFirst.slice(0, 3)
  const recited = [...new Set(input.recitedGuardrails)].sort()
  const required = [...REQUIRED_OPERATE_GUARDRAILS].sort()
  if (!nonEmpty(input.task.description) || !input.blockedLogRead || !input.incidentRegisterRead
    || !sameOrdered(input.loadedEntryIds, expectedEntries)
    || !sameOrdered(recited, required)) {
    throw new OperateHarnessError('SESSION_START_INVALID')
  }
  if (input.activePolicyIncident && input.task.kind !== 'POLICY_INCIDENT_RESPONSE') {
    throw new OperateHarnessError('OPERATE_INCIDENT_PRIORITY_VIOLATION')
  }
  return {
    mode: 'OPERATE',
    task: { ...input.task },
    loadedEntryIds: [...input.loadedEntryIds],
    guardrails: [...REQUIRED_OPERATE_GUARDRAILS],
    awaitingOperatorConfirmation: true,
    providerCostUsd: 0,
    stateWrites: [],
  }
}

function validateDailyInput(input: DailyScanInput): void {
  if (!validDate(input.windowStart) || !validDate(input.asOf)
    || Date.parse(input.windowStart) > Date.parse(input.asOf)
    || input.orphanReservations.some((item) => !nonEmpty(item.reservationId)
      || !nonEmpty(item.packageId) || !nonEmpty(item.leaseId) || !validDate(item.leaseExpiredAt)
      || !uniqueNonEmpty(item.providerRequestIds) || (item.reconciledAt !== null && !validDate(item.reconciledAt)))
    || input.gateFailures.some((item) => !nonEmpty(item.evaluationId) || !nonEmpty(item.packageId)
      || !nonEmpty(item.reason) || !nonEmpty(item.sourceStageCode) || !nonEmpty(item.rootStageCode)
      || !validDate(item.evaluatedAt) || !nonEmpty(item.evidenceR2Key)
      || (item.variance !== null && (!Number.isFinite(item.variance) || item.variance < 0)))
    || input.packages.some((item) => !nonEmpty(item.packageId) || !Number.isFinite(item.actualSpendUsd)
      || item.actualSpendUsd < 0 || !Number.isFinite(item.spendCeilingUsd) || item.spendCeilingUsd <= 0)
    || input.incidents.some((item) => !nonEmpty(item.incidentId) || !nonEmpty(item.channelId)
      || !validDate(item.detectedAt) || !nonEmpty(item.evidenceR2Key))) {
    throw new OperateHarnessError('DAILY_SCAN_INPUT_INVALID')
  }
}

function issue(input: Omit<OperationalIssue, 'id'>): OperationalIssue {
  return { id: stableId('ops-issue', input), ...input }
}

export function runDailyOperationalScan(input: DailyScanInput): DailyScanReport {
  validateDailyInput(input)
  const windowStart = Date.parse(input.windowStart)
  const asOf = Date.parse(input.asOf)
  const incidents = input.incidents
    .filter((item) => item.status === 'OPEN' && Date.parse(item.detectedAt) >= windowStart && Date.parse(item.detectedAt) <= asOf)
    .sort((left, right) => left.incidentId.localeCompare(right.incidentId))

  if (incidents.length > 0) {
    const issues = incidents.map((item) => issue({
      kind: 'POLICY_INCIDENT',
      sourceId: item.incidentId,
      packageId: null,
      evidenceRefs: [item.evidenceR2Key],
      priority: 1,
    }))
    const actions: OperateAction[] = issues.map((current, index) => ({
      kind: 'HALT_FOR_POLICY_INCIDENT',
      issueId: current.id,
      incidentId: incidents[index]?.incidentId ?? current.sourceId,
      channelId: incidents[index]?.channelId ?? '',
      requiresHumanDirection: true,
    }))
    const payload = { window_start: input.windowStart, as_of: input.asOf, halted: true, issues, actions }
    return {
      id: stableId('ops-daily', payload),
      windowStart: input.windowStart,
      asOf: input.asOf,
      haltedByPolicyIncident: true,
      issues,
      actions,
      providerCostUsd: 0,
      autoCommands: [],
      stateWrites: [],
    }
  }

  const issues: OperationalIssue[] = []
  const actions: OperateAction[] = []

  for (const orphan of input.orphanReservations
    .filter((item) => item.reconciledAt === null && Date.parse(item.leaseExpiredAt) <= asOf)
    .sort((left, right) => left.reservationId.localeCompare(right.reservationId))) {
    const current = issue({
      kind: 'ORPHAN_RESERVATION',
      sourceId: orphan.reservationId,
      packageId: orphan.packageId,
      evidenceRefs: orphan.providerRequestIds,
      priority: 2,
    })
    issues.push(current)
    actions.push({
      kind: 'RECONCILE_ORPHAN',
      issueId: current.id,
      reservationId: orphan.reservationId,
      providerRequestIds: [...orphan.providerRequestIds].sort(),
      blockNewLeaseUntilClean: true,
    })
  }

  for (const failure of input.gateFailures
    .filter((item) => Date.parse(item.evaluatedAt) >= windowStart && Date.parse(item.evaluatedAt) <= asOf)
    .sort((left, right) => left.evaluationId.localeCompare(right.evaluationId))) {
    const current = issue({
      kind: 'GATE_FAIL',
      sourceId: failure.evaluationId,
      packageId: failure.packageId,
      evidenceRefs: [failure.evidenceR2Key],
      priority: 3,
    })
    issues.push(current)
    if (failure.tier === 'M2' && failure.borderline) {
      actions.push({
        kind: 'RERUN_BORDERLINE_M2',
        issueId: current.id,
        evaluationId: failure.evaluationId,
        sampleCount: thresholds.ASSURANCE.RERUN_N,
        aggregate: 'MEDIAN',
        waiveAllowed: false,
      })
      if (failure.variance !== null && failure.variance > thresholds.ASSURANCE.MAX_VARIANCE
        && failure.criticCapabilityId !== null && nonEmpty(failure.criticCapabilityId)) {
        actions.push({
          kind: 'FLAG_CRITIC_REQUALIFICATION',
          issueId: current.id,
          capabilityId: failure.criticCapabilityId,
          excludeVerdict: true,
        })
      }
    } else {
      actions.push({
        kind: 'PROPOSE_REOPEN_ROOT_STAGE',
        issueId: current.id,
        packageId: failure.packageId,
        rootStageCode: failure.rootStageCode,
        waiveAllowed: false,
        requiresOperatorConfirmation: true,
      })
    }
  }

  for (const item of [...input.packages].sort((left, right) => left.packageId.localeCompare(right.packageId))) {
    const spendRatio = item.actualSpendUsd / item.spendCeilingUsd
    if (spendRatio < thresholds.OPS.SPEND_ALERT_PCT) continue
    const current = issue({
      kind: 'SPEND_ALERT',
      sourceId: item.packageId,
      packageId: item.packageId,
      evidenceRefs: [],
      priority: 4,
    })
    issues.push(current)
    actions.push({
      kind: 'SPEND_ALERT',
      issueId: current.id,
      packageId: item.packageId,
      spendRatio,
      ceilingChangeAllowed: false,
      requiresOwnerDecision: true,
    })
  }

  const payload = { window_start: input.windowStart, as_of: input.asOf, halted: false, issues, actions }
  return {
    id: stableId('ops-daily', payload),
    windowStart: input.windowStart,
    asOf: input.asOf,
    haltedByPolicyIncident: false,
    issues,
    actions,
    providerCostUsd: 0,
    autoCommands: [],
    stateWrites: [],
  }
}

function validOpsLogEntry(entry: OpsLogEntry): boolean {
  const guardrails = [...new Set(entry.guardrails)].sort()
  const required = [...REQUIRED_OPERATE_GUARDRAILS].sort()
  return nonEmpty(entry.sessionId) && nonEmpty(entry.task)
    && validDate(entry.openedAt) && validDate(entry.closedAt)
    && Date.parse(entry.closedAt) >= Date.parse(entry.openedAt)
    && sameOrdered(guardrails, required)
    && uniqueNonEmpty(entry.traceIds)
}

export function auditOpsLog(entries: readonly OpsLogEntry[], commands: readonly CommandLogRecord[]): OpsLogAudit {
  const invalidSessionIds = entries.filter((entry) => !validOpsLogEntry(entry)).map((entry) => entry.sessionId).sort()
  const traceCounts = new Map<string, number>()
  for (const entry of entries) {
    for (const traceId of entry.traceIds) traceCounts.set(traceId, (traceCounts.get(traceId) ?? 0) + 1)
  }
  const commandTraceIds = new Set(commands.map((command) => command.traceId))
  const loggedTraceIds = new Set(traceCounts.keys())
  const unloggedCommandIds = commands
    .filter((command) => !nonEmpty(command.id) || !nonEmpty(command.traceId) || !nonEmpty(command.commandType)
      || !validDate(command.createdAt) || !loggedTraceIds.has(command.traceId))
    .map((command) => command.id)
    .sort()
  const unknownTraceIds = [...loggedTraceIds].filter((traceId) => !commandTraceIds.has(traceId)).sort()
  const duplicateLoggedTraceIds = [...traceCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([traceId]) => traceId)
    .sort()
  return {
    clean: invalidSessionIds.length === 0 && unloggedCommandIds.length === 0
      && unknownTraceIds.length === 0 && duplicateLoggedTraceIds.length === 0,
    unloggedCommandIds,
    unknownTraceIds,
    duplicateLoggedTraceIds,
    invalidSessionIds,
  }
}

export function formatOpsLogEntry(entry: OpsLogEntry): string {
  if (!validOpsLogEntry(entry)) throw new OperateHarnessError('OPS_LOG_ENTRY_INVALID')
  const list = (values: readonly string[]): string => values.length === 0
    ? '- none'
    : values.map((value) => `- ${value}`).join('\n')
  return [
    `## OPS-SESSION ${entry.sessionId}`,
    '',
    `- Mode: ${entry.mode}`,
    `- Task: ${entry.task}`,
    `- Opened: ${entry.openedAt}`,
    `- Closed: ${entry.closedAt}`,
    '',
    '### Guardrails recited',
    list(entry.guardrails),
    '',
    '### Command trace IDs',
    list(entry.traceIds),
    '',
    '### Exceptions',
    list(entry.exceptions),
    '',
    '### Pending human decisions',
    list(entry.pendingHumanDecisions),
    '',
  ].join('\n')
}

export function appendOpsLog(previous: string, entry: OpsLogEntry): string {
  const separator = previous.endsWith('\n') ? '\n' : '\n\n'
  const next = `${previous}${separator}${formatOpsLogEntry(entry)}`
  assertOpsLogAppend(previous, next)
  return next
}

export function assertOpsLogAppend(previous: string, next: string): void {
  const suffix = next.startsWith(previous) ? next.slice(previous.length) : ''
  const entryCount = (suffix.match(/\n## OPS-SESSION /gu) ?? []).length
  if (!next.startsWith(previous) || entryCount !== 1) {
    throw new OperateHarnessError('OPS_LOG_NOT_APPEND_ONLY')
  }
}

export function buildWeeklyOwnerReport(input: WeeklyReportInput): WeeklyOwnerReport {
  if (!validDate(input.windowStart) || !validDate(input.windowEnd)
    || Date.parse(input.windowStart) > Date.parse(input.windowEnd)
    || !nonEmpty(input.policyWatchSummary)
    || input.firstPassYieldByStage.some((item) => !nonEmpty(item.stageCode)
      || !Number.isFinite(item.yield) || item.yield < 0 || item.yield > 1)
    || input.costPerVideo.some((item) => !nonEmpty(item.packageId)
      || !Number.isFinite(item.actualUsd) || item.actualUsd < 0
      || !Number.isFinite(item.ceilingUsd) || item.ceilingUsd <= 0)
    || input.humanQueue.some((item) => !nonEmpty(item.touchpoint) || !nonEmpty(item.itemId)
      || !Number.isFinite(item.ageHours) || item.ageHours < 0)) {
    throw new OperateHarnessError('WEEKLY_REPORT_INPUT_INVALID')
  }
  const payload = {
    window_start: input.windowStart,
    window_end: input.windowEnd,
    first_pass_yield_by_stage: input.firstPassYieldByStage,
    cost_per_video: input.costPerVideo,
    human_queue: input.humanQueue,
    learning_status_counts: input.learningStatusCounts,
    policy_watch_summary: input.policyWatchSummary,
    ops_log_audit: input.opsLogAudit,
  }
  return {
    id: stableId('ops-weekly', payload),
    ...input,
    readOnly: true,
    providerCostUsd: 0,
    stateWrites: [],
  }
}
