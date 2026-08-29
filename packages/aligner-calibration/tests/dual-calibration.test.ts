import { describe, expect, test } from 'vitest'

import { calibrateAligner } from '../src/calibrator.js'
import { validateProductionVoice } from '../src/production-validation.js'

const hash = (index: number) => index.toString(16).padStart(64, '0')
const reference = ['F', 'AY', 'N', 'AE', 'N', 'S']

const humanSamples = Array.from({ length: 10 }, (_, index) => ({
  id: `human-${index}`,
  provenance: 'licensed_human_corpus' as const,
  speakerId: `speaker-${index}`,
  audioSha256: hash(index + 1),
  transcript: 'Finance',
  referencePhonemes: reference,
  observedPhonemes: reference,
  durationSec: 1,
}))

const productionSamples = Array.from({ length: 10 }, (_, index) => ({
  id: `tts-${index}`,
  provenance: 'qualified_tts_validation' as const,
  voiceId: 'KXyrWqXTuK63FlJ9XZ33',
  modelId: 'eleven_multilingual_v2',
  audioSha256: hash(index + 100),
  transcript: 'Finance',
  referencePhonemes: reference,
  observedPhonemes: reference,
  durationSec: 1,
  domainTags: ['FINANCIAL_TERM'] as const,
}))

describe('G-02G dual calibration', () => {
  test('allows licensed human corpus samples to establish the independent error floor', () => {
    const result = calibrateAligner(humanSamples, { finance: reference })
    expect(result).toMatchObject({ calibrated: true, errorFloor: 0, threshold: 0.01 })
  })

  test('prevents qualified TTS output from self-calibrating its own threshold', () => {
    const result = calibrateAligner(productionSamples, { finance: reference })
    expect(result).toMatchObject({ calibrated: false, gateEvaluated: false })
    if (result.calibrated) return
    expect(result.failures).toContain('ALIGNER_SAMPLE_INVALID')
  })

  test('validates the registered production voice only after independent calibration', () => {
    const calibration = calibrateAligner(humanSamples, { finance: reference })
    const result = validateProductionVoice({
      samples: productionSamples,
      independentCalibration: calibration,
      expectedVoiceId: 'KXyrWqXTuK63FlJ9XZ33',
      expectedModelId: 'eleven_multilingual_v2',
    })
    expect(result).toMatchObject({ evaluated: true, passed: true, aggregatePhonemeErrorRate: 0 })
  })

  test('fails closed without independent calibration and on a mismatched voice', () => {
    const noCalibration = calibrateAligner([], {})
    const blocked = validateProductionVoice({
      samples: productionSamples,
      independentCalibration: noCalibration,
      expectedVoiceId: 'KXyrWqXTuK63FlJ9XZ33',
      expectedModelId: 'eleven_multilingual_v2',
    })
    expect(blocked.failures).toContain('INDEPENDENT_HUMAN_CALIBRATION_REQUIRED')

    const calibration = calibrateAligner(humanSamples, { finance: reference })
    const mismatched = validateProductionVoice({
      samples: productionSamples,
      independentCalibration: calibration,
      expectedVoiceId: 'different-voice',
      expectedModelId: 'eleven_multilingual_v2',
    })
    expect(mismatched.failures).toContain('PRODUCTION_VOICE_ID_MISMATCH')
  })
})
