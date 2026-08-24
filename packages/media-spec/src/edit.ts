import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import { MediaSpecError } from './errors.js'

export interface AlignedWord {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
  readonly alignmentEvidenceRef: string
}

export interface CaptionEvent {
  readonly index: number
  readonly text: string
  readonly startMs: number
  readonly endMs: number
  readonly alignmentEvidenceRefs: readonly string[]
}

export interface EditClip {
  readonly id: string
  readonly sourceRef: string
  readonly startMs: number
  readonly endMs: number
}

export interface OtioTimelinePlan {
  readonly schema: 'OTIO.1'
  readonly canonicalDurationMs: number
  readonly clips: readonly EditClip[]
  readonly captions: readonly CaptionEvent[]
  readonly timelineHash: ReturnType<typeof canonicalHash>
}

export function captionsFromAlignment(words: readonly AlignedWord[]): readonly CaptionEvent[] {
  const ordered = [...words].sort((left, right) => left.startMs - right.startMs)
  const events: CaptionEvent[] = []
  for (let index = 0; index < ordered.length; index += thresholds.MOBILE.CAPTION_MAX_WORDS) {
    const group = ordered.slice(index, index + thresholds.MOBILE.CAPTION_MAX_WORDS)
    const first = group[0]
    const last = group.at(-1)
    if (first === undefined || last === undefined) continue
    events.push({
      index: events.length,
      text: group.map((word) => word.text).join(' '),
      startMs: first.startMs,
      endMs: last.endMs,
      alignmentEvidenceRefs: group.map((word) => word.alignmentEvidenceRef),
    })
  }
  return events
}

export function buildOtioTimeline(canonicalDurationMs: number, clips: readonly EditClip[], words: readonly AlignedWord[]): OtioTimelinePlan {
  const ordered = [...clips].sort((left, right) => left.startMs - right.startMs)
  const failures: string[] = []
  let cursor = 0
  for (const clip of ordered) {
    if (clip.startMs !== cursor) failures.push('TIMELINE_GAP_OR_OVERLAP:' + clip.id)
    if (clip.endMs <= clip.startMs) failures.push('CLIP_DURATION_INVALID:' + clip.id)
    cursor = clip.endMs
  }
  if (cursor !== canonicalDurationMs) failures.push('CANONICAL_DURATION_MISMATCH')
  if (words.some((word) => word.alignmentEvidenceRef.length === 0)) failures.push('CAPTION_ALIGNMENT_EVIDENCE_MISSING')
  if (failures.length > 0) throw new MediaSpecError('EDIT_PLAN_INVALID', failures)
  const value = { schema: 'OTIO.1' as const, canonicalDurationMs, clips: ordered, captions: captionsFromAlignment(words) }
  return { ...value, timelineHash: canonicalHash(value) }
}

export function validateEditQa(input: {
  readonly duplicateRate: number
  readonly nearStaticViolationCount: number
  readonly debugOverlayCount: number
  readonly watermarkCount: number
  readonly templateResidueCount: number
}): void {
  const failures: string[] = []
  if (input.duplicateRate > thresholds.VISUAL.DUPLICATE_MAX_PCT) failures.push('DUPLICATE_RATE_HIGH')
  if (input.nearStaticViolationCount > 0) failures.push('NEAR_STATIC_PRESENT')
  if (input.debugOverlayCount > 0) failures.push('DEBUG_OVERLAY_PRESENT')
  if (input.watermarkCount > 0) failures.push('WATERMARK_PRESENT')
  if (input.templateResidueCount > 0) failures.push('TEMPLATE_RESIDUE_PRESENT')
  if (failures.length > 0) throw new MediaSpecError('EDIT_PLAN_INVALID', failures)
}
