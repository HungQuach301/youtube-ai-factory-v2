import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import {
  AnalyticsIngestInputSchema,
  type ActualPerformanceArtifact,
  type AnalyticsIngestInput,
  type AssessedLearning,
  type CalibratedPredictionModel,
  type CalibrationObservation,
  type DeviationReport,
  type Experiment,
  type LearningCandidate,
  type LearningPromotion,
  type LearningPromotionTarget,
  type PredictionForAnalysis,
  type PromoteLearningCommandEvidence,
} from './types.js'

export type LearningErrorCode =
  | 'ANALYTICS_INPUT_INVALID'
  | 'SIMULATED_ANALYTICS_FORBIDDEN'
  | 'ANALYTICS_WINDOW_INVALID'
  | 'ANALYTICS_EVIDENCE_MISSING'
  | 'VIDEO_BINDING_NOT_VERIFIED'
  | 'VIDEO_MASTER_BINDING_MISMATCH'
  | 'RETENTION_GRID_INVALID'
  | 'DEVIATION_INPUT_INVALID'
  | 'CALIBRATION_SAMPLE_SIZE_INSUFFICIENT'
  | 'CALIBRATION_EVIDENCE_INVALID'
  | 'CALIBRATION_MATRIX_SINGULAR'
  | 'EXPERIMENT_INVALID'
  | 'LEARNING_SCOPE_INVALID'
  | 'PORTFOLIO_REPLICATION_INSUFFICIENT'
  | 'VOICE_CANNOT_CROSS_CHANNELS'
  | 'LEARNING_NOT_READY'
  | 'OWNER_COMMAND_INVALID'

export class LearningError extends Error {
  override readonly name = 'LearningError'

  constructor(readonly code: LearningErrorCode, readonly failures: readonly string[] = []) {
    super(`${code}${failures.length === 0 ? '' : `: ${failures.join('; ')}`}`)
  }
}

const HEX_64 = /^[0-9a-f]{64}$/u
const GRID_POINT_COUNT = (100 / thresholds.PREDICTION.CURVE_STEP_PCT) + 1
const FEATURE_COUNT = 4

function assertRetentionGrid(curve: AnalyticsIngestInput['metrics']['retentionCurve']): void {
  if (curve.length !== GRID_POINT_COUNT) throw new LearningError('RETENTION_GRID_INVALID')
  for (let index = 0; index < curve.length; index += 1) {
    const point = curve[index]
    const expected = (index * thresholds.PREDICTION.CURVE_STEP_PCT) / 100
    if (point === undefined || Math.abs(point.elapsedVideoTimeRatio - expected) > Number.EPSILON) {
      throw new LearningError('RETENTION_GRID_INVALID')
    }
  }
}

export function ingestYoutubeAnalytics(input: unknown): ActualPerformanceArtifact {
  if (typeof input === 'object' && input !== null) {
    const candidate = input as Readonly<Record<string, unknown>>
    if (candidate['simulated'] !== false) throw new LearningError('SIMULATED_ANALYTICS_FORBIDDEN')
    if (candidate['source'] !== 'YOUTUBE_ANALYTICS_API') {
      throw new LearningError('ANALYTICS_INPUT_INVALID', ['SOURCE_NOT_YOUTUBE_ANALYTICS_API'])
    }
  }
  const result = AnalyticsIngestInputSchema.safeParse(input)
  if (!result.success) throw new LearningError('ANALYTICS_INPUT_INVALID', result.error.issues.map((issue) => issue.message))
  const parsed = result.data
  if (parsed.windowDays < thresholds.LEARNING.ANALYTICS_WINDOW_DAYS.min
    || parsed.windowDays > thresholds.LEARNING.ANALYTICS_WINDOW_DAYS.max) {
    throw new LearningError('ANALYTICS_WINDOW_INVALID')
  }
  if (parsed.responseEvidenceR2Key.trim().length === 0) throw new LearningError('ANALYTICS_EVIDENCE_MISSING')
  if (!parsed.binding.verified || parsed.binding.verificationEvidenceR2Key.trim().length === 0) {
    throw new LearningError('VIDEO_BINDING_NOT_VERIFIED')
  }
  if (parsed.binding.packageId !== parsed.packageId
    || parsed.binding.youtubeVideoId !== parsed.youtubeVideoId
    || parsed.binding.masterId !== parsed.masterId
    || parsed.binding.masterSha256 !== parsed.masterSha256) {
    throw new LearningError('VIDEO_MASTER_BINDING_MISMATCH')
  }
  assertRetentionGrid(parsed.metrics.retentionCurve)
  const payload = {
    id: parsed.id,
    package_id: parsed.packageId,
    youtube_video_id: parsed.youtubeVideoId,
    master_id: parsed.masterId,
    master_sha256: parsed.masterSha256,
    source: 'YOUTUBE_ANALYTICS_API' as const,
    simulated: false as const,
    published_at: parsed.publishedAt,
    fetched_at: parsed.fetchedAt,
    window_days: parsed.windowDays,
    response_evidence_r2_key: parsed.responseEvidenceR2Key,
    response_sha256: parsed.responseSha256,
    metrics: parsed.metrics,
  }
  return {
    id: payload.id,
    packageId: payload.package_id,
    youtubeVideoId: payload.youtube_video_id,
    masterId: payload.master_id,
    masterSha256: payload.master_sha256,
    source: payload.source,
    simulated: payload.simulated,
    publishedAt: payload.published_at,
    fetchedAt: payload.fetched_at,
    windowDays: payload.window_days,
    responseEvidenceR2Key: payload.response_evidence_r2_key,
    responseSha256: payload.response_sha256,
    metrics: payload.metrics,
    canonicalHash: canonicalHash(payload),
  }
}

function interpolate(points: readonly { readonly x: number; readonly y: number }[], x: number): number {
  const exact = points.find((point) => Math.abs(point.x - x) <= Number.EPSILON)
  if (exact !== undefined) return exact.y
  const upperIndex = points.findIndex((point) => point.x > x)
  if (upperIndex <= 0) return points[0]?.y ?? 0
  const lower = points[upperIndex - 1]
  const upper = points[upperIndex]
  if (lower === undefined || upper === undefined) return points.at(-1)?.y ?? 0
  const fraction = (x - lower.x) / (upper.x - lower.x)
  return lower.y + ((upper.y - lower.y) * fraction)
}

export function analyzeDeviation(
  prediction: PredictionForAnalysis,
  actual: ActualPerformanceArtifact,
  beatBoundaries: readonly number[],
): DeviationReport {
  if (prediction.packageId !== actual.packageId || !HEX_64.test(prediction.canonicalHash)
    || beatBoundaries.some((boundary) => !Number.isFinite(boundary) || boundary < 0 || boundary > 1)) {
    throw new LearningError('DEVIATION_INPUT_INVALID')
  }
  const predicted = prediction.retentionCurve.map((point) => ({ x: point.elapsedPct / 100, y: point.predictedRetention }))
  if (predicted.length !== GRID_POINT_COUNT) throw new LearningError('RETENTION_GRID_INVALID')
  const actualPoints = actual.metrics.retentionCurve.map((point) => ({
    x: point.elapsedVideoTimeRatio,
    y: point.audienceWatchRatio,
  }))
  const absoluteErrors = actualPoints.map((point) => Math.abs(point.y - interpolate(predicted, point.x)))
  const retentionMae = absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length
  const beatErrors = beatBoundaries.map((boundary) => {
    const predictedRetention = interpolate(predicted, boundary)
    const actualRetention = interpolate(actualPoints, boundary)
    return { elapsedVideoTimeRatio: boundary, predictedRetention, actualRetention, error: actualRetention - predictedRetention }
  })
  const payload = {
    package_id: actual.packageId,
    prediction_hash: prediction.canonicalHash,
    analytics_hash: actual.canonicalHash,
    retention_mae: retentionMae,
    beat_errors: beatErrors,
    ctr_delta: actual.metrics.impressionClickThroughRate - prediction.ctrEstimate,
  }
  return {
    packageId: payload.package_id,
    predictionHash: payload.prediction_hash,
    analyticsHash: payload.analytics_hash,
    retentionMae: payload.retention_mae,
    beatErrors: payload.beat_errors,
    ctrDelta: payload.ctr_delta,
    canonicalHash: canonicalHash(payload),
  }
}

function solveLeastSquares(observations: readonly CalibrationObservation[]): readonly number[] {
  const normal = Array.from({ length: FEATURE_COUNT }, () => Array<number>(FEATURE_COUNT + 1).fill(0))
  for (const observation of observations) {
    for (let row = 0; row < FEATURE_COUNT; row += 1) {
      const rowValue = observation.features[row]
      if (rowValue === undefined) throw new LearningError('CALIBRATION_EVIDENCE_INVALID')
      for (let column = 0; column < FEATURE_COUNT; column += 1) {
        const columnValue = observation.features[column]
        if (columnValue === undefined) throw new LearningError('CALIBRATION_EVIDENCE_INVALID')
        normal[row]![column] = normal[row]![column]! + (rowValue * columnValue)
      }
      normal[row]![FEATURE_COUNT] = normal[row]![FEATURE_COUNT]! + (rowValue * observation.observedRisk)
    }
  }
  for (let pivot = 0; pivot < FEATURE_COUNT; pivot += 1) {
    let pivotRow = pivot
    for (let row = pivot + 1; row < FEATURE_COUNT; row += 1) {
      if (Math.abs(normal[row]![pivot]!) > Math.abs(normal[pivotRow]![pivot]!)) pivotRow = row
    }
    const pivotValue = normal[pivotRow]![pivot]!
    if (pivotValue === 0) throw new LearningError('CALIBRATION_MATRIX_SINGULAR')
    const temporary = normal[pivot]!
    normal[pivot] = normal[pivotRow]!
    normal[pivotRow] = temporary
    for (let column = pivot; column <= FEATURE_COUNT; column += 1) {
      normal[pivot]![column] = normal[pivot]![column]! / pivotValue
    }
    for (let row = 0; row < FEATURE_COUNT; row += 1) {
      if (row === pivot) continue
      const factor = normal[row]![pivot]!
      for (let column = pivot; column <= FEATURE_COUNT; column += 1) {
        normal[row]![column] = normal[row]![column]! - (factor * normal[pivot]![column]!)
      }
    }
  }
  return normal.map((row) => Math.max(0, row[FEATURE_COUNT]!))
}

export function calibratePredictionModel(input: {
  readonly parentModelVersion: string
  readonly actuals: readonly ActualPerformanceArtifact[]
  readonly observations: readonly CalibrationObservation[]
}): CalibratedPredictionModel {
  const byVideo = new Map(input.actuals.map((actual) => [actual.youtubeVideoId, actual]))
  if (byVideo.size < thresholds.PREDICTION.RECALIBRATE_AFTER_VIDEOS) {
    throw new LearningError('CALIBRATION_SAMPLE_SIZE_INSUFFICIENT')
  }
  if (input.parentModelVersion.trim().length === 0 || input.observations.length < FEATURE_COUNT
    || input.observations.some((observation) => {
      const actual = byVideo.get(observation.videoId)
      return actual === undefined || actual.canonicalHash !== observation.analyticsHash
        || !observation.features.every(Number.isFinite) || !Number.isFinite(observation.observedRisk)
    })) {
    throw new LearningError('CALIBRATION_EVIDENCE_INVALID')
  }
  const fitted = solveLeastSquares(input.observations)
  const analyticsHashes = [...new Set(input.actuals.map((actual) => actual.canonicalHash))].sort()
  const weights = {
    stateStaleness: fitted[0]!,
    entityDensity: fitted[1]!,
    openLoopDistance: fitted[2]!,
    archetypeStaleness: fitted[3]!,
  }
  const lineage = { parent_model_version: input.parentModelVersion, weights, analytics_hashes: analyticsHashes }
  const modelHash = canonicalHash(lineage)
  return {
    modelVersion: `calibrated:${modelHash}`,
    parentModelVersion: input.parentModelVersion,
    weights,
    analyticsHashes,
    canonicalHash: modelHash,
  }
}

export function registerExperiment(input: {
  readonly id: string
  readonly channelId: string
  readonly hypothesis: string
  readonly variableTested: string
  readonly heldConstants: readonly string[]
  readonly minSampleSize: number
  readonly decisionCriterion: string
}): Experiment {
  const heldConstants = [...new Set(input.heldConstants.map((item) => item.trim()))].filter((item) => item.length > 0)
  if (input.id.trim().length === 0 || input.channelId.trim().length === 0
    || input.hypothesis.trim().length === 0 || input.variableTested.trim().length === 0
    || input.decisionCriterion.trim().length === 0 || !Number.isSafeInteger(input.minSampleSize)
    || input.minSampleSize <= 0 || heldConstants.length === 0
    || heldConstants.includes(input.variableTested.trim())) {
    throw new LearningError('EXPERIMENT_INVALID')
  }
  const payload = {
    id: input.id,
    channel_id: input.channelId,
    hypothesis: input.hypothesis,
    variable_tested: input.variableTested,
    held_constants: heldConstants,
    min_sample_size: input.minSampleSize,
    decision_criterion: input.decisionCriterion,
    status: 'RUNNING' as const,
  }
  return {
    id: payload.id,
    channelId: payload.channel_id,
    hypothesis: payload.hypothesis,
    variableTested: payload.variable_tested,
    heldConstants: payload.held_constants,
    minSampleSize: payload.min_sample_size,
    decisionCriterion: payload.decision_criterion,
    status: payload.status,
    canonicalHash: canonicalHash(payload),
  }
}

export function assessLearning(input: LearningCandidate): AssessedLearning {
  if (input.id.trim().length === 0 || input.finding.trim().length === 0) {
    throw new LearningError('LEARNING_SCOPE_INVALID')
  }
  const knowledgeKind = input.knowledgeKind ?? 'STRUCTURE'
  const replicatedChannelIds = [...new Set(input.replicatedChannelIds)].sort()
  if (input.scope === 'CHANNEL' && (input.channelId === null || input.channelId !== input.experiment.channelId)) {
    throw new LearningError('LEARNING_SCOPE_INVALID')
  }
  if (input.scope === 'PORTFOLIO') {
    if (input.channelId !== null) throw new LearningError('LEARNING_SCOPE_INVALID')
    if (replicatedChannelIds.length < thresholds.LEARNING.PORTFOLIO_MIN_CHANNELS) {
      throw new LearningError('PORTFOLIO_REPLICATION_INSUFFICIENT')
    }
    if (knowledgeKind === 'VOICE') throw new LearningError('VOICE_CANNOT_CROSS_CHANNELS')
  }
  const observations = new Map(input.observations.map((observation) => [observation.videoId, observation]))
  const directions = new Set([...observations.values()].map((observation) => observation.direction))
  const enoughSamples = observations.size >= input.experiment.minSampleSize
  const consistent = observations.size >= thresholds.LEARNING.MIN_CONSISTENT_VIDEOS && directions.size === 1
  const ready = enoughSamples && consistent
  const direction = ready ? [...directions][0] ?? null : null
  const analyticsHashes = [...new Set([...observations.values()].map((observation) => observation.analyticsHash))].sort()
  const payload = {
    id: input.id,
    experiment_id: input.experiment.id,
    experiment_status: ready ? 'CONCLUDED' as const : 'RUNNING' as const,
    scope: input.scope,
    channel_id: input.channelId,
    replicated_channel_ids: replicatedChannelIds,
    knowledge_kind: knowledgeKind,
    finding: input.finding,
    supporting_video_count: observations.size,
    direction,
    analytics_hashes: analyticsHashes,
    status: ready ? 'READY' as const : 'INSUFFICIENT_EVIDENCE' as const,
  }
  return {
    id: payload.id,
    experimentId: payload.experiment_id,
    experimentStatus: payload.experiment_status,
    scope: payload.scope,
    channelId: payload.channel_id,
    replicatedChannelIds: payload.replicated_channel_ids,
    knowledgeKind: payload.knowledge_kind,
    finding: payload.finding,
    supportingVideoCount: payload.supporting_video_count,
    direction: payload.direction,
    analyticsHashes: payload.analytics_hashes,
    status: payload.status,
    canonicalHash: canonicalHash(payload),
  }
}

function validOwnerCommand(command: PromoteLearningCommandEvidence, learningId: string): boolean {
  return command.type === 'PROMOTE_LEARNING'
    && command.learningId === learningId
    && command.ownerActive
    && command.executed
    && command.ownerIdentity.trim().length > 0
    && command.signature.trim().length > 0
    && HEX_64.test(command.evidenceHash)
    && Number.isFinite(Date.parse(command.createdAt))
}

export function promoteLearning(
  learning: AssessedLearning,
  command: PromoteLearningCommandEvidence,
  target: LearningPromotionTarget,
): LearningPromotion {
  if (learning.status !== 'READY') throw new LearningError('LEARNING_NOT_READY')
  if (!validOwnerCommand(command, learning.id)) throw new LearningError('OWNER_COMMAND_INVALID')
  if (target.ref.trim().length === 0 || !Number.isSafeInteger(target.versionBefore) || target.versionBefore < 0) {
    throw new LearningError('LEARNING_NOT_READY', ['PROMOTION_TARGET_INVALID'])
  }
  const payload = {
    learning_id: learning.id,
    command_id: command.id,
    target_kind: target.kind,
    target_ref: target.ref,
    target_version_before: target.versionBefore,
    target_version_after: target.versionBefore + 1,
    owner_identity: command.ownerIdentity,
    evidence_hash: command.evidenceHash,
    status: 'PROMOTED' as const,
  }
  return {
    learningId: payload.learning_id,
    commandId: payload.command_id,
    targetKind: payload.target_kind,
    targetRef: payload.target_ref,
    targetVersionBefore: payload.target_version_before,
    targetVersionAfter: payload.target_version_after,
    ownerIdentity: payload.owner_identity,
    evidenceHash: payload.evidence_hash,
    status: payload.status,
    canonicalHash: canonicalHash(payload),
  }
}

export type * from './types.js'
