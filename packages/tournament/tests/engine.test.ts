import { describe, expect, it } from 'vitest'

import { thresholds } from '@youtube-ai-factory/contracts'
import type {
  AcceptanceTest,
  BlindJudgeInput,
  Candidate,
  CandidateSourceMetadata,
  ChannelId,
  CriticCode,
  Hex64,
  PackageId,
  RubricCriterion,
  RunContext,
  StageInstanceId,
  TournamentCandidateStatus,
  TournamentEngineConfig,
  TournamentEvidenceBundle,
  TournamentJudge,
  TraceId,
} from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import { TournamentEngine, TournamentError } from '../src/index.js'

interface Route {
  readonly title: string
  readonly quality: number
}

const CONTEXT: RunContext = {
  packageId: 'package-11' as PackageId,
  stageInstanceId: 'stage-04' as StageInstanceId,
  traceId: 'trace-11' as TraceId,
  profile: 'REDUCED',
  profileSettings: thresholds.PROFILE.REDUCED,
}
const GENERATION_PROMPT = canonicalHash({ prompt: 'creative generator' })
const JUDGE_PROMPT = canonicalHash({ prompt: 'anchored blind judge' })
const EVIDENCE_HASH = canonicalHash({ evidence: 'judge' })
const RUBRIC: readonly RubricCriterion[] = [{
  code: 'QUALITY',
  description: 'Overall route quality.',
  anchors: {
    fail: 'Unsupported and unusable.',
    borderline: 'Plausible but incomplete.',
    pass: 'Specific, supported and production-ready.',
  },
}]

function route(
  candidateOrdinal: number,
  title: string,
  quality: number,
  sourceMetadata?: CandidateSourceMetadata,
): Candidate<Route> {
  return {
    candidateOrdinal,
    lineageHash: canonicalHash({ candidateOrdinal, title }),
    value: { title, quality },
    ...(sourceMetadata === undefined ? {} : { sourceMetadata }),
  }
}

const CANDIDATES: readonly Candidate<Route>[] = [
  route(1, 'Settlement rails', 96),
  route(2, 'Invisible queue', 99),
]

function acceptanceTests(): readonly AcceptanceTest[] {
  return [{ code: 'TITLE_PRESENT', description: 'Title is required.' }]
}

function scoringJudge(
  criticCode: CriticCode,
  seen: BlindJudgeInput<Route>[] = [],
): TournamentJudge<Route> {
  return {
    criticCode,
    systemPromptHash: JUDGE_PROMPT,
    async judge(input) {
      seen.push(input)
      return {
        scores: input.candidates.map((candidate) => ({
          blindId: candidate.blindId,
          criterionScores: { QUALITY: candidate.value.quality },
        })),
        evidenceHashes: [EVIDENCE_HASH],
      }
    },
  }
}

function fixture(overrides: Partial<TournamentEngineConfig<Route>> = {}): {
  readonly config: TournamentEngineConfig<Route>
  readonly preserved: TournamentEvidenceBundle<Route>[]
  readonly seen: BlindJudgeInput<Route>[]
} {
  const preserved: TournamentEvidenceBundle<Route>[] = []
  const seen: BlindJudgeInput<Route>[] = []
  return {
    preserved,
    seen,
    config: {
      seed: 'fixed-seed-11',
      widthKey: 'routeCount',
      criticCountKey: 'criticCountStage04',
      generation: {
        temperature: thresholds.CREATIVE.GENERATE_TEMPERATURE.min,
        systemPromptHash: GENERATION_PROMPT,
      },
      rubric: RUBRIC,
      judges: [
        scoringJudge('EXECUTIVE_PRODUCER', seen),
        scoringJudge('STORY_RETENTION', seen),
        scoringJudge('VISUAL_DIRECTION', seen),
      ],
      eligibility: {
        async evaluate() { return { eligible: true, evidenceHashes: [EVIDENCE_HASH] } },
      },
      evidence: {
        async preserve(bundle) { preserved.push(bundle) },
      },
      ...overrides,
    },
  }
}

describe('TournamentEngine', () => {
  it('selects the same champion three times with the same seed', async () => {
    const tiedCandidates = [
      route(1, 'Settlement rails', 99),
      route(2, 'Invisible queue', 99),
    ]
    const champions = []
    for (const _run of [1, 2, 3]) {
      const test = fixture()
      const champion = await new TournamentEngine(test.config).select({
        candidates: tiedCandidates,
        context: CONTEXT,
        acceptanceTests,
      })
      champions.push(champion.lineageHash)
    }

    expect(new Set(champions).size).toBe(1)
  })

  it('never exposes source metadata, lineage or generation order to a judge', async () => {
    const metadata: CandidateSourceMetadata = {
      provider: 'provider-hidden',
      model: 'model-hidden',
      systemPromptHash: GENERATION_PROMPT,
      requestId: 'request-hidden',
      generatedAt: '2026-08-23T00:00:00Z',
      sourceId: 'source-hidden',
    }
    const candidates = [
      route(1, 'Settlement rails', 96, metadata),
      route(2, 'Invisible queue', 99, metadata),
    ]
    const test = fixture()

    await new TournamentEngine(test.config).select({ candidates, context: CONTEXT, acceptanceTests })

    expect(test.seen).toHaveLength(thresholds.PROFILE.REDUCED.criticCountStage04)
    for (const input of test.seen) {
      expect(Object.keys(input).sort()).toEqual(['candidates', 'rubric', 'seed', 'temperature'])
      expect(input.seed).toBe('fixed-seed-11')
      expect(input.temperature).toBe(thresholds.CREATIVE.JUDGE_TEMPERATURE)
      for (const candidate of input.candidates) {
        expect(Object.keys(candidate).sort()).toEqual(['blindId', 'value'])
        expect(candidate).not.toHaveProperty('candidateOrdinal')
        expect(candidate).not.toHaveProperty('lineageHash')
        expect(candidate).not.toHaveProperty('sourceMetadata')
        expect(candidate).not.toHaveProperty('provider')
        expect(candidate).not.toHaveProperty('model')
      }
    }
  })

  it('filters eligibility before judging and preserves ineligible candidates', async () => {
    let judgeCalls = 0
    const test = fixture({
      eligibility: {
        async evaluate({ candidate }) {
          return candidate.candidateOrdinal === 1
            ? { eligible: false, reasons: ['rights missing'], evidenceHashes: [EVIDENCE_HASH] }
            : { eligible: true, evidenceHashes: [EVIDENCE_HASH] }
        },
      },
      judges: [
        ...(['EXECUTIVE_PRODUCER', 'STORY_RETENTION', 'VISUAL_DIRECTION'] as const).map((criticCode) => ({
          ...scoringJudge(criticCode),
          async judge(input: BlindJudgeInput<Route>) {
            judgeCalls += 1
            expect(input.candidates).toHaveLength(1)
            return {
              scores: input.candidates.map((candidate) => ({
                blindId: candidate.blindId,
                criterionScores: { QUALITY: candidate.value.quality },
              })),
              evidenceHashes: [EVIDENCE_HASH],
            }
          },
        })),
      ],
    })

    const champion = await new TournamentEngine(test.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })

    expect(champion.candidateOrdinal).toBe(2)
    expect(judgeCalls).toBe(thresholds.PROFILE.REDUCED.criticCountStage04)
    expect(test.preserved[0]?.candidates.map((item) => item.status))
      .toEqual(['INELIGIBLE', 'CHAMPION'] satisfies TournamentCandidateStatus[])
  })

  it('preserves every rejected candidate with critic evidence', async () => {
    const test = fixture()
    await new TournamentEngine(test.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })

    const bundle = test.preserved[0]
    expect(bundle?.candidates).toHaveLength(CANDIDATES.length)
    expect(bundle?.candidates.map((item) => item.status)).toEqual(['REJECTED', 'CHAMPION'])
    expect(bundle?.judgeEvidenceHashes).toHaveLength(thresholds.PROFILE.REDUCED.criticCountStage04)
    expect(bundle?.candidates[0]?.criticScores).toMatchObject({
      EXECUTIVE_PRODUCER: 96,
      STORY_RETENTION: 96,
      VISUAL_DIRECTION: 96,
    })
  })

  it('fails closed when rejected-candidate evidence cannot be preserved', async () => {
    const test = fixture({
      evidence: { async preserve() { throw new Error('evidence unavailable') } },
    })

    await expect(new TournamentEngine(test.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })).rejects.toMatchObject({ code: 'EVIDENCE_PRESERVATION_FAILED' })
  })

  it('reads candidate width and critic count from the active PROFILE', async () => {
    const wrongWidth = fixture()
    await expect(new TournamentEngine(wrongWidth.config).select({
      candidates: [CANDIDATES[0]!],
      context: CONTEXT,
      acceptanceTests,
    })).rejects.toMatchObject({ code: 'PROFILE_WIDTH_MISMATCH' })

    const wrongCritics = fixture({ judges: [scoringJudge('EXECUTIVE_PRODUCER')] })
    await expect(new TournamentEngine(wrongCritics.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })).rejects.toMatchObject({ code: 'PROFILE_CRITIC_COUNT_MISMATCH' })
  })

  it('requires independent generation and judging settings plus complete rubric anchors', async () => {
    const samePrompt = fixture({
      judges: [
        scoringJudge('EXECUTIVE_PRODUCER'),
        { ...scoringJudge('STORY_RETENTION'), systemPromptHash: GENERATION_PROMPT },
        scoringJudge('VISUAL_DIRECTION'),
      ],
    })
    await expect(new TournamentEngine(samePrompt.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })).rejects.toMatchObject({ code: 'GENERATOR_JUDGE_NOT_INDEPENDENT' })

    const missingAnchor = fixture({
      rubric: [{ ...RUBRIC[0]!, anchors: { ...RUBRIC[0]!.anchors, borderline: '' } }],
    })
    await expect(new TournamentEngine(missingAnchor.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })).rejects.toMatchObject({ code: 'RUBRIC_NOT_ANCHORED' })
  })

  it('rejects malformed judge output instead of choosing from partial scores', async () => {
    const malformed = fixture({
      judges: [
        scoringJudge('EXECUTIVE_PRODUCER'),
        {
          criticCode: 'STORY_RETENTION',
          systemPromptHash: JUDGE_PROMPT,
          async judge() { return { scores: [], evidenceHashes: [EVIDENCE_HASH] } },
        },
        scoringJudge('VISUAL_DIRECTION'),
      ],
    })

    await expect(new TournamentEngine(malformed.config).select({
      candidates: CANDIDATES,
      context: CONTEXT,
      acceptanceTests,
    })).rejects.toBeInstanceOf(TournamentError)
    expect(malformed.preserved).toHaveLength(0)
  })
})
