import { OWNER_COMMANDS } from '@youtube-ai-factory/contracts'
import type {
  CommandResult,
  CommandType,
  FencingToken,
  Hex64,
  PackageId,
  TraceId,
} from '@youtube-ai-factory/contracts'

import {
  commandTargetKind,
  nextStateFor,
  StateConflictError,
} from './state-machine.js'
import type { StateTargetKind } from './state-machine.js'

type MaybePromise<T> = T | Promise<T>

export interface ExecuteCommand {
  readonly type: CommandType
  readonly packageId: PackageId
  readonly targetId: string
  readonly idempotencyKey: Hex64
  readonly fencingToken: FencingToken
  readonly prevState: string
  readonly traceId: TraceId
  readonly actorIdentity: string
  readonly actorSignature?: string
  readonly evidenceHash?: Hex64
  readonly payload: Readonly<Record<string, unknown>>
}

export interface StateTarget {
  readonly kind: StateTargetKind
  readonly id: string
  readonly packageId: PackageId
}

export interface CommandLogRecord {
  readonly id: string
  readonly packageId: PackageId
  readonly commandType: CommandType
  readonly payload: Readonly<Record<string, unknown>>
  readonly idempotencyKey: Hex64
  readonly fencingToken: FencingToken
  readonly actorIdentity: string
  readonly actorSignature: string | null
  readonly evidenceHash: Hex64 | null
  readonly prevState: string
  readonly nextState: string
  readonly traceId: TraceId
  readonly createdAt: string
}

export interface CommandTransaction {
  readLeaseToken(packageId: PackageId): MaybePromise<number | undefined>
  appendCommand(record: CommandLogRecord): MaybePromise<void>
  readState(target: StateTarget): MaybePromise<string | undefined>
  compareAndSetState(target: StateTarget, expected: string, next: string): MaybePromise<boolean>
}

export interface CommandStore {
  transaction<T>(operation: (transaction: CommandTransaction) => MaybePromise<T>): Promise<T>
}

export interface OwnerCommandVerifier {
  verify(command: ExecuteCommand): MaybePromise<boolean>
}

export type CommandStoreErrorCode = 'DUPLICATE' | 'UNAUTHORIZED'

export class CommandStoreError extends Error {
  constructor(readonly code: CommandStoreErrorCode) {
    super(code)
    this.name = 'CommandStoreError'
  }
}

type RejectionReason = Extract<CommandResult, { readonly ok: false }>['reason']

class CommandRejectedError extends Error {
  constructor(readonly reason: RejectionReason) {
    super(reason)
    this.name = 'CommandRejectedError'
  }
}

const ownerCommandSet = new Set<CommandType>(OWNER_COMMANDS)

function rejection(reason: RejectionReason): never {
  throw new CommandRejectedError(reason)
}

function isOwnerCommand(commandType: CommandType): boolean {
  return ownerCommandSet.has(commandType)
}

export class CommandEngine {
  constructor(
    private readonly store: CommandStore,
    private readonly ownerVerifier: OwnerCommandVerifier,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async execute(command: ExecuteCommand): Promise<CommandResult> {
    let nextState: string
    try {
      nextState = nextStateFor(command.type, command.prevState)
    } catch (error: unknown) {
      if (error instanceof StateConflictError) return { ok: false, reason: 'STATE_CONFLICT' }
      throw error
    }

    const target: StateTarget = {
      kind: commandTargetKind(command.type),
      id: command.targetId,
      packageId: command.packageId,
    }
    const record: CommandLogRecord = {
      id: command.idempotencyKey,
      packageId: command.packageId,
      commandType: command.type,
      payload: command.payload,
      idempotencyKey: command.idempotencyKey,
      fencingToken: command.fencingToken,
      actorIdentity: command.actorIdentity,
      actorSignature: command.actorSignature ?? null,
      evidenceHash: command.evidenceHash ?? null,
      prevState: command.prevState,
      nextState,
      traceId: command.traceId,
      createdAt: this.now(),
    }

    try {
      return await this.store.transaction(async (transaction) => {
        const currentLeaseToken = await transaction.readLeaseToken(command.packageId)
        if (currentLeaseToken === undefined || command.fencingToken < currentLeaseToken) {
          rejection('STALE_WRITER')
        }

        await transaction.appendCommand(record)

        const currentState = await transaction.readState(target)
        if (currentState !== command.prevState) rejection('STATE_CONFLICT')

        if (isOwnerCommand(command.type) && !(await this.ownerVerifier.verify(command))) {
          rejection('UNAUTHORIZED')
        }

        if (!(await transaction.compareAndSetState(target, command.prevState, nextState))) {
          rejection('STATE_CONFLICT')
        }

        return { ok: true, nextState } as const
      })
    } catch (error: unknown) {
      if (error instanceof CommandRejectedError) return { ok: false, reason: error.reason }
      if (error instanceof CommandStoreError && error.code === 'DUPLICATE') {
        return { ok: false, reason: 'DUPLICATE' }
      }
      if (error instanceof CommandStoreError && error.code === 'UNAUTHORIZED') {
        return { ok: false, reason: 'UNAUTHORIZED' }
      }
      throw error
    }
  }
}
