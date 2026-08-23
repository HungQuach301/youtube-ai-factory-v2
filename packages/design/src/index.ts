export { DesignError } from './errors.js'
export type { DesignErrorCode } from './errors.js'
export { assertInheritedVoice, sealChannelIdentity } from './identity.js'
export type { ChannelIdentityContract } from './identity.js'
export { planTtsSegments } from './segmentation.js'
export type { TtsSegment } from './segmentation.js'
export { sealSoundscape } from './soundscape.js'
export type { SoundscapeContract } from './soundscape.js'
export {
  ChannelIdentityInputSchema,
  MotionClassSchema,
  MusicCueFunctionSchema,
  MusicCueSchema,
  MusicProviderEvidenceSchema,
  ProtectedSpanSchema,
  VisualArchetypeSchema,
  VisualRouteSchema,
  VoiceIdentitySchema,
} from './types.js'
export type {
  ChannelIdentityInput,
  MotionClass,
  MusicCue,
  MusicProviderEvidence,
  ProtectedSpan,
  VisualArchetype,
  VisualRoute,
} from './types.js'
export { assertRouteFrozen, classifyMotion, routeVisual, sealVisualGrammar } from './visual.js'
