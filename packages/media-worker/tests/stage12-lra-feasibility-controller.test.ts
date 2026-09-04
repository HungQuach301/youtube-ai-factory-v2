import { describe, expect, it } from 'vitest'
import { buildStage12LraFeasibilityMap, planStage12LraFeasibilityStep,
  selectStage12LraFeasibilitySeeds, STAGE12_LRA_FEASIBILITY_POLICY,
  validateStage12LraFeasibilityLineage, verifyStage12LraFeasibilityCandidate,
} from '../stage12-lra-feasibility-controller.mjs'

const thresholds = { integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1,
  lraMin: 4, lraMax: 8 }
const base = { integratedLufs: -15.2, truePeakDbtp: -0.9, loudnessRangeLu: 4.2,
  limiterCeilingDbtp: -2.67 }

describe('Stage 12 codec-safe LRA feasibility controller', () => {
  it('uses the exact non-monotonic lattice without allowing TP to narrow LRA search', () => {
    const measurements = STAGE12_LRA_FEASIBILITY_POLICY.lattice.map((macroDepthDb, index) =>
      ({ ...base, macroDepthDb, truePeakDbtp: index % 2 ? -1.1 : -0.8,
        loudnessRangeLu: index === 2 ? 4.4 : 3.5 }))
    const map = buildStage12LraFeasibilityMap(measurements, thresholds)
    expect(map.map((item) => item.macroDepthDb)).toEqual([14, 12.45, 11.675, 13.225,
      11.2875, 12.0625, 12.8375, 13.6125])
    expect(map[2].lraFeasible).toBe(true)
    expect(map[2].truePeakContained).toBe(false)
    expect(selectStage12LraFeasibilitySeeds(map, thresholds)[0].probeOrdinal).toBe(2)
  })

  it('reserves LUFS budget and limits a 0.30 LU correction to 0.25 LU', () => {
    const lraMeasurements = STAGE12_LRA_FEASIBILITY_POLICY.lattice.map((macroDepthDb) =>
      ({ ...base, macroDepthDb }))
    const step = planStage12LraFeasibilityStep({ lraMeasurements, truePeakContained: true,
      lufsContained: false, currentIntegratedLufs: -15.25, currentIntegratedTargetLufs: -14,
      currentLimiterCeilingDbtp: -2.8, safeRollbackCandidatePass: 5, used: {} }, thresholds)
    expect(step.phase).toBe('LUFS_TRIM')
    expect(step.targetStepLufs).toBe(0.25)
  })

  it('requires one post-Opus artifact to pass all unchanged predicates', () => {
    expect(verifyStage12LraFeasibilityCandidate({ integratedLufs: -14.9,
      truePeakDbtp: -1.01, loudnessRangeLu: 4 }, thresholds).pass).toBe(true)
    expect(verifyStage12LraFeasibilityCandidate({ integratedLufs: -14.9,
      truePeakDbtp: -0.99, loudnessRangeLu: 4 }, thresholds).pass).toBe(false)
  })

  it('binds immutable ordinal-2 and both exact evidence ids', () => {
    expect(() => validateStage12LraFeasibilityLineage({ sourceAttemptOrdinal: 3,
      sourceCorrectionOrdinal: 2, historicalFailureCorrectionOrdinal: 3,
      sourceSha256: '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2',
      parentEvidenceId: '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb',
      lraGuardEvidenceId: '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9',
      shadowOnly: true, uploadCorrectedOutput: false, providerDispatch: 'OFF', providerCallCount: 0,
      calibration: false, finalize: false, productionActivation: false, release: false,
      autoPublish: 'OFF' })).not.toThrow()
  })

  it('finds an interior feasible island despite endpoint and slope reversals', () => {
    const lra = [3.1, 3.8, 4.1, 3.9, 4.6, 8.2, 4.3, 3.7]
    const map = buildStage12LraFeasibilityMap(STAGE12_LRA_FEASIBILITY_POLICY.lattice
      .map((macroDepthDb, index) => ({ ...base, macroDepthDb,
        loudnessRangeLu: lra[index], truePeakDbtp: index === 4 ? -0.7 : -1.1 })), thresholds)
    expect(map.filter((item) => item.lraFeasible).map((item) => item.probeOrdinal))
      .toEqual([2, 4, 6])
    expect(selectStage12LraFeasibilitySeeds(map, thresholds)).toHaveLength(2)
  })

  it('does not spend LUFS or rollback reserves during the complete LRA map', () => {
    const first = planStage12LraFeasibilityStep({ lraMeasurements: [],
      anchorLimiterCeilingDbtp: -2.67, safeRollbackCandidatePass: 5,
      used: { LRA_MAP: 0, LUFS_TRIM: 3, SAFE_ROLLBACK: 1 } }, thresholds)
    expect(first).toMatchObject({ phase: 'LRA_MAP', macroDepthDb: 14,
      integratedTargetLufs: -14, limiterCeilingDbtp: -2.67 })
  })

  it('contains post-Opus true peak with macro depth frozen', () => {
    const lraMeasurements = STAGE12_LRA_FEASIBILITY_POLICY.lattice.map((macroDepthDb) =>
      ({ ...base, macroDepthDb, loudnessRangeLu: 4.5, truePeakDbtp: -0.8 }))
    const step = planStage12LraFeasibilityStep({ lraMeasurements, truePeakContained: false,
      anchorLimiterCeilingDbtp: -2.67, currentLimiterCeilingDbtp: -2.67,
      safeRollbackCandidatePass: 5, used: {} }, thresholds)
    expect(step.phase).toBe('TRUE_PEAK_CONTAINMENT')
    expect(step.macroDepthDb).toBe(step.seed.macroDepthDb)
    expect(step.limiterCeilingDbtp).toBeLessThan(-2.67)
  })
})
