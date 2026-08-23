import { describe, expect, test } from 'vitest'
import {
  auditNumbers,
  lintPackagingAgainstScript,
  lintRouteDiversity,
  lintScript,
  lintStory,
  sealCreativeContract,
  sealPrediction,
  stage04TournamentSettings,
  type Beat,
  type CreativeRoute,
  type PackagingContract,
} from '../src/index.js'

const routes: readonly CreativeRoute[] = [
  {
    id: 'route-1',
    hookType: 'cold_open_anomaly',
    narrativeDevice: 'mechanism_teardown',
    premise: 'A payment appears complete before settlement is final.',
  },
  {
    id: 'route-2',
    hookType: 'direct_question',
    narrativeDevice: 'mystery_reveal',
    premise: 'Where does money wait between authorization and settlement?',
  },
  {
    id: 'route-3',
    hookType: 'visual_reveal',
    narrativeDevice: 'comparison',
    premise: 'Two identical payments travel through different hidden systems.',
  },
  {
    id: 'route-4',
    hookType: 'counterintuitive_claim',
    narrativeDevice: 'case_study',
    premise: 'The fastest payment can carry the longest operational tail.',
  },
]

const packaging: PackagingContract = {
  titleCandidates: [
    'The Hidden Delay After You Tap Pay',
    'Where Your Money Waits After Payment',
  ],
  thumbnailConcept: 'A payment split across authorization, clearing and settlement lanes.',
  viewerPromise: 'Explain why a completed payment can remain financially unfinished.',
  viewerPromiseClaimIds: ['claim-settlement-finality'],
}

const beats: readonly Beat[] = [
  {
    id: 'beat-hook',
    tStartSec: 0,
    tEndSec: 15,
    beatType: 'HOOK',
    knowledgeBefore: [],
    knowledgeAfter: ['A payment confirmation is not final settlement.'],
    expectationDelta: 'The familiar payment moment becomes unresolved.',
    claimIds: ['claim-settlement-finality'],
    loopOpened: 'loop-finality',
    loopClosed: null,
    visualIntent: 'Split the visible checkout from the hidden ledger.',
    prosodyIntent: 'Controlled urgency.',
    newEntities: ['settlement'],
  },
  {
    id: 'beat-promise',
    tStartSec: 15,
    tEndSec: 30,
    beatType: 'PROMISE',
    knowledgeBefore: ['A payment confirmation is not final settlement.'],
    knowledgeAfter: ['The episode will trace authorization, clearing and settlement.'],
    expectationDelta: 'The viewer receives a concrete explanatory map.',
    claimIds: ['claim-payment-rails'],
    loopOpened: null,
    loopClosed: null,
    visualIntent: 'Reveal the three-stage route.',
    prosodyIntent: 'Orienting and precise.',
    newEntities: ['authorization'],
  },
  {
    id: 'beat-mechanism',
    tStartSec: 30,
    tEndSec: 180,
    beatType: 'MECHANISM',
    knowledgeBefore: ['The episode will trace authorization, clearing and settlement.'],
    knowledgeAfter: ['Authorization reserves capacity while settlement transfers value.'],
    expectationDelta: 'The apparent single event becomes a state machine.',
    claimIds: ['claim-authorization', 'claim-settlement-finality'],
    loopOpened: null,
    loopClosed: 'loop-finality',
    visualIntent: 'Animate the transaction state machine.',
    prosodyIntent: 'Measured mechanism explanation.',
    newEntities: ['clearing'],
  },
  {
    id: 'beat-rehook',
    tStartSec: 240,
    tEndSec: 270,
    beatType: 'MIDPOINT_REHOOK',
    knowledgeBefore: ['Authorization reserves capacity while settlement transfers value.'],
    knowledgeAfter: ['Failure can occur after the customer experience appears complete.'],
    expectationDelta: 'A hidden operational consequence reopens attention.',
    claimIds: ['claim-settlement-risk'],
    loopOpened: null,
    loopClosed: null,
    visualIntent: 'Reverse a completed status into a pending ledger.',
    prosodyIntent: 'Short escalation.',
    newEntities: ['reconciliation'],
  },
  {
    id: 'beat-payoff',
    tStartSec: 400,
    tEndSec: 480,
    beatType: 'PAYOFF',
    knowledgeBefore: ['Failure can occur after the customer experience appears complete.'],
    knowledgeAfter: ['The viewer can distinguish user confirmation from financial finality.'],
    expectationDelta: 'The original anomaly resolves into a reusable mental model.',
    claimIds: ['claim-settlement-finality'],
    loopOpened: null,
    loopClosed: null,
    visualIntent: 'Unify the route into a final state diagram.',
    prosodyIntent: 'Calm resolution.',
    newEntities: [],
  },
]

const oneSyllableLexicon = (text: string): Readonly<Record<string, string>> => Object.fromEntries(
  [...new Set(text.toLowerCase().match(/[a-z]+/gu) ?? [])].map((token) => [token, 'W AH1 N']),
)

describe('WP-18 creative layer', () => {
  test('fails four FULL routes that duplicate a hook × device pair', () => {
    const duplicated = routes.map((route, index) => index === 3
      ? { ...route, hookType: routes[0]!.hookType, narrativeDevice: routes[0]!.narrativeDevice }
      : route)
    expect(lintRouteDiversity(duplicated, 'FULL')).toEqual({
      valid: false,
      failures: ['DUPLICATE_HOOK_DEVICE:cold_open_anomaly:mechanism_teardown'],
    })
  })

  test('reads route width from REDUCED and seals packaging with the creative contract', () => {
    expect(stage04TournamentSettings('REDUCED')).toEqual({
      routeCount: 2,
      criticCount: 3,
      championMinScore: 95,
    })
    const contract = sealCreativeContract({
      profile: 'REDUCED',
      routes: routes.slice(0, 2),
      championRouteId: 'route-1',
      championScore: 95,
      rejectedRoutes: [{ routeId: 'route-2', reason: 'Less direct mechanism payoff.' }],
      packaging,
    })
    expect(contract.profile).toBe('REDUCED')
    expect(contract.routes).toHaveLength(2)
    expect(contract.packaging.viewerPromise).toBe(packaging.viewerPromise)
    expect(contract.canonicalHash).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('fails a beat whose knowledge state does not change', () => {
    const invalid = beats.map((beat, index) => index === 2
      ? { ...beat, knowledgeAfter: beat.knowledgeBefore }
      : beat)
    expect(lintStory(invalid).failures).toContain('KNOWLEDGE_STATE_UNCHANGED:beat-mechanism')
  })

  test('closes curiosity loops and enforces the story clock', () => {
    expect(lintStory(beats)).toEqual({ valid: true, failures: [] })
    const unclosed = beats.map((beat) => beat.id === 'beat-mechanism'
      ? { ...beat, loopClosed: null }
      : beat)
    expect(lintStory(unclosed).failures).toContain('UNCLOSED_LOOP:loop-finality')
  })

  test('seals a deterministic v0-flat prediction before publication', () => {
    const prediction = sealPrediction({
      beats,
      weights: {
        stateStaleness: 0.08,
        entityDensity: 0.04,
        openLoopDistance: 0.06,
        archetypeStaleness: 0.03,
      },
      ctrEstimate: 0.07,
    })
    expect(prediction.modelVersion).toBe('v0-flat')
    expect(prediction.baselineSource).toBe('flat')
    expect(prediction.retentionCurve).toHaveLength(21)
    expect(prediction.canonicalHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(prediction.beatRisk.every((item) => item.risk >= 0)).toBe(true)
  })

  test('uses ARPAbet syllables for pace and rejects advice deterministically', () => {
    const text = [
      'Hidden payment rails move funds through many linked banks each night alone.',
      'Each bank records a promise before final value crosses the network today.',
      'That gap explains why a finished payment can still remain pending here.',
    ].join(' ')
    expect(lintScript({
      sections: [{ id: 'hook', kind: 'HOOK', text, durationSec: 10, claimIds: ['claim-settlement-finality'] }],
      arpabetLexicon: oneSyllableLexicon(text),
      numericClaims: [],
      numberBindings: [],
    })).toEqual({ valid: true, failures: [], warnings: [] })

    const unsafe = text.replace('Hidden payment rails', 'You should buy shares because payment rails')
    expect(lintScript({
      sections: [{ id: 'hook', kind: 'HOOK', text: unsafe, durationSec: 10, claimIds: ['claim-settlement-finality'] }],
      arpabetLexicon: oneSyllableLexicon(unsafe),
      numericClaims: [],
      numberBindings: [],
    }).failures).toContain('ADVICE_LINT:DIRECT_ADVICE')
  })

  test('requires every parsed number to match a numeric claim and as-of evidence', () => {
    const input = {
      sections: [{ id: 'mechanism', text: 'Settlement volume rose 40 percent.' }],
      numericClaims: [{
        claimId: 'claim-volume',
        value: 40,
        unit: 'PERCENT' as const,
        currency: null,
        asOfDate: '2026-06-30',
      }],
      numberBindings: [{
        sectionId: 'mechanism',
        numberIndex: 0,
        claimId: 'claim-volume',
        asOfEvidence: 'ONSCREEN' as const,
      }],
    }
    expect(auditNumbers(input)).toEqual({ valid: true, failures: [] })
    expect(auditNumbers({ ...input, numberBindings: [] }).failures).toContain(
      'NUMBER_UNBOUND:mechanism:0:40 percent',
    )
  })

  test('keeps the packaging promise structurally bound to the script and anti-copy evidence', () => {
    expect(lintPackagingAgainstScript(packaging, ['claim-settlement-finality'], [0.21, 0.34])).toEqual({
      valid: true,
      failures: [],
    })
    expect(lintPackagingAgainstScript(packaging, [], [0.21]).failures).toContain(
      'VIEWER_PROMISE_CLAIM_MISSING:claim-settlement-finality',
    )
  })
})
