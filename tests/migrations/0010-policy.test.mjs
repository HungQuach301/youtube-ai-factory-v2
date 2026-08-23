import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const humanMigration = readFileSync(new URL('../../db/migrations/0009_human.sql', import.meta.url), 'utf8')
const policyMigration = readFileSync(new URL('../../db/migrations/0010_policy.sql', import.meta.url), 'utf8')

function section(migration, name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []
function baseDb() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(section(controlMigration, 'up'))
  db.exec(`
    CREATE TABLE artifact (id TEXT PRIMARY KEY);
    CREATE TABLE master (id TEXT PRIMARY KEY, package_id TEXT NOT NULL);
    CREATE TABLE predicted_performance (package_id TEXT PRIMARY KEY);
    CREATE TABLE evolution_proposal (source TEXT NOT NULL, status TEXT NOT NULL, target_ref TEXT NOT NULL);
  `)
  db.exec(section(humanMigration, 'up'))
  db.exec(section(policyMigration, 'up'))
  db.exec(`
    INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-23');
    INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
    INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
    INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-23');
    INSERT INTO human_actor VALUES ('human-owner', 'Human Owner', 'OWNER', 0, 1);
    INSERT INTO owner_identity VALUES ('human-owner', 'public-key', 'OWNER', 1, '2026-08-23');
    INSERT INTO master VALUES ('master', 'pkg');
  `)
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0010_policy', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec(section(controlMigration, 'up'))
    db.exec('CREATE TABLE artifact(id TEXT PRIMARY KEY); CREATE TABLE master(id TEXT PRIMARY KEY); CREATE TABLE predicted_performance(package_id TEXT); CREATE TABLE evolution_proposal(source TEXT,status TEXT,target_ref TEXT);')
    db.exec(section(humanMigration, 'up'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(policyMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='policy_check'").get().count).toBe(1)
      db.exec(section(policyMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='policy_check'").get().count).toBe(0)
    }
  })

  it('aborts disclosure off without rationale on insert and update', () => {
    const db = baseDb()
    expect(() => db.exec("INSERT INTO disclosure_decision VALUES ('d','pkg',0,NULL,'human-owner','2026-08-23')"))
      .toThrow(/requires written rationale/iu)
    db.exec("INSERT INTO disclosure_decision VALUES ('d','pkg',1,NULL,'human-owner','2026-08-23')")
    expect(() => db.exec("UPDATE disclosure_decision SET synthetic_toggle=0 WHERE id='d'"))
      .toThrow(/requires written rationale/iu)
  })

  it('requires evidence for PASS and all eight checks before publish', () => {
    const db = baseDb()
    expect(() => db.exec("INSERT INTO policy_check VALUES ('x','pkg','PC1','PASS',NULL,'2026-08-23')"))
      .toThrow(/PASS requires evidence/iu)
    db.exec("INSERT INTO disclosure_decision VALUES ('d','pkg',1,NULL,'human-owner','2026-08-23'); INSERT INTO predicted_performance VALUES ('pkg');")
    expect(() => db.exec("INSERT INTO publish_record VALUES ('pub','pkg','master',NULL,'human-owner','2026-08-23')"))
      .toThrow(/checklist incomplete/iu)
    for (let index = 1; index <= 8; index += 1) db.exec(`INSERT INTO policy_check VALUES ('pc${index}','pkg','PC${index}','PASS','r2/pc${index}','2026-08-23')`)
    expect(() => db.exec("INSERT INTO publish_record VALUES ('pub','pkg','master',NULL,'human-owner','2026-08-23')")).not.toThrow()
  })

  it('blocks unfreeze without owner and without promoted incident learning', () => {
    const db = baseDb()
    db.exec("INSERT INTO policy_incident VALUES ('i','c','pkg','I2','ref','PLATFORM_NOTICE','2026-08-23',NULL,'NONE',NULL,NULL); INSERT INTO channel_freeze VALUES ('f','c','i','2026-08-23','operator',NULL,NULL,NULL)")
    expect(() => db.exec("UPDATE channel_freeze SET unfrozen_at='2026-08-24', unfrozen_by='operator' WHERE id='f'"))
      .toThrow(/active owner/iu)
    expect(() => db.exec("UPDATE channel_freeze SET unfrozen_at='2026-08-24', unfrozen_by='human-owner' WHERE id='f'"))
      .toThrow(/promoted learning/iu)
    db.exec("INSERT INTO evolution_proposal VALUES ('INCIDENT','PROMOTED','incident:i')")
    expect(() => db.exec("UPDATE channel_freeze SET unfrozen_at='2026-08-24', unfrozen_by='human-owner' WHERE id='f'")).not.toThrow()
  })
})
