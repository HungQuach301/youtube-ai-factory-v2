import type { AudioArchetype } from '@youtube-ai-factory/contracts'

export interface VoiceQualificationSample {
  readonly archetype: AudioArchetype
  readonly fileStem: string
  readonly fingerprintSource: boolean
  readonly text: string
  readonly previousText?: string
  readonly nextText?: string
}

const PLAN = [
  {
    archetype: 'high_energy_hook',
    fileStem: '01-high-energy-hook',
    fingerprintSource: true,
    text: 'At 9:17 a.m., a customer taps Pay. The screen says complete, but the money has not actually reached the merchant. Between that tap and final settlement, several institutions exchange promises, instructions, and risk. Most people never see those hidden steps. Yet they explain why balances change, why payments sometimes fail, and who carries the loss when a transaction remains unfinished. Today, we are going inside the machinery that makes modern money appear instant, even when it is not.',
  },
  {
    archetype: 'number_heavy_narration',
    fileStem: '02-number-heavy-narration',
    fingerprintSource: false,
    text: 'Imagine a payment of 2,487 dollars and 63 cents initiated at 8:42 p.m. on Friday, August 28th. The merchant may see an approval in under two seconds, while clearing occurs in a later batch and settlement may not finish until the next business window. A fee of 2.9 percent plus 30 cents changes the merchant proceeds to 2,415 dollars and 18 cents before other adjustments.',
  },
  {
    archetype: 'dense_mechanism',
    fileStem: '03-dense-mechanism',
    fingerprintSource: false,
    text: 'The visible balance is an interface state, not a bag of money moving through a pipe. The issuing bank validates the account, the network routes an authorization message, and the acquiring side returns a response. Each participant records a conditional obligation. Those records are reconciled later, when net positions are calculated and institutions exchange final funds through designated settlement accounts.',
  },
  {
    archetype: 'authorization_clearing_settlement',
    fileStem: '04-authorization-clearing-settlement',
    fingerprintSource: false,
    text: 'Authorization asks whether a transaction should be allowed. Clearing determines what each participant owes after accepted transactions are grouped and reconciled. Settlement transfers the final value between institutions. These stages can happen at different times, under different rules, with different reversal rights. Treating them as one event hides where the risk actually sits.',
  },
  {
    archetype: 'long_section_continuity',
    fileStem: '05-long-section-continuity',
    fingerprintSource: false,
    previousText: 'The first section established that a payment status can change before final value moves.',
    nextText: 'The next section follows the obligation into clearing and final settlement.',
    text: 'Now follow the same transaction across the institutional boundary. The customer sees one continuous experience, but the system breaks that experience into messages, ledger entries, risk checks, and timed obligations. A temporary approval can therefore coexist with an unsettled position. The distinction matters because every delay, exception, and reversal must be assigned to a specific participant before the system can safely continue.',
  },
  {
    archetype: 'causal_sfx_ambience',
    fileStem: '06-causal-sfx-ambience',
    fingerprintSource: false,
    text: 'A notification sound confirms the instruction, not the final movement of funds. Behind it, low operational ambience should support the explanation without masking consonants or numbers. When the route branches, the sound design may mark the decision. When the ledger updates, a restrained cue may reinforce the state change. Every effect must explain cause and consequence rather than decorate the scene.',
  },
  {
    archetype: 'music_transition',
    fileStem: '07-music-transition',
    fingerprintSource: false,
    text: 'The promise has been approved. Now the system must determine who owes what. As the explanation moves from authorization into clearing, the music should change function without competing with the narrator. The transition is a structural signal: we are leaving the customer-facing moment and entering the institutional process that resolves the obligation.',
  },
  {
    archetype: 'silence_consequence_payoff',
    fileStem: '08-silence-consequence-payoff',
    fingerprintSource: false,
    text: 'The screen said complete. The obligation was not. And for several hours, someone still carried the risk. That pause is the point. Modern money feels instantaneous because the interface hides the waiting, the reconciliation, and the institutions standing behind the promise. Once you see those layers, a simple payment never looks simple again.',
  },
] as const satisfies readonly VoiceQualificationSample[]

export function buildVoiceQualificationPlan(): readonly VoiceQualificationSample[] {
  return PLAN
}

export function qualificationCharacterCount(
  plan: readonly VoiceQualificationSample[] = PLAN,
): number {
  return plan.reduce((total, sample) => total + sample.text.length, 0)
}
