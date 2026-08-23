import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

import { DesignError } from './errors.js'
import { MusicCueSchema, MusicProviderEvidenceSchema, type MusicCue, type MusicProviderEvidence } from './types.js'

const SoundscapeInputSchema = z.object({
  identityHash: z.string().regex(/^[0-9a-f]{64}$/u),
  voiceSettingsHash: z.string().regex(/^[0-9a-f]{64}$/u),
  narratorVoiceId: z.string().min(1),
  providerSpeed: z.number().positive(),
  provider: MusicProviderEvidenceSchema.nullable(),
  musicMode: z.enum(['licensed', 'ambience_only']),
  cues: z.array(MusicCueSchema),
}).strict()

export interface SoundscapeContract {
  readonly identityHash: string
  readonly voiceSettingsHash: string
  readonly narratorVoiceId: string
  readonly providerSpeed: number
  readonly provider: MusicProviderEvidence | null
  readonly musicMode: 'licensed' | 'ambience_only'
  readonly cues: readonly MusicCue[]
  readonly soundscapeHash: ReturnType<typeof canonicalHash>
}

export function sealSoundscape(input: unknown): SoundscapeContract {
  const parsed = SoundscapeInputSchema.parse(input)
  const failures: string[] = []
  if (parsed.providerSpeed < thresholds.AUDIO.PROVIDER_SPEED.min || parsed.providerSpeed > thresholds.AUDIO.PROVIDER_SPEED.max) {
    failures.push(`PROVIDER_SPEED_OUT_OF_RANGE:${parsed.providerSpeed}`)
  }
  if (parsed.provider === null && parsed.musicMode !== 'ambience_only') failures.push('LICENSED_MODE_REQUIRES_PROVIDER')
  if (parsed.provider !== null && parsed.musicMode !== 'licensed') failures.push('PROVIDER_REQUIRES_LICENSED_MODE')
  for (const cue of parsed.cues) {
    if (cue.assetKind === 'MUSIC' && parsed.provider === null) failures.push(`MUSIC_PROVIDER_MISSING:${cue.id}`)
    if (cue.assetKind === 'SILENCE' && cue.function !== 'silence') failures.push(`SILENCE_FUNCTION_REQUIRED:${cue.id}`)
    if (cue.assetKind !== 'SILENCE' && cue.assetRef === null) failures.push(`CUE_ASSET_REF_REQUIRED:${cue.id}`)
  }
  if (failures.length > 0) throw new DesignError('SOUNDSCAPE_INVALID', failures)
  return { ...parsed, soundscapeHash: canonicalHash(parsed) }
}
