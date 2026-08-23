import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const qualityMigration = readFileSync(new URL('../../db/migrations/0005_quality.sql', import.meta.url), 'utf8')

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
  db.exec(`
    CREATE TABLE master (id TEXT PRIMARY KEY);
    CREATE TABLE capability (id TEXT PRIMARY KEY);
    CREATE TABLE capability_archetype_binding (
      capability_id TEXT NOT NULL,
      qualification_state TEXT NOT NULL
    );
  `)
  db.exec(section(qualityMigration, 'up'))
  db.exec(`
    INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-23');
    INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
    INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
    INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-23');
    INSERT INTO owner_identity VALUES ('owner', 'public-key', 'OWNER', 1, '2026-08-23');
    INSERT INTO gate_definition VALUES ('m0', 'RIGHTS', 'M0', '[]', 1, NULL, 10, 1);
    INSERT INTO gate_definition VALUES ('m1', 'TECHNICAL', 'M1', '[]', 1, NULL, 10, 1);
  `)
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0005_quality', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(section(controlMigration, 'up'))
    db.exec('CREATE TABLE master (id TEXT PRIMARY KEY); CREATE TABLE capability (id TEXT PRIMARY KEY); CREATE TABLE capability_archetype_binding (capability_id TEXT, qualification_state TEXT);')
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(qualityMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='standard'").get().count).toBe(1)
      db.exec(section(qualityMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='standard'").get().count).toBe(0)
    }
  })

  it('aborts INSERT PASS without evidence', () => {
    const db = createDb()
    expect(() => db.exec("INSERT INTO gate_evaluation (id, package_id, gate_id, state) VALUES ('g', 'pkg', 'm0', 'PASS')"))
      .toThrow(/G7: gate PASS requires evidence_r2_key/iu)
  })

  it('aborts UPDATE to PASS without evidence', () => {
    const db = createDb()
    db.exec("INSERT INTO gate_evaluation (id, package_id, gate_id, state) VALUES ('g', 'pkg', 'm0', 'FAIL')")
    expect(() => db.exec("UPDATE gate_evaluation SET state='PASS' WHERE id='g'"))
      .toThrow(/G7: gate PASS requires evidence_r2_key/iu)
  })

  it('aborts INSERT and UPDATE attempts to WAIVE M0', () => {
    const db = createDb()
    expect(() => db.exec("INSERT INTO gate_evaluation (id, package_id, gate_id, state, waiver_owner, waiver_expires_at) VALUES ('g1', 'pkg', 'm0', 'WAIVED', 'owner', '2026-09-01')"))
      .toThrow(/P2: M0 gates cannot be WAIVED/iu)
    db.exec("INSERT INTO gate_evaluation (id, package_id, gate_id, state) VALUES ('g2', 'pkg', 'm0', 'FAIL')")
    expect(() => db.exec("UPDATE gate_evaluation SET state='WAIVED', waiver_owner='owner', waiver_expires_at='2026-09-01' WHERE id='g2'"))
      .toThrow(/P2: M0 gates cannot be WAIVED/iu)
  })

  it('aborts M1 waiver without an active owner and expiry', () => {
    const db = createDb()
    expect(() => db.exec("INSERT INTO gate_evaluation (id, package_id, gate_id, state) VALUES ('g', 'pkg', 'm1', 'WAIVED')"))
      .toThrow(/WAIVED requires active owner and expiry/iu)
  })

  it('aborts a critic verdict unless the capability is QUALIFIED', () => {
    const db = createDb()
    db.exec("INSERT INTO master VALUES ('master'); INSERT INTO capability VALUES ('critic'); INSERT INTO assurance_run VALUES ('run', 'master', 1, '{}', 'PASS', '2026-08-23')")
    expect(() => db.exec("INSERT INTO critic_verdict VALUES ('v', 'run', 'TRUTH_BRAND_SAFETY', 'critic', 1, 0, 0, NULL, 1, 'evidence/critic.json')"))
      .toThrow(/MSR-02: critic capability is not QUALIFIED/iu)
    db.exec("INSERT INTO capability_archetype_binding VALUES ('critic', 'QUALIFIED')")
    expect(() => db.exec("INSERT INTO critic_verdict VALUES ('v', 'run', 'TRUTH_BRAND_SAFETY', 'critic', 1, 0, 0, NULL, 1, 'evidence/critic.json')"))
      .not.toThrow()
  })
})
