import { describe, expect, it } from 'vitest'

import {
  OperateHarnessError,
  REQUIRED_OPERATE_GUARDRAILS,
  appendOpsLog,
  assertOpsLogAppend,
  auditOpsLog,
  buildWeeklyOwnerReport,
  openOperateSession,
  runDailyOperationalScan,
  type DailyScanInput,
  type OpsLogEntry,
} from '../src/index.js'

const windowStart = '2026-08-24T10:00:00.000Z'
const asOf = '2026-08-25T10:00:00.000Z'

describe('WP-31 §0-OPS session start', () => {
  it('requires the exact five guardrails, latest three entries, and one task', () => {
    const opened = openOperateSession({
      mode: 'OPERATE',
      task: { kind: 'DAILY_SCAN', description: 'Run the daily operations scan.' },
      recentEntryIdsNewestFirst: ['ops-3', 'ops-2', 'ops-1', 'ops-0'],
      loadedEntryIds: ['ops-3', 'ops-2', 'ops-1'],
      blockedLogRead: true,
      incidentRegisterRead: true,
      activePolicyIncident: false,
      recitedGuardrails: REQUIRED_OPERATE_GUARDRAILS,
    })
    expect(opened).toMatchObject({ mode: 'OPERATE', awaitingOperatorConfirmation: true, providerCostUsd: 0 })
    expect(opened.stateWrites).toEqual([])
    expect(() => openOperateSession({
      mode: 'OPERATE',
      task: { kind: 'DAILY_SCAN', description: 'Run the daily operations scan.' },
      recentEntryIdsNewestFirst: ['ops-3', 'ops-2', 'ops-1'],
      loadedEntryIds: ['ops-3'],
      blockedLogRead: true,
      incidentRegisterRead: true,
      activePolicyIncident: false,
      recitedGuardrails: REQUIRED_OPERATE_GUARDRAILS,
    })).toThrow(OperateHarnessError)
  })

  it('allows only incident response when an incident is open', () => {
    expect(() => openOperateSession({
      mode: 'OPERATE',
      task: { kind: 'DAILY_SCAN', description: 'Run daily scan.' },
      recentEntryIdsNewestFirst: [],
      loadedEntryIds: [],
      blockedLogRead: true,
      incidentRegisterRead: true,
      activePolicyIncident: true,
      recitedGuardrails: REQUIRED_OPERATE_GUARDRAILS,
    })).toThrow('OPERATE_INCIDENT_PRIORITY_VIOLATION')
  })
})

const dailyFixture = (): DailyScanInput => ({
  windowStart,
  asOf,
  orphanReservations: [{
    reservationId: 'reservation-1',
    packageId: 'package-1',
    leaseId: 'lease-1',
    leaseExpiredAt: '2026-08-25T08:00:00.000Z',
    providerRequestIds: ['request-1'],
    reconciledAt: null,
  }],
  gateFailures: [{
    evaluationId: 'gate-eval-1',
    packageId: 'package-1',
    tier: 'M1',
    reason: 'TIMELINE_GAP',
    sourceStageCode: 'STAGE_14',
    rootStageCode: 'STAGE_08',
    evaluatedAt: '2026-08-25T09:00:00.000Z',
    evidenceR2Key: 'evidence/gates/gate-eval-1.json',
    borderline: false,
    variance: null,
    criticCapabilityId: null,
  }],
  packages: [{
    packageId: 'package-1',
    status: 'RUNNING',
    actualSpendUsd: 8,
    spendCeilingUsd: 10,
  }],
  incidents: [],
})

describe('WP-31 §1-OPS daily scan', () => {
  it('reports orphan, FAIL and spend with the exact runbook actions and no automatic writes', () => {
    const report = runDailyOperationalScan(dailyFixture())
    expect(report.haltedByPolicyIncident).toBe(false)
    expect(report.issues.map((item) => item.kind)).toEqual([
      'ORPHAN_RESERVATION',
      'GATE_FAIL',
      'SPEND_ALERT',
    ])
    expect(report.actions.map((item) => item.kind)).toEqual([
      'RECONCILE_ORPHAN',
      'PROPOSE_REOPEN_ROOT_STAGE',
      'SPEND_ALERT',
    ])
    expect(report.actions).toContainEqual(expect.objectContaining({
      kind: 'RECONCILE_ORPHAN',
      blockNewLeaseUntilClean: true,
    }))
    expect(report.actions).toContainEqual(expect.objectContaining({
      kind: 'PROPOSE_REOPEN_ROOT_STAGE',
      waiveAllowed: false,
      requiresOperatorConfirmation: true,
    }))
    expect(report.actions).toContainEqual(expect.objectContaining({
      kind: 'SPEND_ALERT',
      spendRatio: 0.8,
      ceilingChangeAllowed: false,
      requiresOwnerDecision: true,
    }))
    expect(report.autoCommands).toEqual([])
    expect(report.stateWrites).toEqual([])
    expect(report.providerCostUsd).toBe(0)
  })

  it('halts all lower-priority work when a new policy incident exists', () => {
    const report = runDailyOperationalScan({
      ...dailyFixture(),
      incidents: [{
        incidentId: 'incident-1',
        channelId: 'channel-1',
        level: 'I2',
        status: 'OPEN',
        detectedAt: '2026-08-25T09:30:00.000Z',
        evidenceR2Key: 'evidence/policy/incident-1.json',
        channelFrozen: false,
      }],
    })
    expect(report.haltedByPolicyIncident).toBe(true)
    expect(report.issues.map((item) => item.kind)).toEqual(['POLICY_INCIDENT'])
    expect(report.actions).toEqual([expect.objectContaining({
      kind: 'HALT_FOR_POLICY_INCIDENT',
      requiresHumanDirection: true,
    })])
  })
})

const entry = (overrides: Partial<OpsLogEntry> = {}): OpsLogEntry => ({
  sessionId: 'ops-1',
  mode: 'OPERATE',
  task: 'Daily operations scan',
  openedAt: '2026-08-25T09:00:00.000Z',
  closedAt: '2026-08-25T09:20:00.000Z',
  guardrails: REQUIRED_OPERATE_GUARDRAILS,
  traceIds: ['trace-1'],
  exceptions: [],
  pendingHumanDecisions: [],
  ...overrides,
})

describe('WP-31 OPS-LOG convention and command audit', () => {
  it('appends exactly one immutable session entry', () => {
    const previous = '# OPS LOG\n'
    const next = appendOpsLog(previous, entry())
    expect(next.startsWith(previous)).toBe(true)
    expect(next).toContain('## OPS-SESSION ops-1')
    expect(() => assertOpsLogAppend(previous, next.replace('# OPS LOG', '# changed')))
      .toThrow('OPS_LOG_NOT_APPEND_ONLY')
  })

  it('detects a command_log record missing from OPS-LOG', () => {
    const audit = auditOpsLog([entry()], [
      { id: 'command-1', traceId: 'trace-1', commandType: 'REOPEN_ROOT_STAGE', createdAt: asOf },
      { id: 'command-2', traceId: 'trace-unlogged', commandType: 'START_STAGE', createdAt: asOf },
    ])
    expect(audit.clean).toBe(false)
    expect(audit.unloggedCommandIds).toEqual(['command-2'])
    expect(audit.unknownTraceIds).toEqual([])
  })
})

describe('WP-31 §2-OPS weekly owner report', () => {
  it('is read-only and surfaces OPS-LOG discrepancies', () => {
    const opsLogAudit = auditOpsLog([entry()], [
      { id: 'command-2', traceId: 'trace-unlogged', commandType: 'START_STAGE', createdAt: asOf },
    ])
    const report = buildWeeklyOwnerReport({
      windowStart: '2026-08-18T00:00:00.000Z',
      windowEnd: '2026-08-25T00:00:00.000Z',
      firstPassYieldByStage: [{ stageCode: 'STAGE_08', yield: 0.75 }],
      costPerVideo: [{ packageId: 'package-1', actualUsd: 8, ceilingUsd: 10 }],
      humanQueue: [{ touchpoint: 'HP-04', itemId: 'master-1', ageHours: 3 }],
      learningStatusCounts: { READY: 1 },
      policyWatchSummary: 'No policy diff detected.',
      opsLogAudit,
    })
    expect(report.readOnly).toBe(true)
    expect(report.opsLogAudit.clean).toBe(false)
    expect(report.stateWrites).toEqual([])
    expect(report.providerCostUsd).toBe(0)
  })
})
