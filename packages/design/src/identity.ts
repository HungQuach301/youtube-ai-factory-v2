import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

import { DesignError } from './errors.js'
import { ChannelIdentityInputSchema, type ChannelIdentityInput } from './types.js'

export interface ChannelIdentityContract extends ChannelIdentityInput {
  readonly identityHash: ReturnType<typeof canonicalHash>
}

export function sealChannelIdentity(input: unknown): ChannelIdentityContract {
  const parsed = ChannelIdentityInputSchema.parse(input)
  const failures: string[] = []
  if (canonicalHash(parsed.voice.settings) !== parsed.voice.settingsHash) {
    failures.push('VOICE_SETTINGS_HASH_MISMATCH')
  }
  if (parsed.voice.fingerprintDurationSec !== thresholds.AUDIO.VOICE_FINGERPRINT_SEC) {
    failures.push(`VOICE_FINGERPRINT_DURATION_INVALID:${parsed.voice.fingerprintDurationSec}`)
  }
  if (parsed.music.tempoRangeBpm.max < parsed.music.tempoRangeBpm.min) {
    failures.push('MUSIC_TEMPO_RANGE_INVALID')
  }
  if (failures.length > 0) throw new DesignError('IDENTITY_CONTRACT_INVALID', failures)
  return { ...parsed, identityHash: canonicalHash(parsed) }
}

const SpecializationSchema = z.object({
  voiceId: z.string().min(1),
  model: z.string().min(1),
  settingsHash: z.string().regex(/^[0-9a-f]{64}$/u),
  ownerExceptionHash: z.string().regex(/^[0-9a-f]{64}$/u).nullable(),
}).strict()

export function assertInheritedVoice(identity: ChannelIdentityContract, specializationInput: unknown): void {
  const specialization = SpecializationSchema.parse(specializationInput)
  const changed = specialization.voiceId !== identity.voice.voiceId
    || specialization.model !== identity.voice.model
    || specialization.settingsHash !== identity.voice.settingsHash
  if (changed && specialization.ownerExceptionHash === null) {
    throw new DesignError('IDENTITY_OVERRIDE_DENIED', ['VOICE_OVERRIDE_REQUIRES_OWNER_EXCEPTION'])
  }
}
