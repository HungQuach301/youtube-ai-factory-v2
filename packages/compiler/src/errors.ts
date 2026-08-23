export type CompilerErrorCode =
  | 'SHOT_CUE_SCHEMA_INVALID'
  | 'SHOT_CUE_ASSERTION_INVALID'
  | 'SHOT_CUE_TIMELINE_INVALID'
  | 'SHOT_CUE_BINDING_INVALID'

export class CompilerError extends Error {
  public constructor(
    public readonly code: CompilerErrorCode,
    public readonly failures: readonly string[],
  ) {
    super(code + ':' + failures.join('|'))
    this.name = 'CompilerError'
  }
}
