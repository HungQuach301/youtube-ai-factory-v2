import { describe, expect, it } from 'vitest'

import type {
  CommandLogRecord,
  CommandStoreError,
  CommandStore,
  CommandTransaction,
  ExecuteCommand,
  OwnerCommandVerifier,
  StateTarget,
} from '../src/index.js'
import { CommandEngine } from '../src/index.js'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)

function command(overrides: Partial<ExecuteCommand> = {}): ExecuteCommand {
  return {
    type: 'START_STAGE',
    packageId: 'pkg-1',
    targetId: 'stage-1',
    idempotencyKey: HEX_A,
    fencingToken: 7,
    prevState: 'NOT_STARTED',
    traceId: 'trace-1',
    actorIdentity: 'orchestrator',
    payload: {},
    ...overrides,
  } as ExecuteCommand
}

class MemoryTransaction implements CommandTransaction {
  constructor(
    private readonly store: MemoryStore,
    private readonly snapshot: Map<string, string>,
    private readonly pending: CommandLogRecord[],
  ) {}

  readLeaseToken(packageId: string): number | undefined {
    return this.store.leases.get(packageId)
  }

  appendCommand(record: CommandLogRecord): void {
    if (this.store.log.some((item) => item.idempotencyKey === record.idempotencyKey)
      || this.pending.some((item) => item.idempotencyKey === record.idempotencyKey)) {
      throw new CommandStoreError('DUPLICATE')
    }
    this.pending.push(record)
  }

  readState(target: StateTarget): string | undefined {
    return this.snapshot.get(`${target.packageId}:${target.kind}:${target.id}`)
  }

  compareAndSetState(target: StateTarget, expected: string, next: string): boolean {
    const key = `${target.packageId}:${target.kind}:${target.id}`
    if (this.snapshot.get(key) !== expected) return false
    this.snapshot.set(key, next)
    return true
  }
}

class MemoryStore implements CommandStore {
  readonly leases = new Map([['pkg-1', 7]])
  readonly states = new Map([['pkg-1:STAGE_INSTANCE:stage-1', 'NOT_STARTED']])
  readonly log: CommandLogRecord[] = []
  private queue = Promise.resolve()

  transaction<T>(operation: (tx: CommandTransaction) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const snapshot = new Map(this.states)
      const pending: CommandLogRecord[] = []
      const tx = new MemoryTransaction(this, snapshot, pending)
      const result = await operation(tx)
      this.states.clear()
      for (const [key, value] of snapshot) this.states.set(key, value)
      this.log.push(...pending)
      return result
    }
    const result = this.queue.then(run, run)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

const ownerVerifier: OwnerCommandVerifier = {
  verify: (request) => request.actorIdentity === 'owner-1'
    && request.actorSignature === 'valid-signature'
    && request.evidenceHash === HEX_B,
}

describe('CommandEngine', () => {
  it('100 concurrent duplicate commands produce exactly one effect', async () => {
    const store = new MemoryStore()
    const engine = new CommandEngine(store, ownerVerifier, () => '2026-08-22T00:00:00.000Z')

    const results = await Promise.all(Array.from({ length: 100 }, () => engine.execute(command())))

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok && result.reason === 'DUPLICATE')).toHaveLength(99)
    expect(store.states.get('pkg-1:STAGE_INSTANCE:stage-1')).toBe('RUNNING')
    expect(store.log).toHaveLength(1)
  })

  it('rejects stale writers with zero side effect', async () => {
    const store = new MemoryStore()
    const engine = new CommandEngine(store, ownerVerifier)

    const result = await engine.execute(command({ fencingToken: 6 }))

    expect(result).toEqual({ ok: false, reason: 'STALE_WRITER' })
    expect(store.states.get('pkg-1:STAGE_INSTANCE:stage-1')).toBe('NOT_STARTED')
    expect(store.log).toHaveLength(0)
  })

  it('rolls back the reserved log when prevState conflicts', async () => {
    const store = new MemoryStore()
    const engine = new CommandEngine(store, ownerVerifier)

    const result = await engine.execute(command({ prevState: 'REOPENED' }))

    expect(result).toEqual({ ok: false, reason: 'STATE_CONFLICT' })
    expect(store.states.get('pkg-1:STAGE_INSTANCE:stage-1')).toBe('NOT_STARTED')
    expect(store.log).toHaveLength(0)
  })

  it('rejects a P10 owner command without a valid bound signature', async () => {
    const store = new MemoryStore()
    store.states.set('pkg-1:PACKAGE:pkg-1', 'RUNNING')
    const engine = new CommandEngine(store, ownerVerifier)

    const result = await engine.execute(command({
      type: 'AUTHORIZE_RELEASE',
      targetId: 'pkg-1',
      prevState: 'RUNNING',
      actorIdentity: 'owner-1',
    }))

    expect(result).toEqual({ ok: false, reason: 'UNAUTHORIZED' })
    expect(store.states.get('pkg-1:PACKAGE:pkg-1')).toBe('RUNNING')
    expect(store.log).toHaveLength(0)
  })

  it('accepts a valid P10 owner command and records immutable evidence', async () => {
    const store = new MemoryStore()
    store.states.set('pkg-1:PACKAGE:pkg-1', 'RUNNING')
    const engine = new CommandEngine(store, ownerVerifier, () => '2026-08-22T00:00:00.000Z')

    const result = await engine.execute(command({
      type: 'AUTHORIZE_RELEASE',
      targetId: 'pkg-1',
      prevState: 'RUNNING',
      actorIdentity: 'owner-1',
      actorSignature: 'valid-signature',
      evidenceHash: HEX_B,
    }))

    expect(result).toEqual({ ok: true, nextState: 'RELEASED' })
    expect(store.log[0]).toMatchObject({
      actorIdentity: 'owner-1',
      actorSignature: 'valid-signature',
      evidenceHash: HEX_B,
      prevState: 'RUNNING',
      nextState: 'RELEASED',
    })
  })

  it('fails closed when a command crosses package boundaries', async () => {
    const store = new MemoryStore()
    store.states.set('pkg-2:STAGE_INSTANCE:stage-2', 'NOT_STARTED')
    const engine = new CommandEngine(store, ownerVerifier)

    const result = await engine.execute(command({ targetId: 'stage-2' }))

    expect(result).toEqual({ ok: false, reason: 'STATE_CONFLICT' })
    expect(store.states.get('pkg-2:STAGE_INSTANCE:stage-2')).toBe('NOT_STARTED')
    expect(store.log).toHaveLength(0)
  })
})
