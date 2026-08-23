import { describe, expect, test } from 'vitest'
import { calibrateAligner, phonemeEditDistance } from '../src/index.js'

const sample = (index: number, observed: readonly string[]) => ({
  id: `sample-${index}`,
  provenance: 'human_reader' as const,
  speakerId: 'reader-1',
  audioSha256: index.toString(16).padStart(64, '0'),
  transcript: 'The system moves money.',
  referencePhonemes: ['DH', 'AH', 'S', 'IH', 'S', 'T', 'AH', 'M'],
  observedPhonemes: observed,
  durationSec: 60,
})

describe('WP-15 forced-aligner calibration harness', () => {
  test('computes phoneme edit distance deterministically', () => {
    expect(phonemeEditDistance(['A', 'B', 'C'], ['A', 'X', 'C'])).toBe(1)
    expect(phonemeEditDistance(['A', 'B'], ['A', 'B', 'C'])).toBe(1)
  })

  test('remains uncalibrated and warning-only with fewer than ten real samples', () => {
    const result = calibrateAligner([sample(1, ['DH'])], {})
    expect(result).toEqual({
      calibrated: false,
      gateEvaluated: false,
      errorFloor: null,
      threshold: null,
      failures: ['ALIGNER_MIN_REAL_SAMPLES'],
    })
  })

  test('rejects synthetic or duplicate-audio evidence', () => {
    const inputs = Array.from({ length: 10 }, (_, index) => sample(index + 1, ['DH', 'AH']))
    inputs[0] = { ...inputs[0]!, provenance: 'human_reader' }
    inputs[1] = { ...inputs[1]!, audioSha256: inputs[0]!.audioSha256 }
    expect(calibrateAligner(inputs, {}).calibrated).toBe(false)
    expect(calibrateAligner([{ ...inputs[0], provenance: 'synthetic' }], {}).calibrated).toBe(false)
  })

  test('measures a micro-averaged error floor and threshold from ten unique samples', () => {
    const inputs = Array.from({ length: 10 }, (_, index) =>
      sample(index + 1, index === 0
        ? ['DH', 'AH', 'X', 'IH', 'S', 'T', 'AH', 'M']
        : ['DH', 'AH', 'S', 'IH', 'S', 'T', 'AH', 'M']))
    const result = calibrateAligner(inputs, { EBITDA: ['IY', 'B', 'IH', 'T', 'D', 'AH'] })
    expect(result.calibrated).toBe(true)
    if (!result.calibrated) return
    expect(result.errorFloor).toBe(0.0125)
    expect(result.threshold).toBe(0.025)
    expect(result.alignerPins).toEqual({ whisperX: '3.4.2', montrealForcedAligner: '3.3.8' })
    expect(result.lexiconHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
