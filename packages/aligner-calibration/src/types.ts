import { z } from 'zod'

const Hex64Schema = z.string().regex(/^[0-9a-f]{64}$/)
const PhonemeSchema = z.string().min(1).regex(/^[A-Za-z0-9ˈˌəɪʊɛɔɑæʌθðʃʒŋɹɾɡ\-]+$/u)

export const CalibrationSampleSchema = z.object({
  id: z.string().min(1),
  provenance: z.enum(['human_reader', 'licensed_human_corpus']),
  speakerId: z.string().min(1),
  audioSha256: Hex64Schema,
  transcript: z.string().min(1),
  referencePhonemes: z.array(PhonemeSchema).min(1),
  observedPhonemes: z.array(PhonemeSchema),
  durationSec: z.number().positive(),
}).strict()

export const ProductionVoiceValidationSampleSchema = z.object({
  id: z.string().min(1),
  provenance: z.literal('qualified_tts_validation'),
  voiceId: z.string().min(1),
  modelId: z.string().min(1),
  audioSha256: Hex64Schema,
  transcript: z.string().min(1),
  referencePhonemes: z.array(PhonemeSchema).min(1),
  observedPhonemes: z.array(PhonemeSchema),
  durationSec: z.number().positive(),
  domainTags: z.array(z.enum([
    'FINANCIAL_TERM',
    'PERCENTAGE',
    'CURRENCY',
    'TICKER',
    'ACRONYM',
    'PROPER_NOUN',
  ])).min(1),
}).strict()

export type CalibrationSample = z.infer<typeof CalibrationSampleSchema>
export type ProductionVoiceValidationSample = z.infer<typeof ProductionVoiceValidationSampleSchema>

export interface SampleError {
  readonly sampleId: string
  readonly editCount: number
  readonly referenceCount: number
  readonly phonemeErrorRate: number
}

export type CalibrationResult =
  | {
      readonly calibrated: false
      readonly gateEvaluated: false
      readonly errorFloor: null
      readonly threshold: null
      readonly failures: readonly string[]
    }
  | {
      readonly calibrated: true
      readonly gateEvaluated: true
      readonly errorFloor: number
      readonly threshold: number
      readonly sampleErrors: readonly SampleError[]
      readonly alignerPins: typeof ALIGNER_PINS
      readonly lexiconHash: string
    }

export interface ProductionVoiceValidationResult {
  readonly evaluated: boolean
  readonly passed: boolean
  readonly threshold: number | null
  readonly aggregatePhonemeErrorRate: number | null
  readonly sampleErrors: readonly SampleError[]
  readonly failures: readonly string[]
}

export const ALIGNER_PINS = {
  whisperX: '3.4.2',
  montrealForcedAligner: '3.3.8',
} as const
