import { thresholds } from '@youtube-ai-factory/contracts'

import { MediaSpecError } from './errors.js'

export interface SourceCandidateMetadata {
  readonly id: string
  readonly durationMs: number
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly licenseType: string
  readonly licenseUrl: string | null
  readonly monetizationAllowed: boolean
  readonly editorialOnly: boolean
  readonly hasWatermark: boolean
  readonly provenanceRef: string | null
  readonly perceptualHash: string | null
}

export interface SourceEligibilityInput {
  readonly shotDurationMs: number
  readonly durationMarginMs: number
  readonly aspectRatio: number
  readonly candidateTarget: number
  readonly candidates: readonly SourceCandidateMetadata[]
}

export interface SourceRejection {
  readonly candidateId: string
  readonly reasons: readonly string[]
}

export interface SourceEligibilityReport {
  readonly eligible: readonly SourceCandidateMetadata[]
  readonly rejected: readonly SourceRejection[]
  readonly bytesAllowedCandidateIds: readonly string[]
}

const allowedFps = new Set([24, 25, 30, 50, 60])

function metadataFailures(candidate: SourceCandidateMetadata, input: SourceEligibilityInput): string[] {
  const failures: string[] = []
  if (candidate.durationMs < input.shotDurationMs + input.durationMarginMs) failures.push('DURATION_SHORT')
  if (candidate.width < 1920 || candidate.height < 1080) failures.push('RESOLUTION_LOW')
  if (!allowedFps.has(candidate.fps)) failures.push('FPS_UNSUPPORTED')
  if (Math.abs(candidate.width / candidate.height - input.aspectRatio) > 0.02) failures.push('ASPECT_RATIO_MISMATCH')
  if (!candidate.monetizationAllowed || candidate.editorialOnly || candidate.licenseUrl === null) failures.push('LICENSE_INELIGIBLE')
  if (candidate.hasWatermark) failures.push('WATERMARK_PRESENT')
  if (candidate.provenanceRef === null) failures.push('PROVENANCE_MISSING')
  return failures
}

function bitCount(value: bigint): number {
  let remaining = value
  let count = 0
  while (remaining > 0n) {
    count += Number(remaining & 1n)
    remaining >>= 1n
  }
  return count
}

function isDuplicate(left: string | null, right: string | null): boolean {
  if (left === null || right === null || !/^[0-9a-f]{16}$/iu.test(left) || !/^[0-9a-f]{16}$/iu.test(right)) return false
  return bitCount(BigInt('0x' + left) ^ BigInt('0x' + right)) <= thresholds.VISUAL.PHASH_HAMMING_DUPLICATE
}

export function filterSourceCandidates(input: SourceEligibilityInput): SourceEligibilityReport {
  const failures: string[] = []
  if (input.shotDurationMs <= 0 || input.durationMarginMs < 0) failures.push('DURATION_INPUT_INVALID')
  if (input.candidateTarget < thresholds.VISUAL.SOURCE_CANDIDATES.min || input.candidateTarget > thresholds.VISUAL.SOURCE_CANDIDATES.max) {
    failures.push('CANDIDATE_TARGET_OUT_OF_RANGE')
  }
  const rejected: SourceRejection[] = []
  const eligible: SourceCandidateMetadata[] = []
  for (const candidate of input.candidates) {
    const reasons = metadataFailures(candidate, input)
    if (reasons.length === 0 && eligible.some((accepted) => isDuplicate(accepted.perceptualHash, candidate.perceptualHash))) {
      reasons.push('PERCEPTUAL_DUPLICATE')
    }
    if (reasons.length > 0) rejected.push({ candidateId: candidate.id, reasons })
    else if (eligible.length < input.candidateTarget) eligible.push(candidate)
  }
  if (failures.length > 0) throw new MediaSpecError('SOURCE_ELIGIBILITY_FAILED', failures)
  return {
    eligible,
    rejected,
    bytesAllowedCandidateIds: eligible.map((candidate) => candidate.id),
  }
}
