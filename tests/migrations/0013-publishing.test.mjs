import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../db/migrations/0013_publishing.sql', import.meta.url), 'utf8')

function section(name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []

function createDb() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE production_package (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL);
    CREATE TABLE media_master (id TEXT PRIMARY KEY, package_id TEXT NOT NULL, tier TEXT NOT NULL, file_sha256 TEXT NOT NULL);
    CREATE TABLE assurance_run (id TEXT PRIMARY KEY);
    CREATE TABLE command_log (
      id TEXT PRIMARY KEY, package_id TEXT, command_type TEXT NOT NULL,
      actor_signature TEXT, evidence_hash TEXT
    );
    CREATE TABLE predicted_performance (
      id TEXT PRIMARY KEY, package_id TEXT NOT NULL, sealed_at TEXT
    );
    CREATE TABLE policy_check (
      package_id TEXT NOT NULL, check_code TEXT NOT NULL, state TEXT NOT NULL
    );
    CREATE TABLE disclosure_decision (
      package_id TEXT PRIMARY KEY, synthetic_toggle INTEGER NOT NULL
    );
    CREATE TABLE channel_freeze (channel_id TEXT NOT NULL, unfrozen_at TEXT);
  `)
  db.exec(section('up'))
  db.exec(`
    INSERT INTO production_package VALUES ('pkg', 'channel');
    INSERT INTO media_master VALUES ('master', 'pkg', 'DISTRIBUTION', '${'a'.repeat(64)}');
    INSERT INTO assurance_run VALUES ('assurance');
    INSERT INTO command_log VALUES ('release-command', 'pkg', 'AUTHORIZE_RELEASE', 'sig', '${'b'.repeat(64)}');
    INSERT INTO command_log VALUES ('publish-command', 'pkg', 'AUTHORIZE_PUBLISH', 'sig', '${'c'.repeat(64)}');
  `)
  return db
}

function insertRelease(db) {
  db.exec(`
    INSERT INTO release_assessment VALUES (
      'release', 'pkg', 'master', '${'a'.repeat(64)}', 'assurance', '${'a'.repeat(64)}',
      'evidence/reconciliation.json', 'release-command', '${'d'.repeat(64)}', '2026-08-24'
    );
  `)
}

function addPublishPrerequisites(db) {
  db.exec("INSERT INTO predicted_performance VALUES ('prediction', 'pkg', '2026-08-24')")
  for (let index = 1; index <= 8; index += 1) {
    db.prepare('INSERT INTO policy_check VALUES (?, ?, ?)').run('pkg', `PC${index}`, 'PASS')
  }
  db.exec("INSERT INTO disclosure_decision VALUES ('pkg', 1)")
}

function manifestSql(autoPublish = 0) {
  const metadata = JSON.stringify({
    title: 'Title', description: 'Description', tags: ['systems'], categoryId: '28',
    privacyStatus: 'private', madeForKids: false, syntheticDisclosure: true,
    defaultLanguage: 'en', chapters: [{ startSeconds: 0, title: 'Start' }],
  }).replaceAll("'", "''")
  return `INSERT INTO publish_manifest VALUES (
    'manifest', 'pkg', 'release', 'publish-command', 'prediction', '${metadata}',
    '${'e'.repeat(64)}', 'publish/thumb.png', '${'f'.repeat(64)}', 1280, 720,
    'rights/thumb.json', 'human/d3.json', 1, ${autoPublish}, '${'1'.repeat(64)}', '2026-08-24'
  )`
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0013_publishing', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = createDb()
    db.exec(section('down'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section('up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='publish_manifest'").get().count).toBe(1)
      db.exec(section('down'))
    }
  })

  it('requires a signed, distinct release command bound to the exact master checksum', () => {
    const db = createDb()
    expect(() => db.exec(`
      INSERT INTO release_assessment VALUES (
        'bad', 'pkg', 'master', '${'9'.repeat(64)}', 'assurance', '${'9'.repeat(64)}',
        'evidence/reconciliation.json', 'release-command', '${'d'.repeat(64)}', '2026-08-24'
      )
    `)).toThrow(/release master checksum mismatch/iu)
    expect(() => insertRelease(db)).not.toThrow()
  })

  it('blocks publish without prediction, PC1–PC8, disclosure match or explicit flags', () => {
    const db = createDb()
    insertRelease(db)
    expect(() => db.exec(manifestSql())).toThrow(/no sealed prediction/iu)
    addPublishPrerequisites(db)
    expect(() => db.exec(manifestSql(1))).toThrow()
    expect(() => db.exec(manifestSql())).not.toThrow()
  })

  it('keeps resumable offsets monotonic and binds only a verified exact master', () => {
    const db = createDb()
    insertRelease(db)
    addPublishPrerequisites(db)
    db.exec(manifestSql())
    db.exec(`INSERT INTO youtube_upload_session VALUES (
      'upload', 'manifest', '${'2'.repeat(64)}', 100, 0, 'INITIATED', '2026-08-24', '2026-08-24'
    )`)
    db.exec("UPDATE youtube_upload_session SET confirmed_bytes=100, state='UPLOADED' WHERE id='upload'")
    expect(() => db.exec("UPDATE youtube_upload_session SET confirmed_bytes=99 WHERE id='upload'"))
      .toThrow(/must be monotonic/iu)
    expect(() => db.exec(`INSERT INTO youtube_video_binding VALUES (
      'binding', 'pkg', 'upload', 'video', '${'a'.repeat(64)}', 'publish/readback.json', '2026-08-24'
    )`)).toThrow(/requires VERIFIED upload/iu)
    db.exec("UPDATE youtube_upload_session SET state='VERIFIED' WHERE id='upload'")
    expect(() => db.exec(`INSERT INTO youtube_video_binding VALUES (
      'binding', 'pkg', 'upload', 'video', '${'a'.repeat(64)}', 'publish/readback.json', '2026-08-24'
    )`)).not.toThrow()
  })
})
