import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../db/migrations/0015_failure_mining.sql', import.meta.url), 'utf8')

function section(name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []

function createDb() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec(`
    CREATE TABLE gold_sample (
      id TEXT PRIMARY KEY, defect_class TEXT, severity TEXT, source TEXT,
      r2_key TEXT, ground_truth_json TEXT, created_at TEXT
    );
    CREATE TABLE evolution_proposal (
      id TEXT PRIMARY KEY, kind TEXT, source TEXT, target_ref TEXT, diff_r2_key TEXT,
      strictness_direction TEXT, status TEXT, created_at TEXT
    );
    CREATE TABLE learning (
      id TEXT PRIMARY KEY, scope TEXT, channel_id TEXT, replicated_channel_ids_json TEXT,
      knowledge_kind TEXT, finding TEXT, evidence_json TEXT, status TEXT
    );
    CREATE TABLE promotion (
      id TEXT PRIMARY KEY, learning_id TEXT NOT NULL UNIQUE
    );
  `)
  db.exec(section('up'))
  return db
}

function promote(db, id, channel, finding = 'finding', direction = 'POSITIVE') {
  db.prepare(`INSERT INTO learning VALUES (?, 'CHANNEL', ?, NULL, 'STRUCTURE', ?, ?, 'READY')`)
    .run(id, channel, finding, JSON.stringify({ direction }))
  db.prepare('INSERT INTO promotion VALUES (?, ?)').run(`promotion-${id}`, id)
  db.prepare("UPDATE learning SET status='PROMOTED' WHERE id=?").run(id)
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0015_failure_mining', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = createDb()
    db.exec(section('down'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section('up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_lrn04_%'").get().count).toBe(2)
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_learning_%'").get().count).toBe(4)
      db.exec(section('down'))
    }
  })

  it('keeps LRN-04 writes in gold/evolution namespaces and prevents relaxation', () => {
    const db = createDb()
    const groundTruth = '{"masterId":"m","stageCode":"S14","tStart":1,"tEnd":2,"evidenceR2Keys":["e"]}'
    expect(() => db.prepare("INSERT INTO gold_sample VALUES ('g','SILENCE','P0','escaped_defect',?,?, '2026-08-25')").run('production/master.mp4', groundTruth))
      .toThrow(/gold namespace/iu)
    expect(() => db.exec(`INSERT INTO evolution_proposal VALUES ('p','GATE','LRN04','gate','learning/lrn04/p/diff.json','RELAX','PROPOSED','2026-08-25')`))
      .toThrow(/cannot relax/iu)
    expect(() => db.prepare("INSERT INTO gold_sample VALUES ('g','SILENCE','P0','escaped_defect',?,?, '2026-08-25')").run('gold/master.mp4', groundTruth))
      .not.toThrow()
    expect(() => db.prepare("INSERT INTO gold_sample VALUES ('g2','SILENCE','P0','escaped_defect',?,?, '2026-08-25')").run('gold/master2.mp4', '{"masterId":"m","stageCode":"S14","evidenceR2Keys":["e"]}'))
      .toThrow(/time span/iu)
  })

  it('rejects direct promotion and portfolio elevation without two matching owner-promoted sources', () => {
    const db = createDb()
    expect(() => db.exec(`INSERT INTO learning VALUES ('forged','CHANNEL','a',NULL,'STRUCTURE','finding','{"direction":"POSITIVE"}','PROMOTED')`))
      .toThrow(/bound promotion/iu)
    promote(db, 'a', 'a')
    expect(() => db.exec(`INSERT INTO learning VALUES ('portfolio-one','PORTFOLIO',NULL,'["a"]','STRUCTURE','finding','{"direction":"POSITIVE"}','READY')`))
      .toThrow(/distinct channel identifiers/iu)
    db.exec(`INSERT INTO learning VALUES ('b','CHANNEL','b',NULL,'STRUCTURE','finding','{"direction":"NEGATIVE"}','READY')`)
    db.exec(`INSERT INTO promotion VALUES ('promotion-b','b')`)
    db.exec(`UPDATE learning SET status='PROMOTED' WHERE id='b'`)
    expect(() => db.exec(`INSERT INTO learning VALUES ('portfolio-direction','PORTFOLIO',NULL,'["a","b"]','STRUCTURE','finding','{"direction":"POSITIVE"}','READY')`))
      .toThrow(/matching owner-promoted evidence/iu)
    db.exec(`UPDATE learning SET evidence_json='{"direction":"POSITIVE"}' WHERE id='b'`)
    expect(() => db.exec(`INSERT INTO learning VALUES ('portfolio','PORTFOLIO',NULL,'["a","b"]','STRUCTURE','finding','{"direction":"POSITIVE"}','READY')`))
      .not.toThrow()
    expect(() => db.exec(`INSERT INTO learning VALUES ('portfolio-voice','PORTFOLIO',NULL,'["a","b"]','VOICE','finding','{"direction":"POSITIVE"}','READY')`))
      .toThrow(/STRUCTURE-only/iu)
  })
})
