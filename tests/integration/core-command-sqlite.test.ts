import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import type {
  CommandLogRecord,
  CommandStore,
  CommandTransaction,
  StateTarget,
} from '../../packages/core-command/src/index.js'
import {
  CommandEngine,
  CommandStoreError,
} from '../../packages/core-command/src/index.js'

const migration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const HEX_A = 'a'.repeat(64)

function upMigration(): string {
  const start = '-- migrate:up'
  const end = '-- migrate:down'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(end)).trim()
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: command_log.idempotency_key/iu.test(error.message)
}

class SqliteTransaction implements CommandTransaction {
  constructor(private readonly database: DatabaseSync) {}

  readLeaseToken(packageId: string): number | undefined {
    const row = this.database.prepare('SELECT lease_token FROM production_package WHERE id = ?').get(packageId)
    return row === undefined ? undefined : Number(row.lease_token)
  }

  appendCommand(record: CommandLogRecord): void {
    try {
      this.database.prepare(`INSERT INTO command_log (
        id, package_id, command_type, payload_json, idempotency_key,
        fencing_token, actor_identity, actor_signature, evidence_hash,
        prev_state, next_state, trace_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          record.id,
          record.packageId,
          record.commandType,
          JSON.stringify(record.payload),
          record.idempotencyKey,
          record.fencingToken,
          record.actorIdentity,
          record.actorSignature,
          record.evidenceHash,
          record.prevState,
          record.nextState,
          record.traceId,
          record.createdAt,
        )
    } catch (error: unknown) {
      if (isUniqueConstraint(error)) throw new CommandStoreError('DUPLICATE')
      throw error
    }
  }

  readState(target: StateTarget): string | undefined {
    if (target.kind !== 'STAGE_INSTANCE') return undefined
    const row = this.database.prepare(
      'SELECT control_state FROM stage_instance WHERE id = ? AND package_id = ?',
    ).get(target.id, target.packageId)
    return row === undefined ? undefined : String(row.control_state)
  }

  compareAndSetState(target: StateTarget, expected: string, next: string): boolean {
    if (target.kind !== 'STAGE_INSTANCE') return false
    const result = this.database.prepare(
      'UPDATE stage_instance SET control_state = ? WHERE id = ? AND package_id = ? AND control_state = ?',
    ).run(next, target.id, target.packageId, expected)
    return result.changes === 1
  }
}

class SqliteCommandStore implements CommandStore {
  private queue = Promise.resolve()

  constructor(private readonly database: DatabaseSync) {}

  transaction<T>(operation: (transaction: CommandTransaction) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      this.database.exec('BEGIN IMMEDIATE')
      try {
        const result = await operation(new SqliteTransaction(this.database))
        this.database.exec('COMMIT')
        return result
      } catch (error: unknown) {
        this.database.exec('ROLLBACK')
        throw error
      }
    }
    const result = this.queue.then(run, run)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

function seed(database: DatabaseSync): void {
  database.exec(upMigration())
  database.exec(`
    INSERT INTO channel VALUES ('channel-1', 'Channel', 'ACTIVE', '2026-08-22');
    INSERT INTO pillar VALUES ('pillar-1', 'channel-1', 'Pillar', 1);
    INSERT INTO episode VALUES ('episode-1', 'pillar-1', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity-1', 'channel-1', 1, '{}', '${HEX_A}', NULL, NULL);
    INSERT INTO production_package VALUES (
      'pkg-1', 'episode-1', 'channel-1', 'production', 'brief', 'identity-1',
      'orchestrator', 7, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-22'
    );
    INSERT INTO stage_instance VALUES (
      'stage-1', 'pkg-1', '00', 'NOT_STARTED', 1, 1, NULL, NULL
    );
  `)
}

describe('CORE-02 SQLite transaction', () => {
  let database: DatabaseSync | undefined

  afterEach(() => database?.close())

  it('100 concurrent commands with one idempotency key commit exactly one effect', async () => {
    database = new DatabaseSync(':memory:')
    database.exec('PRAGMA foreign_keys = ON')
    seed(database)
    const engine = new CommandEngine(
      new SqliteCommandStore(database),
      { verify: () => false },
      () => '2026-08-22T00:00:00.000Z',
    )
    const request = {
      type: 'START_STAGE',
      packageId: 'pkg-1',
      targetId: 'stage-1',
      idempotencyKey: HEX_A,
      fencingToken: 7,
      prevState: 'NOT_STARTED',
      traceId: 'trace-1',
      actorIdentity: 'orchestrator',
      payload: {},
    } as const

    const results = await Promise.all(Array.from({ length: 100 }, () => engine.execute(request)))
    const state = database.prepare('SELECT control_state FROM stage_instance WHERE id = ?').get('stage-1')
    const logCount = database.prepare('SELECT COUNT(*) AS count FROM command_log').get()

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok && result.reason === 'DUPLICATE')).toHaveLength(99)
    expect(state?.control_state).toBe('RUNNING')
    expect(logCount?.count).toBe(1)
  })
})
