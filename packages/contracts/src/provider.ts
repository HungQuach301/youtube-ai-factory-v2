import type { ErrorClass } from './enums.js'
import type { Namespace } from './enums.js'
import type { ArchetypeId, CapabilityId, FencingToken, Hex64, PackageId, ReservationId, StageInstanceId, TraceId } from './ids.js'

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
  actualCost(response: Res): number
  normalizeError(error: unknown): ErrorClass
}

export interface DispatchExecutionContext {
  readonly fencingToken: FencingToken
  readonly packageId: PackageId
  readonly stageInstanceId: StageInstanceId
  readonly traceId: TraceId
  readonly namespace: Exclude<Namespace, 'quarantine'>
  readonly reservationId: ReservationId
  readonly portfolioRef: string
  readonly channelRef?: string
  readonly createdAt: string
  readonly expiresAt: string
}

export interface DispatchGuardInput<Req> {
  readonly capabilityId: CapabilityId
  readonly capabilityVersion: string
  readonly adapterSettingsHash: Hex64
  readonly requestSettingsHash: Hex64
  readonly archetypeId: ArchetypeId
  readonly request: Req
  readonly estimate: CostEstimate
  readonly idempotencyKey: Hex64
  readonly context: DispatchExecutionContext
}

export interface DispatchTransportResult<Res> {
  readonly response: Res
  readonly actualCostUsd: number
}

export interface DispatchGuardRuntime {
  execute<Req, Res>(
    input: DispatchGuardInput<Req>,
    transport: () => Promise<DispatchTransportResult<Res>>,
  ): Promise<Res>
}

export interface GuardedDispatchContext extends DispatchExecutionContext {
  readonly requestSettingsHash: Hex64
  readonly dispatchGuard: DispatchGuardRuntime
}

export declare function guardedDispatch<Req, Res>(
  adapter: ProviderAdapter<Req, Res>,
  archetype: ArchetypeId,
  request: Req,
  context: GuardedDispatchContext
): Promise<Res>
