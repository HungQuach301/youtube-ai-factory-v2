import { thresholds } from '@youtube-ai-factory/contracts'

import type {
  AlignmentMeasurement,
  ClippingMeasurement,
  DropFrameMeasurement,
  DuplicateMeasurement,
  Interval,
  IntervalMeasurement,
  LegibilityMeasurement,
  LoudnessMeasurement,
  MotionMeasurement,
  NearStaticMeasurement,
  SafeZoneMeasurement,
  SeamMeasurement,
  StreamProfileMeasurement,
  TimelineMeasurement,
} from './types.js'

export class MeasurementInputError extends Error {
  readonly code = 'MEASUREMENT_INPUT_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'MeasurementInputError'
  }
}

function finiteNumber(value: string, key: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new MeasurementInputError(`Invalid ${key} value.`)
  }
  return parsed
}

function intervalMeasurement(
  log: string,
  startKey: string,
  endKey: string,
): IntervalMeasurement {
  const eventPattern = new RegExp(`(?:${startKey}|${endKey})(?:=|:)\\s*(-?\\d+(?:\\.\\d+)?)`, 'g')
  const intervals: Interval[] = []
  let start: number | null = null

  for (const match of log.matchAll(eventPattern)) {
    const token = match[0]
    const rawValue = match[1]
    if (rawValue === undefined) throw new MeasurementInputError('Interval event is missing a value.')
    const value = finiteNumber(rawValue, token)
    if (token.startsWith(startKey)) {
      if (start !== null) throw new MeasurementInputError(`${startKey} repeated before ${endKey}.`)
      start = value
      continue
    }
    if (start === null || value < start) {
      throw new MeasurementInputError(`${endKey} does not match a valid ${startKey}.`)
    }
    intervals.push({ startSec: start, endSec: value })
    start = null
  }

  if (start !== null) throw new MeasurementInputError(`${startKey} is missing ${endKey}.`)
  return {
    intervals,
    totalDurationSec: intervals.reduce((sum, interval) => sum + interval.endSec - interval.startSec, 0),
  }
}

export function measureBlackFrames(log: string): IntervalMeasurement {
  return intervalMeasurement(log, 'black_start', 'black_end')
}

export function measureFreezeFrames(log: string): IntervalMeasurement {
  return intervalMeasurement(log, 'freeze_start', 'freeze_end')
}

export function measureSilence(log: string): IntervalMeasurement {
  return intervalMeasurement(log, 'silence_start', 'silence_end')
}

export function measureClipping(input: ClippingMeasurement): ClippingMeasurement {
  return { ...input }
}

export function measureLoudness(input: LoudnessMeasurement): LoudnessMeasurement {
  return { ...input }
}

export function measureDropFrames(input: {
  readonly durationSec: number
  readonly fps: number
  readonly countedFrames: number
}): DropFrameMeasurement {
  const expectedFrames = Math.round(input.durationSec * input.fps)
  return {
    expectedFrames,
    countedFrames: input.countedFrames,
    missingFrames: Math.max(0, expectedFrames - input.countedFrames),
  }
}

export function measureStreamProfile(input: StreamProfileMeasurement): StreamProfileMeasurement {
  return { ...input }
}

function editDistance(left: readonly string[], right: readonly string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      const insertionCost = (current[rightIndex - 1] ?? Number.POSITIVE_INFINITY) + 1
      const deletionCost = (previous[rightIndex] ?? Number.POSITIVE_INFINITY) + 1
      const substitutionCost = (previous[rightIndex - 1] ?? Number.POSITIVE_INFINITY) + substitution
      current[rightIndex] = Math.min(insertionCost, deletionCost, substitutionCost)
    }
    previous = current
  }
  return previous[right.length] ?? left.length
}

export function measureForcedAlignment(input: {
  readonly expectedPhonemes: readonly string[]
  readonly observedPhonemes: readonly string[]
}): AlignmentMeasurement {
  const distance = editDistance(input.expectedPhonemes, input.observedPhonemes)
  return {
    expectedCount: input.expectedPhonemes.length,
    observedCount: input.observedPhonemes.length,
    editDistance: distance,
    phonemeMismatchRate: distance / input.expectedPhonemes.length,
    gateEvaluated: false,
  }
}

function correlation(left: readonly number[], right: readonly number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
  let numerator = 0
  let leftPower = 0
  let rightPower = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = (left[index] ?? 0) - leftMean
    const rightDelta = (right[index] ?? 0) - rightMean
    numerator += leftDelta * rightDelta
    leftPower += leftDelta * leftDelta
    rightPower += rightDelta * rightDelta
  }
  const denominator = Math.sqrt(leftPower * rightPower)
  return denominator === 0 ? 0 : numerator / denominator
}

export function measureSeam(input: {
  readonly leftSamples: readonly number[]
  readonly rightSamples: readonly number[]
  readonly leftF0Hz: number | null
  readonly rightF0Hz: number | null
  readonly mfccDistance: number
}): SeamMeasurement {
  const f0StepSemitone = input.leftF0Hz === null || input.rightF0Hz === null
    ? null
    : Math.abs(12 * Math.log2(input.rightF0Hz / input.leftF0Hz))
  return {
    correlation: correlation(input.leftSamples, input.rightSamples),
    mfccDistance: input.mfccDistance,
    f0StepSemitone,
  }
}

export function measureSemanticMotion(input: {
  readonly globalEnergy: readonly number[]
  readonly denseEnergy: readonly number[]
}): MotionMeasurement {
  const residuals = input.denseEnergy.map((value, index) =>
    Math.max(0, value - (input.globalEnergy[index] ?? 0)))
  return {
    residualEnergyMean: residuals.reduce((sum, value) => sum + value, 0) / residuals.length,
    residualEnergyMax: Math.max(...residuals),
  }
}

function bitCount(value: bigint): number {
  let remaining = value
  let count = 0
  while (remaining > 0n) {
    count += Number(remaining & 1n)
    remaining >>= 1n
  }
  return count
}

export function measureDuplicate(perceptualHashes: readonly string[]): DuplicateMeasurement {
  let pairCount = 0
  let duplicatePairCount = 0
  for (let left = 0; left < perceptualHashes.length; left += 1) {
    for (let right = left + 1; right < perceptualHashes.length; right += 1) {
      const leftHash = perceptualHashes[left]
      const rightHash = perceptualHashes[right]
      if (leftHash === undefined || rightHash === undefined) continue
      pairCount += 1
      const distance = bitCount(BigInt(`0x${leftHash}`) ^ BigInt(`0x${rightHash}`))
      if (distance <= thresholds.VISUAL.PHASH_HAMMING_DUPLICATE) duplicatePairCount += 1
    }
  }
  return {
    sampleCount: perceptualHashes.length,
    pairCount,
    duplicatePairCount,
    duplicatePairRatio: pairCount === 0 ? 0 : duplicatePairCount / pairCount,
  }
}

export function measureNearStatic(samples: readonly { readonly atSec: number; readonly ssim: number }[]): NearStaticMeasurement {
  const sorted = [...samples].sort((left, right) => left.atSec - right.atSec)
  const intervals: Interval[] = []
  let start: number | null = null
  let last: number | null = null

  for (const sample of sorted) {
    if (sample.ssim > thresholds.VISUAL.NEAR_STATIC_SSIM) {
      start ??= sample.atSec
      last = sample.atSec
      continue
    }
    if (start !== null && last !== null && last - start > thresholds.VISUAL.NEAR_STATIC_MAX_SEC) {
      intervals.push({ startSec: start, endSec: last })
    }
    start = null
    last = null
  }
  if (start !== null && last !== null && last - start > thresholds.VISUAL.NEAR_STATIC_MAX_SEC) {
    intervals.push({ startSec: start, endSec: last })
  }
  const durations = intervals.map((interval) => interval.endSec - interval.startSec)
  return {
    intervals,
    totalDurationSec: durations.reduce((sum, duration) => sum + duration, 0),
    longestDurationSec: durations.length === 0 ? 0 : Math.max(...durations),
  }
}

export function measureMobileLegibility(elements: readonly {
  readonly id: string
  readonly xHeightPxAtQaScale: number
  readonly contrastRatio: number
  readonly largeText: boolean
}[]): LegibilityMeasurement {
  const failedElementIds = elements
    .filter((element) => {
      const contrastFloor = element.largeText
        ? thresholds.MOBILE.MIN_CONTRAST_LARGE
        : thresholds.MOBILE.MIN_CONTRAST_NORMAL
      return element.xHeightPxAtQaScale < thresholds.MOBILE.MIN_X_HEIGHT_PX
        || element.contrastRatio < contrastFloor
    })
    .map((element) => element.id)
  return { passed: failedElementIds.length === 0, failedElementIds }
}

export function measureSafeZone(input: {
  readonly safeRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly elements: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]
}): SafeZoneMeasurement {
  const safeRight = input.safeRect.x + input.safeRect.width
  const safeBottom = input.safeRect.y + input.safeRect.height
  const outsideElementIds = input.elements.filter((element) =>
    element.x < input.safeRect.x
    || element.y < input.safeRect.y
    || element.x + element.width > safeRight
    || element.y + element.height > safeBottom).map((element) => element.id)
  return { passed: outsideElementIds.length === 0, outsideElementIds }
}

export function measureTimeline(input: {
  readonly durationSec: number
  readonly fps: number
  readonly segments: readonly { readonly id: string; readonly startSec: number; readonly endSec: number }[]
}): TimelineMeasurement {
  const toleranceSec = thresholds.SHOT.DURATION_TOLERANCE_FRAMES / input.fps
  const sorted = [...input.segments].sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec)
  const gaps: Interval[] = []
  const overlaps: Interval[] = []
  let cursor = 0

  for (const segment of sorted) {
    if (segment.startSec - cursor > toleranceSec) gaps.push({ startSec: cursor, endSec: segment.startSec })
    if (cursor - segment.startSec > toleranceSec) overlaps.push({ startSec: segment.startSec, endSec: Math.min(cursor, segment.endSec) })
    cursor = Math.max(cursor, segment.endSec)
  }
  if (input.durationSec - cursor > toleranceSec) gaps.push({ startSec: cursor, endSec: input.durationSec })
  return { gaps, overlaps, issueCount: gaps.length + overlaps.length }
}
