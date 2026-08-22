import type { z } from 'zod'

import type { CapabilityId, Hex64, PackageId, StageInstanceId, TraceId } from './ids.js'

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
}

export interface RunContext {
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId
  readonly traceId: TraceId
}

export type PreflightResult =
  | { readonly ok: true; readonly evidenceHashes: readonly Hex64[] }
  | { readonly ok: false; readonly failures: readonly string[] }

export interface AcceptanceTest {
  readonly code: string
  readonly description: string
  readonly schema?: z.ZodType<unknown>
}
