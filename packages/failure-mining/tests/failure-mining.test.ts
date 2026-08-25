import { describe, expect, test } from 'vitest'

import { thresholds } from '@youtube-ai-factory/contracts'

import {
  FailureMiningError,
  failureDensityReport,
  mineEscapedDefects,
  mineQuarantine,
  mineRejection,
  mineRepeatedFailures,
} from '../src/index.js'

const now = '2026-08-25T10:00:00.000Z'

describe('WP-30 LRN-04 rejected-master mining', () => {
  test('turns a structured HP-04 rejection into a gold insert in the same run', () => {
    const result = mineRejection({
      masterId: 'master-1',
      rejectedAt: '2026-08-25T09:00:00.000Z',
      minedAt: now,
      judgment: {
        touchpoint: 'HP-04',
        verdict: 'REJECTED',
        actorIdentity: 'owner@example.com',
        rationale: 'A black frame remains visible at the opening transition.',
        evidenceR2Key: 'human/hp04/master-1/verdict.json',
      },
      defects: [{ defectClass: 'BLACK_FRAME', severity: 'P1', stageCode: 'STAGE_14', tStart: 1, tEnd: 1.5 }],
      existingGoldDefectClasses: ['BLACK_FRAME'],
    })

    expect(result.writes).toHaveLength(1)
    expect(result.writes[0]).toEqual(expect.objectContaining({
      table: 'gold_sample',
      row: expect.objectContaining({ source: 'rejected_master', r2Key: expect.stringMatching(/^gold\//u) }),
    }))
    expect(result.providerCostUsd).toBe(0)
    const groundTruth = result.writes[0]?.table === 'gold_sample' ? result.writes[0].row.groundTruth : null
    expect(groundTruth).toMatchObject({ labelSource: 'HP-04_REJECTION', rationale: expect.any(String) })
    expect(result.allowedTables).toEqual(['gold_sample', 'evolution_proposal'])
  })

  test('fails closed without a genuine structured HP-04 judgment or outside the SLA', () => {
    const base = {
      masterId: 'master-1', rejectedAt: '2026-08-25T09:00:00.000Z', minedAt: now,
      judgment: { touchpoint: 'HP-04' as const, verdict: 'REJECTED' as const, actorIdentity: '', rationale: 'short', evidenceR2Key: '' },
      defects: [{ defectClass: 'BLACK_FRAME', severity: 'P1' as const, stageCode: 'STAGE_14', tStart: 1, tEnd: 1.5 }],
      existingGoldDefectClasses: ['BLACK_FRAME'],
    }
    expect(() => mineRejection(base)).toThrow(FailureMiningError)
    expect(() => mineRejection({ ...base, judgment: { ...base.judgment, actorIdentity: 'owner', rationale: 'A fully structured rejection rationale with traceable evidence.', evidenceR2Key: 'human/verdict.json' }, rejectedAt: '2026-08-01T00:00:00.000Z' })).toThrow('REJECTION_SLA_EXCEEDED')
  })
})

describe('WP-30 LRN-04 escaped defects and repeated failures', () => {
  test('creates a gold sample and requalification proposal for escaped P0 in one run', () => {
    const result = mineEscapedDefects({
      minedAt: now,
      defects: [{
        id: 'escape-1', masterId: 'master-2', defectClass: 'SILENCE', severity: 'P0', stageCode: 'STAGE_14',
        tStart: 4, tEnd: 8, criticCapabilityId: 'ASSURANCE_AUDIO@1', machineMeasurable: true,
        assurance: { verdict: 'PASS', decidedAt: '2026-08-25T08:00:00.000Z', evidenceR2Key: 'assurance/master-2/pass.json' },
        detected: { source: 'HUMAN', detectedAt: '2026-08-25T09:00:00.000Z', evidenceR2Key: 'human/master-2/escape.json' },
      }],
    })
    expect(result.writes.map((write) => write.table)).toEqual(['gold_sample', 'evolution_proposal'])
    const proposal = result.writes[1]
    expect(proposal?.table === 'evolution_proposal' ? proposal.row.metadata.requalifyCapabilityIds : []).toEqual(['ASSURANCE_AUDIO@1'])
    expect(proposal?.table === 'evolution_proposal' ? proposal.row.metadata.proposedControl : null).toBe('DETERMINISTIC_LINT')
  })

  test('emits earlier-stage lint proposals only after the repeated-failure threshold', () => {
    const one = mineRepeatedFailures({ minedAt: now, failures: [{ id: 'f1', reason: 'BAD_SAFE_ZONE', defectClass: 'SAFE_ZONE', stageCode: 'STAGE_14', earlierStageCode: 'STAGE_12', machineMeasurable: true, evidenceR2Key: 'gates/f1.json' }] })
    expect(one.writes).toHaveLength(0)
    const repeated = mineRepeatedFailures({ minedAt: now, failures: Array.from({ length: thresholds.OPS.GATE_FAIL_REPEAT_TO_LRN04 }, (_, index) => ({ id: `f${index}`, reason: 'BAD_SAFE_ZONE', defectClass: 'SAFE_ZONE', stageCode: 'STAGE_14', earlierStageCode: 'STAGE_12', machineMeasurable: true, evidenceR2Key: `gates/f${index}.json` })) })
    expect(repeated.writes).toHaveLength(1)
    expect(repeated.writes[0]).toEqual(expect.objectContaining({ table: 'evolution_proposal', row: expect.objectContaining({ targetRef: 'gate:STAGE_12:BAD_SAFE_ZONE' }) }))
    expect(() => mineRepeatedFailures({
      minedAt: now,
      failures: [0, 1].map(() => ({
        id: 'duplicate', reason: 'BAD_SAFE_ZONE', defectClass: 'SAFE_ZONE', stageCode: 'STAGE_14',
        earlierStageCode: 'STAGE_12', machineMeasurable: true, evidenceR2Key: 'gates/duplicate.json',
      })),
    })).toThrow('FAILURE_EVIDENCE_INVALID')
  })

  test('proposes a quarantine rule only above the configured density and without an existing lint', () => {
    const result = mineQuarantine({
      minedAt: now,
      items: [
        { id: 'q1', defectClass: 'TIMELINE', stageCode: 'STAGE_14', deterministicLintExists: false, evidenceR2Key: 'quarantine/q1.json' },
        { id: 'q2', defectClass: 'TIMELINE', stageCode: 'STAGE_14', deterministicLintExists: false, evidenceR2Key: 'quarantine/q2.json' },
        { id: 'q3', defectClass: 'OTHER', stageCode: 'STAGE_14', deterministicLintExists: false, evidenceR2Key: 'quarantine/q3.json' },
        { id: 'q4', defectClass: 'OTHER', stageCode: 'STAGE_14', deterministicLintExists: true, evidenceR2Key: 'quarantine/q4.json' },
      ],
    })
    expect(result.writes).toHaveLength(1)
    expect(result.writes[0]).toEqual(expect.objectContaining({ table: 'evolution_proposal' }))
  })

  test('reports density without exposing a persistence adapter', () => {
    const report = failureDensityReport([{ defectClass: 'SILENCE', stageCode: 'STAGE_14' }, { defectClass: 'SILENCE', stageCode: 'STAGE_14' }])
    expect(report.byDefectClass['SILENCE']).toBe(1)
    expect(report.byStage['STAGE_14']).toBe(1)
  })
})
