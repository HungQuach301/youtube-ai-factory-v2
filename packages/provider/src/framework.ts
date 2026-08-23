import {
  RETRYABLE,
  thresholds,
} from '@youtube-ai-factory/contracts'
import type {
  ArchetypeId,
  ErrorClass,
  GuardedDispatchContext,
  Hex64,
  ProviderAdapter,
} from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

const ERROR_CLASSES: ReadonlySet<string> = new Set<ErrorClass>([
  'TRANSIENT',
  'RATE_LIMIT',
  'SCHEMA_VIOLATION',
  'RIGHTS_DENIED',
  'BUDGET_DENIED',
  'CONTENT_FILTERED',
  'PROVIDER_ERROR',
])
const RETRYABLE_CLASSES: ReadonlySet<ErrorClass> = new Set(RETRYABLE)
const COST_BASES = new Set(['token_count', 'char_count', 'per_asset', 'per_second'])

function isErrorClass(value: unknown): value is ErrorClass {
  return typeof value === 'string' && ERROR_CLASSES.has(value)
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function assertValidEstimate(estimate: ReturnType<ProviderAdapter<unknown, unknown>['estimateCost']>): void {
  if (!estimate
    || typeof estimate !== 'object'
    || !COST_BASES.has(estimate.basis)
    || !estimate.detail
    || typeof estimate.detail !== 'object'
    || !isNonNegativeFinite(estimate.maxCostUsd)
    || Object.values(estimate.detail).some((value) => !isNonNegativeFinite(value))) {
    throw new TypeError('Provider cost estimate must contain only non-negative finite numbers.')
  }
}

function idempotencyKey<Req>(
  adapter: ProviderAdapter<Req, unknown>,
  archetype: ArchetypeId,
  request: Req,
  context: GuardedDispatchContext,
): Hex64 {
  return canonicalHash({
    archetype_id: archetype,
    capability_id: adapter.capabilityId,
    package_id: context.packageId,
    request,
    settings_hash: adapter.settingsHash,
    stage_instance_id: context.stageInstanceId,
    version: adapter.version,
  })
}

function normalizeError<Req, Res>(
  adapter: ProviderAdapter<Req, Res>,
  error: unknown,
): ErrorClass {
  try {
    const normalized = adapter.normalizeError(error)
    return isErrorClass(normalized) ? normalized : 'PROVIDER_ERROR'
  } catch {
    return 'PROVIDER_ERROR'
  }
}

function retryDelayMs(failedAttempt: number): number {
  const base = thresholds.RETRY.BASE_BACKOFF_MS * (2 ** (failedAttempt - 1))
  const jitter = base * thresholds.RETRY.JITTER_RATIO * ((Math.random() * 2) - 1)
  return Math.max(0, Math.round(base + jitter))
}

async function waitBeforeRetry(failedAttempt: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, retryDelayMs(failedAttempt))
  })
}

export class ProviderDispatchError extends Error {
  override readonly name = 'ProviderDispatchError'

  constructor(
    readonly errorClass: ErrorClass,
    readonly attempts: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export async function guardedDispatch<Req, Res>(
  adapter: ProviderAdapter<Req, Res>,
  archetype: ArchetypeId,
  request: Req,
  context: GuardedDispatchContext,
): Promise<Res> {
  let key: Hex64
  let estimate: ReturnType<ProviderAdapter<Req, Res>['estimateCost']>
  try {
    estimate = adapter.estimateCost(request)
    assertValidEstimate(estimate)
    key = idempotencyKey(adapter, archetype, request, context)
  } catch (error) {
    throw new ProviderDispatchError(
      'PROVIDER_ERROR',
      0,
      'Provider dispatch was blocked before transport because estimation or identity failed.',
      { cause: error },
    )
  }

  return context.dispatchGuard.execute({
    capabilityId: adapter.capabilityId,
    capabilityVersion: adapter.version,
    adapterSettingsHash: adapter.settingsHash,
    requestSettingsHash: context.requestSettingsHash,
    archetypeId: archetype,
    request,
    estimate,
    idempotencyKey: key,
    context,
  }, async () => {
    for (let attempt = 1; attempt <= thresholds.RETRY.MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await adapter.dispatch(request, key)
        const actualCostUsd = adapter.actualCost(response)
        if (!isNonNegativeFinite(actualCostUsd) || actualCostUsd > estimate.maxCostUsd) {
          throw new ProviderDispatchError(
            'PROVIDER_ERROR',
            attempt,
            'Provider actual cost is invalid or exceeds the reserved estimate.',
          )
        }
        return { response, actualCostUsd }
      } catch (error) {
        if (error instanceof ProviderDispatchError) throw error
        const errorClass = normalizeError(adapter, error)
        if (!RETRYABLE_CLASSES.has(errorClass) || attempt === thresholds.RETRY.MAX_ATTEMPTS) {
          throw new ProviderDispatchError(
            errorClass,
            attempt,
            `Provider dispatch stopped after ${attempt} attempt(s): ${errorClass}.`,
            { cause: error },
          )
        }
        await waitBeforeRetry(attempt)
      }
    }

    throw new ProviderDispatchError(
      'PROVIDER_ERROR',
      thresholds.RETRY.MAX_ATTEMPTS,
      'Provider dispatch exhausted its fail-closed retry state.',
    )
  })
}
