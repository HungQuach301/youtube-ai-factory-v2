import type { ErrorClass } from './enums.js'
import type { ArchetypeId, CapabilityId, FencingToken, Hex64, PackageId, StageInstanceId, TraceId } from './ids.js'

export interface CostEstimate {
  readonly maxCostUsd: number
  readonly basis: 'token_count' | 'char_count' | 'per_asset' | 'per_second'
  readonly detail: Readonly<Record<string, number>>
}

export interface ProviderAdapter<Req, Res> {
  readonly capabilityId: CapabilityId
  readonly version: string
  readonly settingsHash: Hex64
  estimateCost(req: Req): CostEstimate
  dispatch(req: Req, idempotencyKey: Hex64): Promise<Res>
  normalizeError(error: unknown): ErrorClass
}

export interface GuardedDispatchContext {
  readonly fencingToken: FencingToken
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId
  readonly traceId: TraceId
}

export declare function guardedDispatch<Req, Res>(
  adapter: ProviderAdapter<Req, Res>,
  archetype: ArchetypeId,
  request: Req,
  context: GuardedDispatchContext
): Promise<Res>
