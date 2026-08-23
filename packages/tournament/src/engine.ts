import { thresholds } from '@youtube-ai-factory/contracts'
import type {
  BlindCandidate,
  BlindCandidateScore,
  BlindJudgeInput,
  Candidate,
  CriticCode,
  EligibilityResult,
  Hex64,
  PreservedTournamentCandidate,
  RubricCriterion,
  TournamentEngineConfig,
  TournamentEvidenceBundle,
  TournamentJudge,
  TournamentSelectionInput,
  TournamentSelectionPort,
} from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

export type TournamentErrorCode =
  | 'PROFILE_CONTEXT_MISMATCH'
  | 'PROFILE_WIDTH_MISMATCH'
  | 'PROFILE_CRITIC_COUNT_MISMATCH'
  | 'INVALID_CANDIDATE_SET'
  | 'INVALID_GENERATION_SETTINGS'
  | 'GENERATOR_JUDGE_NOT_INDEPENDENT'
  | 'DUPLICATE_CRITIC'
  | 'RUBRIC_NOT_ANCHORED'
  | 'NO_ELIGIBLE_CANDIDATES'
  | 'JUDGE_OUTPUT_INVALID'
  | 'JUDGE_EVIDENCE_MISSING'
  | 'NO_CHAMPION_ABOVE_THRESHOLD'
  | 'EVIDENCE_PRESERVATION_FAILED'

export class TournamentError extends Error {
  override readonly name = 'TournamentError'

  constructor(
    readonly code: TournamentErrorCode,
    readonly failures: readonly string[],
    options?: ErrorOptions,
  ) {
    super(`${code}: ${failures.join('; ')}`, options)
  }
}

interface EligibleCandidate<Out> {
  readonly candidate: Candidate<Out>
  readonly eligibility: Extract<EligibilityResult, { readonly eligible: true }>
}

interface JudgeCall<Out> {
  readonly judge: TournamentJudge<Out>
  readonly request: BlindJudgeInput<Out>
  readonly byBlindId: ReadonlyMap<string, Candidate<Out>>
}

interface EvaluatedCandidate<Out> {
  readonly candidate: Candidate<Out>
  readonly eligibility: EligibilityResult
  readonly aggregateScore: number | null
  readonly criticScores: Readonly<Partial<Record<CriticCode, number>>>
}

function tournamentError(
  code: TournamentErrorCode,
  ...failures: readonly string[]
): never {
  throw new TournamentError(code, failures)
}

function hasText(value: string): boolean {
  return value.trim().length > 0
}

function isFiniteScore(value: number): boolean {
  return Number.isFinite(value)
    && value >= thresholds.CREATIVE.JUDGE_SCORE.min
    && value <= thresholds.CREATIVE.JUDGE_SCORE.max
}

function cloneValue<Value>(value: Value): Value {
  try {
    return structuredClone(value)
  } catch (error: unknown) {
    throw new TournamentError(
      'INVALID_CANDIDATE_SET',
      ['Candidate values must be structured-cloneable for blind judging.'],
      { cause: error },
    )
  }
}

function average(values: readonly number[]): number {
  if (values.length === 0) tournamentError('JUDGE_OUTPUT_INVALID', 'Cannot average an empty score set.')
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export class TournamentEngine<Out> implements TournamentSelectionPort<Out> {
  constructor(private readonly config: TournamentEngineConfig<Out>) {}

  async select(input: TournamentSelectionInput<Out>): Promise<Candidate<Out>> {
    this.validateConfiguration(input)
    const tournamentHash = this.tournamentHash(input)
    const eligibility = await this.evaluateEligibility(input)
    const eligible = eligibility.filter((item): item is EligibleCandidate<Out> => item.eligibility.eligible)

    if (eligible.length === 0) {
      await this.preserve(tournamentHash, input, eligibility.map((item) => ({
        candidate: item.candidate,
        eligibility: item.eligibility,
        aggregateScore: null,
        criticScores: {},
      })), [], undefined)
      tournamentError('NO_ELIGIBLE_CANDIDATES', 'Eligibility filter rejected every candidate.')
    }

    const calls = this.config.judges.map((judge, criticOrdinal) => (
      this.createJudgeCall(judge, criticOrdinal, eligible)
    ))
    const results = await Promise.all(calls.map(async (call) => ({
      call,
      result: await call.judge.judge(call.request),
    })))

    const scoreByLineage = new Map<Hex64, Partial<Record<CriticCode, number>>>()
    const judgeEvidenceHashes: Hex64[] = []
    for (const { call, result } of results) {
      if (result.evidenceHashes.length === 0) {
        tournamentError('JUDGE_EVIDENCE_MISSING', `${call.judge.criticCode} returned no evidence hash.`)
      }
      judgeEvidenceHashes.push(...result.evidenceHashes)
      const criticScores = this.validateJudgeResult(call, result.scores)
      for (const [lineageHash, score] of criticScores) {
        const current = scoreByLineage.get(lineageHash) ?? {}
        current[call.judge.criticCode] = score
        scoreByLineage.set(lineageHash, current)
      }
    }

    const evaluated: EvaluatedCandidate<Out>[] = eligibility.map((item) => {
      if (!item.eligibility.eligible) {
        return {
          candidate: item.candidate,
          eligibility: item.eligibility,
          aggregateScore: null,
          criticScores: {},
        }
      }
      const criticScores = scoreByLineage.get(item.candidate.lineageHash) ?? {}
      const scores = this.config.judges.map((judge) => criticScores[judge.criticCode])
      if (scores.some((score) => score === undefined)) {
        tournamentError('JUDGE_OUTPUT_INVALID', 'An eligible candidate is missing a critic score.')
      }
      return {
        candidate: item.candidate,
        eligibility: item.eligibility,
        aggregateScore: average(scores.filter((score): score is number => score !== undefined)),
        criticScores,
      }
    })

    const champion = this.chooseChampion(evaluated)
    await this.preserve(tournamentHash, input, evaluated, judgeEvidenceHashes, champion)
    if (champion === undefined) {
      tournamentError(
        'NO_CHAMPION_ABOVE_THRESHOLD',
        `No candidate reached CREATIVE.CHAMPION_MIN_SCORE=${thresholds.CREATIVE.CHAMPION_MIN_SCORE}.`,
      )
    }
    return champion
  }

  private validateConfiguration(input: TournamentSelectionInput<Out>): void {
    const profile = thresholds.PROFILE[input.context.profile]
    if (input.context.profileSettings !== profile) {
      tournamentError('PROFILE_CONTEXT_MISMATCH', 'RunContext profile settings are not the SSOT PROFILE object.')
    }
    if (input.candidates.length !== profile[this.config.widthKey]) {
      tournamentError(
        'PROFILE_WIDTH_MISMATCH',
        `Expected ${profile[this.config.widthKey]} candidates for ${this.config.widthKey}; received ${input.candidates.length}.`,
      )
    }
    if (this.config.judges.length !== profile[this.config.criticCountKey]) {
      tournamentError(
        'PROFILE_CRITIC_COUNT_MISMATCH',
        `Expected ${profile[this.config.criticCountKey]} critics for ${this.config.criticCountKey}; received ${this.config.judges.length}.`,
      )
    }
    if (
      !Number.isFinite(this.config.generation.temperature)
      || this.config.generation.temperature < thresholds.CREATIVE.GENERATE_TEMPERATURE.min
      || this.config.generation.temperature > thresholds.CREATIVE.GENERATE_TEMPERATURE.max
    ) {
      tournamentError('INVALID_GENERATION_SETTINGS', 'Generation temperature is outside the contract range.')
    }
    const criticCodes = new Set<CriticCode>()
    for (const judge of this.config.judges) {
      if (judge.systemPromptHash === this.config.generation.systemPromptHash) {
        tournamentError(
          'GENERATOR_JUDGE_NOT_INDEPENDENT',
          `${judge.criticCode} reuses the generation system prompt hash.`,
        )
      }
      if (criticCodes.has(judge.criticCode)) {
        tournamentError('DUPLICATE_CRITIC', `Critic ${judge.criticCode} appears more than once.`)
      }
      criticCodes.add(judge.criticCode)
    }
    if (this.config.rubric.length === 0) {
      tournamentError('RUBRIC_NOT_ANCHORED', 'Rubric must contain at least one criterion.')
    }
    const criterionCodes = new Set<string>()
    for (const criterion of this.config.rubric) {
      if (
        !hasText(criterion.code)
        || !hasText(criterion.description)
        || !hasText(criterion.anchors.fail)
        || !hasText(criterion.anchors.borderline)
        || !hasText(criterion.anchors.pass)
      ) {
        tournamentError('RUBRIC_NOT_ANCHORED', 'Every criterion requires fail, borderline and pass anchors.')
      }
      if (criterionCodes.has(criterion.code)) {
        tournamentError('RUBRIC_NOT_ANCHORED', `Rubric criterion ${criterion.code} is duplicated.`)
      }
      criterionCodes.add(criterion.code)
    }
    const ordinals = new Set<number>()
    const lineageHashes = new Set<Hex64>()
    for (const candidate of input.candidates) {
      if (!Number.isInteger(candidate.candidateOrdinal) || candidate.candidateOrdinal < 1) {
        tournamentError('INVALID_CANDIDATE_SET', 'Candidate ordinals must be positive integers.')
      }
      if (ordinals.has(candidate.candidateOrdinal) || lineageHashes.has(candidate.lineageHash)) {
        tournamentError('INVALID_CANDIDATE_SET', 'Candidate ordinal and lineage hash must both be unique.')
      }
      ordinals.add(candidate.candidateOrdinal)
      lineageHashes.add(candidate.lineageHash)
    }
  }

  private async evaluateEligibility(input: TournamentSelectionInput<Out>): Promise<readonly {
    readonly candidate: Candidate<Out>
    readonly eligibility: EligibilityResult
  }[]> {
    return Promise.all(input.candidates.map(async (candidate) => ({
      candidate,
      eligibility: await this.config.eligibility.evaluate({
        candidate,
        acceptanceTests: input.acceptanceTests(candidate.value),
      }),
    })))
  }

  private createJudgeCall(
    judge: TournamentJudge<Out>,
    criticOrdinal: number,
    eligible: readonly EligibleCandidate<Out>[],
  ): JudgeCall<Out> {
    const ordered = [...eligible].sort((left, right) => {
      const leftRank = canonicalHash({
        critic_ordinal: criticOrdinal,
        lineage_hash: left.candidate.lineageHash,
        seed: this.config.seed,
      })
      const rightRank = canonicalHash({
        critic_ordinal: criticOrdinal,
        lineage_hash: right.candidate.lineageHash,
        seed: this.config.seed,
      })
      return leftRank.localeCompare(rightRank)
    })
    const byBlindId = new Map<string, Candidate<Out>>()
    const candidates: BlindCandidate<Out>[] = ordered.map((item, index) => {
      const blindId = `candidate-${index + 1}`
      byBlindId.set(blindId, item.candidate)
      return { blindId, value: cloneValue(item.candidate.value) }
    })
    return {
      judge,
      byBlindId,
      request: {
        seed: this.config.seed,
        temperature: thresholds.CREATIVE.JUDGE_TEMPERATURE,
        rubric: this.config.rubric.map((criterion) => ({
          code: criterion.code,
          description: criterion.description,
          anchors: { ...criterion.anchors },
        })),
        candidates,
      },
    }
  }

  private validateJudgeResult(
    call: JudgeCall<Out>,
    scores: readonly BlindCandidateScore[],
  ): ReadonlyMap<Hex64, number> {
    if (scores.length !== call.byBlindId.size) {
      tournamentError(
        'JUDGE_OUTPUT_INVALID',
        `${call.judge.criticCode} returned ${scores.length} scores for ${call.byBlindId.size} blind candidates.`,
      )
    }
    const criterionCodes = this.config.rubric.map((criterion) => criterion.code)
    const seen = new Set<string>()
    const result = new Map<Hex64, number>()
    for (const score of scores) {
      const candidate = call.byBlindId.get(score.blindId)
      if (candidate === undefined || seen.has(score.blindId)) {
        tournamentError('JUDGE_OUTPUT_INVALID', 'Judge returned an unknown or duplicate blind candidate ID.')
      }
      seen.add(score.blindId)
      const returnedCodes = Object.keys(score.criterionScores).sort()
      const expectedCodes = [...criterionCodes].sort()
      if (
        returnedCodes.length !== expectedCodes.length
        || returnedCodes.some((code, index) => code !== expectedCodes[index])
      ) {
        tournamentError('JUDGE_OUTPUT_INVALID', 'Judge must score every rubric criterion exactly once.')
      }
      const criterionScores = expectedCodes.map((code) => score.criterionScores[code])
      if (criterionScores.some((value) => value === undefined || !isFiniteScore(value))) {
        tournamentError('JUDGE_OUTPUT_INVALID', 'Judge scores must be finite values on the anchored 0–100 scale.')
      }
      result.set(
        candidate.lineageHash,
        average(criterionScores.filter((score): score is number => score !== undefined)),
      )
    }
    return result
  }

  private chooseChampion(evaluated: readonly EvaluatedCandidate<Out>[]): Candidate<Out> | undefined {
    const passing = evaluated.filter((item): item is EvaluatedCandidate<Out> & { readonly aggregateScore: number } => (
      item.aggregateScore !== null
      && item.aggregateScore >= thresholds.CREATIVE.CHAMPION_MIN_SCORE
    ))
    passing.sort((left, right) => {
      if (right.aggregateScore !== left.aggregateScore) return right.aggregateScore - left.aggregateScore
      const leftRank = canonicalHash({ lineage_hash: left.candidate.lineageHash, seed: this.config.seed })
      const rightRank = canonicalHash({ lineage_hash: right.candidate.lineageHash, seed: this.config.seed })
      return leftRank.localeCompare(rightRank)
    })
    return passing[0]?.candidate
  }

  private tournamentHash(input: TournamentSelectionInput<Out>): Hex64 {
    return canonicalHash({
      candidates: input.candidates.map((candidate) => ({
        candidate_ordinal: candidate.candidateOrdinal,
        lineage_hash: candidate.lineageHash,
      })),
      critic_codes: this.config.judges.map((judge) => judge.criticCode),
      critic_count_key: this.config.criticCountKey,
      generation_prompt_hash: this.config.generation.systemPromptHash,
      profile: input.context.profile,
      rubric: this.config.rubric,
      seed: this.config.seed,
      width_key: this.config.widthKey,
    })
  }

  private async preserve(
    tournamentHash: Hex64,
    input: TournamentSelectionInput<Out>,
    evaluated: readonly EvaluatedCandidate<Out>[],
    judgeEvidenceHashes: readonly Hex64[],
    champion: Candidate<Out> | undefined,
  ): Promise<void> {
    const candidates: PreservedTournamentCandidate<Out>[] = evaluated.map((item) => ({
      candidate: item.candidate,
      status: !item.eligibility.eligible
        ? 'INELIGIBLE'
        : champion?.lineageHash === item.candidate.lineageHash
          ? 'CHAMPION'
          : 'REJECTED',
      aggregateScore: item.aggregateScore,
      criticScores: item.criticScores,
      eligibility: item.eligibility,
    }))
    const bundle: TournamentEvidenceBundle<Out> = {
      tournamentHash,
      seed: this.config.seed,
      profile: input.context.profile,
      widthKey: this.config.widthKey,
      criticCountKey: this.config.criticCountKey,
      candidates,
      judgeEvidenceHashes,
    }
    try {
      await this.config.evidence.preserve(bundle)
    } catch (error: unknown) {
      throw new TournamentError(
        'EVIDENCE_PRESERVATION_FAILED',
        ['Tournament evidence could not be preserved.'],
        { cause: error },
      )
    }
  }
}
