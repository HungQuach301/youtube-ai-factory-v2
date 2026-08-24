import { thresholds } from '@youtube-ai-factory/contracts'

import { missingRubricAnchors } from './engine.js'
import type {
  CriticQualificationInput,
  CriticQualificationResult,
  QualificationObservation,
  QualificationSample,
} from './types.js'

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length
}

function detectionsFor(
  observations: readonly QualificationObservation[],
  sampleId: string,
): readonly QualificationObservation[] {
  return observations.filter((observation) => observation.sampleId === sampleId)
}

function recallFor(
  samples: readonly QualificationSample[],
  observations: readonly QualificationObservation[],
): number {
  if (samples.length === 0) return 0
  const hits = samples.reduce((total, sample) => total + detectionsFor(observations, sample.id)
    .filter((observation) => observation.predictedDefectClasses.includes(sample.defectClass)).length, 0)
  return hits / (samples.length * 3)
}

export function evaluateCriticQualification(
  input: CriticQualificationInput,
): CriticQualificationResult {
  const readinessFailures: string[] = []
  if (!input.goldSetReady) readinessFailures.push('GOLD_SET_NOT_READY')
  if (missingRubricAnchors(input.rubric).length > 0) readinessFailures.push('RUBRIC_ANCHORS_INCOMPLETE')
  if (readinessFailures.length > 0) {
    return {
      verdict: 'INCONCLUSIVE',
      qualificationState: 'REGISTERED',
      recallP0ByDefectClass: {},
      recallP1: 0,
      precision: 0,
      maxScoreVariance: 0,
      failures: readinessFailures,
    }
  }

  const failures: string[] = []
  const sampleIds = new Set(input.samples.map((sample) => sample.id))
  if (sampleIds.size !== input.samples.length) failures.push('DUPLICATE_SAMPLE_ID')
  for (const sample of input.samples) {
    const observations = detectionsFor(input.observations, sample.id)
    const ordinals = new Set(observations.map((observation) => observation.runOrdinal))
    if (observations.length !== 3 || ordinals.size !== 3) failures.push(`THREE_RUNS_REQUIRED:${sample.id}`)
    if (observations.some((observation) => !Number.isFinite(observation.score)
      || observation.score < 0 || observation.score > 100)) failures.push(`INVALID_SCORE:${sample.id}`)
  }
  if (input.observations.some((observation) => !sampleIds.has(observation.sampleId))) {
    failures.push('UNKNOWN_SAMPLE_OBSERVATION')
  }

  const p0Classes = [...new Set(input.samples
    .filter((sample) => sample.severity === 'P0')
    .map((sample) => sample.defectClass))]
  const recallP0ByDefectClass = Object.fromEntries(p0Classes.map((defectClass) => [
    defectClass,
    recallFor(input.samples.filter((sample) =>
      sample.severity === 'P0' && sample.defectClass === defectClass), input.observations),
  ]))
  for (const [defectClass, recall] of Object.entries(recallP0ByDefectClass)) {
    if (recall < thresholds.QUALIFICATION.GOLD_RECALL_P0) failures.push(`P0_RECALL:${defectClass}`)
  }

  const recallP1 = recallFor(input.samples.filter((sample) => sample.severity === 'P1'), input.observations)
  if (recallP1 < thresholds.QUALIFICATION.GOLD_RECALL_P1) failures.push('P1_RECALL')

  let truePositivePredictions = 0
  let allPredictions = 0
  for (const observation of input.observations) {
    const sample = input.samples.find((candidate) => candidate.id === observation.sampleId)
    allPredictions += observation.predictedDefectClasses.length
    if (sample !== undefined) {
      truePositivePredictions += observation.predictedDefectClasses
        .filter((defectClass) => defectClass === sample.defectClass).length
    }
  }
  const precision = allPredictions === 0 ? 0 : truePositivePredictions / allPredictions
  if (precision < thresholds.QUALIFICATION.GOLD_PRECISION_MIN) failures.push('PRECISION')

  const maxScoreVariance = Math.max(0, ...input.samples.map((sample) =>
    variance(detectionsFor(input.observations, sample.id).map((observation) => observation.score))))
  if (maxScoreVariance > thresholds.ASSURANCE.MAX_VARIANCE) failures.push('SCORE_VARIANCE')

  return {
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    qualificationState: failures.length === 0 ? 'QUALIFIED' : 'REGISTERED',
    recallP0ByDefectClass,
    recallP1,
    precision,
    maxScoreVariance,
    failures,
  }
}
