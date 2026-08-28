import { describe, expect, it } from 'vitest'

import type { AudioArchetype } from '@youtube-ai-factory/contracts'

import {
  buildVoiceQualificationPlan,
  qualificationCharacterCount,
} from '../src/index.js'

const EXPECTED = new Set<AudioArchetype>([
  'high_energy_hook',
  'number_heavy_narration',
  'dense_mechanism',
  'authorization_clearing_settlement',
  'long_section_continuity',
  'causal_sfx_ambience',
  'music_transition',
  'silence_consequence_payoff',
])

describe('voice qualification plan', () => {
  it('covers every audio archetype exactly once with one fingerprint source', () => {
    const plan = buildVoiceQualificationPlan()
    expect(plan).toHaveLength(EXPECTED.size)
    expect(new Set(plan.map((sample) => sample.archetype))).toEqual(EXPECTED)
    expect(plan.filter((sample) => sample.fingerprintSource)).toHaveLength(1)
    expect(new Set(plan.map((sample) => sample.fileStem)).size).toBe(plan.length)
  })

  it('exercises request stitching context and stays inside the bounded cost plan', () => {
    const continuity = buildVoiceQualificationPlan()
      .find((sample) => sample.archetype === 'long_section_continuity')
    expect(continuity?.previousText).toBeTruthy()
    expect(continuity?.nextText).toBeTruthy()
    expect(qualificationCharacterCount()).toBeGreaterThan(1_000)
    expect((qualificationCharacterCount() * 0.1) / 1_000).toBeLessThanOrEqual(1.5)
  })
})
