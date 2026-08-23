export type EvidenceErrorCode =
  | 'EVIDENCE_NOT_FOUND'
  | 'IMMUTABILITY_VIOLATION'
  | 'INTEGRITY_MISMATCH'
  | 'INVALID_R2_PATH'
  | 'INVALID_EVIDENCE_METADATA'
  | 'SOURCE_FETCH_FAILED'
  | 'SECRET_MATERIAL_REJECTED'
  | 'CODEC_UNAVAILABLE'

export class EvidenceError extends Error {
  override readonly name = 'EvidenceError'

  constructor(
    readonly code: EvidenceErrorCode,
    message: string,
  ) {
    super(message)
  }
}
