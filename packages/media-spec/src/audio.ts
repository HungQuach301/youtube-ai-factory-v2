import { thresholds } from '@youtube-ai-factory/contracts'

import { MediaSpecError } from './errors.js'

export type CueKind = 'MUSIC' | 'SFX' | 'AMBIENCE' | 'SILENCE'

export interface AudioCue {
  readonly id: string
  readonly kind: CueKind
  readonly assetId: string | null
  readonly function: string
  readonly monetizationAllowed: boolean
  readonly licenseEvidenceHash: string | null
}

export interface LoudnormPass {
  readonly pass: 1 | 2
  readonly args: readonly string[]
}

export function validateAudioCues(mode: 'licensed' | 'ambience_only', cues: readonly AudioCue[]): void {
  const failures: string[] = []
  for (const cue of cues) {
    if (mode === 'ambience_only' && cue.kind === 'MUSIC') failures.push('MUSIC_FORBIDDEN_WITHOUT_PROVIDER:' + cue.id)
    if (cue.kind === 'SILENCE') {
      if (cue.assetId !== null || cue.function !== 'silence') failures.push('SILENCE_CUE_INVALID:' + cue.id)
      continue
    }
    if (cue.assetId === null || !cue.monetizationAllowed || cue.licenseEvidenceHash === null) failures.push('CUE_LICENSE_INCOMPLETE:' + cue.id)
  }
  if (failures.length > 0) throw new MediaSpecError('AUDIO_PLAN_INVALID', failures)
}

export function buildLoudnormPlan(measured: {
  readonly integratedLufs: number
  readonly truePeakDbtp: number
  readonly lra: number
  readonly threshold: number
  readonly offset: number
}): readonly LoudnormPass[] {
  const target = `I=${thresholds.AUDIO.LUFS_I.target}:TP=${thresholds.AUDIO.TRUE_PEAK_MAX_DBTP}:LRA=7`
  return [
    { pass: 1, args: ['loudnorm=' + target + ':print_format=json'] },
    { pass: 2, args: ['loudnorm=' + target + `:measured_I=${measured.integratedLufs}:measured_TP=${measured.truePeakDbtp}:measured_LRA=${measured.lra}:measured_thresh=${measured.threshold}:offset=${measured.offset}:linear=true`] },
  ]
}

export function buildDuckingFilter(input: {
  readonly duckDb: number
  readonly attackMs: number
  readonly releaseMs: number
}): string {
  const failures: string[] = []
  if (input.duckDb < thresholds.AUDIO.DUCK_DB.min || input.duckDb > thresholds.AUDIO.DUCK_DB.max) failures.push('DUCK_DB_OUT_OF_RANGE')
  if (input.attackMs < thresholds.AUDIO.DUCK_ATTACK_MS.min || input.attackMs > thresholds.AUDIO.DUCK_ATTACK_MS.max) failures.push('DUCK_ATTACK_OUT_OF_RANGE')
  if (input.releaseMs < thresholds.AUDIO.DUCK_RELEASE_MS.min || input.releaseMs > thresholds.AUDIO.DUCK_RELEASE_MS.max) failures.push('DUCK_RELEASE_OUT_OF_RANGE')
  if (failures.length > 0) throw new MediaSpecError('AUDIO_PLAN_INVALID', failures)
  return `sidechaincompress=threshold=-${input.duckDb}dB:attack=${input.attackMs}:release=${input.releaseMs}`
}
