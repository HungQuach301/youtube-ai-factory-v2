import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0015_stage10_failed_retry.sql", import.meta.url),
  "utf8",
);
const stage10Domain = readFileSync(
  new URL("../../app/track-g-video-one.ts", import.meta.url),
  "utf8",
);
const operatorRuntime = readFileSync(
  new URL("../../app/operator-runtime.ts", import.meta.url),
  "utf8",
);

function applyMigration(db) {
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    db.exec(statement);
  }
}

function fixture(errorCode = "MEDIA_TOOL_FAILED") {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE stage10_media_job (
    id text PRIMARY KEY NOT NULL,
    package_id text NOT NULL,
    operation_run_id text NOT NULL,
    stage_instance_id text NOT NULL,
    provider_idempotency_key text NOT NULL,
    callback_token_hash text NOT NULL,
    state text NOT NULL,
    receipt_r2_key text,
    receipt_sha256 text,
    worker_image_digest text,
    error_code text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE UNIQUE INDEX stage10_media_job_package_unique
    ON stage10_media_job (package_id);
  CREATE UNIQUE INDEX stage10_media_job_provider_key_unique
    ON stage10_media_job (provider_idempotency_key);`);
  db.prepare(`INSERT INTO stage10_media_job
    (id, package_id, operation_run_id, stage_instance_id, provider_idempotency_key,
     callback_token_hash, state, error_code, created_at, updated_at)
    VALUES ('attempt-1', 'package-1', 'run-1', 'stage-10', ?, ?, 'FAILED', ?, ?, ?)`)
    .run("a".repeat(64), "b".repeat(64), errorCode,
      "2026-08-31T00:00:00.000Z", "2026-08-31T00:01:00.000Z");
  return db;
}

function insertRetry(db, overrides = {}) {
  const values = {
    id: "attempt-2",
    packageId: "package-1",
    operationRunId: "run-1",
    stageInstanceId: "stage-10",
    providerKey: "c".repeat(64),
    callbackHash: "d".repeat(64),
    attemptOrdinal: 2,
    retryOfJobId: "attempt-1",
    ...overrides,
  };
  db.prepare(`INSERT INTO stage10_media_job
    (id, package_id, operation_run_id, stage_instance_id, provider_idempotency_key,
     callback_token_hash, state, created_at, updated_at, attempt_ordinal, retry_of_job_id)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', '2026-08-31T01:00:00.000Z',
      '2026-08-31T01:00:00.000Z', ?, ?)`)
    .run(values.id, values.packageId, values.operationRunId, values.stageInstanceId,
      values.providerKey, values.callbackHash, values.attemptOrdinal, values.retryOfJobId);
}

describe("migration 0015 Stage 10 failed retry", () => {
  test("routes commands through the latest bounded attempt and fails closed", () => {
    assert.match(stage10Domain, /STAGE_10_RETRYABLE_ERROR_CODES/u);
    assert.match(stage10Domain, /attemptOrdinal >= 2/u);
    assert.match(stage10Domain, /retryOfJobId/u);
    assert.match(stage10Domain, /TRACK_G_STAGE_10_JOB_RETRY_NOT_ALLOWED/u);
    assert.match(operatorRuntime, /orderBy\(desc\(stage10MediaJobs\.attemptOrdinal\)\)/u);
    assert.match(operatorRuntime, /stage10Job\.attemptOrdinal === 1/u);
  });

  test("preserves attempt one and appends exactly one retry after an eligible failure", () => {
    const db = fixture();
    applyMigration(db);

    const first = db.prepare("SELECT attempt_ordinal, retry_of_job_id FROM stage10_media_job").get();
    assert.deepEqual({ ...first }, { attempt_ordinal: 1, retry_of_job_id: null });
    insertRetry(db);
    const attempts = db.prepare(`SELECT id, state, attempt_ordinal, retry_of_job_id
      FROM stage10_media_job ORDER BY attempt_ordinal`).all();
    assert.deepEqual(attempts.map((attempt) => ({ ...attempt })), [
      { id: "attempt-1", state: "FAILED", attempt_ordinal: 1, retry_of_job_id: null },
      { id: "attempt-2", state: "PENDING", attempt_ordinal: 2, retry_of_job_id: "attempt-1" },
    ]);
    assert.throws(() => insertRetry(db, { id: "attempt-2-copy", providerKey: "e".repeat(64) }),
      /UNIQUE|STAGE10_RETRY_CONTRACT_VIOLATION/u);
    db.exec("UPDATE stage10_media_job SET state = 'FAILED', error_code = 'MEDIA_TOOL_FAILED' WHERE id = 'attempt-2'");
    assert.throws(() => insertRetry(db, { id: "attempt-3", attemptOrdinal: 3,
      retryOfJobId: "attempt-2", providerKey: "f".repeat(64) }), /CHECK constraint failed/u);
  });

  test("rejects gaps, cross-run retries and terminal media failures", () => {
    for (const overrides of [
      { attemptOrdinal: 3 },
      { operationRunId: "run-2" },
      { retryOfJobId: null },
    ]) {
      const db = fixture();
      applyMigration(db);
      assert.throws(() => insertRetry(db, overrides), /STAGE10_RETRY_CONTRACT_VIOLATION/u);
    }

    const terminal = fixture("PHONEME_MISMATCH_GATE_FAILED");
    applyMigration(terminal);
    assert.throws(() => insertRetry(terminal), /STAGE10_RETRY_CONTRACT_VIOLATION/u);
  });
});
