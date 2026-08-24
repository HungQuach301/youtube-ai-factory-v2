import { describe, expect, it } from 'vitest'

import type { CriticCode, Hex64 } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import {
  AssuranceError,
  AssurancePanel,
  evaluateCriticQualification,
  gatePrerequisites,
  type AssuranceCritic,
  type AssuranceCriticResponse,
  type AssuranceDimension,
  type AssuranceRubric,
  type BlindAssuranceRequest,
} from '../src/index.js'

const dimensions = Object.keys(thresholds.ASSURANCE.FLOORS) as AssuranceDimension[]
const hash = 'a'.repeat(64) as Hex64

const rubric = (): AssuranceRubric => Object.fromEntries(dimensions.map((dimension) => [dimension, {
  fail: `${dimension} fail fixture`,
  borderline: `${dimension} borderline fixture`,
  pass: `${dimension} pass fixture`,
  evidenceR2Key: `qualification/rubric/${dimension}.json`,
  selectedBy: 'fixture-human-owner',
}]))

const response = (score: number, attempt: number): AssuranceCriticResponse => ({
  dimensionScores: Object.fromEntries(dimensions.map((dimension) => [dimension, score])),
  p0Count: 0,
  criticalP1Count: 0,
  evidenceR2Key: `qualification/critic/attempt-${attempt}.json`,
})

const reducedCodes = [
  'TRUTH_BRAND_SAFETY', 'SEMANTIC_ALIGNMENT', 'STORY_RETENTION', 'PACKAGING_CTR',
] as const satisfies readonly CriticCode[]

function critics(
  judge: (request: BlindAssuranceRequest) => AssuranceCriticResponse = (request) => response(100, request.attempt),
): readonly AssuranceCritic[] {
  return reducedCodes.map((code) => ({
    code,
    capabilityId: `critic-${code}`,
    qualificationState: 'QUALIFIED',
    qualificationRunId: `qualification-${code}`,
    judge: async (request) => judge(request),
  }))
}

const input = (overrides: Partial<Parameters<AssurancePanel['run']>[0]> = {}) => ({
  runId: 'assurance-run-1',
  profile: 'REDUCED' as const,
  profileSettings: thresholds.PROFILE.REDUCED,
  mode: 'HARD_GATE' as const,
  masterEvidenceHash: hash,
  temporalSampleRefs: ['master/sample-1.png'],
  prerequisites: gatePrerequisites(['PASS', 'PASS']),
  rubric: rubric(),
  ...overrides,
})

describe('WP-22 assurance panel', () => {
  it('never dispatches M2 while any deterministic M0/M1 prerequisite is dirty', async () => {
    let calls = 0
    const panel = new AssurancePanel(critics((request) => {
      calls += 1
      return response(100, request.attempt)
    }))
    await expect(panel.run(input({ prerequisites: gatePrerequisites(['PASS', 'FAIL']) })))
      .rejects.toEqual(expect.objectContaining({ code: 'M2_PREREQUISITES_NOT_CLEAN' }))
    expect(calls).toBe(0)
  })

  it('fails closed with zero provider calls while real rubric anchors are missing', async () => {
    let calls = 0
    const panel = new AssurancePanel(critics((request) => {
      calls += 1
      return response(100, request.attempt)
    }))
    const result = await panel.run(input({ mode: 'WARNING_ONLY', rubric: {} }))
    expect(result).toMatchObject({ gateState: 'NOT_EVALUATED', verdict: 'NOT_RUN', providerCallCount: 0 })
    expect(result.blockers).toContain('RUBRIC_ANCHOR_MISSING:OVERALL')
    expect(calls).toBe(0)
  })

  it('requires the exact REDUCED critic set and a passing qualification run', async () => {
    const wrongSet = critics().slice(0, 3)
    await expect(new AssurancePanel(wrongSet).run(input()))
      .rejects.toEqual(expect.objectContaining({ code: 'PROFILE_CRITIC_SET_MISMATCH' }))

    const unqualified = critics().map((critic, index) => index === 0
      ? { ...critic, qualificationState: 'REGISTERED', qualificationRunId: null }
      : critic)
    const result = await new AssurancePanel(unqualified).run(input())
    expect(result.providerCallCount).toBe(0)
    expect(result.blockers[0]).toMatch(/^CRITIC_NOT_QUALIFIED:/u)
  })

  it('keeps a warning-only score out of the M2 release gate', async () => {
    const requests: BlindAssuranceRequest[] = []
    const panel = new AssurancePanel(critics((request) => {
      requests.push(request)
      return response(100, request.attempt)
    }))
    const result = await panel.run(input({ mode: 'WARNING_ONLY' }))
    expect(result).toMatchObject({ verdict: 'PASS', gateState: 'NOT_EVALUATED', providerCallCount: 4 })
    expect(new Set(requests.map((request) => request.blindMasterId)).size).toBe(1)
    expect(requests.every((request) => request.temperature === 0 && request.seed === 0)).toBe(true)
  })

  it('runs exactly three total samples in the borderline band and uses their median', async () => {
    const panel = new AssurancePanel(critics((request) => response(94, request.attempt)))
    const result = await panel.run(input())
    expect(result.providerCallCount).toBe(12)
    expect(result.gateState).toBe('PASS')
    expect(result.criticEvidence.every((item) => item.samples.length === 3)).toBe(true)
  })

  it('discards unstable verdicts and requires critic requalification', async () => {
    const scoreByAttempt = { 1: 94, 2: 100, 3: 88 } as const
    const panel = new AssurancePanel(critics((request) => response(scoreByAttempt[request.attempt], request.attempt)))
    const result = await panel.run(input())
    expect(result.gateState).toBe('NOT_EVALUATED')
    expect(result.blockers.some((blocker) => blocker.startsWith('CRITIC_REQUALIFICATION_REQUIRED:'))).toBe(true)
  })
})

describe('critic qualification', () => {
  const samples = [
    { id: 'p0-sync', defectClass: 'SYNC', severity: 'P0' as const },
    { id: 'p1-caption', defectClass: 'CAPTION', severity: 'P1' as const },
  ]
  const observations = samples.flatMap((sample) => ([1, 2, 3] as const).map((runOrdinal) => ({
    sampleId: sample.id,
    runOrdinal,
    predictedDefectClasses: [sample.defectClass],
    score: 95,
  })))

  it('qualifies only against ready gold evidence and every measured floor', () => {
    expect(evaluateCriticQualification({ samples, observations, goldSetReady: true, rubric: rubric() }))
      .toMatchObject({ verdict: 'PASS', qualificationState: 'QUALIFIED', precision: 1, recallP1: 1 })
  })

  it('never forges qualification when gold or anchor evidence is absent', () => {
    expect(evaluateCriticQualification({ samples, observations, goldSetReady: false, rubric: {} }))
      .toMatchObject({ verdict: 'INCONCLUSIVE', qualificationState: 'REGISTERED' })
  })
})

it('exposes stable assurance error codes', () => {
  expect(new AssuranceError('INVALID_CRITIC_RESPONSE', 'fixture')).toMatchObject({
    name: 'AssuranceError', code: 'INVALID_CRITIC_RESPONSE',
  })
})
