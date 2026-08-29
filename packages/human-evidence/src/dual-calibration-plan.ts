import { thresholds } from '@youtube-ai-factory/contracts'
import { z } from 'zod'

const isoTimestamp = z.string().datetime({ offset: true })

export const DUAL_CALIBRATION_DATASET = Object.freeze({
  provider: 'MOZILLA_DATA_COLLECTIVE',
  datasetId: 'cmrt70j4z001qmm07nvfsmgmr',
  datasetName: 'Common Voice Scripted Speech 26.0 - American English (Female)',
  datasetVersion: 'cv-corpus-26.0-2026-06-12',
  datasetUrl: 'https://mozilladatacollective.com/datasets/cmrt70j4z001qmm07nvfsmgmr',
  licenseId: 'CC0-1.0',
  locale: 'en-US',
  retainSourceAudio: false,
  allowSpeakerReidentification: false,
})

export const DUAL_CALIBRATION_TARGETS = Object.freeze({
  independentHumanMin: thresholds.ALIGNER_CALIBRATION.MIN_SAMPLES,
  independentHumanMax: thresholds.ALIGNER_CALIBRATION.MAX_SAMPLES,
  productionVoiceMin: thresholds.ALIGNER_CALIBRATION.MIN_SAMPLES,
  productionVoiceMax: thresholds.ALIGNER_CALIBRATION.MAX_SAMPLES,
})

export const DualCalibrationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  workPackage: z.literal('G-02G'),
  namespace: z.literal('qualification'),
  state: z.literal('OWNER_ACTION_REQUIRED'),
  createdAt: isoTimestamp,
  productionEligible: z.literal(false),
  providerDispatch: z.literal('OFF'),
  autoPublish: z.literal('OFF'),
  ownerAuthorization: z.literal('RECORDED'),
  corpus: z.object({
    provider: z.literal('MOZILLA_DATA_COLLECTIVE'),
    datasetId: z.literal(DUAL_CALIBRATION_DATASET.datasetId),
    datasetName: z.literal(DUAL_CALIBRATION_DATASET.datasetName),
    datasetVersion: z.literal(DUAL_CALIBRATION_DATASET.datasetVersion),
    datasetUrl: z.literal(DUAL_CALIBRATION_DATASET.datasetUrl),
    licenseId: z.literal('CC0-1.0'),
    locale: z.literal('en-US'),
    retainSourceAudio: z.literal(false),
    allowSpeakerReidentification: z.literal(false),
  }).strict(),
  productionVoice: z.object({
    provider: z.literal('ELEVENLABS'),
    voiceId: z.literal('KXyrWqXTuK63FlJ9XZ33'),
    modelId: z.literal('eleven_multilingual_v2'),
    maySetErrorFloor: z.literal(false),
  }).strict(),
  targets: z.object({
    independentHumanMin: z.literal(DUAL_CALIBRATION_TARGETS.independentHumanMin),
    independentHumanMax: z.literal(DUAL_CALIBRATION_TARGETS.independentHumanMax),
    productionVoiceMin: z.literal(DUAL_CALIBRATION_TARGETS.productionVoiceMin),
    productionVoiceMax: z.literal(DUAL_CALIBRATION_TARGETS.productionVoiceMax),
  }).strict(),
}).strict()

export type DualCalibrationPlan = z.infer<typeof DualCalibrationPlanSchema>

export interface DualCalibrationRuntimePrerequisites {
  readonly mdcTermsAccepted: boolean
  readonly mdcApiCredentialConfigured: boolean
  readonly elevenLabsApiCredentialConfigured: boolean
  readonly productionVoiceRegistered: boolean
}

export function createDualCalibrationPlan(createdAt: string): DualCalibrationPlan {
  return DualCalibrationPlanSchema.parse({
    schemaVersion: 1,
    workPackage: 'G-02G',
    namespace: 'qualification',
    state: 'OWNER_ACTION_REQUIRED',
    createdAt,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    ownerAuthorization: 'RECORDED',
    corpus: DUAL_CALIBRATION_DATASET,
    productionVoice: {
      provider: 'ELEVENLABS',
      voiceId: 'KXyrWqXTuK63FlJ9XZ33',
      modelId: 'eleven_multilingual_v2',
      maySetErrorFloor: false,
    },
    targets: DUAL_CALIBRATION_TARGETS,
  })
}

export function evaluateDualCalibrationReadiness(
  planInput: unknown,
  runtime: DualCalibrationRuntimePrerequisites,
): {
  readonly readyForExecution: boolean
  readonly providerDispatch: 'OFF'
  readonly productionEligible: false
  readonly blockers: readonly string[]
} {
  DualCalibrationPlanSchema.parse(planInput)
  const blockers: string[] = []
  if (!runtime.mdcTermsAccepted) blockers.push('MDC_DATASET_TERMS_ACCEPTANCE_REQUIRED')
  if (!runtime.mdcApiCredentialConfigured) blockers.push('MDC_API_CREDENTIAL_REQUIRED')
  if (!runtime.elevenLabsApiCredentialConfigured) blockers.push('ELEVENLABS_API_CREDENTIAL_REQUIRED')
  if (!runtime.productionVoiceRegistered) blockers.push('REGISTERED_PRODUCTION_VOICE_REQUIRED')
  return {
    readyForExecution: blockers.length === 0,
    providerDispatch: 'OFF',
    productionEligible: false,
    blockers,
  }
}
