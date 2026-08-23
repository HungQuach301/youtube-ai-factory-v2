import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import { CompilerError } from './errors.js'
import { findOverlapPairs } from './interval-tree.js'
import {
  ShotCueProgramInputSchema,
  type AdaptiveWarning,
  type ShotCueProgram,
  type ShotCueProgramInput,
  type ShotInput,
  type TimelineReport,
} from './types.js'

const parseProgram = (input: unknown): ShotCueProgramInput => {
  const result = ShotCueProgramInputSchema.safeParse(input)
  if (!result.success) {
    throw new CompilerError(
      'SHOT_CUE_SCHEMA_INVALID',
      result.error.issues.map((issue) => issue.path.join('.') + ':' + issue.message),
    )
  }
  return result.data
}

const validateAssertions = (shot: ShotInput): readonly string[] => {
  const failures: string[] = []
  const states = new Set(shot.assertions.map((assertion) => assertion.temporalState))
  for (const required of ['BEFORE', 'DURING', 'AFTER'] as const) {
    if (!states.has(required)) failures.push('ASSERTION_STATE_MISSING:' + shot.id + ':' + required)
  }
  if (states.size !== 3) failures.push('ASSERTION_STATE_DUPLICATE:' + shot.id)
  const claimIds = new Set(shot.claimIds)
  for (const assertion of shot.assertions) {
    for (const claimId of assertion.claimIds) {
      if (!claimIds.has(claimId)) failures.push('ASSERTION_CLAIM_OUTSIDE_SHOT:' + shot.id + ':' + claimId)
    }
  }
  return failures
}

const validateBindings = (shot: ShotInput): readonly string[] => {
  const failures: string[] = []
  if ((shot.route === 'SOURCE' || shot.route === 'HYBRID') && shot.sourceQuery === null) {
    failures.push('SOURCE_QUERY_REQUIRED:' + shot.id + ':' + shot.route)
  }
  if (shot.route === 'MAKE' && shot.sourceQuery !== null) {
    failures.push('SOURCE_QUERY_FORBIDDEN:' + shot.id + ':MAKE')
  }
  return failures
}

const frameToleranceTicks = (program: ShotCueProgramInput): number => Math.ceil(
  program.timebaseHz * program.frameRate.denominator / program.frameRate.numerator,
) * thresholds.SHOT.DURATION_TOLERANCE_FRAMES

const validateTimeline = (program: ShotCueProgramInput): TimelineReport => {
  const failures: string[] = []
  const ids = new Set<string>()
  const seqs = new Set<number>()
  for (const shot of program.shots) {
    if (ids.has(shot.id)) failures.push('DUPLICATE_SHOT_ID:' + shot.id)
    if (seqs.has(shot.seq)) failures.push('DUPLICATE_SHOT_SEQ:' + shot.seq)
    if (shot.tEndTick <= shot.tStartTick) failures.push('NON_POSITIVE_INTERVAL:' + shot.id)
    ids.add(shot.id)
    seqs.add(shot.seq)
  }

  const byTime = [...program.shots].sort(
    (left, right) => left.tStartTick - right.tStartTick || left.tEndTick - right.tEndTick,
  )
  const overlaps = findOverlapPairs(byTime.map((shot) => ({
    id: shot.id,
    start: shot.tStartTick,
    end: shot.tEndTick,
  })))
  for (const [left, right] of overlaps) failures.push('TIMELINE_OVERLAP:' + left + ':' + right)

  let gapCount = 0
  if (byTime[0]?.tStartTick !== 0) {
    failures.push('TIMELINE_START_NOT_ZERO:' + String(byTime[0]?.tStartTick ?? 'MISSING'))
    gapCount += 1
  }
  for (let index = 1; index < byTime.length; index += 1) {
    const previous = byTime[index - 1]
    const current = byTime[index]
    if (previous === undefined || current === undefined) continue
    if (current.tStartTick > previous.tEndTick) {
      failures.push(
        'TIMELINE_GAP:' + previous.id + ':' + current.id + ':' + (current.tStartTick - previous.tEndTick),
      )
      gapCount += 1
    }
  }

  const bySeq = [...program.shots].sort((left, right) => left.seq - right.seq)
  for (let index = 0; index < bySeq.length; index += 1) {
    const shot = bySeq[index]
    if (shot?.seq !== index) {
      failures.push('SHOT_SEQ_NOT_CONTIGUOUS:' + String(shot?.seq ?? 'MISSING') + ':' + index)
    }
    if (shot?.id !== byTime[index]?.id) {
      failures.push('SHOT_SEQ_TIME_ORDER_MISMATCH:' + String(shot?.id ?? 'MISSING'))
    }
  }

  const finalTick = byTime.at(-1)?.tEndTick ?? 0
  const durationDeltaTicks = Math.abs(finalTick - program.canonicalDurationTicks)
  const toleranceTicks = frameToleranceTicks(program)
  if (durationDeltaTicks > toleranceTicks) {
    failures.push('DURATION_MISMATCH:' + durationDeltaTicks + ':' + toleranceTicks)
  }
  if (failures.length > 0) throw new CompilerError('SHOT_CUE_TIMELINE_INVALID', failures)

  return {
    gapCount,
    overlapCount: overlaps.length,
    durationDeltaTicks,
    durationDeltaFrames: durationDeltaTicks * program.frameRate.numerator
      / (program.timebaseHz * program.frameRate.denominator),
  }
}

const adaptiveWarnings = (program: ShotCueProgramInput): readonly AdaptiveWarning[] => {
  const warnings: AdaptiveWarning[] = []
  const bySeq = [...program.shots].sort((left, right) => left.seq - right.seq)
  const durations = bySeq.map((shot) => (shot.tEndTick - shot.tStartTick) / program.timebaseHz)
  for (let index = 0; index < bySeq.length; index += 1) {
    const shot = bySeq[index]
    const duration = durations[index]
    if (shot === undefined || duration === undefined) continue
    if (duration < thresholds.SHOT.DURATION_SEC.min) {
      warnings.push({
        code: 'SHOT_DURATION_BELOW_GUIDANCE',
        shotId: shot.id,
        observed: duration,
        guidance: thresholds.SHOT.DURATION_SEC.min,
      })
    }
    if (duration > thresholds.SHOT.DURATION_SEC.max) {
      warnings.push({
        code: 'SHOT_DURATION_ABOVE_GUIDANCE',
        shotId: shot.id,
        observed: duration,
        guidance: thresholds.SHOT.DURATION_SEC.max,
      })
    }
  }

  const orderedDurations = [...durations].sort((left, right) => left - right)
  const middle = Math.floor(orderedDurations.length / 2)
  const median = orderedDurations.length % 2 === 0
    ? ((orderedDurations[middle - 1] ?? 0) + (orderedDurations[middle] ?? 0)) / 2
    : (orderedDurations[middle] ?? 0)
  if (median < thresholds.SHOT.MEDIAN_DURATION_SEC.min || median > thresholds.SHOT.MEDIAN_DURATION_SEC.max) {
    warnings.push({
      code: 'MEDIAN_DURATION_OUTSIDE_GUIDANCE',
      shotId: null,
      observed: median,
      guidance: median < thresholds.SHOT.MEDIAN_DURATION_SEC.min
        ? thresholds.SHOT.MEDIAN_DURATION_SEC.min
        : thresholds.SHOT.MEDIAN_DURATION_SEC.max,
    })
  }

  let runStart = 0
  for (let index = 1; index <= bySeq.length; index += 1) {
    const changed = index === bySeq.length || bySeq[index]?.archetype !== bySeq[runStart]?.archetype
    if (!changed) continue
    const runLength = index - runStart
    const start = bySeq[runStart]
    const end = bySeq[index - 1]
    if (start !== undefined && end !== undefined) {
      if (runLength > thresholds.SHOT.MAX_CONSECUTIVE_SAME_ARCHETYPE) {
        warnings.push({
          code: 'ARCHETYPE_RUN_ABOVE_GUIDANCE',
          shotId: start.id,
          observed: runLength,
          guidance: thresholds.SHOT.MAX_CONSECUTIVE_SAME_ARCHETYPE,
        })
      }
      const hold = (end.tEndTick - start.tStartTick) / program.timebaseHz
      if (hold > thresholds.SHOT.MAX_NO_ARCHETYPE_CHANGE_SEC) {
        warnings.push({
          code: 'ARCHETYPE_HOLD_ABOVE_GUIDANCE',
          shotId: start.id,
          observed: hold,
          guidance: thresholds.SHOT.MAX_NO_ARCHETYPE_CHANGE_SEC,
        })
      }
    }
    runStart = index
  }
  return warnings
}

export const compileShotCueProgram = (input: unknown): ShotCueProgram => {
  const program = parseProgram(input)
  const assertionFailures = program.shots.flatMap(validateAssertions)
  if (assertionFailures.length > 0) {
    throw new CompilerError('SHOT_CUE_ASSERTION_INVALID', assertionFailures)
  }
  const bindingFailures = program.shots.flatMap(validateBindings)
  if (bindingFailures.length > 0) {
    throw new CompilerError('SHOT_CUE_BINDING_INVALID', bindingFailures)
  }
  const timeline = validateTimeline(program)
  const ordered = {
    ...program,
    shots: [...program.shots].sort((left, right) => left.seq - right.seq),
  }
  const core = {
    ...ordered,
    shotCount: ordered.shots.length,
    timeline,
    adaptiveWarnings: adaptiveWarnings(ordered),
  }
  return { ...core, canonicalHash: canonicalHash(core) }
}
