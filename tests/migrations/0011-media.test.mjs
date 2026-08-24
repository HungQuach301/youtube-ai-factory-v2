import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const controlMigration = readFileSync(
  new URL('../../db/migrations/0001_control_core.sql', import.meta.url),
  'utf8',
)
const compilerMigration = readFileSync(
  new URL('../../db/migrations/0004_shot_cue_program.sql', import.meta.url),
  'utf8',
)
const mediaMigration = readFileSync(
  new URL('../../db/migrations/0011_media.sql', import.meta.url),
  'utf8',
)

function section(migration, name) {
  const start = '-- migrate:' + name
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []
const createDb = () => {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(section(controlMigration, 'up'))
  db.exec(section(compilerMigration, 'up'))
  db.exec(section(mediaMigration, 'up'))
  db.exec([
    "INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-24');",
    "INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);",
    "INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');",
    "INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '" + 'a'.repeat(64) + "', NULL, NULL);",
    "INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 30, 0, 0, 'OPEN', '2026-08-24');",
  ].join('\n'))
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0011_media', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec(section(controlMigration, 'up'))
    db.exec(section(compilerMigration, 'up'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(mediaMigration, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='media_master'").get().count).toBe(1)
      db.exec(section(mediaMigration, 'down'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='media_master'").get().count).toBe(0)
    }
  })

  it('rejects asset bytes without commercial rights evidence', () => {
    const db = createDb()
    db.exec("INSERT INTO media_license_record VALUES ('license', 'stock', 'EDITORIAL', 'https://license', 0, 0, 'US', '1y', '" + 'b'.repeat(64) + "', '2026-08-24')")
    expect(() => db.exec("INSERT INTO media_asset VALUES ('asset', 'pkg', NULL, 'provider-id', 'prod/asset', '" + 'c'.repeat(64) + "', 30, 1920, 1080, 'none', 'license', 'snapshot', NULL, '2026-08-24')"))
      .toThrow(/monetization rights/iu)
  })

  it('rejects distribution master without its same-package archival parent', () => {
    const db = createDb()
    expect(() => db.exec("INSERT INTO media_master VALUES ('dist', 'pkg', 'DISTRIBUTION', NULL, 'master/dist', 'drive-dist', '" + 'd'.repeat(64) + "', 'framemd5', 'libvpx-vp9', 'libopus', 10000, 30, '{}', '2026-08-24')"))
      .toThrow(/requires sealed ARCHIVAL parent/iu)

    db.exec("INSERT INTO media_master VALUES ('archive', 'pkg', 'ARCHIVAL', NULL, 'master/archive', 'drive-archive', '" + 'e'.repeat(64) + "', 'framemd5', 'ffv1', 'pcm_s24le', 10000, 30, '{}', '2026-08-24')")
    expect(() => db.exec("INSERT INTO media_master VALUES ('dist', 'pkg', 'DISTRIBUTION', 'archive', 'master/dist', 'drive-dist', '" + 'd'.repeat(64) + "', 'framemd5', 'libvpx-vp9', 'libopus', 10000, 30, '{}', '2026-08-24')"))
      .not.toThrow()
    expect(() => db.exec("UPDATE media_master SET duration_ms=9999 WHERE id='archive'"))
      .toThrow(/immutable/iu)
  })
})
