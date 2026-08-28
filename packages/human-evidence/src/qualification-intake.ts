import { thresholds } from '@youtube-ai-factory/contracts'
import { z } from 'zod'

const qualificationKey = z.string().min(1).refine(
  (value) => value.startsWith('qualification/') && !value.includes('/production/'),
  'Evidence must remain inside the qualification namespace',
)
const isoTimestamp = z.string().datetime({ offset: true })
const humanIdentity = z.string().min(3).refine(
  (value) => !/(?:<domain>|example\.com|placeholder|service|bot)/iu.test(value),
  'Human identity must be explicit and non-placeholder',
)
const Hex64Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const phoneme = z.string().min(1)

export const QUALIFICATION_DEFECT_CLASSES = [
  'BLACK_FRAME',
  'FREEZE_FRAME',
  'SILENCE',
  'CLIPPING',
  'DROP_FRAME',
  'MOBILE_LEGIBILITY',
  'SAFE_ZONE',
  'TIMELINE',
] as const

export const QUALIFICATION_ASSURANCE_DIMENSIONS = [
  'FACTUAL_SAFETY',
  'SEMANTIC_ALIGNMENT',
  'VOICE_INTELLIGIBILITY',
  'STORY_PAYOFF',
  'VISUAL_DIRECTION',
  'MUSIC_SOUND_DESIGN',
  'RETENTION',
  'MOBILE_LEGIBILITY',
  'PACKAGING_CTR',
  'EXECUTIVE_PRODUCER',
  'COMPETITIVE_EDITOR',
  'OVERALL',
] as const satisfies readonly (keyof typeof thresholds.ASSURANCE.FLOORS)[]

export const QUALIFICATION_ANCHOR_VERDICTS = ['FAIL', 'BORDERLINE', 'PASS'] as const

export const QUALIFICATION_INTAKE_TARGETS = Object.freeze({
  rejectedMasterMin: 15,
  alignerMin: thresholds.ALIGNER_CALIBRATION.MIN_SAMPLES,
  alignerMax: thresholds.ALIGNER_CALIBRATION.MAX_SAMPLES,
  rubricAnchorCount: QUALIFICATION_ASSURANCE_DIMENSIONS.length * QUALIFICATION_ANCHOR_VERDICTS.length,
  ownerRationaleMinChars: thresholds.ATTENTION.RATIONALE_MIN_CHARS,
})

export const QualificationEvidenceAssetSchema = z.object({
  r2Key: qualificationKey,
  sha256: Hex64Schema,
  sizeBytes: z.number().int().positive(),
  mediaType: z.enum(['AUDIO', 'VIDEO', 'IMAGE', 'JSON']),
}).strict()

export const QualificationOwnerJudgmentSchema = z.object({
  actorIdentity: humanIdentity,
  rationale: z.string().min(thresholds.ATTENTION.RATIONALE_MIN_CHARS),
  decidedAt: isoTimestamp,
}).strict()

export const RejectedMasterEvidenceSchema = z.object({
  id: z.string().min(1),
  source: z.literal('rejected_master'),
  asset: QualificationEvidenceAssetSchema,
  groundTruth: z.object({
    defectClass: z.enum(QUALIFICATION_DEFECT_CLASSES),
    severity: z.enum(['P0', 'P1', 'P2']),
    tStart: z.number().nonnegative(),
    tEnd: z.number().positive(),
  }).strict().refine((value) => value.tEnd > value.tStart, 'tEnd must be greater than tStart'),
  ownerJudgment: QualificationOwnerJudgmentSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.asset.mediaType !== 'VIDEO') {
    context.addIssue({ code: 'custom', message: 'Rejected masters must reference VIDEO evidence' })
  }
})

export const AlignerEvidenceSchema = z.object({
  id: z.string().min(1),
  provenance: z.literal('human_reader'),
  asset: QualificationEvidenceAssetSchema,
  readerIdentity: humanIdentity,
  speakerId: z.string().min(1),
  transcript: z.string().min(1),
  durationSec: z.number().positive().finite(),
  recordedAt: isoTimestamp,
  referencePhonemes: z.array(phoneme).min(1).nullable(),
  observedPhonemes: z.array(phoneme).nullable(),
}).strict().superRefine((value, context) => {
  if (value.asset.mediaType !== 'AUDIO') {
    context.addIssue({ code: 'custom', message: 'Aligner evidence must reference AUDIO evidence' })
  }
  if ((value.referencePhonemes === null) !== (value.observedPhonemes === null)) {
    context.addIssue({ code: 'custom', message: 'Phoneme arrays must be supplied together' })
  }
})

export const RubricAnchorEvidenceSchema = z.object({
  id: z.string().min(1),
  dimension: z.enum(QUALIFICATION_ASSURANCE_DIMENSIONS),
  verdict: z.enum(QUALIFICATION_ANCHOR_VERDICTS),
  description: z.string().min(1),
  asset: QualificationEvidenceAssetSchema,
  ownerJudgment: QualificationOwnerJudgmentSchema.nullable(),
}).strict()

export const QualificationIntakePacketSchema = z.object({
  schemaVersion: z.literal(1),
  workPackage: z.literal('G-02F'),
  namespace: z.literal('qualification'),
  state: z.literal('DRAFT_ONLY'),
  createdAt: isoTimestamp,
  productionEligible: z.literal(false),
  providerDispatch: z.literal('OFF'),
  autoPublish: z.literal('OFF'),
  ownerActorIdentity: humanIdentity.nullable(),
  rejectedMasters: z.array(RejectedMasterEvidenceSchema),
  alignerSamples: z.array(AlignerEvidenceSchema).max(QUALIFICATION_INTAKE_TARGETS.alignerMax),
  rubricAnchors: z.array(RubricAnchorEvidenceSchema),
}).strict()

export const QualificationEvidenceReadbackSchema = z.object({
  r2Key: qualificationKey,
  sha256: Hex64Schema,
  sizeBytes: z.number().int().positive(),
}).strict()

export type QualificationIntakePacket = z.infer<typeof QualificationIntakePacketSchema>
export type QualificationEvidenceReadback = z.infer<typeof QualificationEvidenceReadbackSchema>

export interface QualificationOwnerActor {
  readonly identity: string
  readonly role: 'OWNER' | 'OPERATOR' | 'EDITOR'
  readonly isService: false
  readonly active: boolean
}

export interface QualificationIntakeEvaluation {
  readonly intakeComplete: boolean
  readonly alignerEvidenceComplete: boolean
  readonly calibrationInputComplete: boolean
  readonly qualificationState: 'NOT_QUALIFIED'
  readonly productionEligible: false
  readonly providerCallCount: 0
  readonly blockers: readonly string[]
  readonly counts: {
    readonly rejectedMasters: number
    readonly reviewedRejectedMasters: number
    readonly alignerSamples: number
    readonly rubricAnchors: number
    readonly reviewedRubricAnchors: number
    readonly sealedAssets: number
  }
}

function declaredAssets(packet: QualificationIntakePacket) {
  return [
    ...packet.rejectedMasters.map((item) => item.asset),
    ...packet.alignerSamples.map((item) => item.asset),
    ...packet.rubricAnchors.map((item) => item.asset),
  ]
}

export function createQualificationIntakeTemplate(createdAt: string): QualificationIntakePacket {
  return QualificationIntakePacketSchema.parse({
    schemaVersion: 1,
    workPackage: 'G-02F',
    namespace: 'qualification',
    state: 'DRAFT_ONLY',
    createdAt,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    ownerActorIdentity: null,
    rejectedMasters: [],
    alignerSamples: [],
    rubricAnchors: [],
  })
}

export function evaluateQualificationIntake(input: {
  readonly packet: QualificationIntakePacket
  readonly actors: readonly QualificationOwnerActor[]
  readonly readbacks: readonly QualificationEvidenceReadback[]
}): QualificationIntakeEvaluation {
  const packet = QualificationIntakePacketSchema.parse(input.packet)
  const readbacks = input.readbacks.map((item) => QualificationEvidenceReadbackSchema.parse(item))
  const blockers: string[] = []

  const owner = input.actors.find((actor) => actor.identity === packet.ownerActorIdentity)
  if (packet.ownerActorIdentity === null || owner?.role !== 'OWNER' || owner.active !== true || owner.isService !== false) {
    blockers.push('ACTIVE_OWNER_ALLOWLIST_IDENTITY_REQUIRED')
  }

  const reviewedRejectedMasters = packet.rejectedMasters.filter((item) => item.ownerJudgment !== null)
  if (reviewedRejectedMasters.length < QUALIFICATION_INTAKE_TARGETS.rejectedMasterMin) {
    blockers.push(`REJECTED_MASTER_EVIDENCE_REQUIRED:${QUALIFICATION_INTAKE_TARGETS.rejectedMasterMin}`)
  }
  const alignerEvidenceComplete = packet.alignerSamples.length >= QUALIFICATION_INTAKE_TARGETS.alignerMin
    && packet.alignerSamples.length <= QUALIFICATION_INTAKE_TARGETS.alignerMax
  if (!alignerEvidenceComplete) {
    blockers.push(`ALIGNER_EVIDENCE_REQUIRED:${QUALIFICATION_INTAKE_TARGETS.alignerMin}-${QUALIFICATION_INTAKE_TARGETS.alignerMax}`)
  }

  const reviewedRubricAnchors = packet.rubricAnchors.filter((item) => item.ownerJudgment !== null)
  const anchorKeys = reviewedRubricAnchors.map((item) => `${item.dimension}:${item.verdict}`)
  const requiredAnchorKeys = QUALIFICATION_ASSURANCE_DIMENSIONS.flatMap((dimension) =>
    QUALIFICATION_ANCHOR_VERDICTS.map((verdict) => `${dimension}:${verdict}`))
  const missingAnchors = requiredAnchorKeys.filter((key) => !anchorKeys.includes(key))
  if (missingAnchors.length > 0) blockers.push(`RUBRIC_ANCHORS_REQUIRED:${missingAnchors.length}`)
  if (new Set(anchorKeys).size !== anchorKeys.length) blockers.push('DUPLICATE_RUBRIC_ANCHOR')

  const evidenceIds = [
    ...packet.rejectedMasters.map((item) => item.id),
    ...packet.alignerSamples.map((item) => item.id),
    ...packet.rubricAnchors.map((item) => item.id),
  ]
  if (new Set(evidenceIds).size !== evidenceIds.length) blockers.push('DUPLICATE_EVIDENCE_ID')

  const assets = declaredAssets(packet)
  if (new Set(assets.map((asset) => asset.r2Key)).size !== assets.length) blockers.push('DUPLICATE_EVIDENCE_R2_KEY')
  const readbackMap = new Map(readbacks.map((item) => [item.r2Key, item]))
  let sealedAssets = 0
  for (const asset of assets) {
    const readback = readbackMap.get(asset.r2Key)
    if (readback === undefined) {
      blockers.push(`EVIDENCE_READBACK_MISSING:${asset.r2Key}`)
    } else if (readback.sha256 !== asset.sha256 || readback.sizeBytes !== asset.sizeBytes) {
      blockers.push(`EVIDENCE_READBACK_MISMATCH:${asset.r2Key}`)
    } else {
      sealedAssets += 1
    }
  }
  if (new Set(readbacks.map((item) => item.r2Key)).size !== readbacks.length) {
    blockers.push('DUPLICATE_EVIDENCE_READBACK')
  }

  const ownerJudgments = [
    ...packet.rejectedMasters.map((item) => item.ownerJudgment),
    ...packet.rubricAnchors.map((item) => item.ownerJudgment),
  ].filter((item) => item !== null)
  if (packet.ownerActorIdentity !== null
    && ownerJudgments.some((item) => item.actorIdentity !== packet.ownerActorIdentity)) {
    blockers.push('OWNER_JUDGMENT_IDENTITY_MISMATCH')
  }

  const calibrationInputComplete = alignerEvidenceComplete
    && packet.alignerSamples.every((item) => item.referencePhonemes !== null && item.observedPhonemes !== null)
  if (alignerEvidenceComplete && !calibrationInputComplete) blockers.push('ALIGNER_PHONEME_INPUTS_PENDING')

  const intakeBlockers = blockers.filter((blocker) => blocker !== 'ALIGNER_PHONEME_INPUTS_PENDING')
  return {
    intakeComplete: intakeBlockers.length === 0,
    alignerEvidenceComplete,
    calibrationInputComplete,
    qualificationState: 'NOT_QUALIFIED',
    productionEligible: false,
    providerCallCount: 0,
    blockers,
    counts: {
      rejectedMasters: packet.rejectedMasters.length,
      reviewedRejectedMasters: reviewedRejectedMasters.length,
      alignerSamples: packet.alignerSamples.length,
      rubricAnchors: packet.rubricAnchors.length,
      reviewedRubricAnchors: reviewedRubricAnchors.length,
      sealedAssets,
    },
  }
}
