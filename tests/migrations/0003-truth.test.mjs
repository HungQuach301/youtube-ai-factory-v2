import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')
const truthMigration = readFileSync(new URL('../../db/migrations/0003_truth.sql', import.meta.url), 'utf8')

function section(migration, name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []
const createDb = () => {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(section(controlMigration, 'up'))
  db.exec(section(truthMigration, 'up'))
  db.exec(`
    INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-23');
    INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
    INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
    INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-23');
  `)
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0003_truth', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec(section(controlMigration, 'up'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(truthMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='claim'").get().count).toBe(1)
      db.exec(section(truthMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='claim'").get().count).toBe(0)
    }
  })

  it('aborts a critical claim linked to a tier-3 primary source', () => {
    const db = createDb()
    db.exec(`
      INSERT INTO source VALUES ('s', 'pkg', 'https://example.com', 3, '2026-08-23', 'r2/source', '${'b'.repeat(64)}');
      INSERT INTO claim VALUES ('cl', 'pkg', 'FACT', 'Fact', 'CRITICAL', NULL, NULL, NULL, '2026-08-23');
    `)
    expect(() => db.exec("INSERT INTO claim_source VALUES ('cl', 's', 'PRIMARY')"))
      .toThrow(/CRITICAL claim requires T1\/T2 primary source/iu)
  })
})
