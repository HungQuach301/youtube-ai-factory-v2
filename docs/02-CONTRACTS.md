# 02 — CONTRACTS (v2 — hợp nhất)

**Đây là nguồn chân lý.** Nếu code mâu thuẫn tài liệu này, code sai. Mọi ngưỡng số trong hệ thống nằm ở đây và **chỉ** ở đây — agent không được hardcode số ở nơi khác.

v2 hợp nhất toàn bộ delta từ tài liệu 08–13. Không còn "CONTRACT DELTA" rải rác: mọi thứ ở dưới.

Triển khai thành `packages/contracts/src/`.

---

## 1. Branded IDs — `ids.ts`

```ts
declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type ChannelId        = Brand<string, 'ChannelId'>
export type EpisodeId        = Brand<string, 'EpisodeId'>
export type PackageId        = Brand<string, 'PackageId'>
export type StageInstanceId  = Brand<string, 'StageInstanceId'>
export type ArtifactId       = Brand<string, 'ArtifactId'>
export type CapabilityId     = Brand<string, 'CapabilityId'>
export type ArchetypeId      = Brand<string, 'ArchetypeId'>
export type ClaimId          = Brand<string, 'ClaimId'>
export type ShotId           = Brand<string, 'ShotId'>
export type MasterId         = Brand<string, 'MasterId'>
export type ReservationId    = Brand<string, 'ReservationId'>
export type LearningId       = Brand<string, 'LearningId'>
export type ProposalId       = Brand<string, 'ProposalId'>      // v2
export type GoldSampleId     = Brand<string, 'GoldSampleId'>    // v2
export type IncidentId       = Brand<string, 'IncidentId'>      // v2
export type HumanActorId     = Brand<string, 'HumanActorId'>    // v2
export type Hex64            = Brand<string, 'Hex64'>
export type FencingToken     = Brand<number, 'FencingToken'>
export type R2Key            = Brand<string, 'R2Key'>
export type TraceId          = Brand<string, 'TraceId'>
```

---

## 2. Enums & unions — `enums.ts`

```ts
export type Namespace = 'production' | 'qualification' | 'staging' | 'quarantine'

// P4 — hai trục trạng thái độc lập
export type ImmutabilityState = 'DRAFT' | 'SEALED' | 'SUPERSEDED'
export type EligibilityState  = 'INELIGIBLE' | 'ELIGIBLE_FOR_STAGE' | 'ELIGIBLE_FOR_RELEASE'

export type ControlState =
  | 'NOT_STARTED' | 'RUNNING' | 'PRODUCED' | 'VERIFIED' | 'FROZEN' | 'REOPENED'

// P2 — bốn trạng thái, không phải hai
export type GateState = 'PASS' | 'FAIL' | 'NOT_EVALUATED' | 'WAIVED'
export type GateTier  = 'M0' | 'M1' | 'M2'

export type CapabilityState =
  | 'REGISTERED' | 'FIXTURE_DESIGNED' | 'QUALIFICATION_RUNNING'
  | 'QUALIFIED' | 'SUPERSEDED' | 'REVOKED'

// G8 — chỉ hai lớp đầu được retry
export type ErrorClass =
  | 'TRANSIENT' | 'RATE_LIMIT'
  | 'SCHEMA_VIOLATION' | 'RIGHTS_DENIED' | 'BUDGET_DENIED'
  | 'CONTENT_FILTERED' | 'PROVIDER_ERROR'
export const RETRYABLE: readonly ErrorClass[] = ['TRANSIENT', 'RATE_LIMIT'] as const

export type ClaimType = 'FACT' | 'ESTIMATE' | 'MECHANISM' | 'INTERPRETATION' | 'PREDICTION'
export type SourceTier = 1 | 2 | 3 | 4
export type VisualRoute = 'SOURCE' | 'MAKE' | 'HYBRID'
export type MotionClass = 'CAMERA_ONLY' | 'LAYERED_SEMANTIC' | 'SOURCE_SEMANTIC'

export type HookType =
  | 'cold_open_anomaly' | 'direct_question' | 'stakes_statement'
  | 'in_medias_res' | 'counterintuitive_claim' | 'visual_reveal'

export type NarrativeDevice =
  | 'chronological' | 'mystery_reveal' | 'comparison'
  | 'case_study' | 'mechanism_teardown' | 'counterfactual'

export type VisualArchetype =
  | 'transaction_state_proof' | 'process_route' | 'data_visualization'
  | 'documentary_live_action' | 'source_authored_hybrid'
  | 'abstract_authored' | 'rights_sensitive' | 'mobile_text_intensive'

export type AudioArchetype =
  | 'high_energy_hook' | 'number_heavy_narration' | 'dense_mechanism'
  | 'authorization_clearing_settlement' | 'long_section_continuity'
  | 'causal_sfx_ambience' | 'music_transition' | 'silence_consequence_payoff'

export type CriticCode =
  | 'EXECUTIVE_PRODUCER' | 'STORY_RETENTION' | 'VISUAL_DIRECTION'
  | 'SEMANTIC_ALIGNMENT' | 'AUDIO_DIRECTION' | 'AUDIENCE_SIMULATION'
  | 'COMPETITIVE_EDITOR' | 'TRUTH_BRAND_SAFETY' | 'PACKAGING_CTR'

export type MusicCueFunction =
  | 'curiosity' | 'orientation' | 'mechanism' | 'escalation'
  | 'reveal' | 'consequence' | 'payoff' | 'silence'

export type MasterTier = 'ARCHIVAL' | 'DISTRIBUTION'
export type LearningStatus = 'INSUFFICIENT_EVIDENCE' | 'READY' | 'PROMOTED' | 'REJECTED'

// ---------- v2 ----------
export type AgentMode = 'BUILD' | 'OPERATE' | 'EVOLVE'
export type LearningScope = 'CHANNEL' | 'PORTFOLIO'
export type StrictnessDirection = 'TIGHTEN' | 'RELAX' | 'NEUTRAL'
export type ProposalKind =
  | 'THRESHOLD' | 'GATE' | 'CAPABILITY' | 'PIPELINE_CODE' | 'LEXICON' | 'POLICY'
export type ProposalStatus =
  | 'DETECTED' | 'PROPOSED' | 'SHADOW_RUNNING' | 'EVIDENCE_READY'
  | 'PROMOTED' | 'REJECTED' | 'EXPIRED'
export type HumanDecisionType = 'D1' | 'D2' | 'D3' | 'D4' | 'D5'
export type Touchpoint = 'HP01'|'HP02'|'HP03'|'HP04'|'HP05'|'HP06'|'HP07'
export type IncidentLevel = 'I1' | 'I2' | 'I3' | 'I4'
export type PolicyCheckCode = 'PC1'|'PC2'|'PC3'|'PC4'|'PC5'|'PC6'|'PC7'|'PC8'
export type DefectSeverity = 'P0' | 'P1' | 'P2'
export type ProfileName = 'FULL' | 'REDUCED'    // 13-TRACK-G-CONFIG
```

---

## 3. Ngưỡng — `thresholds.ts`

**Mọi số trong hệ thống nằm ở đây.**

```ts
export const SCRIPT = {
  DURATION_SEC:            { min: 480,  max: 720 },
  WPM_OVERALL:             { min: 140,  max: 160 },
  WPM_HOOK:                { min: 150,  max: 170 },
  WPM_DENSE_MECHANISM:     { min: 125,  max: 150 },
  WPM_PAYOFF:              { min: 135,  max: 155 },
  SYLLABLES_PER_SEC:       { min: 3.3,  max: 3.8 },
  SENTENCE_WORDS_MEDIAN:   { min: 10,   max: 18 },
  SENTENCE_WORDS_REVIEW:   24,
  BREATH_GROUP_WORDS:      { min: 5,    max: 12 },
  BREATH_GROUP_SEC:        { min: 2.5,  max: 5 },
  NEW_ENTITY_PER_15S:      2,
} as const

export const STORY = {
  HOOK_END_SEC:            15,
  PROMISE_END_SEC:         30,
  MIDPOINT_REHOOK_PCT:     { min: 0.40, max: 0.60 },
  PAYOFF_START_PCT:        0.80,
  LOOP_MAX_SPAN_PCT:       0.40,
} as const

export const CREATIVE = {
  ROUTE_COUNT:             4,
  CHAMPION_MIN_SCORE:      95,
  CRITIC_COUNT_STAGE_04:   7,
  GENERATE_TEMPERATURE:    { min: 0.9,  max: 1.1 },
  JUDGE_TEMPERATURE:       0,
  JUDGE_SCORE:             { min: 0, max: 100 },
} as const

export const ANTICOPY = {
  MAX_SHARED_NGRAM:            7,
  JACCARD_5GRAM_MAX:           0.15,
  BEAT_SEQUENCE_DIFF_MIN:      0.40,
  THUMBNAIL_PHASH_HAMMING_MIN: 20,
  TITLE_COSINE_MAX:            0.85,
  DIFFERENTIATION_MIN:         null,   // UNCALIBRATED → hiệu chỉnh sau 10–15 video
} as const

export const SHOT = {
  DURATION_SEC:            { min: 3,    max: 20 },
  MEDIAN_DURATION_SEC:     { min: 6,    max: 12 },
  MAX_CONSECUTIVE_SAME_ARCHETYPE: 2,
  MAX_NO_ARCHETYPE_CHANGE_SEC:    25,
  DURATION_TOLERANCE_FRAMES:      1,
  // hard limit 90–180 shots ĐÃ BỊ BỎ
} as const

export const VISUAL = {
  CAMERA_ONLY_MAX_PCT:      0.35,
  LAYERED_SEMANTIC_MIN_PCT: 0.45,
  SOURCE_VIDEO_MIN_PCT:     0.20,
  TREATMENTS_MIN:           3,
  TREATMENTS_TARGET:        { min: 5, max: 7 },
  COMPOSITIONS_PER_CRITICAL_UNIT_MIN: 3,
  SOURCE_CANDIDATES:        { min: 6, max: 12 },
  DUPLICATE_MAX_PCT:        0.02,
  PHASH_HAMMING_DUPLICATE:  10,
  SEMANTIC_FIT_CRITICAL:    94,
  SEMANTIC_FIT_NORMAL:      90,
  SEMANTIC_FIT_SUPPORTING:  86,
  NEAR_STATIC_MAX_SEC:      7,
  NEAR_STATIC_SSIM:         0.98,
} as const

export const AUDIO = {
  LUFS_I:                  { target: -14, tolerance: 1 },
  TRUE_PEAK_MAX_DBTP:      -1,
  LRA:                     { min: 4, max: 8 },
  NARRATION_OVER_MUSIC_LU: { min: 10, target_min: 12, target_max: 16 },
  DUCK_DB:                 { min: 6, max: 12 },
  DUCK_ATTACK_MS:          { min: 80, max: 250 },
  DUCK_RELEASE_MS:         { min: 300, max: 800 },
  SAMPLE_RATE_HZ:          48000,
  PROVIDER_SPEED:          { min: 0.95, max: 1.08 },
  PAUSE_MICRO_MS:          { min: 80,  max: 200 },
  PAUSE_CLAUSE_MS:         { min: 150, max: 300 },
  PAUSE_SENTENCE_MS:       { min: 250, max: 500 },
  PAUSE_BEAT_RESET_MS:     { min: 500, max: 900 },
  PAUSE_DRAMATIC_MAX_MS:   1200,
  TTS_SECTION_CHARS:       { min: 300, max: 800 },
  TTS_CONTEXT_CHARS:       { min: 200, max: 300 },
  SEAM_F0_MAX_SEMITONE:    2,
  // P5 — ngưỡng thật = max(base, error_floor × multiplier); floor phải ĐO
  PHONEME_MISMATCH_BASE:   0.01,
  PHONEME_MISMATCH_FLOOR_MULTIPLIER: 2,
} as const

// C4 — dung sai theo archetype
export const AV_SYNC_MS: Record<string, number> = {
  documentary_live_action: 45,
  source_authored_hybrid:  80,
  DEFAULT:                 120,
} as const

export const MASTER = {
  WIDTH: 1920, HEIGHT: 1080, FPS: 30,
  COLOR: 'bt709',
  ARCHIVAL_VIDEO_CODEC: 'ffv1',
  ARCHIVAL_AUDIO_CODEC: 'pcm_s24le',
  DISTRIBUTION_VIDEO_CODEC: 'libvpx-vp9',
  DISTRIBUTION_AUDIO_CODEC: 'libopus',
  AV_DURATION_TOLERANCE_FRAMES: 1,
} as const

export const ASSURANCE = {
  CRITIC_COUNT: 9,
  TEMPORAL_SAMPLES_PER_SHOT: 3,
  FLOORS: {
    FACTUAL_SAFETY:        94,
    SEMANTIC_ALIGNMENT:    94,
    VOICE_INTELLIGIBILITY: 94,
    STORY_PAYOFF:          90,
    VISUAL_DIRECTION:      90,
    MUSIC_SOUND_DESIGN:    90,
    RETENTION:             90,
    MOBILE_LEGIBILITY:     90,
    PACKAGING_CTR:         90,
    EXECUTIVE_PRODUCER:    90,
    COMPETITIVE_EDITOR:    90,
    OVERALL:               92,
  },
  P0_MAX: 0,
  CRITICAL_P1_MAX: 0,
  BORDERLINE_BAND: 3,
  RERUN_N: 3,
  MAX_VARIANCE: 3,
} as const

export const QUALIFICATION = {
  RUNS_CRITICAL: 10,
  RUNS_HIGH: 8,
  YIELD_ASSURANCE: 1.00,
  YIELD_AUDIO: 0.97,
  YIELD_VISUAL: 0.95,
  YIELD_CONTROL: 0.95,
  GOLD_SET_MIN_SAMPLES: 30,
  GOLD_RECALL_P0: 1.00,
  GOLD_RECALL_P1: 0.90,
  GOLD_PRECISION_MIN: 0.80,
} as const

export const MOBILE = {
  QA_SCALE: 0.25,
  MIN_X_HEIGHT_PX: 10,
  MIN_CONTRAST_NORMAL: 4.5,
  MIN_CONTRAST_LARGE: 3.0,
  CAPTION_MAX_WORDS: 5,
} as const

export const LEASE = { HEARTBEAT_SEC: 30, TTL_SEC: 90 } as const
export const RETRY = { MAX_ATTEMPTS: 3, BASE_BACKOFF_MS: 1000, JITTER_RATIO: 0.3 } as const

export const LEARNING = {
  ANALYTICS_WINDOW_DAYS: { min: 14, max: 28 },
  MIN_CONSISTENT_VIDEOS: 2,
  PORTFOLIO_MIN_CHANNELS: 2,          // v2 — nâng CHANNEL→PORTFOLIO
} as const

export const SOURCE_QUALITY = {
  CRITICAL_CLAIM_MIN_TIER: 2 as SourceTier,
  FRESHNESS_DAYS: {
    DEMAND_SIGNAL: 90,
    COMPETITIVE: 180,
    INDUSTRY_QUANTITATIVE: 365,
  },
} as const

// ============ v2 — VẬN HÀNH ============
export const OPS = {
  DAILY_SESSION_MAX_MIN: 30,
  SPEND_ALERT_PCT: 0.80,
  GATE_FAIL_REPEAT_TO_LRN04: 2,
  OPSLOG_AUDIT_INTERVAL_DAYS: 7,
  BUILD_AUDIT_INTERVAL_WP: 3,
} as const

// ============ v2 — ĐIỂM CHẠM CON NGƯỜI ============
export const ATTENTION = {
  HP02_MIN_PER_VIDEO:  { min: 10, max: 20 },
  HP03_MIN_PER_VIDEO:  { min: 5,  max: 10 },
  HP04_MIN_PER_REJECT: { min: 10, max: 15 },
  HP05_MIN_PER_WEEK:   { min: 15, max: 30 },
  OWNER_WEEKLY_CEILING_MIN: 300,      // confirmed by owner 2026-08-23
  QUEUE_AGE_ALERT_HOURS: 48,
  RATIONALE_MIN_CHARS: 20,
} as const

// ============ v2 — PHÒNG THỦ CHÍNH SÁCH ============
export const POLICY = {
  MIN_HUMAN_DECISIONS: 2,                    // ≥2 quyết định, ≥2 loại khác nhau
  MIN_DISTINCT_DECISION_TYPES: 2,
  DECISION_TYPE_DIVERSITY_WINDOW: 5,         // 5 video gần nhất không được cùng một loại
  SELF_SIMILARITY_WINDOW_VIDEOS: 10,
  SELF_BEAT_SEQUENCE_DIFF_MIN: 0.30,         // UNCALIBRATED
  SELF_THUMBNAIL_PHASH_HAMMING_MIN: 16,      // UNCALIBRATED
  INCIDENT_CLEAN_DAYS_FOR_SAMPLING: 90,
  ESCAPED_P0_CLEAN_DAYS_FOR_SAMPLING: 90,
  POLICY_WATCH_INTERVAL_DAYS: 7,
  POLICY_CHECK_COUNT: 8,                     // PC1..PC8, tất cả phải PASS (G15)
  SAMPLING_MIN_CLEAN_STREAK: 15,             // owner confirmed 2026-08-23
  KILL_CRITERIA_VIDEO_COUNT: 12,             // owner confirmed 2026-08-23
  POLICY_SNAPSHOT_SOURCES: ['ypp_monetization','inauthentic_content',
                            'synthetic_disclosure','advertiser_friendly'],
  DISCLOSURE_DEFAULT: true,
  OPERATOR_EMERGENCY_FREEZE: true,
  FREEZE_OWNER_CONFIRM_HOURS: 24,
} as const

// ============ v2 — TIẾN HÓA ============
export const EVOLUTION = {
  SHADOW_MIN_ARTIFACTS: 10,          // threshold change: chạy lại trên ≥10 artifact gần nhất
  SHADOW_GOLD_REGRESSION_REQUIRED: true,
  PROPOSAL_EXPIRY_DAYS: 30,
  ESCAPED_P0_PROPOSAL_SLA_HOURS: 48,
  REJECTED_MASTER_TO_GOLD_SLA_DAYS: 7,
  QUARANTINE_CLUSTER_PROPOSAL_PCT: 0.20,
} as const

// ============ v2 — PROFILE (13-TRACK-G-CONFIG) ============
// Tham số duy nhất được đổi theo profile. Mọi giá trị khác giữ nguyên.
export const PROFILE: Record<ProfileName, {
  routeCount: number
  compositionsPerCriticalUnit: number
  criticCountStage04: number
  criticCountAssurance: number
  sourceCandidates: number
  temporalSamplesPerShot: number
  treatmentsMin: number
}> = {
  FULL: {
    routeCount: 4, compositionsPerCriticalUnit: 3, criticCountStage04: 7,
    criticCountAssurance: 9, sourceCandidates: 8, temporalSamplesPerShot: 3,
    treatmentsMin: 3,
  },
  REDUCED: {
    routeCount: 2, compositionsPerCriticalUnit: 1, criticCountStage04: 3,
    criticCountAssurance: 4, sourceCandidates: 6, temporalSamplesPerShot: 1,
    treatmentsMin: 3,
  },
} as const
```

### Trần chi phí owner đã xác nhận — PRV-02 dùng trực tiếp
```ts
export const SPEND = {
  CEILING_PER_VIDEO_USD: 30,
  CEILING_PER_CHANNEL_WEEK_USD: 70,
  CEILING_PORTFOLIO_MONTH_USD: 900,
  QUALIFICATION_BUDGET_USD: 400,
  TRACK_G_BUDGET_USD: 350,
  SCALED_TARGET_COST_PER_VIDEO_USD: 18,
} as const
```

### Giá trị chưa xác định — agent phải hỏi, không được đặt mặc định
```ts
export const UNDECIDED = {
  TARGET_VIDEOS_PER_CHANNEL_PER_WEEK: null,   // → 07 §1
  IDENTITY_SCOPE: null,                       // → 07 §2  'channel' | 'video'
  PRODUCTION_AUDIO_PROVIDER: null,            // → 07 §5
  ALIGNER_ERROR_FLOOR: null,                  // → phải ĐO (WP-15)
  SAMPLING_THRESHOLD_N: null,                 // → 07 §10
  BASELINE_RETENTION_SOURCE: null,            // → 07 §8
  MEDIA_INFRA: null,                          // → 07 §4
} as const
```

### Ngưỡng chưa hiệu chuẩn (P5) — phải đánh dấu tường minh
```ts
export const UNCALIBRATED: readonly string[] = [
  'ANTICOPY.DIFFERENTIATION_MIN',
  'POLICY.SELF_BEAT_SEQUENCE_DIFF_MIN',
  'POLICY.SELF_THUMBNAIL_PHASH_HAMMING_MIN',
  'AUDIO.PHONEME_MISMATCH_BASE',   // đến khi ALIGNER_ERROR_FLOOR đo xong
] as const
// Lint: ngưỡng trong danh sách này không được dùng làm gate M0/M1
// cho tới khi có evidence hiệu chuẩn. Dùng làm cảnh báo thì được.
```

---

## 4. Commands — `commands.ts`

```ts
export type CommandType =
  | 'START_STAGE' | 'PRODUCE_ARTIFACT' | 'VERIFY_ARTIFACT'
  | 'FREEZE_STAGE' | 'REOPEN_ROOT_STAGE'
  | 'AUTHORIZE_RELEASE' | 'AUTHORIZE_PUBLISH' | 'PROMOTE_LEARNING'
  | 'PROMOTE_EVOLUTION' | 'RETIRE_GOLD_SAMPLE'          // v2
  | 'FREEZE_CHANNEL' | 'UNFREEZE_CHANNEL'                // v2

// P10 — năm lệnh bắt buộc chữ ký owner
export const OWNER_COMMANDS: readonly CommandType[] = [
  'AUTHORIZE_RELEASE', 'AUTHORIZE_PUBLISH', 'PROMOTE_LEARNING',
  'PROMOTE_EVOLUTION', 'RETIRE_GOLD_SAMPLE',
] as const

// FREEZE_CHANNEL: operator được phát khẩn cấp (07 §10), owner xác nhận sau
// UNFREEZE_CHANNEL: owner-only, thêm điều kiện learning đã promote (schema 0010)
export const OPERATOR_EMERGENCY_COMMANDS: readonly CommandType[] = ['FREEZE_CHANNEL'] as const

export interface CommandBase {
  type: CommandType
  packageId: PackageId
  idempotencyKey: Hex64      // sha256(stageId ‖ inputHash ‖ attemptOrdinal)
  fencingToken: FencingToken
  prevState: string
  traceId: TraceId
}

export interface OwnerCommand extends CommandBase {
  ownerIdentity: string
  signature: string
  evidenceHash: Hex64
}

export type CommandResult =
  | { ok: true; nextState: string }
  | { ok: false; reason:
        | 'STALE_WRITER' | 'DUPLICATE' | 'STATE_CONFLICT'
        | 'UNAUTHORIZED' | 'DOR_FAILED'
        | 'POLICY_BLOCKED' | 'CHANNEL_FROZEN' }   // v2
```

---

## 5. Provider adapter — `provider.ts`

```ts
export interface CostEstimate {
  maxCostUsd: number
  basis: 'token_count' | 'char_count' | 'per_asset' | 'per_second'
  detail: Record<string, number>
}

export interface ProviderAdapter<Req, Res> {
  readonly capabilityId: CapabilityId
  readonly version: string
  readonly settingsHash: Hex64
  estimateCost(req: Req): CostEstimate        // đếm thật, KHÔNG đoán
  dispatch(req: Req, idempotencyKey: Hex64): Promise<Res>
  actualCost(response: Res): number            // giá thật, hữu hạn, không âm, ≤ reservation
  normalizeError(e: unknown): ErrorClass
}

export interface DispatchExecutionContext {
  fencingToken: FencingToken
  packageId: PackageId
  stageInstanceId: StageInstanceId
  traceId: TraceId
  namespace: 'production' | 'qualification' | 'staging'
  reservationId: ReservationId
  portfolioRef: string
  channelRef?: string
  createdAt: string
  expiresAt: string
}

export interface DispatchGuardRuntime {
  execute<Req, Res>(
    input: DispatchGuardInput<Req>,
    transport: () => Promise<{ response: Res; actualCostUsd: number }>,
  ): Promise<Res>
}

// G9 — điểm chặn duy nhất
export function guardedDispatch<Req, Res>(
  adapter: ProviderAdapter<Req, Res>,
  archetype: ArchetypeId,
  request: Req,
  ctx: DispatchExecutionContext & {
    requestSettingsHash: Hex64
    dispatchGuard: DispatchGuardRuntime
  }
): Promise<Res>
```

---

## 6. Job envelope — `envelope.ts`

```ts
export const JobEnvelopeSchema = z.object({
  traceId: z.string(),
  packageId: z.string(),
  stageInstanceId: z.string(),
  fencingToken: z.number().int(),
  capabilityId: z.string(),
  settingsHash: z.string().length(64),
  reservationId: z.string(),
  namespace: z.enum(['production', 'qualification', 'staging']),
  imageDigest: z.string(),
  profile: z.enum(['FULL', 'REDUCED']),          // v2
  inputs: z.array(z.object({ r2Key: z.string(), sha256: z.string().length(64) })),
  spec: z.unknown(),
  outputs: z.object({ r2Prefix: z.string(), expectedArtifacts: z.array(z.string()) }),
  deadlineAt: z.string().datetime(),
})
export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>
```

---

## 7. Stage runner — `stage-runner.ts`

```ts
export interface RunContext {
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId
  readonly traceId: TraceId
  readonly profile: ProfileName
  readonly profileSettings: (typeof PROFILE)[ProfileName]
}

export interface PreflightContext {
  // G6 — CỐ Ý không expose provider client
  readonly measurements: DeterministicMeasurements
  readonly thresholds: typeof import('./thresholds')
  readonly profile: ProfileName
}

export abstract class StageRunner<In, Out> {
  abstract readonly stageCode: string
  abstract requiredCapabilities(): CapabilityRef[]
  abstract inputSchema(): z.ZodType<In>
  abstract produce(input: In, ctx: RunContext): Promise<Candidate<Out>[]>
  abstract preflight(candidate: Out, ctx: PreflightContext): Promise<PreflightResult>
  abstract acceptanceTests(out: Out): AcceptanceTest[]

  // framework lo: DoR → validate → produce candidates → tournament
  //               → deterministic preflight → produce artifact
  //               → read-back → verify → freeze. KHÔNG override
  final async run(id: StageInstanceId): Promise<void>
}
```

`run()` là template method do EXE-02 sở hữu. `START_STAGE` chỉ được phát sau khi
DoR và input schema đã PASS; bốn command `START_STAGE`, `PRODUCE_ARTIFACT`,
`VERIFY_ARTIFACT`, `FREEZE_STAGE` dùng idempotency key xác định theo cùng stage
attempt. Preflight fail hoặc read-back fail phải ghi evidence, không seal/freeze
và không tự sinh revision thứ hai. `RunContext` đọc đúng cấu hình `PROFILE`; còn
`PreflightContext` chỉ có measurement, threshold và profile nên provider/LLM call
trong preflight là lỗi biên dịch.

---

## 7A. Tournament Engine — `tournament.ts`

```ts
export type TournamentWidthKey =
  | 'routeCount' | 'compositionsPerCriticalUnit' | 'sourceCandidates'
export type TournamentCriticCountKey =
  | 'criticCountStage04' | 'criticCountAssurance'

export interface CandidateSourceMetadata {
  provider?: string
  model?: string
  systemPromptHash?: Hex64
  requestId?: string
  generatedAt?: string
  sourceId?: string
}

export interface BlindCandidate<Out> {
  blindId: string
  value: Out
}

export interface BlindJudgeInput<Out> {
  seed: string
  temperature: number                 // luôn CREATIVE.JUDGE_TEMPERATURE
  rubric: RubricCriterion[]           // mỗi criterion đủ fail/borderline/pass
  candidates: BlindCandidate<Out>[]   // không ordinal, lineage, source metadata
}

export interface TournamentSelectionPort<Out> {
  select(input: TournamentSelectionInput<Out>): Promise<Candidate<Out>>
}
```

Engine đọc candidate width và critic count trực tiếp từ `PROFILE` bằng hai key
được type hóa; số lượng truyền vào lệch cấu hình phải fail-closed. Generation
temperature nằm trong `CREATIVE.GENERATE_TEMPERATURE`, judging luôn temperature
0 và system prompt hash của judge không được trùng generator. Mỗi critic nhận
một payload mới, thứ tự candidate được xáo xác định theo seed và chỉ có blind ID.

Điểm mỗi criterion nằm trên thang `CREATIVE.JUDGE_SCORE`; engine lấy trung bình
xác định theo critic, chọn `argmax` đạt `CREATIVE.CHAMPION_MIN_SCORE` và phá hòa
bằng rank hash theo seed. Eligibility chạy trước mọi judge call. Trước khi trả
champion, engine phải bảo tồn cả `CHAMPION`, `REJECTED`, `INELIGIBLE`, score và
evidence hash; lỗi bảo tồn chặn kết quả. Candidate source metadata chỉ tồn tại
trong evidence nội bộ và không thuộc `BlindJudgeInput`.

---

## 8. Gate & DoR — `gates.ts`

```ts
export interface GateEvaluation {
  gateCode: string
  tier: GateTier
  state: GateState
  evidenceR2Key: R2Key | null   // G7: non-null khi state='PASS'
  waiverOwner?: string          // cấm khi tier='M0'
  waiverExpiresAt?: string
}

export type DoRResult = { ready: true } | { ready: false; failures: DoRFailure[] }

export interface DoRFailure {
  condition: string; expected: string; actual: string; remediation: string
}
```

**Bất biến DoR** (CORE-04) — cưỡng chế bằng test:
```
gate.tier ∈ {M0, M1} ∧ gate.state = 'NOT_EVALUATED'  →  ready = false
gate.tier = 'M0' ∧ gate.state = 'WAIVED'             →  từ chối khi ghi
v2: package.channel đang frozen                       →  ready = false
v2: human_decision count < POLICY.MIN_HUMAN_DECISIONS →  chặn từ Stage 14
```

---

## 9. Human & Policy — `human.ts`, `policy.ts` *(v2)*

```ts
export interface HumanDecision {
  id: string
  packageId: PackageId
  decisionType: HumanDecisionType
  actorIdentity: HumanActorId          // KHÔNG BAO GIỜ service account
  artifactBeforeId: ArtifactId | null
  artifactAfterId: ArtifactId | null
  diffR2Key: R2Key | null
  rationaleText: string                // ≥ ATTENTION.RATIONALE_MIN_CHARS
  createdAt: string
}

export interface PolicyCheckResult {
  code: PolicyCheckCode
  state: 'PASS' | 'FAIL' | 'NOT_EVALUATED'
  evidenceR2Key: R2Key | null
  detail: Record<string, unknown>
}

// G15 — điểm chặn publish duy nhất
export function policyDefenseChecklist(pkg: PackageId): Promise<PolicyCheckResult[]>
// PASS ⇔ mọi PC1..PC8 = 'PASS' (POLICY.POLICY_CHECK_COUNT)
```

---

## 10. Quy tắc thay đổi contracts này *(v2 — G11)*

```
Thêm hằng số mới          → PR thường, cần test
Siết ngưỡng (TIGHTEN)     → PR + ghi standard_change_log, không cần owner
Nới ngưỡng (RELAX)        → BẮT BUỘC evolution_proposal → shadow → owner promote
Xóa hằng số               → coi như RELAX
Đổi UNCALIBRATED → dùng   → cần evidence hiệu chuẩn đính kèm (P5)
```
CI so sánh mọi thay đổi `thresholds.ts` với bản seal gần nhất và phân loại chiều tự động; chiều RELAX không kèm promotion → CI fail (test `g11-no-self-relax`).
