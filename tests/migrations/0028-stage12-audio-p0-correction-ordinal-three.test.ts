import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const ordinalTwoMigration = readFileSync(
  new URL("../../sites/control-plane/drizzle/0026_stage12_audio_p0_correction.sql", import.meta.url),
  "utf8",
);
const ordinalThreeMigration = readFileSync(
  new URL(
    "../../sites/control-plane/drizzle/0028_stage12_audio_p0_correction_ordinal_three.sql",
    import.meta.url,
  ),
  "utf8",
);
const hex = (value: string) => value.repeat(64).slice(0, 64);

function apply(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function fixture(ordinalTwoOutcome: "PASS" | "FAIL" = "FAIL") {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE command_log (
      id text PRIMARY KEY, command_type text NOT NULL, idempotency_key text NOT NULL,
      prev_state text, next_state text
    );
    CREATE TRIGGER command_log_validate_insert
    BEFORE INSERT ON command_log
    BEGIN SELECT RAISE(ABORT, 'LEGACY_TRIGGER_MUST_BE_REPLACED'); END;
    CREATE TABLE stage12_media_job (id text PRIMARY KEY);
    CREATE TABLE stage12_corrected_pre_master_job (
      id text PRIMARY KEY, stage12_job_id text, state text,
      corrected_pre_master_r2_key text, corrected_pre_master_sha256 text,
      corrected_pre_master_byte_length integer, receipt_sha256 text, outcome text,
      failures_json text, measurements_json text, provider_call_count integer,
      provider_dispatch text, auto_publish text
    );
    INSERT INTO stage12_media_job VALUES ('job-3');
    INSERT INTO stage12_corrected_pre_master_job VALUES (
      'correction-1','job-3','READY','prod/corrected/${hex("a")}.webm','${hex("a")}',
      7000000,'${hex("b")}','FAIL',
      '["CONTROL_CONTRACT","TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.48,"loudnessRangeLu":2.9,"p0DefectCount":1}',
      0,'OFF','OFF'
    );`);
  apply(db, ordinalTwoMigration);
  db.exec(`INSERT INTO stage12_audio_p0_correction_job
    (id, predecessor_corrected_pre_master_job_id, stage12_job_id, correction_ordinal,
     idempotency_key, callback_token_hash, actor_identity, owner_approval_text, state,
     source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
     source_receipt_sha256, corrected_pre_master_r2_key, corrected_pre_master_sha256,
     corrected_pre_master_byte_length, corrected_frame_md5_sha256, receipt_r2_key,
     receipt_sha256, worker_image_digest, report_sha256, outcome, failures_json,
     measurements_json)
    VALUES ('correction-2','correction-1','job-3',2,'${hex("c")}','${hex("d")}',
      'owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION','READY',
      'prod/corrected/${hex("a")}.webm','${hex("a")}',7000000,'${hex("b")}',
      'prod/audio-p0/${hex("e")}.webm','${hex("e")}',7100000,'${hex("f")}',
      'prod/receipt/${hex("1")}.json','${hex("1")}','sha256:${hex("2")}',
      '${hex("3")}','${ordinalTwoOutcome}',
      '["CONTROL_CONTRACT","TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.9,"loudnessRangeLu":3,"p0DefectCount":1}');`);
  apply(db, ordinalThreeMigration);
  return db;
}

function insertOrdinalThree(db: DatabaseSync, sourceSha256 = hex("e"), receiptSha256 = hex("1")) {
  db.exec(`INSERT INTO stage12_audio_p0_correction_retry_job
    (id, predecessor_correction_job_id, stage12_job_id, correction_ordinal,
     correction_strategy_version, retry_reason_code, idempotency_key, callback_token_hash,
     actor_identity, owner_approval_text, state, source_pre_master_r2_key,
     source_pre_master_sha256, source_pre_master_byte_length, source_receipt_sha256)
    VALUES ('correction-3','correction-2','job-3',3,3,
      'STAGE12_AUDIO_P0_ENCODED_QA_FAIL','${hex("4")}','${hex("5")}',
      'owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION','PENDING',
      'prod/audio-p0/${hex("e")}.webm','${sourceSha256}',7100000,'${receiptSha256}');`);
}

describe("migration 0028 Stage 12 audio/P0 correction ordinal 3", () => {
  test("seals one ordinal-3 correction from the immutable ordinal-2 QA failure", () => {
    const db = fixture();
    insertOrdinalThree(db);
    expect(() => db.exec(`UPDATE stage12_audio_p0_correction_retry_job SET state='READY',
      corrected_pre_master_r2_key='prod/audio-p0/${hex("6")}.webm',
      corrected_pre_master_sha256='${hex("6")}', corrected_pre_master_byte_length=7200000,
      corrected_frame_md5_sha256='${hex("7")}', receipt_r2_key='prod/receipt/${hex("8")}.json',
      receipt_sha256='${hex("8")}', worker_image_digest='sha256:${hex("9")}',
      report_sha256='${hex("0")}', outcome='PASS', failures_json='[]', measurements_json='{}'
      WHERE id='correction-3'`)).not.toThrow();
    expect(() => db.exec("UPDATE stage12_audio_p0_correction_retry_job SET outcome='FAIL'"))
      .toThrow(/STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_TERMINAL_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_audio_p0_correction_retry_job"))
      .toThrow(/STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_IMMUTABLE/u);
  });

  test("rejects mismatched source, receipt, ordinal, strategy and non-failed predecessor", () => {
    for (const mutate of [
      (db: DatabaseSync) => insertOrdinalThree(db, hex("9")),
      (db: DatabaseSync) => insertOrdinalThree(db, hex("e"), hex("9")),
    ]) {
      const db = fixture();
      expect(() => mutate(db)).toThrow(/STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_LINEAGE_INVALID/u);
    }
    const passedPredecessorDb = fixture("PASS");
    expect(() => insertOrdinalThree(passedPredecessorDb))
      .toThrow(/STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_LINEAGE_INVALID/u);
    const db = fixture();
    expect(() => db.exec(`INSERT INTO stage12_audio_p0_correction_retry_job
      (id, predecessor_correction_job_id, stage12_job_id, correction_ordinal,
       correction_strategy_version, retry_reason_code, idempotency_key, callback_token_hash,
       actor_identity, owner_approval_text, state, source_pre_master_r2_key,
       source_pre_master_sha256, source_pre_master_byte_length, source_receipt_sha256)
      VALUES ('bad','correction-2','job-3',2,2,'STAGE12_AUDIO_P0_ENCODED_QA_FAIL',
       '${hex("7")}','${hex("8")}','owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION',
       'PENDING','prod/audio-p0/${hex("e")}.webm','${hex("e")}',7100000,'${hex("1")}')`))
      .toThrow();
  });

  test("preserves the existing command contract and adds only the ordinal-3 transition", () => {
    const db = fixture();
    const key = hex("a");
    expect(() => db.prepare(`INSERT INTO command_log
      (id,command_type,idempotency_key,prev_state,next_state) VALUES (?,?,?,?,?)`)
      .run("new", "CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION", key,
        "TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_FAIL",
        "TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING")).not.toThrow();
    expect(() => db.prepare(`INSERT INTO command_log
      (id,command_type,idempotency_key,prev_state,next_state) VALUES (?,?,?,?,?)`)
      .run("old", "CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION", key,
        "TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL",
        "TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING")).not.toThrow();
    expect(() => db.prepare(`INSERT INTO command_log
      (id,command_type,idempotency_key,prev_state,next_state) VALUES (?,?,?,?,?)`)
      .run("unknown", "UNKNOWN", key, "ANY", "ANY"))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
  });
});
