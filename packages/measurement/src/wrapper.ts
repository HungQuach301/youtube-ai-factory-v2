import type { DeterministicMeasurements } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import {
  measureBlackFrames,
  measureClipping,
  measureDropFrames,
  measureDuplicate,
  measureForcedAlignment,
  measureFreezeFrames,
  measureLoudness,
  measureMobileLegibility,
  measureNearStatic,
  measureSafeZone,
  measureSeam,
  measureSemanticMotion,
  measureSilence,
  measureStreamProfile,
  measureTimeline,
} from './measure.js'
import { MeasurementInputSchema } from './types.js'
import type { MeasurementBundle, MeasurementCode, MeasurementEvidence } from './types.js'

function evidence<Value>(code: MeasurementCode, value: Value): MeasurementEvidence<Value> {
  return { code, value }
}

export function runDeterministicMeasurements(input: unknown): MeasurementBundle {
  const parsed = MeasurementInputSchema.parse(input)
  const evidenceItems: readonly MeasurementEvidence<unknown>[] = [
    evidence('BLACK_FRAME', measureBlackFrames(parsed.blackFrameLog)),
    evidence('FREEZE_FRAME', measureFreezeFrames(parsed.freezeFrameLog)),
    evidence('SILENCE', measureSilence(parsed.silenceLog)),
    evidence('CLIPPING', measureClipping(parsed.clipping)),
    evidence('LOUDNESS', measureLoudness(parsed.loudness)),
    evidence('DROP_FRAME', measureDropFrames(parsed.dropFrame)),
    evidence('STREAM_PROFILE', measureStreamProfile(parsed.streamProfile)),
    evidence('FORCED_ALIGNMENT', measureForcedAlignment(parsed.forcedAlignment)),
    evidence('SEAM', measureSeam(parsed.seam)),
    evidence('SEMANTIC_MOTION', measureSemanticMotion(parsed.semanticMotion)),
    evidence('DUPLICATE', measureDuplicate(parsed.duplicate.perceptualHashes)),
    evidence('NEAR_STATIC', measureNearStatic(parsed.nearStatic.samples)),
    evidence('MOBILE_LEGIBILITY', measureMobileLegibility(parsed.mobileLegibility.elements)),
    evidence('SAFE_ZONE', measureSafeZone(parsed.safeZone)),
    evidence('TIMELINE_LINT', measureTimeline(parsed.timeline)),
  ]

  const byCode = new Map(evidenceItems.map((item) => [item.code, item.value]))
  const intervalCount = (code: MeasurementCode): number => {
    const value = byCode.get(code)
    if (typeof value !== 'object' || value === null || !('intervals' in value) || !Array.isArray(value.intervals)) {
      throw new Error(`Measurement ${code} does not contain intervals.`)
    }
    return value.intervals.length
  }
  const objectValue = <Value>(code: MeasurementCode): Value => {
    const value = byCode.get(code)
    if (value === undefined) throw new Error(`Measurement ${code} is missing.`)
    return value as Value
  }

  const alignment = objectValue<{ readonly phonemeMismatchRate: number }>('FORCED_ALIGNMENT')
  const seam = objectValue<{ readonly f0StepSemitone: number | null }>('SEAM')
  const motion = objectValue<{ readonly residualEnergyMean: number }>('SEMANTIC_MOTION')
  const duplicates = objectValue<{ readonly duplicatePairRatio: number }>('DUPLICATE')
  const nearStatic = objectValue<{ readonly longestDurationSec: number }>('NEAR_STATIC')
  const legibility = objectValue<{ readonly passed: boolean }>('MOBILE_LEGIBILITY')
  const safeZone = objectValue<{ readonly passed: boolean }>('SAFE_ZONE')
  const timeline = objectValue<{ readonly issueCount: number }>('TIMELINE_LINT')
  const clipping = objectValue<{ readonly peakDb: number }>('CLIPPING')
  const loudness = objectValue<{ readonly integratedLufs: number }>('LOUDNESS')
  const dropFrame = objectValue<{ readonly missingFrames: number }>('DROP_FRAME')

  const measurements: DeterministicMeasurements = {
    values: {
      black_frame_interval_count: intervalCount('BLACK_FRAME'),
      freeze_frame_interval_count: intervalCount('FREEZE_FRAME'),
      silence_interval_count: intervalCount('SILENCE'),
      clipping_peak_db: clipping.peakDb,
      loudness_integrated_lufs: loudness.integratedLufs,
      missing_frame_count: dropFrame.missingFrames,
      stream_profile_hash: canonicalHash(objectValue('STREAM_PROFILE')),
      phoneme_mismatch_rate: alignment.phonemeMismatchRate,
      seam_f0_step_semitone: seam.f0StepSemitone,
      semantic_motion_residual_mean: motion.residualEnergyMean,
      duplicate_pair_ratio: duplicates.duplicatePairRatio,
      near_static_longest_sec: nearStatic.longestDurationSec,
      mobile_legibility_pass: legibility.passed,
      safe_zone_pass: safeZone.passed,
      timeline_issue_count: timeline.issueCount,
    },
    evidenceHashes: evidenceItems.map((item) => canonicalHash(item)),
  }

  return { measurements, evidence: evidenceItems }
}
