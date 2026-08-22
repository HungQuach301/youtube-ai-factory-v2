import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../db/migrations/0001_control_core.sql', import.meta.url), 'utf8')

function section(name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

describe('migration 0001_control_core', () => {
  it('runs up and down twice without residue', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (let run = 0; run < 2; run += 1) {
      db.exec(section('up'))
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      expect(tables.map(({ name }) => name)).toContain('command_log')
      expect(() => db.exec(`
        INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-22');
        INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
        INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
        INSERT INTO channel_identity_contract VALUES ('i', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
        INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'i', NULL, 0, NULL, 1, 1.0, 0, 1, 'OPEN', '2026-08-22');
      `)).toThrow(/CHECK constraint/iu)
      db.exec("INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'i', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-22')")
      db.prepare(`INSERT INTO command_log (
        id, package_id, command_type, payload_json, idempotency_key,
        fencing_token, actor_identity, trace_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('cmd', 'pkg', 'START_STAGE', '{}', 'b'.repeat(64), 0, 'operator', 'trace', '2026-08-22')
      expect(() => db.exec("UPDATE command_log SET next_state = 'RUNNING' WHERE id = 'cmd'"))
        .toThrow(/G4: command_log is append-only/iu)
      expect(() => db.exec("DELETE FROM command_log WHERE id = 'cmd'"))
        .toThrow(/G4: command_log is append-only/iu)
      expect(() => db.prepare(`INSERT INTO command_log (
        id, package_id, command_type, payload_json, idempotency_key,
        fencing_token, actor_identity, trace_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('owner-cmd', 'pkg', 'AUTHORIZE_RELEASE', '{}', 'c'.repeat(64), 0, 'owner', 'trace', '2026-08-22'))
        .toThrow(/P10: owner command requires signature/iu)
      db.exec(section('down'))
      const remaining = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()
      expect(remaining.count).toBe(0)
    }
    db.close()
  })
})
