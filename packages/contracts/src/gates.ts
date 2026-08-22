import type { GateState, GateTier } from './enums.js'
import type { R2Key } from './ids.js'

export interface GateEvaluation {
  readonly gateCode: string
  readonly tier: GateTier
  readonly state: GateState
  readonly evidenceR2Key: R2Key | null
  readonly waiverOwner?: string
  readonly waiverExpiresAt?: string
}

export type DoRResult =
  | { readonly ready: true }
  | { readonly ready: false; readonly failures: readonly DoRFailure[] }

export interface DoRFailure {
  readonly condition: string
  readonly expected: string
  readonly actual: string
  readonly remediation: string
}
