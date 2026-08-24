import { z } from 'zod'

const Hex64Schema = z.string().regex(/^[0-9a-f]{64}$/u)

export const RetentionSampleSchema = z.object({
  elapsedVideoTimeRatio: z.number().min(0).max(1),
  audienceWatchRatio: z.number().nonnegative(),
  relativeRetentionPerformance: z.number().nonnegative(),
}).strict()

export const AnalyticsMetricsSchema = z.object({
  retentionCurve: z.array(RetentionSampleSchema).min(1),
  impressions: z.number().int().nonnegative(),
  impressionClickThroughRate: z.number().min(0).max(1),
  averageViewDurationSec: z.number().nonnegative(),
  averageViewPercentage: z.number().nonnegative(),
  trafficSources: z.array(z.object({
    source: z.string().min(1),
    views: z.number().int().nonnegative(),
  }).strict()),
}).strict()

export const YoutubeVideoBindingSchema = z.object({
  packageId: z.string().min(1),
  youtubeVideoId: z.string().min(1),
  masterId: z.string().min(1),
  masterSha256: Hex64Schema,
  verified: z.boolean(),
  verificationEvidenceR2Key: z.string().min(1),
}).strict()

export const AnalyticsIngestInputSchema = z.object({
  id: z.string().min(1),
  packageId: z.string().min(1),
  youtubeVideoId: z.string().min(1),
  masterId: z.string().min(1),
  masterSha256: Hex64Schema,
  source: z.string().min(1),
  simulated: z.boolean(),
  publishedAt: z.string().datetime({ offset: true }),
  fetchedAt: z.string().datetime({ offset: true }),
  windowDays: z.number().int(),
  responseEvidenceR2Key: z.string(),
  responseSha256: Hex64Schema,
  binding: YoutubeVideoBindingSchema,
  metrics: AnalyticsMetricsSchema,
}).strict()

export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>
export type AnalyticsIngestInput = z.infer<typeof AnalyticsIngestInputSchema>

export interface ActualPerformanceArtifact {
  readonly id: string
  readonly packageId: string
  readonly youtubeVideoId: string
  readonly masterId: string
  readonly masterSha256: string
  readonly source: 'YOUTUBE_ANALYTICS_API'
  readonly simulated: false
  readonly publishedAt: string
  readonly fetchedAt: string
  readonly windowDays: number
  readonly responseEvidenceR2Key: string
  readonly responseSha256: string
  readonly metrics: AnalyticsMetrics
  readonly canonicalHash: string
}

export interface PredictionForAnalysis {
  readonly packageId: string
  readonly modelVersion: string
  readonly canonicalHash: string
  readonly retentionCurve: readonly {
    readonly elapsedPct: number
    readonly predictedRetention: number
  }[]
  readonly ctrEstimate: number
}

export interface DeviationReport {
  readonly packageId: string
  readonly predictionHash: string
  readonly analyticsHash: string
  readonly retentionMae: number
  readonly beatErrors: readonly {
    readonly elapsedVideoTimeRatio: number
    readonly predictedRetention: number
    readonly actualRetention: number
    readonly error: number
  }[]
  readonly ctrDelta: number
  readonly canonicalHash: string
}

export interface CalibrationObservation {
  readonly analyticsHash: string
  readonly videoId: string
  readonly features: readonly [number, number, number, number]
  readonly observedRisk: number
}

export interface CalibratedPredictionModel {
  readonly modelVersion: string
  readonly parentModelVersion: string
  readonly weights: {
    readonly stateStaleness: number
    readonly entityDensity: number
    readonly openLoopDistance: number
    readonly archetypeStaleness: number
  }
  readonly analyticsHashes: readonly string[]
  readonly canonicalHash: string
}

export interface Experiment {
  readonly id: string
  readonly channelId: string
  readonly hypothesis: string
  readonly variableTested: string
  readonly heldConstants: readonly string[]
  readonly minSampleSize: number
  readonly decisionCriterion: string
  readonly status: 'RUNNING' | 'CONCLUDED' | 'ABANDONED'
  readonly canonicalHash: string
}

export interface ExperimentObservation {
  readonly videoId: string
  readonly analyticsHash: string
  readonly direction: 'POSITIVE' | 'NEGATIVE'
  readonly effect: number
}

export interface LearningCandidate {
  readonly id: string
  readonly experiment: Experiment
  readonly scope: 'CHANNEL' | 'PORTFOLIO'
  readonly channelId: string | null
  readonly replicatedChannelIds: readonly string[]
  readonly finding: string
  readonly observations: readonly ExperimentObservation[]
  readonly knowledgeKind?: 'STRUCTURE' | 'VOICE'
}

export interface AssessedLearning {
  readonly id: string
  readonly experimentId: string
  readonly experimentStatus: 'RUNNING' | 'CONCLUDED'
  readonly scope: 'CHANNEL' | 'PORTFOLIO'
  readonly channelId: string | null
  readonly replicatedChannelIds: readonly string[]
  readonly knowledgeKind: 'STRUCTURE' | 'VOICE'
  readonly finding: string
  readonly supportingVideoCount: number
  readonly direction: 'POSITIVE' | 'NEGATIVE' | null
  readonly analyticsHashes: readonly string[]
  readonly status: 'INSUFFICIENT_EVIDENCE' | 'READY' | 'PROMOTED' | 'REJECTED'
  readonly canonicalHash: string
}

export interface PromoteLearningCommandEvidence {
  readonly id: string
  readonly type: 'PROMOTE_LEARNING'
  readonly learningId: string
  readonly ownerIdentity: string
  readonly ownerActive: boolean
  readonly signature: string
  readonly evidenceHash: string
  readonly executed: boolean
  readonly createdAt: string
}

export interface LearningPromotionTarget {
  readonly kind: 'STANDARD' | 'STRATEGY'
  readonly ref: string
  readonly versionBefore: number
}

export interface LearningPromotion {
  readonly learningId: string
  readonly commandId: string
  readonly targetKind: 'STANDARD' | 'STRATEGY'
  readonly targetRef: string
  readonly targetVersionBefore: number
  readonly targetVersionAfter: number
  readonly ownerIdentity: string
  readonly evidenceHash: string
  readonly status: 'PROMOTED'
  readonly canonicalHash: string
}
