import { thresholds } from '@youtube-ai-factory/contracts'

import { phonemeEditDistance } from './calibrator.js'
import {
  ProductionVoiceValidationSampleSchema,
  type CalibrationResult,
  type ProductionVoiceValidationResult,
  type ProductionVoiceValidationSample,
  type SampleError,
} from './types.js'

export function validateProductionVoice(input: {
  readonly samples: readonly unknown[]
  readonly independentCalibration: CalibrationResult
  readonly expectedVoiceId: string
  readonly expectedModelId: string
}): ProductionVoiceValidationResult {
  const failures: string[] = []
  if (!input.independentCalibration.calibrated) failures.push('INDEPENDENT_HUMAN_CALIBRATION_REQUIRED')
  if (input.samples.length < thresholds.ALIGNER_CALIBRATION.MIN_SAMPLES) failures.push('PRODUCTION_VOICE_MIN_SAMPLES')
  if (input.samples.length > thresholds.ALIGNER_CALIBRATION.MAX_SAMPLES) failures.push('PRODUCTION_VOICE_MAX_SAMPLES')

  const samples: ProductionVoiceValidationSample[] = []
  for (const sample of input.samples) {
    const parsed = ProductionVoiceValidationSampleSchema.safeParse(sample)
    if (!parsed.success) failures.push('PRODUCTION_VOICE_SAMPLE_INVALID')
    else samples.push(parsed.data)
  }
  if (new Set(samples.map((sample) => sample.audioSha256)).size !== samples.length) {
    failures.push('PRODUCTION_VOICE_AUDIO_MUST_BE_UNIQUE')
  }
  if (samples.some((sample) => sample.voiceId !== input.expectedVoiceId)) {
    failures.push('PRODUCTION_VOICE_ID_MISMATCH')
  }
  if (samples.some((sample) => sample.modelId !== input.expectedModelId)) {
    failures.push('PRODUCTION_VOICE_MODEL_MISMATCH')
  }
  if (failures.length > 0 || !input.independentCalibration.calibrated) {
    return {
      evaluated: false,
      passed: false,
      threshold: null,
      aggregatePhonemeErrorRate: null,
      sampleErrors: [],
      failures: [...new Set(failures)],
    }
  }

  const sampleErrors: SampleError[] = samples.map((sample) => {
    const editCount = phonemeEditDistance(sample.referencePhonemes, sample.observedPhonemes)
    return {
      sampleId: sample.id,
      editCount,
      referenceCount: sample.referencePhonemes.length,
      phonemeErrorRate: editCount / sample.referencePhonemes.length,
    }
  })
  const totalEdits = sampleErrors.reduce((total, sample) => total + sample.editCount, 0)
  const totalReference = sampleErrors.reduce((total, sample) => total + sample.referenceCount, 0)
  const aggregatePhonemeErrorRate = totalEdits / totalReference
  const threshold = input.independentCalibration.threshold
  if (aggregatePhonemeErrorRate > threshold) failures.push('PRODUCTION_VOICE_AGGREGATE_THRESHOLD_EXCEEDED')
  if (sampleErrors.some((sample) => sample.phonemeErrorRate > threshold)) {
    failures.push('PRODUCTION_VOICE_SAMPLE_THRESHOLD_EXCEEDED')
  }
  return {
    evaluated: true,
    passed: failures.length === 0,
    threshold,
    aggregatePhonemeErrorRate,
    sampleErrors,
    failures,
  }
}
