import { thresholds } from '@youtube-ai-factory/contracts'
import { z } from 'zod'

import { DesignError } from './errors.js'
import { ProtectedSpanSchema, type ProtectedSpan } from './types.js'

const SegmentationInputSchema = z.object({
  text: z.string().min(1),
  protectedSpans: z.array(ProtectedSpanSchema),
}).strict()

export interface TtsSegment {
  readonly index: number
  readonly start: number
  readonly end: number
  readonly text: string
  readonly previousContext: string
  readonly nextContext: string
}

const isInsideProtectedSpan = (offset: number, spans: readonly ProtectedSpan[]): boolean => (
  spans.some((span) => offset > span.start && offset < span.end)
)

function sentenceBoundaries(text: string): readonly number[] {
  const boundaries: number[] = []
  const matcher = /[.!?](?:["'”’)]*)\s+|[.!?](?:["'”’)]*)$/gu
  for (const match of text.matchAll(matcher)) boundaries.push(match.index + match[0].trimEnd().length)
  if (boundaries.at(-1) !== text.length) boundaries.push(text.length)
  return boundaries
}

export function planTtsSegments(input: unknown): readonly TtsSegment[] {
  const parsed = SegmentationInputSchema.parse(input)
  const failures: string[] = []
  for (const span of parsed.protectedSpans) {
    if (span.end <= span.start || span.end > parsed.text.length) failures.push(`PROTECTED_SPAN_INVALID:${span.kind}:${span.start}:${span.end}`)
  }
  if (failures.length > 0) throw new DesignError('TTS_SEGMENTATION_FAILED', failures)

  const candidates = sentenceBoundaries(parsed.text).filter((offset) => !isInsideProtectedSpan(offset, parsed.protectedSpans))
  const segments: TtsSegment[] = []
  let start = 0
  while (start < parsed.text.length) {
    const afterMin = candidates.filter((offset) => offset > start && offset - start >= thresholds.AUDIO.TTS_SECTION_CHARS.min)
    const withinMax = afterMin.filter((offset) => offset - start <= thresholds.AUDIO.TTS_SECTION_CHARS.max)
    const end = withinMax.at(-1) ?? afterMin[0] ?? parsed.text.length
    if (end <= start || isInsideProtectedSpan(end, parsed.protectedSpans)) {
      throw new DesignError('TTS_SEGMENTATION_FAILED', [`NO_SAFE_BOUNDARY:${start}`])
    }
    const contextChars = thresholds.AUDIO.TTS_CONTEXT_CHARS.min
    segments.push({
      index: segments.length,
      start,
      end,
      text: parsed.text.slice(start, end).trim(),
      previousContext: parsed.text.slice(Math.max(0, start - contextChars), start),
      nextContext: parsed.text.slice(end, Math.min(parsed.text.length, end + contextChars)),
    })
    start = end
    while (/\s/u.test(parsed.text[start] ?? '')) start += 1
  }
  return segments
}
