import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const capabilityMigration = readFileSync(new URL('../../db/migrations/0002_capability.sql', import.meta.url), 'utf8')

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
  db.exec(section(capabilityMigration, 'up'))
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0002_capability', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec(section(controlMigration, 'up'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(capabilityMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='capability'").get().count).toBe(1)
      db.exec(section(capabilityMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='capability'").get().count).toBe(0)
    }
  })

  it.each(['latest', 'default', 'gpt-latest', 'gpt_default'])('rejects model alias %s', (modelSnapshot) => {
    const db = createDb()
    expect(() => db.prepare(`INSERT INTO capability (
      id, code, kind, version, provider, model_snapshot, settings_hash, created_at
    ) VALUES (?, 'CAP', 'TEXT', '1.0.0', 'provider', ?, ?, '2026-08-23')`)
      .run('cap', modelSnapshot, 'a'.repeat(64))).toThrow(/CHECK constraint/iu)
  })

  it('makes capability identity and settings immutable', () => {
    const db = createDb()
    db.exec(`INSERT INTO capability VALUES (
      'cap', 'CAP', 'TEXT', '1.0.0', 'provider', 'model-2026-08-01', '${'a'.repeat(64)}', 'ACTIVE', '2026-08-23'
    )`)
    expect(() => db.exec(`UPDATE capability SET settings_hash='${'b'.repeat(64)}' WHERE id='cap'`))
      .toThrow(/CAP-01: capability identity is immutable/iu)
  })

  it('requires a matching PASS run before a binding becomes QUALIFIED', () => {
    const db = createDb()
    db.exec(`
      INSERT INTO capability VALUES ('cap', 'CAP', 'TEXT', '1.0.0', 'provider', 'model-2026-08-01', '${'a'.repeat(64)}', 'ACTIVE', '2026-08-23');
      INSERT INTO archetype VALUES ('arch', 'ARCH', 'TEXT', 'CRITICAL', 1.0);
      INSERT INTO capability_archetype_binding VALUES ('cap', 'arch', 'REGISTERED', NULL, NULL);
    `)
    expect(() => db.exec("UPDATE capability_archetype_binding SET qualification_state='QUALIFIED', qualification_run_id='missing', qualified_at='2026-08-23'"))
      .toThrow(/CAP: QUALIFIED requires a passing qualification_run/iu)
    db.exec(`INSERT INTO qualification_run VALUES (
      'run-pass', 'cap', 'arch', NULL, 'qualification', 1, 1, 1, 0,
      'qual/evidence.json', 'PASS', 0, '2026-08-23'
    )`)
    expect(() => db.exec("UPDATE capability_archetype_binding SET qualification_state='QUALIFIED', qualification_run_id='run-pass', qualified_at='2026-08-23'"))
      .not.toThrow()
  })

  it('keeps dispatch block logs append-only', () => {
    const db = createDb()
    db.exec(`
      INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-23');
      INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
      INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
      INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
      INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-23');
      INSERT INTO stage_instance (id, package_id, stage_code, control_state, standard_version, attempt_ordinal)
        VALUES ('stage', 'pkg', '00', 'NOT_STARTED', 1, 1);
      INSERT INTO capability VALUES ('cap', 'CAP', 'TEXT', '1.0.0', 'provider', 'model-2026-08-01', '${'a'.repeat(64)}', 'ACTIVE', '2026-08-23');
      INSERT INTO archetype VALUES ('arch', 'ARCH', 'TEXT', 'CRITICAL', 1.0);
      INSERT INTO dispatch_block_log VALUES (
        'block', 'trace', 'pkg', 'stage', 'cap', 'arch', 2,
        'SETTINGS_HASH_MISMATCH', '${'b'.repeat(64)}', '${'a'.repeat(64)}', 1, '2026-08-23'
      );
    `)
    expect(() => db.exec("UPDATE dispatch_block_log SET reason='BUDGET_DENIED' WHERE id='block'"))
      .toThrow(/CAP-04: dispatch block log is append-only/iu)
    expect(() => db.exec("DELETE FROM dispatch_block_log WHERE id='block'"))
      .toThrow(/CAP-04: dispatch block log is append-only/iu)
  })
})
