export type MediaSpecErrorCode =
  | 'SOURCE_ELIGIBILITY_FAILED'
  | 'COMPOSITION_PLAN_INVALID'
  | 'NARRATION_PLAN_INVALID'
  | 'AUDIO_PLAN_INVALID'
  | 'EDIT_PLAN_INVALID'
  | 'MASTER_PLAN_INVALID'

export class MediaSpecError extends Error {
  constructor(
    readonly code: MediaSpecErrorCode,
    readonly failures: readonly string[],
  ) {
    super(code + ': ' + failures.join(', '))
    this.name = 'MediaSpecError'
  }
}
