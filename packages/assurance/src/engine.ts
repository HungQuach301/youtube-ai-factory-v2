import type { CriticCode, GateState, Hex64, ProfileName } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import type {
  AssuranceCritic,
  AssuranceCriticResponse,
  AssuranceDimension,
  AssuranceRubric,
  AssuranceRunInput,
  AssuranceRunResult,
  BlindAssuranceRequest,
  CriticDimensionEvidence,
  RubricAnchor,
} from './types.js'

const DIMENSIONS = Object.freeze(Object.keys(thresholds.ASSURANCE.FLOORS) as AssuranceDimension[])
const FULL_CRITICS = Object.freeze([
  'EXECUTIVE_PRODUCER', 'STORY_RETENTION', 'VISUAL_DIRECTION', 'SEMANTIC_ALIGNMENT',
  'AUDIO_DIRECTION', 'AUDIENCE_SIMULATION', 'COMPETITIVE_EDITOR',
  'TRUTH_BRAND_SAFETY', 'PACKAGING_CTR',
] as const satisfies readonly CriticCode[])
const REDUCED_CRITICS = Object.freeze([
  'TRUTH_BRAND_SAFETY', 'SEMANTIC_ALIGNMENT', 'STORY_RETENTION', 'PACKAGING_CTR',
] as const satisfies readonly CriticCode[])

export type AssuranceErrorCode =
  | 'PROFILE_CONTEXT_MISMATCH'
  | 'PROFILE_CRITIC_SET_MISMATCH'
  | 'TEMPORAL_SAMPLE_COUNT_MISMATCH'
  | 'M2_PREREQUISITES_NOT_CLEAN'
  | 'INVALID_CRITIC_RESPONSE'

export class AssuranceError extends Error {
  override readonly name = 'AssuranceError'

  constructor(readonly code: AssuranceErrorCode, message: string) {
    super(`${code}: ${message}`)
  }
}

function hasText(value: string): boolean {
  return value.trim().length > 0
}

function completeAnchor(anchor: RubricAnchor | undefined): anchor is RubricAnchor {
  return anchor !== undefined
    && hasText(anchor.fail)
    && hasText(anchor.borderline)
    && hasText(anchor.pass)
    && hasText(anchor.evidenceR2Key)
    && hasText(anchor.selectedBy)
}

export function missingRubricAnchors(rubric: AssuranceRubric): readonly AssuranceDimension[] {
  return DIMENSIONS.filter((dimension) => !completeAnchor(rubric[dimension]))
}

function completeRubric(
  rubric: AssuranceRubric,
): Readonly<Record<AssuranceDimension, RubricAnchor>> | null {
  if (missingRubricAnchors(rubric).length > 0) return null
  return rubric as Readonly<Record<AssuranceDimension, RubricAnchor>>
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered[middle] ?? 0
}

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length
}

function exactCritics(profile: ProfileName): readonly CriticCode[] {
  return profile === 'REDUCED' ? REDUCED_CRITICS : FULL_CRITICS
}

function assertProfile(input: AssuranceRunInput, critics: readonly AssuranceCritic[]): void {
  const settings = thresholds.PROFILE[input.profile]
  if (input.profileSettings !== settings) {
    throw new AssuranceError('PROFILE_CONTEXT_MISMATCH', 'profileSettings must be the SSOT PROFILE object.')
  }
  const expected = exactCritics(input.profile)
  const actual = critics.map((critic) => critic.code)
  if (actual.length !== settings.criticCountAssurance
    || new Set(actual).size !== actual.length
    || expected.some((code) => !actual.includes(code))) {
    throw new AssuranceError(
      'PROFILE_CRITIC_SET_MISMATCH',
      `${input.profile} requires exactly ${expected.join(', ')}.`,
    )
  }
  if (input.temporalSampleRefs.length !== settings.temporalSamplesPerShot) {
    throw new AssuranceError(
      'TEMPORAL_SAMPLE_COUNT_MISMATCH',
      `${input.profile} requires ${settings.temporalSamplesPerShot} temporal sample(s) per shot.`,
    )
  }
}

function assertPrerequisites(input: AssuranceRunInput): void {
  if (input.prerequisites.length === 0
    || input.prerequisites.some((gate) => gate.state !== 'PASS')) {
    throw new AssuranceError(
      'M2_PREREQUISITES_NOT_CLEAN',
      'M0 and M1 must all be PASS before any Stage 14 critic dispatch.',
    )
  }
}

function validateResponse(response: AssuranceCriticResponse): void {
  if (!Number.isSafeInteger(response.p0Count) || response.p0Count < 0
    || !Number.isSafeInteger(response.criticalP1Count) || response.criticalP1Count < 0
    || !hasText(response.evidenceR2Key)) {
    throw new AssuranceError('INVALID_CRITIC_RESPONSE', 'Counts and evidence reference are invalid.')
  }
  for (const [dimension, score] of Object.entries(response.dimensionScores)) {
    if (!DIMENSIONS.includes(dimension as AssuranceDimension)
      || score === undefined || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new AssuranceError('INVALID_CRITIC_RESPONSE', `Invalid score for ${dimension}.`)
    }
  }
}

function blockedResult(input: AssuranceRunInput, blockers: readonly string[]): AssuranceRunResult {
  return {
    runId: input.runId,
    mode: input.mode,
    gateState: 'NOT_EVALUATED',
    verdict: 'NOT_RUN',
    providerCallCount: 0,
    blockers,
    dimensionScores: {},
    borderlineDimensions: [],
    criticEvidence: [],
    p0Count: 0,
    criticalP1Count: 0,
  }
}

interface CriticRun {
  readonly critic: AssuranceCritic
  readonly responses: readonly AssuranceCriticResponse[]
}

export class AssurancePanel {
  constructor(private readonly critics: readonly AssuranceCritic[]) {}

  async run(input: AssuranceRunInput): Promise<AssuranceRunResult> {
    assertProfile(input, this.critics)
    assertPrerequisites(input)

    const missing = missingRubricAnchors(input.rubric)
    if (missing.length > 0) {
      return blockedResult(input, missing.map((dimension) => `RUBRIC_ANCHOR_MISSING:${dimension}`))
    }
    const rubric = completeRubric(input.rubric)
    if (rubric === null) return blockedResult(input, ['RUBRIC_ANCHORS_INCOMPLETE'])

    const unqualified = this.critics.filter((critic) =>
      critic.qualificationState !== 'QUALIFIED' || !hasText(critic.qualificationRunId ?? ''))
    if (unqualified.length > 0) {
      return blockedResult(input, unqualified.map((critic) => `CRITIC_NOT_QUALIFIED:${critic.code}`))
    }

    const blindMasterId = canonicalHash({
      evidence_hash: input.masterEvidenceHash,
      run_id: input.runId,
      purpose: 'assurance-blind-master',
    }) as Hex64
    let providerCallCount = 0

    const judge = async (
      critic: AssuranceCritic,
      attempt: 1 | 2 | 3,
    ): Promise<AssuranceCriticResponse> => {
      providerCallCount += 1
      const request: BlindAssuranceRequest = {
        blindMasterId,
        criticCode: critic.code,
        temperature: 0,
        seed: 0,
        attempt,
        temporalSampleRefs: [...input.temporalSampleRefs],
        rubric: structuredClone(rubric),
      }
      const response = await critic.judge(request)
      validateResponse(response)
      return structuredClone(response)
    }

    const initial = await Promise.all(this.critics.map(async (critic) => ({
      critic,
      response: await judge(critic, 1),
    })))
    const runs: CriticRun[] = await Promise.all(initial.map(async ({ critic, response }) => {
      const isBorderline = Object.entries(response.dimensionScores).some(([dimension, score]) => {
        const floor = thresholds.ASSURANCE.FLOORS[dimension as AssuranceDimension]
        return score !== undefined && Math.abs(score - floor) <= thresholds.ASSURANCE.BORDERLINE_BAND
      })
      if (!isBorderline) return { critic, responses: [response] }
      const reruns = await Promise.all([judge(critic, 2), judge(critic, 3)])
      return { critic, responses: [response, ...reruns] }
    }))

    const criticEvidence: CriticDimensionEvidence[] = []
    for (const run of runs) {
      for (const dimension of DIMENSIONS) {
        const samples = run.responses.flatMap((response) => {
          const score = response.dimensionScores[dimension]
          return score === undefined ? [] : [score]
        })
        if (samples.length === 0) continue
        criticEvidence.push({
          criticCode: run.critic.code,
          dimension,
          samples,
          median: median(samples),
          variance: variance(samples),
          evidenceR2Keys: run.responses.map((response) => response.evidenceR2Key),
        })
      }
    }

    const highVariance = criticEvidence.filter((evidence) =>
      evidence.variance > thresholds.ASSURANCE.MAX_VARIANCE)
    if (highVariance.length > 0) {
      return {
        ...blockedResult(input, highVariance.map((evidence) =>
          `CRITIC_REQUALIFICATION_REQUIRED:${evidence.criticCode}:${evidence.dimension}`)),
        providerCallCount,
        criticEvidence,
      }
    }

    const dimensionScores: Partial<Record<AssuranceDimension, number>> = {}
    const missingCoverage: string[] = []
    for (const dimension of DIMENSIONS) {
      const values = criticEvidence
        .filter((evidence) => evidence.dimension === dimension)
        .map((evidence) => evidence.median)
      if (values.length === 0) missingCoverage.push(`DIMENSION_NOT_COVERED:${dimension}`)
      else dimensionScores[dimension] = median(values)
    }
    if (missingCoverage.length > 0) {
      return {
        ...blockedResult(input, missingCoverage),
        providerCallCount,
        criticEvidence,
      }
    }

    const p0Count = Math.max(...runs.flatMap((run) => run.responses.map((item) => item.p0Count)))
    const criticalP1Count = Math.max(...runs.flatMap((run) =>
      run.responses.map((item) => item.criticalP1Count)))
    const borderlineDimensions = DIMENSIONS.filter((dimension) => {
      const score = dimensionScores[dimension]
      return score !== undefined
        && Math.abs(score - thresholds.ASSURANCE.FLOORS[dimension]) <= thresholds.ASSURANCE.BORDERLINE_BAND
    })
    const belowFloor = DIMENSIONS.some((dimension) => {
      const score = dimensionScores[dimension]
      return score === undefined || score < thresholds.ASSURANCE.FLOORS[dimension]
    })
    const verdict = p0Count > thresholds.ASSURANCE.P0_MAX
      || criticalP1Count > thresholds.ASSURANCE.CRITICAL_P1_MAX
      || belowFloor ? 'FAIL' : 'PASS'
    const gateState: Extract<GateState, 'PASS' | 'FAIL' | 'NOT_EVALUATED'> =
      input.mode === 'WARNING_ONLY' ? 'NOT_EVALUATED' : verdict

    return {
      runId: input.runId,
      mode: input.mode,
      gateState,
      verdict,
      providerCallCount,
      blockers: input.mode === 'WARNING_ONLY' ? ['M2_WARNING_ONLY_NOT_A_RELEASE_GATE'] : [],
      dimensionScores,
      borderlineDimensions,
      criticEvidence,
      p0Count,
      criticalP1Count,
    }
  }
}

export function gatePrerequisites(states: readonly GateState[]): readonly {
  readonly gateCode: string
  readonly tier: 'M0' | 'M1'
  readonly state: GateState
}[] {
  return states.map((state, index) => ({
    gateCode: `PREREQUISITE_${index + 1}`,
    tier: index === 0 ? 'M0' : 'M1',
    state,
  }))
}
