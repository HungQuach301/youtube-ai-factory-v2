import type { AcceptanceTest, Candidate, RunContext } from './artifacts.js'
import type { CriticCode } from './enums.js'
import type { Hex64 } from './ids.js'
import type { PROFILE } from './thresholds.js'

export type TournamentWidthKey =
  | 'routeCount'
  | 'compositionsPerCriticalUnit'
  | 'sourceCandidates'

export type TournamentCriticCountKey =
  | 'criticCountStage04'
  | 'criticCountAssurance'

export interface CandidateSourceMetadata {
  readonly provider?: string
  readonly model?: string
  readonly systemPromptHash?: Hex64
  readonly requestId?: string
  readonly generatedAt?: string
  readonly sourceId?: string
}

export interface TournamentSelectionInput<Out> {
  readonly candidates: readonly Candidate<Out>[]
  readonly context: RunContext
  readonly acceptanceTests: (output: Out) => readonly AcceptanceTest[]
}

export interface TournamentSelectionPort<Out> {
  select(input: TournamentSelectionInput<Out>): Promise<Candidate<Out>>
}

export interface RubricAnchors {
  readonly fail: string
  readonly borderline: string
  readonly pass: string
}

export interface RubricCriterion {
  readonly code: string
  readonly description: string
  readonly anchors: RubricAnchors
}

export interface BlindCandidate<Out> {
  readonly blindId: string
  readonly value: Out
}

export interface BlindJudgeInput<Out> {
  readonly seed: string
  readonly temperature: number
  readonly rubric: readonly RubricCriterion[]
  readonly candidates: readonly BlindCandidate<Out>[]
}

export interface BlindCandidateScore {
  readonly blindId: string
  readonly criterionScores: Readonly<Record<string, number>>
}

export interface BlindJudgeResult {
  readonly scores: readonly BlindCandidateScore[]
  readonly evidenceHashes: readonly Hex64[]
}

export interface TournamentJudge<Out> {
  readonly criticCode: CriticCode
  readonly systemPromptHash: Hex64
  judge(input: BlindJudgeInput<Out>): Promise<BlindJudgeResult>
}

export type EligibilityResult =
  | { readonly eligible: true; readonly evidenceHashes: readonly Hex64[] }
  | {
      readonly eligible: false
      readonly reasons: readonly string[]
      readonly evidenceHashes: readonly Hex64[]
    }

export interface TournamentEligibilityPort<Out> {
  evaluate(input: {
    readonly candidate: Candidate<Out>
    readonly acceptanceTests: readonly AcceptanceTest[]
  }): Promise<EligibilityResult>
}

export type TournamentCandidateStatus = 'CHAMPION' | 'REJECTED' | 'INELIGIBLE'

export interface PreservedTournamentCandidate<Out> {
  readonly candidate: Candidate<Out>
  readonly status: TournamentCandidateStatus
  readonly aggregateScore: number | null
  readonly criticScores: Readonly<Partial<Record<CriticCode, number>>>
  readonly eligibility: EligibilityResult
}

export interface TournamentEvidenceBundle<Out> {
  readonly tournamentHash: Hex64
  readonly seed: string
  readonly profile: RunContext['profile']
  readonly widthKey: TournamentWidthKey
  readonly criticCountKey: TournamentCriticCountKey
  readonly candidates: readonly PreservedTournamentCandidate<Out>[]
  readonly judgeEvidenceHashes: readonly Hex64[]
}

export interface TournamentEvidencePort<Out> {
  preserve(bundle: TournamentEvidenceBundle<Out>): Promise<void>
}

export interface TournamentEngineConfig<Out> {
  readonly seed: string
  readonly widthKey: TournamentWidthKey
  readonly criticCountKey: TournamentCriticCountKey
  readonly generation: {
    readonly temperature: number
    readonly systemPromptHash: Hex64
  }
  readonly rubric: readonly RubricCriterion[]
  readonly judges: readonly TournamentJudge<Out>[]
  readonly eligibility: TournamentEligibilityPort<Out>
  readonly evidence: TournamentEvidencePort<Out>
}

export type TournamentProfileSettings = (typeof PROFILE)[keyof typeof PROFILE]
