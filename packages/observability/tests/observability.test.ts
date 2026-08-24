import { describe, expect, test } from 'vitest'

import {
  FIXTURE_BANNER,
  ObservabilityError,
  buildOperatorWorkspace,
  computeMinimumMetrics,
  evaluateMandatoryAlerts,
  reconstructTrace,
  validateRejectionLabel,
} from '../src/index.js'

const at = '2026-08-24T10:00:00.000Z'

const completeTrace = [
  { id: 'e0', traceId: 'trace-1', sequence: 0, packageId: 'pkg', stageInstanceId: 'stage-1', eventType: 'STAGE_ATTEMPT_STARTED' as const, occurredAt: at, evidenceR2Key: 'ops/e0.json' },
  { id: 'e1', traceId: 'trace-1', sequence: 1, packageId: 'pkg', stageInstanceId: 'stage-1', eventType: 'PROVIDER_REQUESTED' as const, spanId: 'span-1', reservationId: 'reservation-1', requestR2Key: 'evidence/request.json.gz', occurredAt: at, evidenceR2Key: 'ops/e1.json' },
  { id: 'e2', traceId: 'trace-1', sequence: 2, packageId: 'pkg', stageInstanceId: 'stage-1', eventType: 'PROVIDER_RESPONDED' as const, spanId: 'span-1', responseR2Key: 'evidence/response.json.gz', latencyMs: 125, errorClass: null, occurredAt: at, evidenceR2Key: 'ops/e2.json' },
  { id: 'e3', traceId: 'trace-1', sequence: 3, packageId: 'pkg', stageInstanceId: 'stage-1', eventType: 'COST_SETTLED' as const, spanId: 'span-1', reservationId: 'reservation-1', costUsd: 0.12, occurredAt: at, evidenceR2Key: 'ops/e3.json' },
  { id: 'e4', traceId: 'trace-1', sequence: 4, packageId: 'pkg', stageInstanceId: 'stage-1', eventType: 'OUTPUT_SEALED' as const, outputId: 'artifact-1', outputR2Key: 'production/artifact.json', outputSha256: 'a'.repeat(64), occurredAt: at, evidenceR2Key: 'ops/e4.json' },
  { id: 'e5', traceId: 'trace-1', sequence: 5, packageId: 'pkg', stageInstanceId: 'stage-1', eventType: 'STAGE_ATTEMPT_COMPLETED' as const, outcome: 'SUCCEEDED' as const, occurredAt: at, evidenceR2Key: 'ops/e5.json' },
]

describe('WP-25 trace reconstruction', () => {
  test('reconstructs one complete ordered stage chain including every provider call, cost and output', () => {
    const chain = reconstructTrace('trace-1', [...completeTrace].reverse())
    expect(chain.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5])
    expect(chain.providerCalls).toEqual([expect.objectContaining({ spanId: 'span-1', costUsd: 0.12 })])
    expect(chain.outputs).toEqual([expect.objectContaining({ outputId: 'artifact-1' })])
    expect(chain.totalCostUsd).toBe(0.12)
  })

  test.each<[string, readonly unknown[]]>([
    ['sequence gap', completeTrace.filter((event) => event.sequence !== 2)],
    ['unfinished provider span', completeTrace.filter((event) => event.sequence !== 3).map((event, index) => ({ ...event, sequence: index }))],
    ['missing terminal event', completeTrace.slice(0, -1)],
  ])('fails closed for an incomplete chain: %s', (_name, events) => {
    expect(() => reconstructTrace('trace-1', events)).toThrow(ObservabilityError)
  })
})

describe('WP-25 minimum metrics and alerts', () => {
  test('reports every baseline and v2 metric family without merging unknown values into zero', () => {
    const metrics = computeMinimumMetrics({
      providerCalls: [
        { capabilityId: 'CAP@1', stageCode: 'STAGE_01', packageId: 'pkg', channelId: 'channel', provider: 'provider-a', latencyMs: 100, errorClass: null, costUsd: 0.1 },
        { capabilityId: 'CAP@1', stageCode: 'STAGE_01', packageId: 'pkg', channelId: 'channel', provider: 'provider-a', latencyMs: 300, errorClass: 'SCHEMA_VIOLATION', costUsd: 0.2 },
      ],
      stages: [{ stageCode: 'STAGE_01', firstPass: true }],
      sealedArtifactCount: 1,
      producedArtifactCount: 4,
      p0EscapeCount: 0,
      criticVariances: [2],
      capabilityBindings: [{ state: 'QUALIFIED' }, { state: 'REVOKED' }],
      blockedDispatches: [{ reason: 'CAPABILITY_REVOKED' }],
      reservations: [{ state: 'ORPHANED' }, { state: 'SETTLED' }],
      leases: [{ expired: false }, { expired: true }],
      queueDepth: 3,
      attentionMinutesThisWeek: 42,
      humanQueueAgesHours: [2, 49],
      proposals: [{ status: 'DRAFT' }, { status: 'DRAFT' }, { status: 'PROMOTED' }],
      escapedDefects: [{ defectClass: 'P1' }, { defectClass: 'P1' }],
    })
    expect(metrics.latency.byCapability['CAP@1']).toEqual({ p50: 100, p95: 300, p99: 300 })
    expect(metrics.errors.byClass['SCHEMA_VIOLATION']).toBe(1)
    expect(metrics.cost.costPerSealedArtifactUsd).toBeCloseTo(0.3)
    expect(metrics.quality.firstPassYieldByStage['STAGE_01']).toBe(1)
    expect(metrics.capability.qualified).toBe(1)
    expect(metrics.operations.queueDepth).toBe(3)
    expect(metrics.evolution.proposalsByStatus['DRAFT']).toBe(2)
    expect(metrics.evolution.escapedFailureDensityByDefectClass['P1']).toBe(0.5)
    expect(metrics.attention.oldestHumanQueueAgeHours).toBe(49)
  })

  test('emits all mandatory alerts from contract thresholds and supplied standard threshold', () => {
    const alerts = evaluateMandatoryAlerts({
      now: '2026-08-24T10:00:00.000Z',
      spendUsedUsd: 80,
      spendCeilingUsd: 100,
      providerRequestCount: 10,
      schemaViolationCount: 2,
      schemaViolationRateMax: 0.1,
      criticVariances: [4],
      revokedCapabilityIds: ['CAP@1'],
      orphanReservations: [{ id: 'orphan-1', orphanedAt: '2026-08-23T09:59:59.000Z' }],
      humanQueue: [{ id: 'hp-1', enqueuedAt: '2026-08-22T09:59:59.000Z' }],
    })
    expect(alerts.map((alert) => alert.code)).toEqual([
      'SPEND_CEILING_80_PERCENT',
      'SCHEMA_VIOLATION_RATE_EXCEEDED',
      'CRITIC_VARIANCE_EXCEEDED',
      'CAPABILITY_REVOKED',
      'ORPHAN_RESERVATION_OVER_24H',
      'HUMAN_QUEUE_OVER_48H',
    ])
  })
})

describe('WP-25 operator workspace', () => {
  test('separates NOT_EVALUATED from FAIL and marks fixtures as never releasable', () => {
    const workspace = buildOperatorWorkspace({
      effectiveState: 'BLOCKED',
      nextValidActions: [{ id: 'resolve-blocker', label: 'Resolve blocker' }],
      gates: [
        { code: 'M0-A', state: 'NOT_EVALUATED' },
        { code: 'M1-A', state: 'FAIL' },
      ],
      candidateKind: 'QUALIFICATION_FIXTURE',
      standardVersion: 'V23.4',
      spentUsd: 3,
      ceilingUsd: 30,
      priorWork: [],
      humanQueue: [],
      decisions: [],
      attention: { usedMinutes: 20, ceilingMinutes: 300 },
      incident: null,
    })
    expect(workspace.gateGroups.FAIL.count).toBe(1)
    expect(workspace.gateGroups.NOT_EVALUATED.count).toBe(1)
    expect(workspace.gateGroups.FAIL.colorToken).not.toBe(workspace.gateGroups.NOT_EVALUATED.colorToken)
    expect(workspace.candidate.releaseCandidate).toBe(false)
    expect(workspace.candidate.banner).toBe(FIXTURE_BANNER)
  })

  test('exposes the five v2 operator controls with a deterministic single next action', () => {
    const workspace = buildOperatorWorkspace({
      effectiveState: 'AWAITING_HUMAN',
      nextValidActions: [{ id: 'review-d2', label: 'Review D2' }],
      gates: [], candidateKind: 'RELEASE_CANDIDATE', standardVersion: 'V23.4',
      spentUsd: 4, ceilingUsd: 30, priorWork: [],
      humanQueue: [{ id: 'q2', touchpoint: 'HP03', packageId: 'pkg', enqueuedAt: '2026-08-24T09:00:00.000Z' }],
      decisions: [{ id: 'd2', decisionType: 'D2', diffR2Key: 'human/diff.json', rationaleText: 'Substantive human edit rationale.', createdAt: at }],
      attention: { usedMinutes: 50, ceilingMinutes: 300 }, incident: null,
    })
    expect(workspace.nextValidAction.id).toBe('review-d2')
    expect(workspace.humanTouchpointQueue).toHaveLength(1)
    expect(workspace.decisionDesk.columns.map((column) => column.decisionType)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5'])
    expect(workspace.decisionDesk.diffBox.r2Key).toBe('human/diff.json')
    expect(workspace.rejectionLabelForm.requiredFields).toContain('defectClass')
    expect(workspace.generateEvidenceReportButton.action).toBe('GENERATE_EVIDENCE_REPORT')
    expect(workspace.attentionBudgetClock.remainingMinutes).toBe(250)
  })

  test('requires structured rejection labels and surfaces an unfrozen I2 incident as a hard alert', () => {
    expect(validateRejectionLabel({ defectClass: 'P1', stageCode: 'STAGE_14', rationale: 'Too short', evidenceR2Key: 'evidence/reject.json' }).success).toBe(false)
    const workspace = buildOperatorWorkspace({
      effectiveState: 'BLOCKED', nextValidActions: [{ id: 'freeze', label: 'Freeze channel' }], gates: [],
      candidateKind: 'RELEASE_CANDIDATE', standardVersion: 'V23.4', spentUsd: 0, ceilingUsd: 30,
      priorWork: [], humanQueue: [], decisions: [], attention: { usedMinutes: 0, ceilingMinutes: 300 },
      incident: { level: 'I2', channelFrozen: false },
    })
    expect(workspace.hardAlerts).toContain('I2_INCIDENT_REQUIRES_CHANNEL_FREEZE')
  })
})
