export type CreativeErrorCode =
  | 'CREATIVE_CONTRACT_INVALID'
  | 'PACKAGING_CONTRACT_INVALID'
  | 'PREDICTION_INPUT_INVALID'
  | 'STORY_LINT_FAILED'

export class CreativeError extends Error {
  override readonly name = 'CreativeError'

  constructor(
    readonly code: CreativeErrorCode,
    readonly failures: readonly string[],
    options?: ErrorOptions,
  ) {
    super(`${code}: ${failures.join('; ')}`, options)
  }
}
