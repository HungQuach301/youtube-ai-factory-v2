import { z } from 'zod'

export const MusicCueFunctionSchema = z.enum([
  'curiosity', 'orientation', 'mechanism', 'escalation',
  'reveal', 'consequence', 'payoff', 'silence',
])
export const VisualRouteSchema = z.enum(['SOURCE', 'MAKE', 'HYBRID'])
export const MotionClassSchema = z.enum(['CAMERA_ONLY', 'LAYERED_SEMANTIC', 'SOURCE_SEMANTIC'])
export const VisualArchetypeSchema = z.enum([
  'transaction_state_proof', 'process_route', 'data_visualization',
  'documentary_live_action', 'source_authored_hybrid', 'abstract_authored',
  'rights_sensitive', 'mobile_text_intensive',
])

export const VoiceIdentitySchema = z.object({
  voiceId: z.string().min(1),
  model: z.string().min(1),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  settingsHash: z.string().regex(/^[0-9a-f]{64}$/u),
  pronunciationLexiconRef: z.string().min(1),
  fingerprintR2Key: z.string().min(1),
  fingerprintDurationSec: z.number().positive(),
}).strict()

export const ChannelIdentityInputSchema = z.object({
  channelId: z.string().min(1),
  version: z.number().int().positive(),
  scope: z.literal('channel'),
  voice: VoiceIdentitySchema,
  visual: z.object({
    palette: z.array(z.string().min(1)).min(1),
    typeScale: z.array(z.number().positive()).min(1),
    motionLanguage: z.string().min(1),
    layoutGrid: z.string().min(1),
    lowerThirdSpec: z.string().min(1),
    safeZoneSpec: z.string().min(1),
  }).strict(),
  music: z.object({
    genreRange: z.array(z.string().min(1)),
    instrumentation: z.array(z.string().min(1)),
    tempoRangeBpm: z.object({ min: z.number().positive(), max: z.number().positive() }).strict(),
    cueLibraryRef: z.string().min(1).nullable(),
  }).strict(),
  terminology: z.object({ ledgerRef: z.string().min(1) }).strict(),
  packaging: z.object({
    thumbnailStyleSpec: z.string().min(1),
    titlePatternConstraints: z.array(z.string().min(1)).min(1),
  }).strict(),
}).strict()

export const ProtectedSpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  kind: z.enum(['ENTITY', 'NUMBER', 'CAUSAL_CLAUSE']),
}).strict()

export const MusicProviderEvidenceSchema = z.object({
  providerId: z.string().min(1),
  monetizationAllowed: z.literal(true),
  contentIdClearance: z.literal(true),
  stemAccess: z.literal(true),
  libraryDepth15Plus: z.literal(true),
  structuredMetadata: z.literal(true),
  stableNonRetroactiveTerms: z.literal(true),
  contractEvidenceHash: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict()

export const MusicCueSchema = z.object({
  id: z.string().min(1),
  assetKind: z.enum(['MUSIC', 'AMBIENCE', 'SILENCE']),
  function: MusicCueFunctionSchema,
  assetRef: z.string().min(1).nullable(),
}).strict()

export type ChannelIdentityInput = z.infer<typeof ChannelIdentityInputSchema>
export type ProtectedSpan = z.infer<typeof ProtectedSpanSchema>
export type MusicProviderEvidence = z.infer<typeof MusicProviderEvidenceSchema>
export type MusicCue = z.infer<typeof MusicCueSchema>
export type VisualRoute = z.infer<typeof VisualRouteSchema>
export type MotionClass = z.infer<typeof MotionClassSchema>
export type VisualArchetype = z.infer<typeof VisualArchetypeSchema>
