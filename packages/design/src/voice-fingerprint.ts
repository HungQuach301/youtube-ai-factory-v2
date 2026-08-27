import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import { DesignError } from './errors.js'
import {
  AUDIO_ARCHETYPES,
  VoiceFingerprintEvidenceSchema,
  type ChannelIdentityInput,
  type VoiceFingerprintEvidence,
} from './types.js'

export interface QualifiedVoiceFingerprint extends VoiceFingerprintEvidence {
  readonly qualificationState: 'QUALIFIED'
  readonly fingerprintHash: ReturnType<typeof canonicalHash>
}

const isQualificationKey = (value: string): boolean =>
  value.startsWith('qual/') && !value.split('/').includes('..')

export function qualifyVoiceFingerprint(
  identity: Pick<ChannelIdentityInput, 'channelId' | 'voice'>,
  input: unknown,
): QualifiedVoiceFingerprint {
  const parsed = VoiceFingerprintEvidenceSchema.safeParse(input)
  if (!parsed.success) {
    throw new DesignError('VOICE_FINGERPRINT_QUALIFICATION_INVALID', [
      'VOICE_FINGERPRINT_EVIDENCE_SCHEMA',
    ])
  }

  const evidence = parsed.data
  const failures: string[] = []
  if (evidence.channelId !== identity.channelId) failures.push('VOICE_CHANNEL_MISMATCH')
  if (evidence.voiceId !== identity.voice.voiceId) failures.push('VOICE_ID_MISMATCH')
  if (evidence.model !== identity.voice.model) failures.push('VOICE_MODEL_MISMATCH')
  if (evidence.settingsHash !== identity.voice.settingsHash) failures.push('VOICE_SETTINGS_HASH_MISMATCH')
  if (evidence.audioR2Key !== identity.voice.fingerprintR2Key) failures.push('VOICE_AUDIO_KEY_MISMATCH')
  if (evidence.audioDurationSec !== thresholds.AUDIO.VOICE_FINGERPRINT_SEC
    || evidence.audioDurationSec !== identity.voice.fingerprintDurationSec) {
    failures.push('VOICE_FINGERPRINT_DURATION_INVALID')
  }

  const allKeys = [
    evidence.audioR2Key,
    evidence.embeddingR2Key,
    evidence.evidenceR2Key,
    ...evidence.bindings.map((binding) => binding.evidenceR2Key),
  ]
  if (allKeys.some((key) => !isQualificationKey(key))) failures.push('VOICE_EVIDENCE_NAMESPACE_INVALID')
  if (new Set(allKeys).size !== allKeys.length) failures.push('VOICE_EVIDENCE_KEYS_MUST_BE_UNIQUE')

  const archetypes = new Set(evidence.bindings.map((binding) => binding.archetype))
  if (archetypes.size !== AUDIO_ARCHETYPES.length
    || AUDIO_ARCHETYPES.some((archetype) => !archetypes.has(archetype))) {
    failures.push('VOICE_AUDIO_ARCHETYPES_INCOMPLETE')
  }
  if (new Set(evidence.bindings.map((binding) => binding.qualificationRunId)).size
    !== evidence.bindings.length) {
    failures.push('VOICE_QUALIFICATION_RUNS_MUST_BE_UNIQUE')
  }
  if (evidence.bindings.some((binding) => !Number.isFinite(Date.parse(binding.qualifiedAt)))) {
    failures.push('VOICE_QUALIFIED_AT_INVALID')
  }

  if (failures.length > 0) {
    throw new DesignError('VOICE_FINGERPRINT_QUALIFICATION_INVALID', failures)
  }
  return {
    ...evidence,
    qualificationState: 'QUALIFIED',
    fingerprintHash: canonicalHash(evidence),
  }
}
