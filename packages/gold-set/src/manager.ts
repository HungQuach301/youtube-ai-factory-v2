import {
  GoldSampleSchema,
  type GoldDefectClass,
  type GoldDetection,
  type GoldMetric,
  type GoldReadiness,
  type GoldSample,
} from './types.js'

const SYNTHETIC_DEFECTS: readonly GoldDefectClass[] = [
  'BLACK_FRAME',
  'FREEZE_FRAME',
  'SILENCE',
  'CLIPPING',
  'DROP_FRAME',
  'MOBILE_LEGIBILITY',
  'SAFE_ZONE',
  'TIMELINE',
]

const recipeFor = (defectClass: GoldDefectClass, variant: number): string => {
  const windowStart = variant === 1 ? '1.000' : '2.000'
  const windowEnd = variant === 1 ? '1.500' : '2.750'
  const recipes: Record<GoldDefectClass, string> = {
    BLACK_FRAME: `color=c=black:s=1280x720:d=${windowEnd}`,
    FREEZE_FRAME: `tpad=stop_mode=clone:stop_duration=${variant}`,
    SILENCE: `volume=enable='between(t,${windowStart},${windowEnd})':volume=0`,
    CLIPPING: `volume=${variant === 1 ? '8' : '12'},alimiter=limit=1`,
    DROP_FRAME: `select='not(between(t,${windowStart},${windowEnd}))',setpts=N/30/TB`,
    MOBILE_LEGIBILITY: `drawtext=text='tiny':fontsize=${variant === 1 ? '8' : '9'}:x=20:y=20`,
    SAFE_ZONE: `drawbox=x=${variant === 1 ? '0' : '1240'}:y=0:w=40:h=40:color=red:t=fill`,
    TIMELINE: `setpts='if(gte(T,${windowStart}),PTS+${variant}/TB,PTS)'`,
  }
  return recipes[defectClass]
}

export const createSyntheticGoldSamples = (createdAt: string): readonly GoldSample[] =>
  SYNTHETIC_DEFECTS.flatMap((defectClass) => [1, 2].map((variant) => GoldSampleSchema.parse({
    id: `synthetic-${defectClass.toLowerCase()}-${variant}`,
    source: 'synthetic',
    r2Key: `qualification/gold/synthetic/${defectClass.toLowerCase()}/${variant}.mp4`,
    groundTruth: {
      defectClass,
      severity: variant === 1 ? 'P1' : 'P2',
      tStart: variant === 1 ? 1 : 2,
      tEnd: variant === 1 ? 1.5 : 2.75,
    },
    ownerJudgment: null,
    recipe: recipeFor(defectClass, variant),
    createdAt,
  })))

export class GoldSetManager {
  readonly #samples = new Map<string, GoldSample>()

  append(input: unknown): GoldSample {
    const sample = GoldSampleSchema.parse(input)
    if (this.#samples.has(sample.id)) {
      throw new Error(`GOLD_SAMPLE_EXISTS:${sample.id}`)
    }
    this.#samples.set(sample.id, sample)
    return sample
  }

  list(): readonly GoldSample[] {
    return [...this.#samples.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  readiness(): GoldReadiness {
    const samples = this.list()
    const rejectedMasterCount = samples.filter((sample) => sample.source === 'rejected_master').length
    const failures: string[] = []
    if (samples.length < 30) failures.push('GOLD_SET_MIN_30')
    if (rejectedMasterCount < 15) failures.push('REJECTED_MASTER_MIN_15')
    for (const defectClass of SYNTHETIC_DEFECTS) {
      if (samples.filter((sample) => sample.groundTruth.defectClass === defectClass).length < 2) {
        failures.push(`DEFECT_CLASS_MIN_2:${defectClass}`)
      }
    }
    return { ready: failures.length === 0, sampleCount: samples.length, rejectedMasterCount, failures }
  }
}

const variance = (values: readonly number[]): number => {
  if (values.length === 0) return 0
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length
}

export const measureGoldPerformance = (
  samples: readonly GoldSample[],
  detections: readonly GoldDetection[],
): readonly GoldMetric[] => {
  const detectedById = new Map(detections.map((detection) => [detection.sampleId, detection.detected]))
  return SYNTHETIC_DEFECTS.map((defectClass) => {
    const inClass = samples.filter((sample) => sample.groundTruth.defectClass === defectClass)
    const truePositives = inClass.filter((sample) => detectedById.get(sample.id) === true).length
    const falsePositives = samples.filter((sample) =>
      sample.groundTruth.defectClass !== defectClass && detectedById.get(sample.id) === true).length
    const durations = inClass.map((sample) => sample.groundTruth.tEnd - sample.groundTruth.tStart)
    return {
      defectClass,
      precision: truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives),
      recall: inClass.length === 0 ? 0 : truePositives / inClass.length,
      durationVariance: variance(durations),
    }
  })
}
