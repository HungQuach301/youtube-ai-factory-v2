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
  db.exec([
    "INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-24');",
    "INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);",
    "INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');",
    "INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '" + 'a'.repeat(64) + "', NULL, NULL);",
    "INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 30, 0, 0, 'OPEN', '2026-08-24');",
  ].join('\n'))
  return db
}

const insertAssertions = (db, shotId) => {
  for (const state of ['BEFORE', 'DURING', 'AFTER']) {
    db.prepare('INSERT INTO shot_assertion VALUES (?, ?, ?, ?)').run(
      shotId + '-' + state,
      shotId,
      state,
      '{}',
    )
  }
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0004_shot_cue_program', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    databases.push(db)
    db.exec(section(controlMigration, 'up'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(compilerMigration, 'up'))
      expect(db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='shot_cue_program'",
      ).get().count).toBe(1)
      db.exec(section(compilerMigration, 'down'))
      expect(db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='shot_cue_program'",
      ).get().count).toBe(0)
    }
  })

  it('seals only a complete zero-gap timeline with three assertions per shot', () => {
    const db = createDb()
    db.exec([
      "INSERT INTO shot_cue_program VALUES ('program', 'pkg', 10000, 2, '" + 'b'.repeat(64) + "', NULL);",
      "INSERT INTO shot VALUES ('s0', 'program', 0, 0, 5000, 'MAKE', 'data_visualization', 'LAYERED_SEMANTIC', '[\"c0\"]', '[]', NULL);",
      "INSERT INTO shot VALUES ('s1', 'program', 1, 5000, 10000, 'SOURCE', 'documentary_live_action', 'SOURCE_SEMANTIC', '[\"c1\"]', '[]', '{}');",
    ].join('\n'))
    insertAssertions(db, 's0')
    insertAssertions(db, 's1')
    expect(() => db.exec(
      "UPDATE shot_cue_program SET sealed_at='2026-08-24' WHERE id='program'",
    )).not.toThrow()
    expect(() => db.exec("UPDATE shot SET t_end_ms=4999 WHERE id='s0'")).toThrow(/immutable/iu)
  })

  it('rejects a gap and an incomplete assertion set at seal time', () => {
    const db = createDb()
    db.exec([
      "INSERT INTO shot_cue_program VALUES ('program', 'pkg', 10000, 2, '" + 'b'.repeat(64) + "', NULL);",
      "INSERT INTO shot VALUES ('s0', 'program', 0, 0, 5000, 'MAKE', 'data_visualization', 'LAYERED_SEMANTIC', '[\"c0\"]', '[]', NULL);",
      "INSERT INTO shot VALUES ('s1', 'program', 1, 5001, 10000, 'SOURCE', 'documentary_live_action', 'SOURCE_SEMANTIC', '[\"c1\"]', '[]', '{}');",
    ].join('\n'))
    insertAssertions(db, 's0')
    insertAssertions(db, 's1')
    expect(() => db.exec(
      "UPDATE shot_cue_program SET sealed_at='2026-08-24' WHERE id='program'",
    )).toThrow(/gap or overlap/iu)

    db.exec("UPDATE shot SET t_start_ms=5000 WHERE id='s1'")
    db.exec("DELETE FROM shot_assertion WHERE id='s1-AFTER'")
    expect(() => db.exec(
      "UPDATE shot_cue_program SET sealed_at='2026-08-24' WHERE id='program'",
    )).toThrow(/three assertions/iu)
  })

  it('rejects a non-contiguous shot sequence at seal time', () => {
    const db = createDb()
    db.exec([
      "INSERT INTO shot_cue_program VALUES ('program', 'pkg', 10000, 2, '" + 'b'.repeat(64) + "', NULL);",
      "INSERT INTO shot VALUES ('s0', 'program', 0, 0, 5000, 'MAKE', 'data_visualization', 'LAYERED_SEMANTIC', '[\"c0\"]', '[]', NULL);",
      "INSERT INTO shot VALUES ('s2', 'program', 2, 5000, 10000, 'SOURCE', 'documentary_live_action', 'SOURCE_SEMANTIC', '[\"c2\"]', '[]', '{}');",
    ].join('\n'))
    insertAssertions(db, 's0')
    insertAssertions(db, 's2')
    expect(() => db.exec(
      "UPDATE shot_cue_program SET sealed_at='2026-08-24' WHERE id='program'",
    )).toThrow(/sequence must be contiguous/iu)
  })

  it('makes the sealed program, shots and assertions immutable', () => {
    const db = createDb()
    db.exec([
      "INSERT INTO shot_cue_program VALUES ('program', 'pkg', 10000, 2, '" + 'b'.repeat(64) + "', NULL);",
      "INSERT INTO shot VALUES ('s0', 'program', 0, 0, 5000, 'MAKE', 'data_visualization', 'LAYERED_SEMANTIC', '[\"c0\"]', '[]', NULL);",
      "INSERT INTO shot VALUES ('s1', 'program', 1, 5000, 10000, 'SOURCE', 'documentary_live_action', 'SOURCE_SEMANTIC', '[\"c1\"]', '[]', '{}');",
    ].join('\n'))
    insertAssertions(db, 's0')
    insertAssertions(db, 's1')
    db.exec("UPDATE shot_cue_program SET sealed_at='2026-08-24' WHERE id='program'")

    expect(() => db.exec(
      "UPDATE shot_cue_program SET canonical_duration_ms=10001 WHERE id='program'",
    )).toThrow(/sealed program is immutable/iu)
    expect(() => db.exec(
      "INSERT INTO shot VALUES ('s2', 'program', 2, 10000, 11000, 'MAKE', 'data_visualization', 'LAYERED_SEMANTIC', '[\"c2\"]', '[]', NULL)",
    )).toThrow(/sealed shots are immutable/iu)
    expect(() => db.exec("UPDATE shot SET t_end_ms=4999 WHERE id='s0'"))
      .toThrow(/sealed shots are immutable/iu)
    expect(() => db.exec("DELETE FROM shot WHERE id='s0'"))
      .toThrow(/sealed shots are immutable/iu)
    expect(() => db.exec(
      "INSERT INTO shot_assertion VALUES ('extra', 's0', 'BEFORE', '{}')",
    )).toThrow(/sealed assertions are immutable/iu)
    expect(() => db.exec("UPDATE shot_assertion SET assertion_json='[]' WHERE id='s0-BEFORE'"))
      .toThrow(/sealed assertions are immutable/iu)
    expect(() => db.exec("DELETE FROM shot_assertion WHERE id='s0-BEFORE'"))
      .toThrow(/sealed assertions are immutable/iu)
  })
})
