import type {
  DispatchGuardInput,
  DispatchGuardRuntime,
  DispatchTransportResult,
  Hex64,
} from '@youtube-ai-factory/contracts'

import type { CapabilityRegistry } from './registry.js'
import type {
  DispatchBlockLog,
  DispatchBlockReason,
  DispatchBlockRecord,
  DispatchCostPort,
  DispatchEvidencePort,
  DispatchLeasePort,
} from './types.js'

export class DispatchBlockedError extends Error {
  override readonly name = 'DispatchBlockedError'

  constructor(
    readonly reason: DispatchBlockReason,
    readonly step: 1 | 2 | 3 | 4,
  ) {
    super(`Dispatch blocked at step ${step}: ${reason}.`)
  }
}

export class MemoryDispatchBlockLog implements DispatchBlockLog {
  private readonly records: DispatchBlockRecord[] = []

  async append(record: DispatchBlockRecord): Promise<void> {
    this.records.push(Object.freeze({ ...record }))
  }

  list(): readonly DispatchBlockRecord[] {
    return this.records.map((record) => ({ ...record }))
  }
}

export class CapabilityDispatchGuard implements DispatchGuardRuntime {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly lease: DispatchLeasePort,
    private readonly cost: DispatchCostPort,
    private readonly evidence: DispatchEvidencePort,
    private readonly blocks: DispatchBlockLog,
  ) {}

  async execute<Req, Res>(
    input: DispatchGuardInput<Req>,
    transport: () => Promise<DispatchTransportResult<Res>>,
  ): Promise<Res> {
    const authorization = this.registry.authorize(
      input.capabilityId,
      input.capabilityVersion,
      input.archetypeId,
    )
    if (!authorization.ok) {
      return await this.block(input, authorization.reason, 1, null)
    }

    const registryHash = authorization.capability.settingsHash
    if (registryHash !== input.adapterSettingsHash || registryHash !== input.requestSettingsHash) {
      await this.block(input, 'SETTINGS_HASH_MISMATCH', 2, registryHash)
    }

    if (!await this.lease.isCurrent(input.context)) {
      await this.block(input, 'STALE_FENCING_TOKEN', 3, registryHash)
    }

    const reservation = await this.cost.reserve({
      reservationId: input.context.reservationId,
      capabilityId: input.capabilityId,
      archetypeId: input.archetypeId,
      estimatedCostUsd: input.estimate.maxCostUsd,
      context: input.context,
    })
    if (!reservation.ok) {
      return await this.block(input, 'BUDGET_DENIED', 4, registryHash)
    }

    const requestEvidence = await this.evidence.snapshotRequest({
      request: input.request,
      idempotencyKey: input.idempotencyKey,
      context: input.context,
    })
    await this.cost.registerProviderRequest({
      reservationId: reservation.reservationId,
      idempotencyKey: input.idempotencyKey,
      requestR2Key: requestEvidence.r2Key,
      createdAt: input.context.createdAt,
    })

    const result = await transport()
    await this.evidence.snapshotResponse({
      response: result.response,
      idempotencyKey: input.idempotencyKey,
      context: input.context,
    })
    await this.cost.settle({
      reservationId: reservation.reservationId,
      namespace: input.context.namespace,
      actualCostUsd: result.actualCostUsd,
      createdAt: input.context.createdAt,
    })
    return result.response
  }

  private async block<Req>(
    input: DispatchGuardInput<Req>,
    reason: DispatchBlockReason,
    step: 1 | 2 | 3 | 4,
    registrySettingsHash: Hex64 | null,
  ): Promise<never> {
    await this.blocks.append({
      id: `${input.context.traceId}:${step}:${reason}`,
      traceId: input.context.traceId,
      packageId: input.context.packageId,
      stageInstanceId: input.context.stageInstanceId,
      capabilityId: input.capabilityId,
      archetypeId: input.archetypeId,
      step,
      reason,
      requestSettingsHash: input.requestSettingsHash,
      registrySettingsHash,
      zeroSpend: true,
      createdAt: input.context.createdAt,
    })
    throw new DispatchBlockedError(reason, step)
  }
}
