import { thresholds } from '@youtube-ai-factory/contracts'

import { MediaSpecError } from './errors.js'

export interface NarrationSection {
  readonly id: string
  readonly index: number
  readonly text: string
  readonly previousContext: string
  readonly nextContext: string
}

export interface NarrationRequest {
  readonly sectionId: string
  readonly text: string
  readonly previousText: string
  readonly nextText: string
  readonly previousRequestId: string | null
  readonly voiceSettingsHash: string
}

export function planNarrationRequests(
  sections: readonly NarrationSection[],
  voiceSettingsHash: string,
  priorRequestIds: Readonly<Record<string, string>> = {},
): readonly NarrationRequest[] {
  const ordered = [...sections].sort((left, right) => left.index - right.index)
  const failures: string[] = []
  if (!/^[0-9a-f]{64}$/u.test(voiceSettingsHash)) failures.push('VOICE_SETTINGS_HASH_INVALID')
  ordered.forEach((section, index) => {
    if (section.index !== index) failures.push('SECTION_SEQUENCE_INVALID:' + section.id)
    if (index < ordered.length - 1 && section.text.length < thresholds.AUDIO.TTS_SECTION_CHARS.min) failures.push('SECTION_TOO_SHORT:' + section.id)
    if (section.text.length > thresholds.AUDIO.TTS_SECTION_CHARS.max) failures.push('SECTION_TOO_LONG:' + section.id)
    if (index > 0 && section.previousContext.length < thresholds.AUDIO.TTS_CONTEXT_CHARS.min) failures.push('PREVIOUS_CONTEXT_SHORT:' + section.id)
    if (index < ordered.length - 1 && section.nextContext.length < thresholds.AUDIO.TTS_CONTEXT_CHARS.min) failures.push('NEXT_CONTEXT_SHORT:' + section.id)
  })
  if (failures.length > 0) throw new MediaSpecError('NARRATION_PLAN_INVALID', failures)
  return ordered.map((section, index) => ({
    sectionId: section.id,
    text: section.text,
    previousText: section.previousContext,
    nextText: section.nextContext,
    previousRequestId: index === 0 ? null : priorRequestIds[ordered[index - 1]?.id ?? ''] ?? null,
    voiceSettingsHash,
  }))
}

export function planNarrationRetry(
  requests: readonly NarrationRequest[],
  failedSectionIds: readonly string[],
): readonly NarrationRequest[] {
  const failed = new Set(failedSectionIds)
  return requests.filter((request) => failed.has(request.sectionId))
}

export function evaluatePhonemeMismatch(rate: number, measuredErrorFloor: number | null): {
  readonly state: 'WARNING_UNCALIBRATED' | 'PASS' | 'FAIL'
  readonly threshold: number | null
} {
  if (!Number.isFinite(rate) || rate < 0) throw new MediaSpecError('NARRATION_PLAN_INVALID', ['PHONEME_RATE_INVALID'])
  if (measuredErrorFloor === null) return { state: 'WARNING_UNCALIBRATED', threshold: null }
  const threshold = Math.max(thresholds.ALIGNER_CALIBRATION.MIN_THRESHOLD, measuredErrorFloor * thresholds.ALIGNER_CALIBRATION.FLOOR_MULTIPLIER)
  return { state: rate <= threshold ? 'PASS' : 'FAIL', threshold }
}
