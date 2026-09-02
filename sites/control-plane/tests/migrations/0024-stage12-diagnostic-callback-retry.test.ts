import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const evidenceMigration = readFileSync(
  new URL("../../drizzle/0023_stage12_qa_evidence.sql", import.meta.url),
  "utf8",
);
const retryMigration = readFileSync(
  new URL("../../drizzle/0024_stage12_diagnostic_callback_retry.sql", import.meta.url),
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
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`CREATE TABLE stage12_media_job (
    id text PRIMARY KEY, package_id text, operation_run_id text, stage_instance_id text,
    attempt_ordinal integer, retry_of_job_id text, state text, error_code text
  );
  CREATE TABLE command_log (
    command_type text, idempotency_key text, prev_state text, next_state text
  );
  CREATE TRIGGER command_log_validate_insert BEFORE INSERT ON command_log
    BEGIN SELECT 1; END;
  CREATE TRIGGER stage12_media_job_retry_insert BEFORE INSERT ON stage12_media_job
    BEGIN SELECT 1; END;
  INSERT INTO stage12_media_job
    (id, package_id, operation_run_id, stage_instance_id, attempt_ordinal, state, error_code)
    VALUES ('job-3', 'pkg', 'run', 's12', 3, 'FAILED', 'S12QA:LOUDNESS');`);
  apply(db, evidenceMigration);
  db.exec(`INSERT INTO stage12_qa_diagnostic_job
    (id, stage12_job_id, idempotency_key, callback_token_hash, state)
    VALUES ('diagnostic-1', 'job-3', '${hex("a")}', '${hex("b")}', 'PENDING');
    UPDATE stage12_qa_diagnostic_job SET state = 'FAILED', error_code = '23'
      WHERE id = 'diagnostic-1';`);
  apply(db, retryMigration);
  return db;
}

describe("migration 0024 Stage 12 diagnostic callback retry", () => {
  test("preserves the failed diagnostic and permits one typed callback-timeout retry", () => {
    const db = fixture();
    expect(() => db.exec(`UPDATE stage12_qa_diagnostic_job SET error_code =
      'STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT' WHERE id = 'diagnostic-1'`))
      .toThrow(/STAGE12_QA_DIAGNOSTIC_TERMINAL_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_qa_diagnostic_job WHERE id = 'diagnostic-1'"))
      .toThrow(/STAGE12_QA_DIAGNOSTIC_TERMINAL_IMMUTABLE/u);

    expect(() => db.exec(`INSERT INTO stage12_qa_diagnostic_job
      (id, stage12_job_id, idempotency_key, callback_token_hash, state,
       diagnostic_ordinal, retry_of_diagnostic_job_id, retry_reason_code, target_duration_sec)
      VALUES ('diagnostic-2', 'job-3', '${hex("c")}', '${hex("d")}', 'PENDING',
       2, 'diagnostic-1', 'STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT', 510)`))
      .not.toThrow();
    const retry = db.prepare(`SELECT diagnostic_ordinal, retry_of_diagnostic_job_id,
      retry_reason_code, target_duration_sec FROM stage12_qa_diagnostic_job
      WHERE id = 'diagnostic-2'`).get() as Record<string, unknown>;
    expect(retry).toEqual({ diagnostic_ordinal: 2,
      retry_of_diagnostic_job_id: "diagnostic-1",
      retry_reason_code: "STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT",
      target_duration_sec: 510 });
  });

  test("rejects an untyped lineage, a third scan, and missing callback duration", () => {
    const db = fixture();
    expect(() => db.exec(`INSERT INTO stage12_qa_diagnostic_job
      (id, stage12_job_id, idempotency_key, callback_token_hash, state,
       diagnostic_ordinal, retry_of_diagnostic_job_id, retry_reason_code, target_duration_sec)
      VALUES ('bad-retry', 'job-3', '${hex("e")}', '${hex("f")}', 'PENDING',
       2, 'diagnostic-1', '23', 510)`))
      .toThrow(/STAGE12_QA_DIAGNOSTIC_RETRY_CONTRACT_VIOLATION/u);
    expect(() => db.exec(`INSERT INTO stage12_qa_diagnostic_job
      (id, stage12_job_id, idempotency_key, callback_token_hash, state,
       diagnostic_ordinal, retry_of_diagnostic_job_id, retry_reason_code, target_duration_sec)
      VALUES ('third', 'job-3', '${hex("1")}', '${hex("2")}', 'PENDING',
       3, 'diagnostic-1', 'STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT', 510)`))
      .toThrow();
    expect(() => db.exec(`INSERT INTO stage12_qa_diagnostic_job
      (id, stage12_job_id, idempotency_key, callback_token_hash, state)
      VALUES ('new-first', 'job-3', '${hex("3")}', '${hex("4")}', 'PENDING')`))
      .toThrow(/STAGE12_QA_DIAGNOSTIC_DURATION_REQUIRED/u);
  });
});
