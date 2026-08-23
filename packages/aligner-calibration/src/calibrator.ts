import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import {
  ALIGNER_PINS,
  CalibrationSampleSchema,
  type CalibrationResult,
  type CalibrationSample,
  type SampleError,
} from './types.js'

export const phonemeEditDistance = (reference: readonly string[], observed: readonly string[]): number => {
  const previous = Array.from({ length: observed.length + 1 }, (_, index) => index)
  for (let referenceIndex = 1; referenceIndex <= reference.length; referenceIndex += 1) {
    const current = [referenceIndex]
    for (let observedIndex = 1; observedIndex <= observed.length; observedIndex += 1) {
      const substitution = previous[observedIndex - 1]
      const deletion = previous[observedIndex]
      const insertion = current[observedIndex - 1]
      if (substitution === undefined || deletion === undefined || insertion === undefined) {
        throw new Error('ALIGNER_MATRIX_BOUNDS')
      }
      current[observedIndex] = reference[referenceIndex - 1] === observed[observedIndex - 1]
        ? substitution
        : Math.min(substitution + 1, deletion + 1, insertion + 1)
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[observed.length] ?? reference.length
}

const lexiconDigest = (lexicon: Readonly<Record<string, readonly string[]>>): string => {
  const canonicalEntries = Object.entries(lexicon)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([term, phonemes]) => [term.normalize('NFC'), [...phonemes]] as const)
  return canonicalHash(canonicalEntries)
}

export const calibrateAligner = (
  inputs: readonly unknown[],
  customLexicon: Readonly<Record<string, readonly string[]>>,
): CalibrationResult => {
  const failures: string[] = []
  if (inputs.length < thresholds.ALIGNER_CALIBRATION.MIN_SAMPLES) failures.push('ALIGNER_MIN_REAL_SAMPLES')
  if (inputs.length > thresholds.ALIGNER_CALIBRATION.MAX_SAMPLES) failures.push('ALIGNER_MAX_REAL_SAMPLES')

  const parsed: CalibrationSample[] = []
  for (const input of inputs) {
    const result = CalibrationSampleSchema.safeParse(input)
    if (!result.success) failures.push('ALIGNER_SAMPLE_INVALID')
    else parsed.push(result.data)
  }
  if (new Set(parsed.map((sample) => sample.audioSha256)).size !== parsed.length) {
    failures.push('ALIGNER_AUDIO_MUST_BE_UNIQUE')
  }
  if (failures.length > 0) {
    return { calibrated: false, gateEvaluated: false, errorFloor: null, threshold: null, failures: [...new Set(failures)] }
  }

  const sampleErrors: SampleError[] = parsed.map((sample) => {
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
  const errorFloor = totalEdits / totalReference
  const threshold = Math.max(
    thresholds.ALIGNER_CALIBRATION.MIN_THRESHOLD,
    errorFloor * thresholds.ALIGNER_CALIBRATION.FLOOR_MULTIPLIER,
  )
  return {
    calibrated: true,
    gateEvaluated: true,
    errorFloor,
    threshold,
    sampleErrors,
    alignerPins: ALIGNER_PINS,
    lexiconHash: lexiconDigest(customLexicon),
  }
}
