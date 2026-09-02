import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL("../../sites/control-plane/drizzle/0025_stage12_corrected_pre_master.sql", import.meta.url),
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
    CREATE TABLE stage12_qa_diagnostic_job (
      id text PRIMARY KEY, stage12_job_id text, diagnostic_ordinal integer, state text
    );
    CREATE TABLE stage12_qa_evidence (
      id text PRIMARY KEY, job_id text, source text, outcome text,
      pre_master_r2_key text, pre_master_sha256 text, render_authorized integer,
      provider_call_count integer, provider_dispatch text, auto_publish text
    );
    INSERT INTO stage12_media_job VALUES ('job-3');
    INSERT INTO stage12_qa_diagnostic_job VALUES ('diagnostic-2','job-3',2,'READY');
    INSERT INTO stage12_qa_evidence VALUES (
      'evidence-2','job-3','DIAGNOSTIC','FAIL','prod/source.webm','${hex("a")}',0,0,'OFF','OFF'
    );`);
  apply(db, migration);
  return db;
}

function insertPending(db: DatabaseSync, overrides = "") {
  db.exec(`INSERT INTO stage12_corrected_pre_master_job
    (id, stage12_job_id, diagnostic_job_id, diagnostic_evidence_id, idempotency_key,
     callback_token_hash, actor_identity, owner_approval_text, state, source_pre_master_r2_key, source_pre_master_sha256,
     source_pre_master_byte_length ${overrides ? `, ${overrides.split("=")[0]}` : ""})
    VALUES ('correction-1','job-3','diagnostic-2','evidence-2','${hex("b")}',
     '${hex("c")}','owner@example.com','CREATE STAGE 12 CORRECTED PRE-MASTER','PENDING','prod/source.webm','${hex("a")}',6264904
     ${overrides ? `, ${overrides.split("=")[1]}` : ""});`);
}

describe("migration 0025 corrected pre-master lineage", () => {
  test("accepts only ordinal-2 FAIL evidence and seals a distinct corrected artifact", () => {
    const db = fixture();
    insertPending(db);
    expect(() => db.exec(`UPDATE stage12_corrected_pre_master_job SET
      state='READY', corrected_pre_master_r2_key='prod/corrected/${hex("d")}.webm',
      corrected_pre_master_sha256='${hex("d")}', corrected_pre_master_byte_length=7000000,
      corrected_frame_md5_sha256='${hex("e")}', receipt_r2_key='prod/receipts/${hex("f")}.json',
      receipt_sha256='${hex("f")}', worker_image_digest='sha256:${hex("1")}',
      report_sha256='${hex("2")}', outcome='PASS', failures_json='[]',
      measurements_json='{}', updated_at='now' WHERE id='correction-1'`)).not.toThrow();
    expect(() => db.exec("UPDATE stage12_corrected_pre_master_job SET outcome='FAIL' WHERE id='correction-1'"))
      .toThrow(/STAGE12_CORRECTED_PRE_MASTER_TERMINAL_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_corrected_pre_master_job WHERE id='correction-1'"))
      .toThrow(/STAGE12_CORRECTED_PRE_MASTER_IMMUTABLE/u);
  });

  test("rejects wrong diagnostic lineage, PASS evidence and source hash reuse", () => {
    const db = fixture();
    db.exec("UPDATE stage12_qa_diagnostic_job SET diagnostic_ordinal=1 WHERE id='diagnostic-2'");
    expect(() => insertPending(db)).toThrow(/STAGE12_CORRECTED_PRE_MASTER_LINEAGE_INVALID/u);
    db.exec("UPDATE stage12_qa_diagnostic_job SET diagnostic_ordinal=2 WHERE id='diagnostic-2'");
    db.exec("UPDATE stage12_qa_evidence SET outcome='PASS' WHERE id='evidence-2'");
    expect(() => insertPending(db)).toThrow(/STAGE12_CORRECTED_PRE_MASTER_LINEAGE_INVALID/u);
    db.exec("UPDATE stage12_qa_evidence SET outcome='FAIL' WHERE id='evidence-2'");
    insertPending(db);
    expect(() => db.exec(`UPDATE stage12_corrected_pre_master_job SET
      state='READY', corrected_pre_master_r2_key='prod/corrected/source.webm',
      corrected_pre_master_sha256='${hex("a")}', corrected_pre_master_byte_length=6264904,
      corrected_frame_md5_sha256='${hex("e")}', receipt_r2_key='prod/receipt.json',
      receipt_sha256='${hex("f")}', worker_image_digest='sha256:${hex("1")}',
      report_sha256='${hex("2")}', outcome='FAIL', failures_json='["LOUDNESS"]',
      measurements_json='{}' WHERE id='correction-1'`))
      .toThrow(/STAGE12_CORRECTED_PRE_MASTER_READY_INVALID/u);
  });
});
