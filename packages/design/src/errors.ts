export type DesignErrorCode =
  | 'IDENTITY_CONTRACT_INVALID'
  | 'IDENTITY_OVERRIDE_DENIED'
  | 'VOICE_FINGERPRINT_QUALIFICATION_INVALID'
  | 'TTS_SEGMENTATION_FAILED'
  | 'SOUNDSCAPE_INVALID'
  | 'VISUAL_GRAMMAR_INVALID'
  | 'ROUTE_FROZEN'

export class DesignError extends Error {
  public constructor(
    public readonly code: DesignErrorCode,
    public readonly failures: readonly string[],
  ) {
    super(`${code}:${failures.join('|')}`)
    this.name = 'DesignError'
  }
}
