export { DesignError } from './errors.js'
export type { DesignErrorCode } from './errors.js'
export { assertInheritedVoice, sealChannelIdentity } from './identity.js'
export { qualifyVoiceFingerprint } from './voice-fingerprint.js'
export type { QualifiedVoiceFingerprint } from './voice-fingerprint.js'
export type { ChannelIdentityContract } from './identity.js'
export { planTtsSegments } from './segmentation.js'
export type { TtsSegment } from './segmentation.js'
export { sealSoundscape } from './soundscape.js'
export type { SoundscapeContract } from './soundscape.js'
export {
  AUDIO_ARCHETYPES,
  AudioArchetypeSchema,
  ChannelIdentityInputSchema,
  MotionClassSchema,
  MusicCueFunctionSchema,
  MusicCueSchema,
  MusicProviderEvidenceSchema,
  ProtectedSpanSchema,
  VisualArchetypeSchema,
  VisualRouteSchema,
  VoiceFingerprintBindingSchema,
  VoiceFingerprintEvidenceSchema,
  VoiceIdentitySchema,
} from './types.js'
export type {
  AudioArchetype,
  ChannelIdentityInput,
  MotionClass,
  MusicCue,
  MusicProviderEvidence,
  ProtectedSpan,
  VisualArchetype,
  VisualRoute,
  VoiceFingerprintBinding,
  VoiceFingerprintEvidence,
} from './types.js'
export { assertRouteFrozen, classifyMotion, routeVisual, sealVisualGrammar } from './visual.js'
