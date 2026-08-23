import type { z } from 'zod'

import type { CapabilityId, Hex64, PackageId, StageInstanceId, TraceId } from './ids.js'
import type { ProfileName } from './enums.js'
import type { PROFILE } from './thresholds.js'
import type { CandidateSourceMetadata } from './tournament.js'

export interface CapabilityRef {
  readonly capabilityId: CapabilityId
  readonly version: string
}

export interface DeterministicMeasurements {
  readonly values: Readonly<Record<string, number | string | boolean | null>>
  readonly evidenceHashes: readonly Hex64[]
}

export interface Candidate<T> {
  readonly value: T
  readonly candidateOrdinal: number
  readonly lineageHash: Hex64
  readonly sourceMetadata?: CandidateSourceMetadata
}

export interface RunContext {
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId
  readonly traceId: TraceId
  readonly profile: ProfileName
  readonly profileSettings: (typeof PROFILE)[ProfileName]
}

export type PreflightResult =
  | { readonly ok: true; readonly evidenceHashes: readonly Hex64[] }
  | { readonly ok: false; readonly failures: readonly string[] }

export interface AcceptanceTest {
  readonly code: string
  readonly description: string
  readonly schema?: z.ZodType<unknown>
}
