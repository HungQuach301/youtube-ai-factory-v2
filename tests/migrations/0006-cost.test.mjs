import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const costMigration = readFileSync(new URL('../../db/migrations/0006_cost.sql', import.meta.url), 'utf8')

function section(migration, name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []

function createDb() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(section(controlMigration, 'up'))
  db.exec('CREATE TABLE capability (id TEXT PRIMARY KEY);')
  db.exec(section(costMigration, 'up'))
  db.exec(`
    INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-23');
    INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
    INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
    INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-23');
    INSERT INTO stage_instance (
      id, package_id, stage_code, control_state, standard_version, attempt_ordinal
    ) VALUES ('stage', 'pkg', '00', 'NOT_STARTED', 1, 1);
    INSERT INTO capability VALUES ('capability');
    INSERT INTO spend_ceiling VALUES ('production', 'PORTFOLIO', 'portfolio', 10, NULL, NULL);
    INSERT INTO spend_ceiling VALUES ('production', 'CHANNEL', 'c', 10, NULL, NULL);
    INSERT INTO spend_ceiling VALUES ('production', 'PACKAGE', 'pkg', 10, NULL, NULL);
    INSERT INTO spend_ceiling VALUES ('production', 'STAGE', 'stage', 10, NULL, NULL);
    INSERT INTO spend_reservation VALUES (
      'reservation', 'pkg', 'stage', 'capability', 'production', 'portfolio', 'c',
      5, NULL, 'HELD', '2026-08-23T00:05:00Z', '2026-08-23T00:00:00Z'
    );
  `)
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0006_cost', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(section(controlMigration, 'up'))
    db.exec('CREATE TABLE capability (id TEXT PRIMARY KEY);')
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(costMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='spend_reservation'").get().count).toBe(1)
      db.exec(section(costMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='spend_reservation'").get().count).toBe(0)
    }
  })

  it.each(['SCHEMA_VIOLATION', 'RIGHTS_DENIED', 'BUDGET_DENIED', 'CONTENT_FILTERED'])(
    'G8 aborts retry after terminal %s',
    (errorClass) => {
      const db = createDb()
      db.prepare(`INSERT INTO provider_request (
        id, reservation_id, idempotency_key, request_r2_key, error_class, attempt_ordinal, state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('request-1', 'reservation', 'a'.repeat(64), 'evidence/request-1.json', errorClass, 1, 'FAILED', '2026-08-23')
      expect(() => db.prepare(`INSERT INTO provider_request (
        id, reservation_id, idempotency_key, request_r2_key, attempt_ordinal, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`)
        .run('request-2', 'reservation', 'b'.repeat(64), 'evidence/request-2.json', 2, '2026-08-23'))
        .toThrow(/G8: terminal error class must not be retried/iu)
    },
  )

  it.each(['TRANSIENT', 'RATE_LIMIT'])('G8 permits retry after %s', (errorClass) => {
    const db = createDb()
    db.prepare(`INSERT INTO provider_request (
      id, reservation_id, idempotency_key, request_r2_key, error_class, attempt_ordinal, state, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('request-1', 'reservation', 'a'.repeat(64), 'evidence/request-1.json', errorClass, 1, 'FAILED', '2026-08-23')
    expect(() => db.prepare(`INSERT INTO provider_request (
      id, reservation_id, idempotency_key, request_r2_key, attempt_ordinal, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('request-2', 'reservation', 'b'.repeat(64), 'evidence/request-2.json', 2, '2026-08-23'))
      .not.toThrow()
  })

  it('requires a HELD reservation before recording a provider request', () => {
    const db = createDb()
    db.exec("UPDATE spend_reservation SET state='EXPIRED' WHERE id='reservation'")
    expect(() => db.exec(`INSERT INTO provider_request (
      id, reservation_id, idempotency_key, request_r2_key, created_at
    ) VALUES ('request', 'reservation', '${'c'.repeat(64)}', 'evidence/request.json', '2026-08-23')`))
      .toThrow(/PRV-02: provider request requires HELD reservation/iu)
  })

  it('atomically admits 10 of 50 reservation inserts and records zero denied spend', () => {
    const db = createDb()
    db.exec("DELETE FROM spend_reservation WHERE id='reservation'")
    const insert = db.prepare(`INSERT INTO spend_reservation VALUES (
      ?, 'pkg', 'stage', 'capability', 'production', 'portfolio', 'c',
      1, NULL, 'HELD', '2026-08-23T00:05:00Z', '2026-08-23T00:00:00Z'
    )`)
    let admitted = 0
    let denied = 0
    for (let index = 0; index < 50; index += 1) {
      try {
        insert.run(`reservation-${index}`)
        admitted += 1
      } catch (error) {
        if (!/PRV-02: spend ceiling exceeded/iu.test(String(error))) throw error
        denied += 1
      }
    }
    expect(admitted).toBe(10)
    expect(denied).toBe(40)
    expect(db.prepare('SELECT COUNT(*) AS count FROM cost_ledger').get().count).toBe(0)
    expect(db.prepare('SELECT SUM(estimated_cost) AS held FROM spend_reservation').get().held).toBe(10)
  })

  it('fails closed when a mandatory hierarchical ceiling is missing', () => {
    const db = createDb()
    db.exec("DELETE FROM spend_reservation WHERE id='reservation'; DELETE FROM spend_ceiling WHERE scope='CHANNEL'")
    expect(() => db.exec(`INSERT INTO spend_reservation VALUES (
      'reservation-2', 'pkg', 'stage', 'capability', 'production', 'portfolio', 'c',
      1, NULL, 'HELD', '2026-08-23T00:05:00Z', '2026-08-23T00:00:00Z'
    )`)).toThrow(/PRV-02: required spend ceiling is missing/iu)
  })

  it('settles only from HELD and rejects negative monetary values', () => {
    const db = createDb()
    db.exec("UPDATE spend_reservation SET state='EXPIRED' WHERE id='reservation'")
    expect(() => db.exec("UPDATE spend_reservation SET state='SETTLED' WHERE id='reservation'"))
      .toThrow(/PRV-02: can only SETTLE a HELD reservation/iu)
    expect(() => db.exec("INSERT INTO cost_ledger VALUES ('cost', 'pkg', 'stage', 'capability', 'production', -1, 'PRODUCTION', '2026-08-23')"))
      .toThrow(/CHECK constraint/iu)
  })

  it('releases unused hold after a valid settlement', () => {
    const db = createDb()
    expect(() => db.exec("UPDATE spend_reservation SET actual_cost=4, state='SETTLED' WHERE id='reservation'"))
      .not.toThrow()
    expect(() => db.exec(`INSERT INTO spend_reservation VALUES (
      'reservation-2', 'pkg', 'stage', 'capability', 'production', 'portfolio', 'c',
      6, NULL, 'HELD', '2026-08-23T00:05:00Z', '2026-08-23T00:00:00Z'
    )`)).not.toThrow()
    expect(() => db.exec(`INSERT INTO spend_reservation VALUES (
      'reservation-3', 'pkg', 'stage', 'capability', 'production', 'portfolio', 'c',
      1, NULL, 'HELD', '2026-08-23T00:05:00Z', '2026-08-23T00:00:00Z'
    )`)).toThrow(/PRV-02: spend ceiling exceeded/iu)
  })
})
