import { describe, expect, test } from 'vitest'

import { CompilerError, compileShotCueProgram } from '../src/index.js'

const hash = 'a'.repeat(64)
const assertionSet = (claimId: string) => ([
  {
    temporalState: 'BEFORE' as const,
    statement: 'The prior state is visible.',
    claimIds: [claimId],
    evidenceBinding: 'claim://' + claimId + '/before',
  },
  {
    temporalState: 'DURING' as const,
    statement: 'The transition is visible.',
    claimIds: [claimId],
    evidenceBinding: 'claim://' + claimId + '/during',
  },
  {
    temporalState: 'AFTER' as const,
    statement: 'The resulting state is visible.',
    claimIds: [claimId],
    evidenceBinding: 'claim://' + claimId + '/after',
  },
])

const makeShot = (seq: number, start: number, end: number) => ({
  id: 'shot-' + seq,
  seq,
  tStartTick: start,
  tEndTick: end,
  route: seq % 2 === 0 ? 'MAKE' as const : 'SOURCE' as const,
  archetype: seq % 2 === 0 ? 'data_visualization' as const : 'documentary_live_action' as const,
  motionClass: seq % 2 === 0 ? 'LAYERED_SEMANTIC' as const : 'SOURCE_SEMANTIC' as const,
  claimIds: ['claim-' + seq],
  layers: [{ id: 'layer-' + seq, kind: 'DATA' as const, payloadHash: hash }],
  sourceQuery: seq % 2 === 0 ? null : 'source query ' + seq,
  assertions: assertionSet('claim-' + seq),
})

const makeProgram = (count = 98) => {
  const canonicalDurationTicks = 33_813_454
  return {
    packageId: 'package-1',
    timebaseHz: 48_000,
    frameRate: { numerator: 30, denominator: 1 },
    canonicalDurationTicks,
    shots: Array.from({ length: count }, (_, seq) => makeShot(
      seq,
      Math.floor(canonicalDurationTicks * seq / count),
      Math.floor(canonicalDurationTicks * (seq + 1) / count),
    )),
  }
}

describe('WP-20 ShotCueProgram compiler', () => {
  test('compiles the complete 704.446958333s timeline without a fixed shot-count target', () => {
    const compiled = compileShotCueProgram(makeProgram())
    expect(compiled.canonicalDurationTicks / compiled.timebaseHz).toBe(704.4469583333333)
    expect(compiled.shotCount).toBe(98)
    expect(compiled.timeline).toEqual({
      gapCount: 0,
      overlapCount: 0,
      durationDeltaTicks: 0,
      durationDeltaFrames: 0,
    })
    expect(compiled.canonicalHash).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('does not impose a minimum or maximum number of shots', () => {
    const single = compileShotCueProgram({
      ...makeProgram(1),
      canonicalDurationTicks: 240_000,
      shots: [makeShot(0, 0, 240_000)],
    })
    expect(single.shotCount).toBe(1)
    expect(compileShotCueProgram(makeProgram(256)).shotCount).toBe(256)
  })

  test('fails closed on a timeline gap', () => {
    const input = makeProgram(3)
    const shots = input.shots.map((shot, index) => index === 1
      ? { ...shot, tStartTick: shot.tStartTick + 10 }
      : shot)
    try {
      compileShotCueProgram({ ...input, shots })
      throw new Error('EXPECTED_FAILURE')
    } catch (error) {
      expect(error).toBeInstanceOf(CompilerError)
      expect((error as CompilerError).failures.some(
        (failure) => failure.startsWith('TIMELINE_GAP:'),
      )).toBe(true)
    }
  })

  test('fails closed on an overlap found by the interval tree', () => {
    const input = makeProgram(3)
    const shots = input.shots.map((shot, index) => index === 1
      ? { ...shot, tStartTick: shot.tStartTick - 10 }
      : shot)
    try {
      compileShotCueProgram({ ...input, shots })
      throw new Error('EXPECTED_FAILURE')
    } catch (error) {
      expect(error).toBeInstanceOf(CompilerError)
      expect((error as CompilerError).failures.some(
        (failure) => failure.startsWith('TIMELINE_OVERLAP:'),
      )).toBe(true)
    }
  })

  test('accepts one-frame duration tolerance and rejects anything larger', () => {
    const input = makeProgram(3)
    const oneFrameTicks = 1_600
    const within = input.shots.map((shot, index) => index === input.shots.length - 1
      ? { ...shot, tEndTick: shot.tEndTick - oneFrameTicks }
      : shot)
    expect(compileShotCueProgram({ ...input, shots: within }).timeline.durationDeltaFrames).toBe(1)
    const outside = input.shots.map((shot, index) => index === input.shots.length - 1
      ? { ...shot, tEndTick: shot.tEndTick - oneFrameTicks - 1 }
      : shot)
    expect(() => compileShotCueProgram({ ...input, shots: outside })).toThrowError(CompilerError)
  })

  test('requires one BEFORE, DURING and AFTER assertion bound to the shot claims', () => {
    const input = makeProgram(2)
    const shots = input.shots.map((shot, index) => index === 0 ? {
      ...shot,
      assertions: [shot.assertions[0], shot.assertions[0], shot.assertions[2]],
    } : shot)
    try {
      compileShotCueProgram({ ...input, shots })
      throw new Error('EXPECTED_FAILURE')
    } catch (error) {
      expect(error).toBeInstanceOf(CompilerError)
      expect((error as CompilerError).failures).toContain('ASSERTION_STATE_MISSING:shot-0:DURING')
    }
  })
})
