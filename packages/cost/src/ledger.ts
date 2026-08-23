import type {
  PackageId,
  ReservationId,
} from '@youtube-ai-factory/contracts'

import type {
  CostControlErrorCode,
  CostKind,
  CostLedgerEntry,
  CostNamespace,
  CostScope,
  OrphanReport,
  ProviderRequestRecord,
  ProviderRequestState,
  Reservation,
  ReservationDecision,
  ReservationRequest,
  SpendCeiling,
  UnitEconomics,
  UnitEconomicsDenominators,
} from './types.js'

interface MutableReservation extends Reservation {
  actualCostUsd: number | null
  state: Reservation['state']
  readonly ceilingKeys: readonly string[]
}

interface MutableProviderRequest extends ProviderRequestRecord {
  state: ProviderRequestState
}

const NON_RETRYABLE_ERROR_CLASSES = new Set([
  'SCHEMA_VIOLATION',
  'RIGHTS_DENIED',
  'BUDGET_DENIED',
  'CONTENT_FILTERED',
])

function ceilingKey(namespace: CostNamespace, scope: CostScope, scopeRef: string): string {
  return `${namespace}:${scope}:${scopeRef}`
}

function displayScope(scope: CostScope, scopeRef: string): string {
  return `${scope}:${scopeRef}`
}

function assertMoney(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CostControlError('INVALID_INPUT', `${name} must be a non-negative finite number.`)
  }
}

function assertDate(value: string, name: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new CostControlError('INVALID_INPUT', `${name} must be an ISO-compatible date.`)
  }
  return parsed
}

function assertCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CostControlError('INVALID_INPUT', `${name} must be a non-negative safe integer.`)
  }
}

export class CostControlError extends Error {
  override readonly name = 'CostControlError'

  constructor(
    readonly code: CostControlErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export class CostReservationLedger {
  private readonly ceilings = new Map<string, SpendCeiling>()
  private readonly reservations = new Map<ReservationId, MutableReservation>()
  private readonly providerRequests = new Map<string, MutableProviderRequest>()
  private readonly providerRequestKeys = new Set<string>()
  private readonly ledgerEntries = new Map<ReservationId, CostLedgerEntry>()
  private serial: Promise<void> = Promise.resolve()

  constructor(ceilings: readonly SpendCeiling[]) {
    for (const ceiling of ceilings) {
      assertMoney(ceiling.ceilingUsd, 'Ceiling')
      if (ceiling.scopeRef.length === 0) {
        throw new CostControlError('INVALID_INPUT', 'Ceiling scopeRef must not be empty.')
      }
      if (ceiling.windowStart !== undefined) assertDate(ceiling.windowStart, 'Ceiling windowStart')
      if (ceiling.windowEnd !== undefined) assertDate(ceiling.windowEnd, 'Ceiling windowEnd')
      if (ceiling.windowStart !== undefined && ceiling.windowEnd !== undefined
        && Date.parse(ceiling.windowEnd) <= Date.parse(ceiling.windowStart)) {
        throw new CostControlError('INVALID_INPUT', 'Ceiling windowEnd must be after windowStart.')
      }
      const key = ceilingKey(ceiling.namespace, ceiling.scope, ceiling.scopeRef)
      if (this.ceilings.has(key)) {
        throw new CostControlError('INVALID_INPUT', `Duplicate ceiling ${key}.`)
      }
      this.ceilings.set(key, ceiling)
    }
  }

  async reserve(request: ReservationRequest): Promise<ReservationDecision> {
    return this.runExclusive(() => {
      this.validateRequest(request)
      const existing = this.reservations.get(request.id)
      if (existing !== undefined) {
        if (existing.packageId === request.packageId
          && existing.capabilityId === request.capabilityId
          && existing.estimatedCostUsd === request.estimatedCostUsd
          && existing.state === 'HELD') {
          return { ok: true, reservation: this.publicReservation(existing) }
        }
        if (existing.state !== 'HELD') {
          throw new CostControlError(
            'INVALID_TRANSITION',
            `Reservation ${request.id} is ${existing.state} and cannot authorize transport.`,
          )
        }
        throw new CostControlError('DUPLICATE_RESERVATION', `Reservation ${request.id} already exists.`)
      }
      if (this.packageHasOrphans(request.packageId)) {
        throw new CostControlError(
          'RECONCILIATION_REQUIRED',
          `Package ${request.packageId} has unresolved orphan reservations.`,
        )
      }

      const requestedScopes = this.requestedScopes(request)
      const createdAt = Date.parse(request.createdAt)
      const deniedScopes: string[] = []
      const matchedKeys: string[] = []
      for (const [scope, scopeRef] of requestedScopes) {
        const key = ceilingKey(request.namespace, scope, scopeRef)
        const ceiling = this.ceilings.get(key)
        if (ceiling === undefined || !this.ceilingActiveAt(ceiling, createdAt)) {
          deniedScopes.push(displayScope(scope, scopeRef))
          continue
        }
        matchedKeys.push(key)
        if (this.utilizationForKey(key) + request.estimatedCostUsd > ceiling.ceilingUsd) {
          deniedScopes.push(displayScope(scope, scopeRef))
        }
      }
      if (deniedScopes.length > 0) {
        return { ok: false, errorClass: 'BUDGET_DENIED', deniedScopes }
      }

      const reservation: MutableReservation = {
        id: request.id,
        packageId: request.packageId,
        stageInstanceId: request.stageInstanceId ?? null,
        capabilityId: request.capabilityId,
        namespace: request.namespace,
        estimatedCostUsd: request.estimatedCostUsd,
        actualCostUsd: null,
        state: 'HELD',
        expiresAt: request.expiresAt,
        createdAt: request.createdAt,
        ceilingKeys: matchedKeys,
      }
      this.reservations.set(request.id, reservation)
      return { ok: true, reservation: this.publicReservation(reservation) }
    })
  }

  async settle(
    reservationId: ReservationId,
    actualCostUsd: number,
    kind: CostKind,
    createdAt: string,
  ): Promise<CostLedgerEntry> {
    return this.runExclusive(() => {
      assertMoney(actualCostUsd, 'Actual cost')
      assertDate(createdAt, 'Ledger createdAt')
      const reservation = this.reservations.get(reservationId)
      if (reservation === undefined) {
        throw new CostControlError('RESERVATION_NOT_FOUND', `Reservation ${reservationId} was not found.`)
      }
      const existingEntry = this.ledgerEntries.get(reservationId)
      if (reservation.state === 'SETTLED' && existingEntry !== undefined
        && existingEntry.amountUsd === actualCostUsd && existingEntry.kind === kind) {
        return existingEntry
      }
      if (reservation.state !== 'HELD') {
        throw new CostControlError('INVALID_TRANSITION', 'Only a HELD reservation can be settled.')
      }
      if (actualCostUsd > reservation.estimatedCostUsd) {
        throw new CostControlError(
          'ACTUAL_EXCEEDS_RESERVATION',
          'Actual cost exceeds the reserved maximum and requires owner-visible reconciliation.',
        )
      }
      if (!this.kindAllowedForNamespace(reservation.namespace, kind)) {
        throw new CostControlError(
          'INVALID_INPUT',
          `Cost kind ${kind} cannot be recorded in namespace ${reservation.namespace}.`,
        )
      }

      const entry: CostLedgerEntry = {
        id: `cost:${reservation.id}`,
        reservationId: reservation.id,
        packageId: reservation.packageId,
        stageInstanceId: reservation.stageInstanceId,
        capabilityId: reservation.capabilityId,
        namespace: reservation.namespace,
        amountUsd: actualCostUsd,
        kind,
        createdAt,
      }
      reservation.actualCostUsd = actualCostUsd
      reservation.state = 'SETTLED'
      this.ledgerEntries.set(reservation.id, entry)
      return entry
    })
  }

  async registerProviderRequest(record: ProviderRequestRecord): Promise<void> {
    await this.runExclusive(() => {
      assertCount(record.attemptOrdinal, 'Provider attempt ordinal')
      if (record.attemptOrdinal < 1) {
        throw new CostControlError('INVALID_INPUT', 'Provider attempt ordinal must start at one.')
      }
      assertDate(record.createdAt, 'Provider request createdAt')
      if (record.actualCostUsd !== undefined) assertMoney(record.actualCostUsd, 'Provider actual cost')
      if (record.latencyMs !== undefined) assertCount(record.latencyMs, 'Provider latency')
      const reservation = this.reservations.get(record.reservationId)
      if (reservation === undefined) {
        throw new CostControlError('RESERVATION_NOT_FOUND', `Reservation ${record.reservationId} was not found.`)
      }
      if (reservation.state !== 'HELD') {
        throw new CostControlError('INVALID_TRANSITION', 'Provider request requires a HELD reservation.')
      }
      if (this.providerRequests.has(record.id) || this.providerRequestKeys.has(record.idempotencyKey)) {
        throw new CostControlError('INVALID_INPUT', 'Provider request identity must be unique.')
      }
      const previous = [...this.providerRequests.values()]
        .filter((request) => request.reservationId === record.reservationId)
        .sort((left, right) => right.attemptOrdinal - left.attemptOrdinal)[0]
      if (record.attemptOrdinal > 1
        && previous?.errorClass !== undefined
        && NON_RETRYABLE_ERROR_CLASSES.has(previous.errorClass)) {
        throw new CostControlError(
          'INVALID_TRANSITION',
          `G8 blocks retry after terminal ${previous.errorClass}.`,
        )
      }
      this.providerRequests.set(record.id, {
        ...record,
        state: record.errorClass === undefined ? 'OPEN' : 'FAILED',
      })
      this.providerRequestKeys.add(record.idempotencyKey)
    })
  }

  async reconcileOrphans(packageId: PackageId, now: string): Promise<OrphanReport> {
    return this.runExclusive(() => {
      const nowMs = assertDate(now, 'Reconciliation time')
      const reservationIds: ReservationId[] = []
      const reservationSet = new Set<ReservationId>()
      let estimatedCostUsd = 0
      for (const reservation of this.reservations.values()) {
        if (reservation.packageId === packageId
          && reservation.state === 'HELD'
          && Date.parse(reservation.expiresAt) <= nowMs) {
          reservation.state = 'EXPIRED'
          reservationIds.push(reservation.id)
          reservationSet.add(reservation.id)
          estimatedCostUsd += reservation.estimatedCostUsd
        }
      }

      const providerRequestIds: string[] = []
      for (const request of this.providerRequests.values()) {
        if (request.state === 'OPEN' && reservationSet.has(request.reservationId)) {
          request.state = 'ORPHANED'
          providerRequestIds.push(request.id)
        }
      }
      return {
        packageId,
        reservationIds,
        providerRequestIds,
        estimatedCostUsd,
        blocksPackage: reservationIds.length > 0,
      }
    })
  }

  getUtilization(namespace: CostNamespace, scope: CostScope, scopeRef: string): number {
    return this.utilizationForKey(ceilingKey(namespace, scope, scopeRef))
  }

  unitEconomics(packageId: PackageId, denominators: UnitEconomicsDenominators): UnitEconomics {
    assertCount(denominators.sealedArtifactCount, 'Sealed artifact count')
    assertCount(denominators.publishedVideoCount, 'Published video count')
    const entries = [...this.ledgerEntries.values()].filter((entry) => entry.packageId === packageId)
    const totalCostUsd = entries.reduce((sum, entry) => sum + entry.amountUsd, 0)
    const productionCostUsd = this.costByKind(entries, 'PRODUCTION')
    const qualificationCostUsd = this.costByKind(entries, 'QUALIFICATION')
    const rejectedCandidateCostUsd = this.costByKind(entries, 'REJECTED_CANDIDATE')
    const packageReservations = [...this.reservations.values()]
      .filter((reservation) => reservation.packageId === packageId)
    const orphanCount = packageReservations
      .filter((reservation) => reservation.state === 'EXPIRED' || reservation.state === 'ORPHANED').length
    return {
      totalCostUsd,
      productionCostUsd,
      qualificationCostUsd,
      rejectedCandidateCostUsd,
      costPerSealedArtifactUsd: denominators.sealedArtifactCount === 0
        ? null
        : totalCostUsd / denominators.sealedArtifactCount,
      costPerPublishedVideoUsd: denominators.publishedVideoCount === 0
        ? null
        : totalCostUsd / denominators.publishedVideoCount,
      tournamentShare: totalCostUsd === 0 ? null : rejectedCandidateCostUsd / totalCostUsd,
      orphanRate: packageReservations.length === 0 ? 0 : orphanCount / packageReservations.length,
    }
  }

  private runExclusive<Result>(operation: () => Result | Promise<Result>): Promise<Result> {
    const result = this.serial.then(operation, operation)
    this.serial = result.then(() => undefined, () => undefined)
    return result
  }

  private validateRequest(request: ReservationRequest): void {
    assertMoney(request.estimatedCostUsd, 'Estimated cost')
    const createdAt = assertDate(request.createdAt, 'Reservation createdAt')
    const expiresAt = assertDate(request.expiresAt, 'Reservation expiresAt')
    if (expiresAt <= createdAt) {
      throw new CostControlError('INVALID_INPUT', 'Reservation expiresAt must be after createdAt.')
    }
    if (request.scopes.portfolio.length === 0) {
      throw new CostControlError('INVALID_INPUT', 'Portfolio scope is mandatory.')
    }
    if (request.scopes.package !== undefined && request.scopes.package !== request.packageId) {
      throw new CostControlError('INVALID_INPUT', 'Package scope must match packageId.')
    }
    if (request.stageInstanceId !== undefined && request.scopes.stage !== request.stageInstanceId) {
      throw new CostControlError('INVALID_INPUT', 'Stage scope must match stageInstanceId.')
    }
    if (request.namespace !== 'qualification'
      && (request.scopes.channel === undefined || request.scopes.package === undefined)) {
      throw new CostControlError(
        'INVALID_INPUT',
        'Production and staging reservations require portfolio, channel and package scopes.',
      )
    }
  }

  private requestedScopes(request: ReservationRequest): readonly [CostScope, string][] {
    const scopes: [CostScope, string][] = [['PORTFOLIO', request.scopes.portfolio]]
    if (request.scopes.channel !== undefined) scopes.push(['CHANNEL', request.scopes.channel])
    if (request.scopes.package !== undefined) scopes.push(['PACKAGE', request.scopes.package])
    if (request.scopes.stage !== undefined) scopes.push(['STAGE', request.scopes.stage])
    return scopes
  }

  private ceilingActiveAt(ceiling: SpendCeiling, at: number): boolean {
    return (ceiling.windowStart === undefined || at >= Date.parse(ceiling.windowStart))
      && (ceiling.windowEnd === undefined || at < Date.parse(ceiling.windowEnd))
  }

  private utilizationForKey(key: string): number {
    let total = 0
    for (const reservation of this.reservations.values()) {
      if (!reservation.ceilingKeys.includes(key)) continue
      total += reservation.state === 'SETTLED'
        ? reservation.actualCostUsd ?? reservation.estimatedCostUsd
        : reservation.estimatedCostUsd
    }
    return total
  }

  private packageHasOrphans(packageId: PackageId): boolean {
    return [...this.reservations.values()].some((reservation) => (
      reservation.packageId === packageId
      && (reservation.state === 'EXPIRED' || reservation.state === 'ORPHANED')
    ))
  }

  private publicReservation(reservation: MutableReservation): Reservation {
    return {
      id: reservation.id,
      packageId: reservation.packageId,
      stageInstanceId: reservation.stageInstanceId,
      capabilityId: reservation.capabilityId,
      namespace: reservation.namespace,
      estimatedCostUsd: reservation.estimatedCostUsd,
      actualCostUsd: reservation.actualCostUsd,
      state: reservation.state,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
    }
  }

  private costByKind(entries: readonly CostLedgerEntry[], kind: CostKind): number {
    return entries.filter((entry) => entry.kind === kind)
      .reduce((sum, entry) => sum + entry.amountUsd, 0)
  }

  private kindAllowedForNamespace(namespace: CostNamespace, kind: CostKind): boolean {
    if (namespace === 'production') return kind === 'PRODUCTION' || kind === 'REJECTED_CANDIDATE'
    if (namespace === 'qualification') return kind === 'QUALIFICATION'
    return kind === 'REJECTED_CANDIDATE'
  }
}
