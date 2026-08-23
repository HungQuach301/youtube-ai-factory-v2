import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

import { CreativeError } from './errors.js'
import { lintStory } from './story.js'
import { BeatSchema, PredictionWeightsSchema, type Beat, type PredictionWeights } from './types.js'

const PredictionInputSchema = z.object({
  beats: z.array(BeatSchema).min(1),
  weights: PredictionWeightsSchema,
  ctrEstimate: z.number().min(0).max(1),
}).strict()

interface BeatRisk {
  readonly beatId: string
  readonly risk: number
}

interface RetentionPoint {
  readonly elapsedPct: number
  readonly predictedRetention: number
}

export interface PredictedPerformanceArtifact {
  readonly modelVersion: string
  readonly baselineSource: 'flat'
  readonly weights: PredictionWeights
  readonly retentionCurve: readonly RetentionPoint[]
  readonly beatRisk: readonly BeatRisk[]
  readonly ctrEstimate: number
  readonly recalibrateAfterVideos: number
  readonly canonicalHash: ReturnType<typeof canonicalHash>
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

function baselineAt(elapsedPct: number): number {
  const points = Object.entries(thresholds.PREDICTION.BASELINE_FLAT_CURVE)
    .map(([pct, retention]) => ({ pct: Number(pct), retention }))
    .sort((left, right) => left.pct - right.pct)
  const exact = points.find((point) => point.pct === elapsedPct)
  if (exact !== undefined) return exact.retention
  const upperIndex = points.findIndex((point) => point.pct > elapsedPct)
  if (upperIndex <= 0) return points[0]!.retention
  const lower = points[upperIndex - 1]!
  const upper = points[upperIndex]!
  const fraction = (elapsedPct - lower.pct) / (upper.pct - lower.pct)
  return lower.retention + ((upper.retention - lower.retention) * fraction)
}

function calculateBeatRisk(
  beats: readonly Beat[],
  weights: PredictionWeights,
  durationSec: number,
): readonly BeatRisk[] {
  return beats.map((beat, index) => {
    const beatDuration = beat.tEndSec - beat.tStartSec
    const previous = index === 0 ? undefined : beats[index - 1]
    const stateStaleness = beatDuration / durationSec
    const entityDensity = beat.newEntities.length / thresholds.SCRIPT.NEW_ENTITY_PER_15S
    const openLoopDistance = beat.loopOpened === null ? 0 : beatDuration / durationSec
    const archetypeStaleness = previous?.visualIntent === beat.visualIntent ? beatDuration / durationSec : 0
    return {
      beatId: beat.id,
      risk:
        (weights.stateStaleness * stateStaleness)
        + (weights.entityDensity * entityDensity)
        + (weights.openLoopDistance * openLoopDistance)
        + (weights.archetypeStaleness * archetypeStaleness),
    }
  })
}

export function sealPrediction(input: unknown): PredictedPerformanceArtifact {
  const parsed = PredictionInputSchema.parse(input)
  const story = lintStory(parsed.beats)
  if (!story.valid) throw new CreativeError('STORY_LINT_FAILED', story.failures)
  const beats = [...parsed.beats].sort((left, right) => left.tStartSec - right.tStartSec)
  const durationSec = Math.max(...beats.map((beat) => beat.tEndSec))
  const beatRisk = calculateBeatRisk(beats, parsed.weights, durationSec)
  const retentionCurve: RetentionPoint[] = []
  for (let elapsedPct = 0; elapsedPct <= 100; elapsedPct += thresholds.PREDICTION.CURVE_STEP_PCT) {
    const cumulativeRisk = beatRisk.reduce((sum, item, index) => {
      const beat = beats[index]
      if (beat === undefined || (beat.tEndSec / durationSec) * 100 > elapsedPct) return sum
      return sum + item.risk
    }, 0)
    retentionCurve.push({
      elapsedPct,
      predictedRetention: clamp(baselineAt(elapsedPct) - cumulativeRisk),
    })
  }
  const payload = {
    modelVersion: thresholds.PREDICTION.MODEL_VERSION,
    baselineSource: thresholds.PREDICTION.BASELINE_SOURCE,
    weights: parsed.weights,
    retentionCurve,
    beatRisk,
    ctrEstimate: parsed.ctrEstimate,
    recalibrateAfterVideos: thresholds.PREDICTION.RECALIBRATE_AFTER_VIDEOS,
  }
  return { ...payload, canonicalHash: canonicalHash(payload) }
}
