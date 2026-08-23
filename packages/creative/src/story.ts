import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import { BeatSchema, type Beat, type LintResult } from './types.js'

const normalizedBeatType = (beat: Beat): string => beat.beatType.trim().toUpperCase()

export function lintStory(beatInputs: readonly unknown[]): LintResult {
  const beats = beatInputs.map((beat) => BeatSchema.parse(beat)).sort((left, right) => left.tStartSec - right.tStartSec)
  const failures: string[] = []
  if (beats.length === 0) return { valid: false, failures: ['STORY_EMPTY'] }

  const durationSec = Math.max(...beats.map((beat) => beat.tEndSec))
  if (durationSec < thresholds.SCRIPT.DURATION_SEC.min || durationSec > thresholds.SCRIPT.DURATION_SEC.max) {
    failures.push(`STORY_DURATION_OUT_OF_RANGE:${durationSec}`)
  }

  const ids = new Set<string>()
  for (const beat of beats) {
    if (ids.has(beat.id)) failures.push(`DUPLICATE_BEAT_ID:${beat.id}`)
    ids.add(beat.id)
    if (beat.tEndSec <= beat.tStartSec) failures.push(`BEAT_TIME_INVALID:${beat.id}`)
    if (canonicalHash(beat.knowledgeBefore) === canonicalHash(beat.knowledgeAfter)) {
      failures.push(`KNOWLEDGE_STATE_UNCHANGED:${beat.id}`)
    }
  }

  const hook = beats.find((beat) => normalizedBeatType(beat) === 'HOOK')
  if (hook === undefined) failures.push('HOOK_MISSING')
  else if (hook.tEndSec > thresholds.STORY.HOOK_END_SEC) failures.push(`HOOK_END_LATE:${hook.tEndSec}`)

  const promise = beats.find((beat) => normalizedBeatType(beat) === 'PROMISE')
  if (promise === undefined) failures.push('PROMISE_MISSING')
  else if (promise.tEndSec > thresholds.STORY.PROMISE_END_SEC) failures.push(`PROMISE_END_LATE:${promise.tEndSec}`)

  const midpoint = beats.find((beat) => normalizedBeatType(beat) === 'MIDPOINT_REHOOK')
  if (midpoint === undefined) {
    failures.push('MIDPOINT_REHOOK_MISSING')
  } else {
    const midpointPct = ((midpoint.tStartSec + midpoint.tEndSec) / 2) / durationSec
    if (midpointPct < thresholds.STORY.MIDPOINT_REHOOK_PCT.min || midpointPct > thresholds.STORY.MIDPOINT_REHOOK_PCT.max) {
      failures.push(`MIDPOINT_REHOOK_OUT_OF_RANGE:${midpointPct}`)
    }
  }

  const payoff = beats.find((beat) => normalizedBeatType(beat) === 'PAYOFF')
  if (payoff === undefined) failures.push('PAYOFF_MISSING')
  else if (payoff.tStartSec / durationSec < thresholds.STORY.PAYOFF_START_PCT) {
    failures.push(`PAYOFF_START_EARLY:${payoff.tStartSec / durationSec}`)
  }

  const openLoops = new Map<string, Beat>()
  for (const beat of beats) {
    if (beat.loopOpened !== null) {
      if (openLoops.has(beat.loopOpened)) failures.push(`LOOP_OPENED_TWICE:${beat.loopOpened}`)
      else openLoops.set(beat.loopOpened, beat)
    }
    if (beat.loopClosed !== null) {
      const opened = openLoops.get(beat.loopClosed)
      if (opened === undefined) {
        failures.push(`LOOP_CLOSED_WITHOUT_OPEN:${beat.loopClosed}`)
      } else {
        const spanPct = (beat.tEndSec - opened.tStartSec) / durationSec
        if (spanPct > thresholds.STORY.LOOP_MAX_SPAN_PCT) failures.push(`LOOP_SPAN_EXCEEDED:${beat.loopClosed}:${spanPct}`)
        openLoops.delete(beat.loopClosed)
      }
    }
  }
  for (const loopId of openLoops.keys()) failures.push(`UNCLOSED_LOOP:${loopId}`)

  for (const beat of beats) {
    const windowEnd = beat.tStartSec + thresholds.SCRIPT.ENTITY_WINDOW_SEC
    const windowBeats = beats.filter((candidate) => candidate.tStartSec >= beat.tStartSec && candidate.tStartSec < windowEnd)
    const hasRecap = windowBeats.some((candidate) => normalizedBeatType(candidate) === 'RECAP')
    const entityCount = new Set(windowBeats.flatMap((candidate) => candidate.newEntities.map((entity) => entity.toLowerCase()))).size
    if (!hasRecap && entityCount > thresholds.SCRIPT.NEW_ENTITY_PER_15S) {
      failures.push(`ENTITY_DENSITY_EXCEEDED:${beat.id}:${entityCount}`)
    }
  }

  return { valid: failures.length === 0, failures }
}
