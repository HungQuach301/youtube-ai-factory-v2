import { describe, expect, test } from 'vitest'
import { createSyntheticGoldSamples, GoldSetManager } from '../src/index.js'

const CREATED_AT = '2026-08-28T00:00:00.000Z'

describe('G-02E qualification-only synthetic materialization plan', () => {
  test('pins 16 samples across eight defect classes with two variants each', () => {
    const samples = createSyntheticGoldSamples(CREATED_AT)
    const defectCounts = new Map<string, number>()
    for (const sample of samples) {
      defectCounts.set(
        sample.groundTruth.defectClass,
        (defectCounts.get(sample.groundTruth.defectClass) ?? 0) + 1,
      )
    }

    expect(samples).toHaveLength(16)
    expect(defectCounts.size).toBe(8)
    expect([...defectCounts.values()]).toEqual(Array.from({ length: 8 }, () => 2))
  })

  test('isolates every materialized key in qualification and keeps production ineligible', () => {
    const samples = createSyntheticGoldSamples(CREATED_AT)
    expect(samples.every((sample) => sample.r2Key.startsWith('qualification/'))).toBe(true)
    expect(samples.every((sample) => !sample.r2Key.includes('/production/'))).toBe(true)
    expect(samples.every((sample) => sample.ownerJudgment === null)).toBe(true)
  })

  test('remains fail-closed without owner-labelled rejected masters', () => {
    const manager = new GoldSetManager()
    for (const sample of createSyntheticGoldSamples(CREATED_AT)) manager.append(sample)

    expect(manager.readiness()).toEqual({
      ready: false,
      sampleCount: 16,
      rejectedMasterCount: 0,
      failures: ['GOLD_SET_MIN_30', 'REJECTED_MASTER_MIN_15'],
    })
  })
})
