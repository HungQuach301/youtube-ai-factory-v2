import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL("../../sites/control-plane/drizzle/0026_stage12_audio_p0_correction.sql", import.meta.url),
  "utf8",
);
const hex = (value: string) => value.repeat(64).slice(0, 64);

function apply(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE stage12_media_job (id text PRIMARY KEY);
    CREATE TABLE stage12_qa_diagnostic_job (id text PRIMARY KEY);
    CREATE TABLE stage12_qa_evidence (id text PRIMARY KEY);
    CREATE TABLE stage12_corrected_pre_master_job (
      id text PRIMARY KEY, stage12_job_id text, diagnostic_job_id text,
      diagnostic_evidence_id text, state text, corrected_pre_master_r2_key text,
      corrected_pre_master_sha256 text, corrected_pre_master_byte_length integer,
      receipt_sha256 text, outcome text, failures_json text, measurements_json text,
      provider_call_count integer, provider_dispatch text, auto_publish text
    );
    INSERT INTO stage12_media_job VALUES ('job-3');
    INSERT INTO stage12_qa_diagnostic_job VALUES ('diagnostic-2');
    INSERT INTO stage12_qa_evidence VALUES ('evidence-2');
    INSERT INTO stage12_corrected_pre_master_job VALUES (
      'correction-1','job-3','diagnostic-2','evidence-2','READY',
      'prod/corrected/${hex("a")}.webm','${hex("a")}',7000000,'${hex("b")}','FAIL',
      '["CONTROL_CONTRACT","TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.48,"loudnessRangeLu":2.9,"p0DefectCount":1}',
      0,'OFF','OFF'
    );`);
  apply(db, migration);
  return db;
}

function insertPending(db: DatabaseSync, sourceSha256 = hex("a")) {
  db.exec(`INSERT INTO stage12_audio_p0_correction_job
    (id, predecessor_corrected_pre_master_job_id, stage12_job_id, correction_ordinal,
     idempotency_key, callback_token_hash, actor_identity, owner_approval_text, state,
     source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
     source_receipt_sha256)
    VALUES ('correction-2','correction-1','job-3',2,'${hex("c")}','${hex("d")}',
     'owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION','PENDING',
     'prod/corrected/${hex("a")}.webm','${sourceSha256}',7000000,'${hex("b")}');`);
}

describe("migration 0026 Stage 12 audio/P0 correction lineage", () => {
  test("seals one distinct correction ordinal 2 from the immutable failed predecessor", () => {
    const db = fixture();
    insertPending(db);
    expect(() => db.exec(`UPDATE stage12_audio_p0_correction_job SET state='READY',
      corrected_pre_master_r2_key='prod/audio-p0/${hex("e")}.webm',
      corrected_pre_master_sha256='${hex("e")}', corrected_pre_master_byte_length=7100000,
      corrected_frame_md5_sha256='${hex("f")}', receipt_r2_key='prod/receipt/${hex("1")}.json',
      receipt_sha256='${hex("1")}', worker_image_digest='sha256:${hex("2")}',
      report_sha256='${hex("3")}', outcome='PASS', failures_json='[]', measurements_json='{}'
      WHERE id='correction-2'`)).not.toThrow();
    expect(() => db.exec("UPDATE stage12_audio_p0_correction_job SET outcome='FAIL'"))
      .toThrow(/STAGE12_AUDIO_P0_CORRECTION_TERMINAL_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_audio_p0_correction_job"))
      .toThrow(/STAGE12_AUDIO_P0_CORRECTION_IMMUTABLE/u);
  });

  test("rejects source mismatch, non-failed predecessor and ordinal reuse", () => {
    const db = fixture();
    expect(() => insertPending(db, hex("9")))
      .toThrow(/STAGE12_AUDIO_P0_CORRECTION_LINEAGE_INVALID/u);
    insertPending(db);
    expect(() => db.exec(`UPDATE stage12_audio_p0_correction_job SET state='READY',
      corrected_pre_master_r2_key='prod/audio-p0/${hex("e")}.webm',
      corrected_pre_master_sha256='${hex("a")}', corrected_pre_master_byte_length=7100000,
      corrected_frame_md5_sha256='${hex("f")}', receipt_r2_key='prod/receipt/${hex("1")}.json',
      receipt_sha256='${hex("1")}', worker_image_digest='sha256:${hex("2")}',
      report_sha256='${hex("3")}', outcome='PASS', failures_json='[]', measurements_json='{}'
      WHERE id='correction-2'`)).toThrow(/STAGE12_AUDIO_P0_CORRECTION_READY_INVALID/u);
    db.close();

    const lineageDb = fixture();
    lineageDb.exec("UPDATE stage12_corrected_pre_master_job SET outcome='PASS' WHERE id='correction-1'");
    expect(() => insertPending(lineageDb)).toThrow(/STAGE12_AUDIO_P0_CORRECTION_LINEAGE_INVALID/u);
    lineageDb.exec("UPDATE stage12_corrected_pre_master_job SET outcome='FAIL' WHERE id='correction-1'");
    insertPending(lineageDb);
    expect(() => lineageDb.exec(`INSERT INTO stage12_audio_p0_correction_job
      (id, predecessor_corrected_pre_master_job_id, stage12_job_id, correction_ordinal,
       idempotency_key, callback_token_hash, actor_identity, owner_approval_text, state,
       source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
       source_receipt_sha256)
      SELECT 'correction-2b', predecessor_corrected_pre_master_job_id, stage12_job_id, 2,
       '${hex("4")}', callback_token_hash, actor_identity, owner_approval_text, state,
       source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
       source_receipt_sha256 FROM stage12_audio_p0_correction_job`))
      .toThrow();
  });
});
