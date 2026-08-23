import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const humanMigration = readFileSync(new URL('../../db/migrations/0009_human.sql', import.meta.url), 'utf8')

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
  db.exec('CREATE TABLE artifact (id TEXT PRIMARY KEY)')
  db.exec(section(humanMigration, 'up'))
  db.exec(`
    INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-23');
    INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
    INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
    INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-23');
    INSERT INTO artifact VALUES ('after');
    INSERT INTO human_actor VALUES ('human-1', 'Human', 'OWNER', 0, 1);
  `)
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0009_human', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec(section(controlMigration, 'up'))
    db.exec('CREATE TABLE artifact (id TEXT PRIMARY KEY)')
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(humanMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='human_decision'").get().count).toBe(1)
      db.exec(section(humanMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='human_decision'").get().count).toBe(0)
    }
  })

  it('aborts service actors, inactive decisions, short rationale and attention over 300 minutes', () => {
    const db = baseDb()
    expect(() => db.exec("INSERT INTO human_actor VALUES ('service-1', 'Service', 'OPERATOR', 1, 1)"))
      .toThrow(/CHECK constraint/iu)
    db.exec("UPDATE human_actor SET active = 0 WHERE identity = 'human-1'")
    expect(() => db.exec("INSERT INTO human_decision VALUES ('d1','pkg','D1','human-1',NULL,'after','r2/diff','A sufficiently long human rationale.','2026-08-23')"))
      .toThrow(/active human actor/iu)
    db.exec("UPDATE human_actor SET active = 1 WHERE identity = 'human-1'")
    expect(() => db.exec("INSERT INTO human_decision VALUES ('d2','pkg','D1','human-1',NULL,'after','r2/diff','short','2026-08-23')"))
      .toThrow(/CHECK constraint/iu)
    db.exec("INSERT INTO attention_ledger VALUES ('a1','human-1','HP02','pkg',300,'2026-08-17','2026-08-23')")
    expect(() => db.exec("INSERT INTO attention_ledger VALUES ('a2','human-1','HP03','pkg',1,'2026-08-17','2026-08-23')"))
      .toThrow(/attention ceiling exceeded/iu)
  })
})
