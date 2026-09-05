import { describe, expect, it } from 'vitest'
import { buildStage12LraFeasibilityMap, planStage12LraFeasibilityStep,
  runStage12LraFeasibilityController, selectStage12LraFeasibilitySeeds,
  STAGE12_LRA_FEASIBILITY_POLICY,
  validateStage12LraFeasibilityLineage, verifyStage12LraFeasibilityCandidate,
} from '../stage12-lra-feasibility-controller.mjs'

const thresholds = { integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1,
  lraMin: 4, lraMax: 8 }
const base = { integratedLufs: -15.2, truePeakDbtp: -0.9, loudnessRangeLu: 4.2,
  limiterCeilingDbtp: -2.67 }
const safeRollbackReference = { candidatePass: 5 as const, macroDepthDb: 10.70625,
  integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
  losslessReferenceSha256: 'a'.repeat(64),
  integratedLufs: -15.25, integratedLufsExact: '-15.25',
  truePeakDbtp: -1.06, truePeakDbtpExact: '-1.06',
  loudnessRangeLu: 3.2, loudnessRangeLuExact: '3.20',
  audioFrameMd5Sha256: 'b'.repeat(64) }

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

  it('runs containment, bounded LUFS trim and same-artifact verification from one seed', async () => {
    const plans: Array<Record<string, unknown>> = []
    const result = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67,
      safeRollbackReference,
      probe: async (plan: Record<string, unknown>) => {
        plans.push(plan)
        const phase = String(plan.phase)
        const phaseOrdinal = Number(plan.phaseOrdinal)
        if (phase === 'FINAL_VERIFICATION') {
          return { ...(plan.sameArtifactReference as Record<string, number | string>) }
        }
        const feasible = phase !== 'LRA_MAP' || phaseOrdinal === 2
        const integratedLufs = phase === 'LUFS_TRIM'
          ? (phaseOrdinal === 0 ? -15 : -14.9) : -15.25
        const truePeakDbtp = phase === 'TRUE_PEAK_CONTAINMENT'
          || phase === 'LUFS_TRIM' ? -1.1 : -0.8
        const ordinal = plans.length.toString(16).padStart(64, '0')
        return { integratedLufs, integratedLufsExact: integratedLufs.toFixed(2),
          truePeakDbtp, truePeakDbtpExact: truePeakDbtp.toFixed(2),
          loudnessRangeLu: feasible ? 4.5 : 3.5,
          loudnessRangeLuExact: feasible ? '4.50' : '3.50',
          candidateSha256: ordinal, audioFrameMd5Sha256: ordinal }
      } })
    expect(result.outcome).toBe('PASS')
    expect(result.phaseBudgetUsed).toEqual({ LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 1,
      LUFS_TRIM: 2, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 0 })
    const nonMap = result.candidateTrace.filter((candidate: { phase: string }) =>
      candidate.phase !== 'LRA_MAP')
    expect(new Set(nonMap.map((candidate: { macroDepthDb: number }) => candidate.macroDepthDb)))
      .toEqual(new Set([11.675]))
    expect(result.candidateTrace.filter((candidate: { phase: string }) =>
      candidate.phase === 'LUFS_TRIM').every(
        (candidate: { targetStepLufs: number }) => Math.abs(candidate.targetStepLufs) <= 0.25,
      )).toBe(true)
    expect(result.safeRollbackReference).toEqual(safeRollbackReference)
  })

  it('spends only the rollback reserve after a complete map proves no LRA seed', async () => {
    let ordinal = 0
    const result = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67,
      safeRollbackReference,
      probe: async (plan: { phase: string }) => {
        ordinal += 1
        const hash = ordinal.toString(16).padStart(64, '0')
        return { integratedLufs: -15.25, integratedLufsExact: '-15.25',
          truePeakDbtp: -1.06, truePeakDbtpExact: '-1.06',
          loudnessRangeLu: plan.phase === 'SAFE_ROLLBACK' ? 3.2 : 3.5,
          loudnessRangeLuExact: plan.phase === 'SAFE_ROLLBACK' ? '3.20' : '3.50',
          candidateSha256: hash, audioFrameMd5Sha256: plan.phase === 'SAFE_ROLLBACK'
            ? safeRollbackReference.audioFrameMd5Sha256 : hash }
      } })
    expect(result).toMatchObject({ outcome: 'FAIL',
      terminalReason: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED' })
    expect(result.phaseBudgetUsed).toEqual({ LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 1 })
    expect(result.candidateTrace.at(-1)?.disposition).toBe('SAFE_ROLLBACK')
    expect(result.selectedCandidateSha256).toBe(result.candidateTrace.at(-1)?.candidateSha256)
  })

  it('preserves the failed probe plan and truthful attempted budget on partial failure', async () => {
    let ordinal = 0
    let caught: unknown
    try {
      await runStage12LraFeasibilityController({ thresholds,
        anchorLimiterCeilingDbtp: -2.67,
        safeRollbackReference,
        probe: async (plan: { phase: string; phaseOrdinal: number }) => {
          if (plan.phase === 'LRA_MAP' && plan.phaseOrdinal === 3) {
            throw Object.assign(new Error('probe failed'), {
              code: 'STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID',
            })
          }
          ordinal += 1
          const digest = ordinal.toString(16).padStart(64, '0')
          return { integratedLufs: -15.25, integratedLufsExact: '-15.25',
            truePeakDbtp: -1.06, truePeakDbtpExact: '-1.06',
            loudnessRangeLu: 3.5, loudnessRangeLuExact: '3.50',
            candidateSha256: digest, audioFrameMd5Sha256: digest }
        } })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error & { feasibilityState?: unknown }).feasibilityState).toEqual({
      candidateTrace: expect.arrayContaining([
        expect.objectContaining({ candidateOrdinal: 0, phase: 'LRA_MAP', phaseOrdinal: 0 }),
        expect.objectContaining({ candidateOrdinal: 1, phase: 'LRA_MAP', phaseOrdinal: 1 }),
        expect.objectContaining({ candidateOrdinal: 2, phase: 'LRA_MAP', phaseOrdinal: 2 }),
      ]),
      phaseBudgetUsed: { LRA_MAP: 4, TRUE_PEAK_CONTAINMENT: 0, LUFS_TRIM: 0,
        POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 0 },
      failedProbes: [{ phase: 'LRA_MAP', phaseOrdinal: 3, seedProbeOrdinal: null,
        macroDepthDb: 13.225, integratedTargetLufs: -14,
        limiterCeilingDbtp: -2.67, targetStepLufs: 0 }],
      failedProbe: { phase: 'LRA_MAP', phaseOrdinal: 3, seedProbeOrdinal: null,
        macroDepthDb: 13.225, integratedTargetLufs: -14,
        limiterCeilingDbtp: -2.67, targetStepLufs: 0 },
    })
  })

  it('uses the single global final slot then rolls back on final artifact drift', async () => {
    let ordinal = 0
    const phases: string[] = []
    const result = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67,
      safeRollbackReference,
      probe: async (plan: { phase: string; phaseOrdinal: number;
        sameArtifactReference?: Record<string, number | string> }) => {
        phases.push(plan.phase)
        ordinal += 1
        const digest = ordinal.toString(16).padStart(64, '0')
        const isMapSeed = plan.phase === 'LRA_MAP' && plan.phaseOrdinal < 2
        if (plan.phase === 'FINAL_VERIFICATION') return {
          ...plan.sameArtifactReference!, truePeakDbtp: -0.9, truePeakDbtpExact: '-0.90' }
        if (plan.phase === 'SAFE_ROLLBACK') return {
          ...safeRollbackReference, candidateSha256: digest }
        return { integratedLufs: -14, integratedLufsExact: '-14.00',
          truePeakDbtp: -1.1, truePeakDbtpExact: '-1.10',
          loudnessRangeLu: isMapSeed || plan.phase !== 'LRA_MAP' ? 4.5 : 3.5,
          loudnessRangeLuExact: isMapSeed || plan.phase !== 'LRA_MAP' ? '4.50' : '3.50',
          candidateSha256: digest, audioFrameMd5Sha256: digest }
      } })
    expect(result).toMatchObject({ outcome: 'FAIL',
      terminalReason: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED' })
    expect(result.phaseBudgetUsed.FINAL_VERIFICATION).toBe(1)
    expect(result.phaseBudgetUsed.SAFE_ROLLBACK).toBe(1)
    expect(result.failedProbe).toMatchObject({ phase: 'FINAL_VERIFICATION', phaseOrdinal: 0,
      failureCode: 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT',
      observedMeasurement: { truePeakDbtp: -0.9, truePeakDbtpExact: '-0.90' } })
    expect(phases.filter((phase) => phase === 'FINAL_VERIFICATION')).toHaveLength(1)
    expect(phases.at(-1)).toBe('SAFE_ROLLBACK')
  })

  it('rejects seed one, final-fails seed two once, then reproduces exact pass-5 rollback',
    async () => {
      let ordinal = 0
      const plans: Array<{ phase: string; phaseOrdinal: number;
        seedProbeOrdinal?: number | null;
        sameArtifactReference?: Record<string, number | string> }> = []
      const result = await runStage12LraFeasibilityController({ thresholds,
        anchorLimiterCeilingDbtp: -2.67,
        safeRollbackReference,
        probe: async (plan: { phase: string; phaseOrdinal: number;
          seedProbeOrdinal?: number | null;
          sameArtifactReference?: Record<string, number | string> }) => {
          plans.push(plan)
          ordinal += 1
          const digest = ordinal.toString(16).padStart(64, '0')
          if (plan.phase === 'SAFE_ROLLBACK') return {
            ...safeRollbackReference, candidateSha256: digest }
          if (plan.phase === 'FINAL_VERIFICATION') return {
            ...plan.sameArtifactReference!, truePeakDbtp: -0.9,
            truePeakDbtpExact: '-0.90' }
          if (plan.phase === 'TRUE_PEAK_CONTAINMENT') return {
            integratedLufs: -14, integratedLufsExact: '-14.00',
            truePeakDbtp: -1.1, truePeakDbtpExact: '-1.10',
            loudnessRangeLu: 3.9, loudnessRangeLuExact: '3.90',
            candidateSha256: digest, audioFrameMd5Sha256: digest }
          const firstSeed = plan.phaseOrdinal === 0
          const secondSeed = plan.phaseOrdinal === 1
          const loudnessRangeLu = firstSeed ? 6 : secondSeed ? 5 : 3.5
          const truePeakDbtp = firstSeed ? -0.8 : -1.1
          return { integratedLufs: -14, integratedLufsExact: '-14.00',
            truePeakDbtp, truePeakDbtpExact: truePeakDbtp.toFixed(2),
            loudnessRangeLu, loudnessRangeLuExact: loudnessRangeLu.toFixed(2),
            candidateSha256: digest, audioFrameMd5Sha256: digest }
        } })
      const containment = result.candidateTrace.find(
        (candidate: { phase: string }) => candidate.phase === 'TRUE_PEAK_CONTAINMENT')
      const finalPlans = plans.filter((plan) => plan.phase === 'FINAL_VERIFICATION')
      const rollback = result.candidateTrace.at(-1)
      expect(containment).toMatchObject({ seedProbeOrdinal: 0,
        disposition: 'LRA_REGRESSION' })
      expect(finalPlans).toHaveLength(1)
      expect(finalPlans[0]?.seedProbeOrdinal).toBe(1)
      expect(result).toMatchObject({ outcome: 'FAIL',
        terminalReason: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
        phaseBudgetUsed: { TRUE_PEAK_CONTAINMENT: 1,
          FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1 },
        failedProbe: { phase: 'FINAL_VERIFICATION', seedProbeOrdinal: 1,
          failureCode: 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT' } })
      expect(rollback).toMatchObject({ phase: 'SAFE_ROLLBACK',
        disposition: 'SAFE_ROLLBACK', macroDepthDb: safeRollbackReference.macroDepthDb,
        integratedTargetLufs: safeRollbackReference.integratedTargetLufs,
        limiterCeilingDbtp: safeRollbackReference.limiterCeilingDbtp,
        integratedLufs: safeRollbackReference.integratedLufs,
        truePeakDbtp: safeRollbackReference.truePeakDbtp,
        loudnessRangeLu: safeRollbackReference.loudnessRangeLu,
        audioFrameMd5Sha256: safeRollbackReference.audioFrameMd5Sha256 })
      expect(result.selectedCandidateSha256).toBe(rollback?.candidateSha256)
    })

  it('does not final-verify a public-pass candidate that misses the internal TP target', async () => {
    let ordinal = 0
    const phases: string[] = []
    const result = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67,
      safeRollbackReference,
      probe: async (plan: { phase: string; phaseOrdinal: number }) => {
        phases.push(plan.phase)
        ordinal += 1
        const digest = ordinal.toString(16).padStart(64, '0')
        const isSeed = plan.phase === 'LRA_MAP' && plan.phaseOrdinal === 0
        const isTrimOrPost = ['LUFS_TRIM', 'POST_TRIM_TRUE_PEAK'].includes(plan.phase)
        const postTrimTruePeak = plan.phase === 'POST_TRIM_TRUE_PEAK'
          ? (plan.phaseOrdinal === 0 ? -1.02 : -1.03) : -1.03
        if (plan.phase === 'SAFE_ROLLBACK') return {
          ...safeRollbackReference, candidateSha256: digest }
        return { integratedLufs: isTrimOrPost ? -14.9 : -15.2,
          integratedLufsExact: isTrimOrPost ? '-14.90' : '-15.20',
          truePeakDbtp: isTrimOrPost ? postTrimTruePeak : -1.1,
          truePeakDbtpExact: isTrimOrPost ? postTrimTruePeak.toFixed(2) : '-1.10',
          loudnessRangeLu: isSeed || plan.phase !== 'LRA_MAP' ? 4.5 : 3.5,
          loudnessRangeLuExact: isSeed || plan.phase !== 'LRA_MAP' ? '4.50' : '3.50',
          candidateSha256: digest, audioFrameMd5Sha256: digest }
      } })
    expect(result.outcome).toBe('FAIL')
    expect(phases).not.toContain('FINAL_VERIFICATION')
    expect(phases.at(-1)).toBe('SAFE_ROLLBACK')
  })

  it('labels improving TP probes truthfully until the internal target is contained', async () => {
    let ordinal = 0
    const result = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67, safeRollbackReference,
      probe: async (plan: { phase: string; phaseOrdinal: number;
        sameArtifactReference?: Record<string, number | string> }) => {
        ordinal += 1
        const digest = ordinal.toString(16).padStart(64, '0')
        if (plan.phase === 'FINAL_VERIFICATION') return plan.sameArtifactReference!
        if (plan.phase === 'SAFE_ROLLBACK') return {
          ...safeRollbackReference, candidateSha256: digest }
        const isSeed = plan.phase === 'LRA_MAP' && plan.phaseOrdinal === 0
        const truePeakDbtp = plan.phase === 'TRUE_PEAK_CONTAINMENT'
          ? (plan.phaseOrdinal === 0 ? -1.02 : -1.06) : isSeed ? -0.8 : -1.1
        return { integratedLufs: -14, integratedLufsExact: '-14.00',
          truePeakDbtp, truePeakDbtpExact: truePeakDbtp.toFixed(2),
          loudnessRangeLu: isSeed || plan.phase !== 'LRA_MAP' ? 4.5 : 3.5,
          loudnessRangeLuExact: isSeed || plan.phase !== 'LRA_MAP' ? '4.50' : '3.50',
          candidateSha256: digest, audioFrameMd5Sha256: digest }
      } })
    expect(result.outcome).toBe('PASS')
    expect(result.candidateTrace.filter((candidate: { phase: string }) =>
      candidate.phase === 'TRUE_PEAK_CONTAINMENT').map(
        (candidate: { disposition: string }) => candidate.disposition,
      )).toEqual(['TP_IMPROVING', 'TP_CONTAINED'])
  })

  it('fails closed instead of selecting a rollback artifact with reference drift', async () => {
    let ordinal = 0
    let caught: unknown
    try {
      await runStage12LraFeasibilityController({ thresholds,
        anchorLimiterCeilingDbtp: -2.67, safeRollbackReference,
        probe: async (plan: { phase: string }) => {
          ordinal += 1
          const digest = ordinal.toString(16).padStart(64, '0')
          if (plan.phase === 'SAFE_ROLLBACK') return {
            ...safeRollbackReference, candidateSha256: digest,
            audioFrameMd5Sha256: 'c'.repeat(64) }
          return { integratedLufs: -15.25, integratedLufsExact: '-15.25',
            truePeakDbtp: -1.06, truePeakDbtpExact: '-1.06',
            loudnessRangeLu: 3.5, loudnessRangeLuExact: '3.50',
            candidateSha256: digest, audioFrameMd5Sha256: digest }
        } })
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      code: 'STAGE12_LRA_FEASIBILITY_MEASUREMENT_SAFE_ROLLBACK_DRIFT',
      feasibilityState: {
        phaseBudgetUsed: expect.objectContaining({ SAFE_ROLLBACK: 1 }),
        failedProbe: expect.objectContaining({ phase: 'SAFE_ROLLBACK', phaseOrdinal: 0 }),
      },
    })
  })

  it('rolls back after the final-ready artifact becomes unavailable', async () => {
    let ordinal = 0
    const result = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67, safeRollbackReference,
      probe: async (plan: { phase: string; phaseOrdinal: number }) => {
        ordinal += 1
        const digest = ordinal.toString(16).padStart(64, '0')
        if (plan.phase === 'FINAL_VERIFICATION') {
          throw Object.assign(new Error('missing cached artifact'), {
            code: 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE',
          })
        }
        if (plan.phase === 'SAFE_ROLLBACK') return {
          ...safeRollbackReference, candidateSha256: digest }
        const feasible = plan.phase === 'LRA_MAP' && plan.phaseOrdinal === 0
        return { integratedLufs: -14, integratedLufsExact: '-14.00',
          truePeakDbtp: -1.1, truePeakDbtpExact: '-1.10',
          loudnessRangeLu: feasible ? 4.5 : 3.5,
          loudnessRangeLuExact: feasible ? '4.50' : '3.50',
          candidateSha256: digest, audioFrameMd5Sha256: digest }
      } })
    expect(result).toMatchObject({ outcome: 'FAIL',
      terminalReason: 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
      failedProbe: { phase: 'FINAL_VERIFICATION',
        failureCode: 'STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE' },
      phaseBudgetUsed: { FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1 },
    })
  })

  it('rejects a forged immutable pass-5 rollback reference before probing', async () => {
    await expect(runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67,
      safeRollbackReference: { ...safeRollbackReference, truePeakDbtp: -0.99,
        truePeakDbtpExact: '-0.99' },
      probe: async () => { throw new Error('must not probe') },
    })).rejects.toMatchObject({ code: 'INVALID_STAGE12_LRA_FEASIBILITY_SAFE_ROLLBACK_REFERENCE' })
  })
})
