import { describe, expect, it } from 'vitest'

import type { Hex64 } from '@youtube-ai-factory/contracts'

import {
  EvolutionError,
  applyPromoteEvolutionCommand,
  buildEvidenceBundle,
  createProposal,
  rollbackPromotion,
  runCapabilityShadow,
  runThresholdShadow,
} from '../src/index.js'

const hash = (character: string): Hex64 => character.repeat(64) as Hex64

const thresholdDiff = {
  before: { kind: 'MINIMUM' as const, value: 94 },
  after: { kind: 'MINIMUM' as const, value: 92 },
}

const proposal = () => createProposal({
  id: 'proposal-1',
  kind: 'THRESHOLD',
  source: 'HUMAN',
  targetRef: 'ASSURANCE.FLOORS.FACTUAL_SAFETY',
  diffR2Key: 'qualification/evolution/proposal-1/diff.json',
  declaredDirection: 'RELAX',
  diff: thresholdDiff,
  createdAt: '2026-08-24T00:00:00.000Z',
})

const artifacts = () => Array.from({ length: 10 }, (_, index) => ({
  artifactId: `artifact-${index}`,
  sourceNamespace: 'production' as const,
  productionCreatedAt: new Date(Date.UTC(2026, 7, 24, 0, 0, 10 - index)).toISOString(),
  beforeVerdict: index === 0 ? 'FAIL' as const : 'PASS' as const,
  afterVerdict: 'PASS' as const,
  evidenceR2Key: `qualification/evolution/proposal-1/artifact-${index}.json`,
}))

const thresholdShadow = () => runThresholdShadow({
  id: 'shadow-1',
  proposalId: 'proposal-1',
  executionNamespace: 'qualification',
  artifacts: artifacts(),
  actualCostUsd: 1.25,
  projectedOperatingCostDeltaUsd: -0.05,
})

describe('EVO-01 structural strictness audit', () => {
  it('catches a RELAX change declared as NEUTRAL', () => {
    expect(() => createProposal({
      id: 'proposal-attack',
      kind: 'THRESHOLD',
      source: 'HUMAN',
      targetRef: 'ASSURANCE.FLOORS.FACTUAL_SAFETY',
      diffR2Key: 'qualification/evolution/proposal-attack/diff.json',
      declaredDirection: 'NEUTRAL',
      diff: thresholdDiff,
      createdAt: '2026-08-24T00:00:00.000Z',
    })).toThrowError(expect.objectContaining({ code: 'STRICTNESS_DIRECTION_MISMATCH' }))
  })
})

describe('EVO-01 qualification shadow harness', () => {
  it('requires at least ten recent production artifacts replayed in qualification', () => {
    expect(() => runThresholdShadow({
      id: 'shadow-short', proposalId: 'proposal-1', executionNamespace: 'qualification',
      artifacts: artifacts().slice(0, 9), actualCostUsd: 0, projectedOperatingCostDeltaUsd: 0,
    })).toThrowError(expect.objectContaining({ code: 'SHADOW_SAMPLE_INSUFFICIENT' }))

    expect(() => runThresholdShadow({
      id: 'shadow-leak', proposalId: 'proposal-1', executionNamespace: 'qualification',
      artifacts: [{ ...artifacts()[0]!, sourceNamespace: 'qualification' }, ...artifacts().slice(1)],
      actualCostUsd: 0, projectedOperatingCostDeltaUsd: 0,
    })).toThrowError(expect.objectContaining({ code: 'SHADOW_NAMESPACE_INVALID' }))

    expect(thresholdShadow()).toMatchObject({
      status: 'PASS', artifactCount: 10, verdictChanges: [{ artifactId: 'artifact-0', before: 'FAIL', after: 'PASS' }],
    })

    expect(() => runThresholdShadow({
      id: 'shadow-order', proposalId: 'proposal-1', executionNamespace: 'qualification',
      artifacts: [...artifacts()].reverse(), actualCostUsd: 0, projectedOperatingCostDeltaUsd: 0,
    })).toThrowError(expect.objectContaining({ code: 'SHADOW_ARTIFACT_ORDER_INVALID' }))
  })

  it('runs the full capability gold set and fails on any defect-class regression', () => {
    const baseline = [
      { defectClass: 'BLACK_FRAME', sampleCount: 6, recall: 1, precision: 0.9, variance: 0.01 },
      { defectClass: 'AUDIO_CLIP', sampleCount: 4, recall: 0.95, precision: 0.85, variance: 0.02 },
    ]
    expect(() => runCapabilityShadow({
      id: 'shadow-capability', proposalId: 'proposal-capability', executionNamespace: 'qualification',
      fullGoldSampleCount: 10, baseline,
      candidate: [baseline[0]!, { ...baseline[1]!, recall: 0.94 }],
      actualCostUsd: 2, projectedOperatingCostDeltaUsd: 0.1,
    })).toThrowError(expect.objectContaining({ code: 'DEFECT_CLASS_REGRESSION' }))

    expect(runCapabilityShadow({
      id: 'shadow-capability', proposalId: 'proposal-capability', executionNamespace: 'qualification',
      fullGoldSampleCount: 10, baseline,
      candidate: baseline.map((metric) => ({ ...metric, precision: metric.precision + 0.01 })),
      actualCostUsd: 2, projectedOperatingCostDeltaUsd: 0.1,
    })).toMatchObject({ status: 'PASS', goldSampleCount: 10 })
  })
})

describe('EVO-01 evidence, owner promotion and rollback', () => {
  it('fails closed when shadow evidence or a RELAX risk analysis is missing', () => {
    expect(() => buildEvidenceBundle({
      proposal: proposal(), shadowResult: null, exactDiff: thresholdDiff,
      recommendation: 'Promote only after owner reviews the changed verdict.',
      relaxRiskAnalysis: 'One previously failing artifact would pass.',
      rollback: { ref: 'registry:v1', instruction: 'Restore the exact prior rule.' },
    })).toThrowError(expect.objectContaining({ code: 'SHADOW_EVIDENCE_MISSING' }))

    expect(() => buildEvidenceBundle({
      proposal: proposal(), shadowResult: thresholdShadow(), exactDiff: thresholdDiff,
      recommendation: 'Promote only after owner reviews the changed verdict.',
      relaxRiskAnalysis: '',
      rollback: { ref: 'registry:v1', instruction: 'Restore the exact prior rule.' },
    })).toThrowError(expect.objectContaining({ code: 'RELAX_RISK_ANALYSIS_MISSING' }))
  })

  it('changes exactly one registry location only through a bound owner command, then rolls it back', () => {
    const ready = buildEvidenceBundle({
      proposal: proposal(), shadowResult: thresholdShadow(), exactDiff: thresholdDiff,
      recommendation: 'Promote only after owner reviews the changed verdict.',
      relaxRiskAnalysis: 'One previously failing artifact would pass and needs owner risk acceptance.',
      rollback: { ref: 'registry:v1', instruction: 'Restore the exact prior rule.' },
    })
    const registry = {
      'ASSURANCE.FLOORS.FACTUAL_SAFETY': thresholdDiff.before,
      'ASSURANCE.FLOORS.SEMANTIC_ALIGNMENT': { kind: 'MINIMUM' as const, value: 94 },
    }
    const command = {
      id: 'command-1', type: 'PROMOTE_EVOLUTION' as const, proposalId: 'proposal-1',
      ownerIdentity: 'real-human-owner', ownerActive: true, signature: 'signature',
      evidenceHash: ready.bundle.canonicalHash, executed: true,
    }

    expect(() => applyPromoteEvolutionCommand(ready.proposal, ready.bundle, {
      ...command, ownerActive: false,
    }, registry)).toThrowError(expect.objectContaining({ code: 'OWNER_COMMAND_INVALID' }))

    const promoted = applyPromoteEvolutionCommand(ready.proposal, ready.bundle, command, registry)
    expect(promoted.changedKeys).toEqual(['ASSURANCE.FLOORS.FACTUAL_SAFETY'])
    expect(promoted.registry['ASSURANCE.FLOORS.FACTUAL_SAFETY']).toEqual(thresholdDiff.after)
    expect(promoted.registry['ASSURANCE.FLOORS.SEMANTIC_ALIGNMENT']).toEqual(
      registry['ASSURANCE.FLOORS.SEMANTIC_ALIGNMENT'],
    )

    const rolledBack = rollbackPromotion(promoted, promoted.registry, 'registry:v1')
    expect(rolledBack.changedKeys).toEqual(['ASSURANCE.FLOORS.FACTUAL_SAFETY'])
    expect(rolledBack.registry).toEqual(registry)
  })

  it('exposes stable fail-closed error codes', () => {
    expect(new EvolutionError('OWNER_COMMAND_INVALID')).toMatchObject({
      name: 'EvolutionError', code: 'OWNER_COMMAND_INVALID',
    })
    expect(hash('a')).toHaveLength(64)
  })
})
