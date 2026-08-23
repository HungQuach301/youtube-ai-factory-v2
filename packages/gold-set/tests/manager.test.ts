import { describe, expect, test } from 'vitest'
import { createSyntheticGoldSamples, GoldSetManager, measureGoldPerformance } from '../src/index.js'

const NOW = '2026-08-23T00:00:00.000Z'

describe('WP-14 gold set manager', () => {
  test('creates exactly 16 deterministic FFmpeg recipes over eight defect classes', () => {
    const samples = createSyntheticGoldSamples(NOW)
    expect(samples).toHaveLength(16)
    expect(new Set(samples.map((sample) => sample.groundTruth.defectClass)).size).toBe(8)
    expect(samples.every((sample) => sample.recipe !== null)).toBe(true)
    expect(createSyntheticGoldSamples(NOW)).toEqual(samples)
  })

  test('fails closed until 15 owner-labelled rejected masters and at least 30 samples exist', () => {
    const manager = new GoldSetManager()
    for (const sample of createSyntheticGoldSamples(NOW)) manager.append(sample)
    expect(manager.readiness()).toMatchObject({ ready: false, sampleCount: 16, rejectedMasterCount: 0 })

    for (let index = 0; index < 15; index += 1) {
      manager.append({
        id: `rejected-${index}`,
        source: 'rejected_master',
        r2Key: `qualification/gold/rejected/${index}.mp4`,
        groundTruth: {
          defectClass: index % 2 === 0 ? 'BLACK_FRAME' : 'SILENCE',
          severity: 'P1',
          tStart: 1,
          tEnd: 2,
        },
        ownerJudgment: {
          actorIdentity: 'owner-test-fixture',
          rationale: 'Owner fixture rationale long enough for validation.',
          decidedAt: NOW,
        },
        recipe: null,
        createdAt: NOW,
      })
    }
    expect(manager.readiness()).toEqual({ ready: true, sampleCount: 31, rejectedMasterCount: 15, failures: [] })
  })

  test('is append-only and rejects duplicate ids', () => {
    const manager = new GoldSetManager()
    const sample = createSyntheticGoldSamples(NOW)[0]
    expect(sample).toBeDefined()
    manager.append(sample)
    expect(() => manager.append(sample)).toThrow('GOLD_SAMPLE_EXISTS')
  })

  test('measures recall, precision and interval-duration variance deterministically', () => {
    const samples = createSyntheticGoldSamples(NOW)
    const detections = samples.map((sample, index) => ({ sampleId: sample.id, detected: index % 2 === 0 }))
    const metrics = measureGoldPerformance(samples, detections)
    expect(metrics).toHaveLength(8)
    expect(metrics[0]).toEqual({ defectClass: 'BLACK_FRAME', precision: 0.125, recall: 0.5, durationVariance: 0.140625 })
  })
})
