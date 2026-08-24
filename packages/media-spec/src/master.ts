import { thresholds } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import { MediaSpecError } from './errors.js'

export interface MasterSpec {
  readonly id: string
  readonly tier: 'ARCHIVAL' | 'DISTRIBUTION'
  readonly derivedFromMasterId: string | null
  readonly videoCodec: string
  readonly audioCodec: string
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly color: string
}

export interface MasterPlan {
  readonly archival: MasterSpec
  readonly distribution: MasterSpec
  readonly planHash: ReturnType<typeof canonicalHash>
}

export function buildMasterPlan(packageId: string): MasterPlan {
  if (packageId.length === 0) throw new MediaSpecError('MASTER_PLAN_INVALID', ['PACKAGE_ID_MISSING'])
  const archival: MasterSpec = {
    id: packageId + '-archival', tier: 'ARCHIVAL', derivedFromMasterId: null,
    videoCodec: thresholds.MASTER.ARCHIVAL_VIDEO_CODEC,
    audioCodec: thresholds.MASTER.ARCHIVAL_AUDIO_CODEC,
    width: thresholds.MASTER.WIDTH, height: thresholds.MASTER.HEIGHT,
    fps: thresholds.MASTER.FPS, color: thresholds.MASTER.COLOR,
  }
  const distribution: MasterSpec = {
    id: packageId + '-distribution', tier: 'DISTRIBUTION', derivedFromMasterId: archival.id,
    videoCodec: thresholds.MASTER.DISTRIBUTION_VIDEO_CODEC,
    audioCodec: thresholds.MASTER.DISTRIBUTION_AUDIO_CODEC,
    width: thresholds.MASTER.WIDTH, height: thresholds.MASTER.HEIGHT,
    fps: thresholds.MASTER.FPS, color: thresholds.MASTER.COLOR,
  }
  return { archival, distribution, planHash: canonicalHash({ archival, distribution }) }
}

export function validateMasterEvidence(input: {
  readonly fileSha256: string
  readonly streamFrameMd5: string
  readonly r2ReadbackSha256: string
  readonly driveReadbackSha256: string
  readonly durationDeltaFrames: number
}): void {
  const failures: string[] = []
  if (!/^[0-9a-f]{64}$/u.test(input.fileSha256)) failures.push('FILE_SHA_INVALID')
  if (input.fileSha256 !== input.r2ReadbackSha256 || input.fileSha256 !== input.driveReadbackSha256) failures.push('STORAGE_READBACK_MISMATCH')
  if (input.streamFrameMd5.trim().length === 0) failures.push('STREAM_FRAMEMD5_MISSING')
  if (Math.abs(input.durationDeltaFrames) > thresholds.MASTER.AV_DURATION_TOLERANCE_FRAMES) failures.push('AV_DURATION_MISMATCH')
  if (failures.length > 0) throw new MediaSpecError('MASTER_PLAN_INVALID', failures)
}
