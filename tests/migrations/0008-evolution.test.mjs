import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../db/migrations/0008_evolution.sql', import.meta.url), 'utf8')

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
    CREATE TABLE owner_identity (identity TEXT PRIMARY KEY, role TEXT NOT NULL, active INTEGER NOT NULL);
    CREATE TABLE command_log (
      id TEXT PRIMARY KEY, command_type TEXT NOT NULL, payload_json TEXT NOT NULL,
      actor_identity TEXT NOT NULL, actor_signature TEXT, evidence_hash TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE qualification_run (id TEXT PRIMARY KEY);
    CREATE TABLE gate_definition (
      id TEXT PRIMARY KEY, tier TEXT NOT NULL, threshold_json TEXT,
      strictness_rank INTEGER NOT NULL, active INTEGER NOT NULL
    );
    CREATE TABLE gold_sample (
      id TEXT PRIMARY KEY, defect_class TEXT NOT NULL, severity TEXT NOT NULL,
      source TEXT NOT NULL, r2_key TEXT NOT NULL, ground_truth_json TEXT NOT NULL,
      retired_at TEXT, retired_by TEXT, created_at TEXT NOT NULL
    );
    INSERT INTO owner_identity VALUES ('owner', 'OWNER', 1);
    INSERT INTO gate_definition VALUES ('gate', 'M0', '{"min":94}', 10, 1);
    INSERT INTO gold_sample VALUES (
      'gold', 'BLACK_FRAME', 'P0', 'synthetic', 'gold/sample.mp4', '{}', NULL, NULL, '2026-08-24'
    );
  `)
  db.exec(section('up'))
  return db
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0008_evolution', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = createDb()
    db.exec(section('down'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section('up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='standard_change_log'").get().count).toBe(1)
      db.exec(section('down'))
    }
  })

  it('G11 blocks RELAX logs and gate relaxation without a matching promotion', () => {
    const db = createDb()
    expect(() => db.exec(`INSERT INTO standard_change_log VALUES (
      'change', 'GATE', 'gate', 'RELAX', NULL, '{"rank":10}', '{"rank":9}',
      'agent', datetime('now')
    )`)).toThrow(/owner-signed promotion/iu)
    expect(() => db.exec("UPDATE gate_definition SET strictness_rank=9 WHERE id='gate'"))
      .toThrow(/gate relaxation requires/iu)
    expect(() => db.exec(`INSERT INTO standard_change_log VALUES (
      'tighten', 'GATE', 'gate', 'TIGHTEN', NULL, '{"rank":10}', '{"rank":11}',
      'agent', datetime('now')
    )`)).not.toThrow()
  })

  it('G12 requires shadow evidence and owner promotion sequencing', () => {
    const db = createDb()
    db.exec(`INSERT INTO evolution_proposal (
      id, kind, source, target_ref, diff_r2_key, strictness_direction,
      shadow_run_id, evidence_r2_key, evidence_hash, status, rollback_ref,
      created_at, decided_at, decided_by, promotion_id, promotion_command_id
    ) VALUES (
      'proposal', 'THRESHOLD', 'HUMAN', 'QUALITY.SCORE_MIN', 'diff.json', 'TIGHTEN',
      NULL, NULL, NULL, 'PROPOSED', NULL, '2026-08-24', NULL, NULL, NULL, NULL
    )`)
    expect(() => db.exec("UPDATE evolution_proposal SET status='EVIDENCE_READY' WHERE id='proposal'"))
      .toThrow(/requires shadow_run_id and evidence/iu)
    db.exec("INSERT INTO qualification_run VALUES ('shadow')")
    expect(() => db.exec(`UPDATE evolution_proposal SET
      shadow_run_id='shadow', evidence_r2_key='evidence/shadow.json', evidence_hash='${h('a')}',
      status='EVIDENCE_READY' WHERE id='proposal'`)).toThrow(/rollback_ref/iu)
    db.exec(`UPDATE evolution_proposal SET
      shadow_run_id='shadow', evidence_r2_key='evidence/shadow.json', evidence_hash='${h('a')}',
      rollback_ref='registry:v1', status='EVIDENCE_READY' WHERE id='proposal'`)
    expect(() => db.exec("UPDATE evolution_proposal SET status='PROMOTED', decided_by='agent' WHERE id='proposal'"))
      .toThrow(/evolution_promotion/iu)

    db.exec(`INSERT INTO command_log VALUES (
      'promote', 'PROMOTE_EVOLUTION', '{"proposalId":"proposal"}', 'owner', 'signature',
      '${h('a')}', datetime('now')
    )`)
    db.exec(`INSERT INTO evolution_promotion VALUES (
      'evo-promotion', 'proposal', 'promote', 'QUALITY.SCORE_MIN', 'registry:v1',
      'owner', '${h('a')}', '{"kind":"MINIMUM","value":94}',
      '{"kind":"MINIMUM","value":95}', '${h('b')}', datetime('now')
    )`)
    expect(db.prepare("SELECT status FROM evolution_proposal WHERE id='proposal'").get().status)
      .toBe('PROMOTED')
    expect(() => db.exec("UPDATE evolution_promotion SET rollback_ref='other' WHERE id='evo-promotion'"))
      .toThrow(/append-only/iu)
  })

  it('G14 makes gold samples append-only and binds retirement to a signed owner command', () => {
    const db = createDb()
    expect(() => db.exec("DELETE FROM gold_sample WHERE id='gold'"))
      .toThrow(/append-only/iu)
    expect(() => db.exec("UPDATE gold_sample SET severity='P1' WHERE id='gold'"))
      .toThrow(/labels are immutable/iu)
    expect(() => db.exec("UPDATE gold_sample SET retired_at=datetime('now'), retired_by='owner' WHERE id='gold'"))
      .toThrow(/RETIRE_GOLD_SAMPLE/iu)
    db.exec(`INSERT INTO command_log VALUES (
      'retire', 'RETIRE_GOLD_SAMPLE', '{"sampleId":"gold"}', 'owner', 'signature',
      '${h('a')}', datetime('now')
    )`)
    expect(() => db.exec("UPDATE gold_sample SET retired_at=datetime('now'), retired_by='owner' WHERE id='gold'"))
      .not.toThrow()
    expect(() => db.exec("UPDATE gold_sample SET retired_at=NULL, retired_by=NULL WHERE id='gold'"))
      .toThrow(/retirement is immutable/iu)
  })
})
