import { z } from 'zod'

export const MeasurementCodeSchema = z.enum([
  'BLACK_FRAME',
  'FREEZE_FRAME',
  'SILENCE',
  'CLIPPING',
  'LOUDNESS',
  'DROP_FRAME',
  'STREAM_PROFILE',
  'FORCED_ALIGNMENT',
  'SEAM',
  'SEMANTIC_MOTION',
  'DUPLICATE',
  'NEAR_STATIC',
  'MOBILE_LEGIBILITY',
  'SAFE_ZONE',
  'TIMELINE_LINT',
])

export type MeasurementCode = z.infer<typeof MeasurementCodeSchema>

export const IntervalSchema = z.object({
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
}).strict().refine((value) => value.endSec >= value.startSec, {
  message: 'Interval end must not precede start.',
})

export type Interval = z.infer<typeof IntervalSchema>

const FlowInputSchema = z.object({
  globalEnergy: z.array(z.number().nonnegative()).min(1),
  denseEnergy: z.array(z.number().nonnegative()).min(1),
}).strict().refine((value) => value.globalEnergy.length === value.denseEnergy.length, {
  message: 'Global and dense flow samples must have equal length.',
})

const RectangleSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
}).strict()

const TimelineSegmentSchema = z.object({
  id: z.string().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
}).strict().refine((value) => value.endSec > value.startSec, {
  message: 'Timeline segment end must be after start.',
})

export const MeasurementInputSchema = z.object({
  blackFrameLog: z.string(),
  freezeFrameLog: z.string(),
  silenceLog: z.string(),
  clipping: z.object({
    peakDb: z.number(),
    flatFactor: z.number().nonnegative(),
  }).strict(),
  loudness: z.object({
    integratedLufs: z.number(),
    truePeakDbtp: z.number(),
    loudnessRangeLu: z.number().nonnegative(),
  }).strict(),
  dropFrame: z.object({
    durationSec: z.number().positive(),
    fps: z.number().positive(),
    countedFrames: z.number().int().nonnegative(),
  }).strict(),
  streamProfile: z.object({
    videoCodec: z.string().min(1),
    audioCodec: z.string().min(1),
    pixelFormat: z.string().min(1),
    colorPrimaries: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
  }).strict(),
  forcedAlignment: z.object({
    expectedPhonemes: z.array(z.string().min(1)).min(1),
    observedPhonemes: z.array(z.string().min(1)),
  }).strict(),
  seam: z.object({
    leftSamples: z.array(z.number()).min(1),
    rightSamples: z.array(z.number()).min(1),
    leftF0Hz: z.number().positive().nullable(),
    rightF0Hz: z.number().positive().nullable(),
    mfccDistance: z.number().nonnegative(),
  }).strict().refine((value) => value.leftSamples.length === value.rightSamples.length, {
    message: 'Seam sample windows must have equal length.',
  }),
  semanticMotion: FlowInputSchema,
  duplicate: z.object({
    perceptualHashes: z.array(z.string().regex(/^[0-9a-fA-F]{16}$/)).min(1),
  }).strict(),
  nearStatic: z.object({
    samples: z.array(z.object({
      atSec: z.number().nonnegative(),
      ssim: z.number().min(0).max(1),
    }).strict()).min(1),
  }).strict(),
  mobileLegibility: z.object({
    elements: z.array(z.object({
      id: z.string().min(1),
      xHeightPxAtQaScale: z.number().nonnegative(),
      contrastRatio: z.number().nonnegative(),
      largeText: z.boolean(),
    }).strict()),
  }).strict(),
  safeZone: z.object({
    safeRect: RectangleSchema,
    elements: z.array(RectangleSchema.extend({ id: z.string().min(1) })),
  }).strict(),
  timeline: z.object({
    durationSec: z.number().positive(),
    fps: z.number().positive(),
    segments: z.array(TimelineSegmentSchema),
  }).strict(),
}).strict()

export type MeasurementInput = z.infer<typeof MeasurementInputSchema>

export interface MeasurementEvidence<Value> {
  readonly code: MeasurementCode
  readonly value: Value
}

export interface IntervalMeasurement {
  readonly intervals: readonly Interval[]
  readonly totalDurationSec: number
}

export interface ClippingMeasurement {
  readonly peakDb: number
  readonly flatFactor: number
}

export interface LoudnessMeasurement {
  readonly integratedLufs: number
  readonly truePeakDbtp: number
  readonly loudnessRangeLu: number
}

export interface DropFrameMeasurement {
  readonly expectedFrames: number
  readonly countedFrames: number
  readonly missingFrames: number
}

export interface StreamProfileMeasurement {
  readonly videoCodec: string
  readonly audioCodec: string
  readonly pixelFormat: string
  readonly colorPrimaries: string
  readonly width: number
  readonly height: number
  readonly fps: number
}

export interface AlignmentMeasurement {
  readonly expectedCount: number
  readonly observedCount: number
  readonly editDistance: number
  readonly phonemeMismatchRate: number
  readonly gateEvaluated: false
}

export interface SeamMeasurement {
  readonly correlation: number
  readonly mfccDistance: number
  readonly f0StepSemitone: number | null
}

export interface MotionMeasurement {
  readonly residualEnergyMean: number
  readonly residualEnergyMax: number
}

export interface DuplicateMeasurement {
  readonly sampleCount: number
  readonly pairCount: number
  readonly duplicatePairCount: number
  readonly duplicatePairRatio: number
}

export interface NearStaticMeasurement extends IntervalMeasurement {
  readonly longestDurationSec: number
}

export interface LegibilityMeasurement {
  readonly passed: boolean
  readonly failedElementIds: readonly string[]
}

export interface SafeZoneMeasurement {
  readonly passed: boolean
  readonly outsideElementIds: readonly string[]
}

export interface TimelineMeasurement {
  readonly gaps: readonly Interval[]
  readonly overlaps: readonly Interval[]
  readonly issueCount: number
}

export interface MeasurementBundle {
  readonly measurements: import('@youtube-ai-factory/contracts').DeterministicMeasurements
  readonly evidence: readonly MeasurementEvidence<unknown>[]
}
