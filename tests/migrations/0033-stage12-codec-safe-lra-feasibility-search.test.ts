import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const sql = readFileSync('sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql', 'utf8')
const insert = (db: DatabaseSync) => db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
 (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,parent_evidence_id,
  lra_guard_evidence_id,status,created_at) VALUES (?,?,?,?,?,?,?,?)`).run('job',2,3,
 '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2',
 '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb',
 '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9','PENDING',new Date(0).toISOString())

describe('migration 0033 Stage 12 LRA feasibility search', () => {
  it('keeps every D1 statement in its own append-only migration chunk', () => {
    const statements = sql.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)
    expect(statements).toHaveLength(7)
    expect(statements[0]).toBe('PRAGMA foreign_keys = ON;')
    expect(statements.slice(1).every((statement) => /^(?:CREATE TABLE|CREATE TRIGGER)\b/u.test(statement)))
      .toBe(true)
    expect(sql).not.toMatch(/-- Down\b/u)
  })

  it('is append-only and locks shadow side effects off', () => {
    const db = new DatabaseSync(':memory:'); db.exec(sql); insert(db)
    expect(() => db.prepare("UPDATE stage12_codec_safe_lra_feasibility_job SET status='READY'").run())
      .toThrow(/IMMUTABLE/u)
    expect(() => db.prepare('DELETE FROM stage12_codec_safe_lra_feasibility_job').run())
      .toThrow(/IMMUTABLE/u)
    expect(() => db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
      (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,parent_evidence_id,
       lra_guard_evidence_id,status,upload_corrected_output,created_at)
      SELECT 'bad',2,3,source_sha256,parent_evidence_id,lra_guard_evidence_id,'PENDING',1,created_at
      FROM stage12_codec_safe_lra_feasibility_job`).run()).toThrow()
    db.close()
  })

  it('rejects lineage drift and makes evidence immutable', () => {
    const db = new DatabaseSync(':memory:'); db.exec(sql); insert(db)
    expect(() => db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
      (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,parent_evidence_id,
       lra_guard_evidence_id,status,created_at) VALUES ('bad',2,3,?,?,?,'PENDING',?)`).run(
        '0'.repeat(64), '1'.repeat(64), '2'.repeat(64), new Date(0).toISOString())).toThrow()
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_evidence VALUES
      ('e','job',?,?,?,?,'${'a'.repeat(64)}','PASS','CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION',?)`)
      .run('b'.repeat(64),'c'.repeat(64),'{}','[]',new Date(0).toISOString())
    expect(() => db.prepare("UPDATE stage12_codec_safe_lra_feasibility_evidence SET terminal_reason='LINEAGE_DRIFT'").run())
      .toThrow(/IMMUTABLE/u)
    db.close()
  })
})
