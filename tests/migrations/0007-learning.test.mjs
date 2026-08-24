import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../db/migrations/0007_learning.sql', import.meta.url), 'utf8')

function section(name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []
const h = (character) => character.repeat(64)

function createDb() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE channel (id TEXT PRIMARY KEY);
    CREATE TABLE production_package (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL);
    CREATE TABLE media_master (id TEXT PRIMARY KEY, package_id TEXT NOT NULL, file_sha256 TEXT NOT NULL);
    CREATE TABLE owner_identity (identity TEXT PRIMARY KEY, role TEXT NOT NULL, active INTEGER NOT NULL);
    CREATE TABLE command_log (
      id TEXT PRIMARY KEY, package_id TEXT, command_type TEXT NOT NULL, payload_json TEXT NOT NULL,
      actor_identity TEXT NOT NULL, actor_signature TEXT, evidence_hash TEXT
    );
    CREATE TABLE youtube_video_binding (
      id TEXT PRIMARY KEY, package_id TEXT NOT NULL, youtube_video_id TEXT NOT NULL,
      master_sha256 TEXT NOT NULL, verification_evidence_r2_key TEXT NOT NULL
    );
    INSERT INTO channel VALUES ('channel-1');
    INSERT INTO channel VALUES ('channel-2');
    INSERT INTO production_package VALUES ('pkg', 'channel-1');
    INSERT INTO media_master VALUES ('master', 'pkg', '${h('a')}');
    INSERT INTO owner_identity VALUES ('owner', 'OWNER', 1);
    INSERT INTO youtube_video_binding VALUES ('binding', 'pkg', 'video', '${h('a')}', 'publish/readback.json');
  `)
  db.exec(section('up'))
  return db
}

function insertExperiment(db) {
  db.exec(`INSERT INTO experiment VALUES (
    'experiment', 'channel-1', 'hypothesis', 'one_variable', '["voice"]', 3,
    'same directional effect', 'RUNNING', '2026-08-24'
  )`)
}

function insertObservations(db, count = 3, direction = 'POSITIVE') {
  for (let index = 0; index < count; index += 1) {
    db.prepare('INSERT INTO experiment_observation VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      `observation-${direction}-${index}`, 'experiment', `video-${direction}-${index}`,
      h(String((index % 9) + 1)), direction, direction === 'POSITIVE' ? 0.04 : -0.04, '2026-08-24',
    )
  }
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0007_learning', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = createDb()
    db.exec(section('down'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section('up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='learning'").get().count).toBe(1)
      db.exec(section('down'))
    }
  })

  it('accepts only real analytics bound to the exact verified master', () => {
    const db = createDb()
    const metrics = JSON.stringify({
      retentionCurve: [], relativeRetentionPerformance: 0.5, impressions: 1000,
      impressionClickThroughRate: 0.08, averageViewDurationSec: 320,
      averageViewPercentage: 0.53, trafficSources: [],
    }).replaceAll("'", "''")
    expect(() => db.exec(`INSERT INTO actual_performance VALUES (
      'actual', 'pkg', 'video', 'master', '${h('a')}', 'YOUTUBE_ANALYTICS_API', 1,
      '2026-08-24', 14, '${metrics}', 'analytics/video.json', '${h('b')}', '${h('c')}'
    )`)).toThrow(/simulated analytics forbidden/iu)
    expect(() => db.exec(`INSERT INTO actual_performance VALUES (
      'actual', 'pkg', 'video', 'master', '${h('d')}', 'YOUTUBE_ANALYTICS_API', 0,
      '2026-08-24', 14, '${metrics}', 'analytics/video.json', '${h('b')}', '${h('c')}'
    )`)).toThrow(/video.master checksum mismatch/iu)
    expect(() => db.exec(`INSERT INTO actual_performance VALUES (
      'actual', 'pkg', 'video', 'master', '${h('a')}', 'YOUTUBE_ANALYTICS_API', 0,
      '2026-08-24', 14, '${metrics}', 'analytics/video.json', '${h('b')}', '${h('c')}'
    )`)).not.toThrow()
  })

  it('blocks READY below experiment sample size or when direction is inconsistent', () => {
    const db = createDb()
    insertExperiment(db)
    insertObservations(db, 2)
    db.exec(`INSERT INTO learning VALUES (
      'learning', 'experiment', 'CHANNEL', 'channel-1', NULL, 'STRUCTURE', 'finding', '{}', 2,
      'INSUFFICIENT_EVIDENCE', '${h('d')}', '2026-08-24'
    )`)
    expect(() => db.exec("UPDATE learning SET status='READY' WHERE id='learning'"))
      .toThrow(/minimum sample size not met/iu)
    insertObservations(db, 1, 'NEGATIVE')
    expect(() => db.exec("UPDATE learning SET status='READY' WHERE id='learning'"))
      .toThrow(/direction is not consistent/iu)
  })

  it('blocks portfolio promotion from one channel and every unsigned/non-command promotion path', () => {
    const db = createDb()
    insertExperiment(db)
    insertObservations(db)
    db.exec(`INSERT INTO learning VALUES (
      'learning', 'experiment', 'PORTFOLIO', NULL, '["channel-1"]', 'STRUCTURE', 'finding', '{}', 3,
      'INSUFFICIENT_EVIDENCE', '${h('d')}', '2026-08-24'
    )`)
    expect(() => db.exec("UPDATE learning SET status='READY' WHERE id='learning'"))
      .toThrow(/requires at least two independent channels/iu)
    db.exec("UPDATE learning SET replicated_channel_ids_json='[\"channel-1\",\"channel-2\"]' WHERE id='learning'")
    db.exec("UPDATE learning SET status='READY' WHERE id='learning'")
    expect(() => db.exec(`INSERT INTO promotion VALUES (
      'promotion', 'learning', 'missing-command', 'STANDARD', 'standard', 3, 4,
      'owner', '${h('e')}', '${h('f')}', '2026-08-24'
    )`)).toThrow(/signed PROMOTE_LEARNING/iu)
    db.exec(`INSERT INTO command_log VALUES (
      'command', NULL, 'PROMOTE_LEARNING', '{"learningId":"learning"}', 'owner', 'sig', '${h('e')}'
    )`)
    expect(() => db.exec(`INSERT INTO promotion VALUES (
      'promotion', 'learning', 'command', 'STANDARD', 'standard', 3, 4,
      'owner', '${h('e')}', '${h('f')}', '2026-08-24'
    )`)).not.toThrow()
  })
})
