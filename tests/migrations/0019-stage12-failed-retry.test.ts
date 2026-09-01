import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0019_stage12_failed_retry.sql", import.meta.url),
  "utf8",
);

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE stage12_media_job (
    id text PRIMARY KEY NOT NULL,
    package_id text NOT NULL,
    operation_run_id text NOT NULL,
    stage_instance_id text NOT NULL,
    idempotency_key text NOT NULL,
    callback_token_hash text NOT NULL,
    state text NOT NULL,
    receipt_r2_key text,
    receipt_sha256 text,
    worker_image_digest text,
    error_code text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE UNIQUE INDEX stage12_media_job_package_unique
    ON stage12_media_job (package_id);
  CREATE UNIQUE INDEX stage12_media_job_key_unique
    ON stage12_media_job (idempotency_key);`);
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
  return db;
}

const insert = (db: DatabaseSync, values: {
  id: string; attempt: number; retryOf: string | null; state: string; error: string | null;
}) => db.prepare(`INSERT INTO stage12_media_job
  (id, package_id, operation_run_id, stage_instance_id, attempt_ordinal,
   retry_of_job_id, idempotency_key, callback_token_hash, state, error_code,
   created_at, updated_at)
  VALUES (?, 'pkg', 'run', 's12', ?, ?, ?, ?, ?, ?, 'now', 'now')`).run(
  values.id, values.attempt, values.retryOf, values.id.padEnd(64, "a").slice(0, 64),
  values.id.padEnd(64, "b").slice(0, 64), values.state, values.error,
);

describe("migration 0019 Stage 12 failed retry", () => {
  test("allows one append-only retry after an eligible failure", () => {
    const db = database();
    insert(db, { id: "attempt-1", attempt: 1, retryOf: null,
      state: "FAILED", error: "MEDIA_TOOL_FAILED" });
    expect(() => insert(db, { id: "attempt-2", attempt: 2, retryOf: "attempt-1",
      state: "PENDING", error: null })).not.toThrow();
    expect(() => insert(db, { id: "attempt-3", attempt: 3, retryOf: "attempt-2",
      state: "PENDING", error: null })).toThrow();
  });

  test("rejects retry after a non-runtime failure", () => {
    const db = database();
    insert(db, { id: "attempt-1", attempt: 1, retryOf: null,
      state: "FAILED", error: "TRACK_G_STAGE_12_QA_FAILED" });
    expect(() => insert(db, { id: "attempt-2", attempt: 2, retryOf: "attempt-1",
      state: "PENDING", error: null })).toThrow(/STAGE12_RETRY_CONTRACT_VIOLATION/u);
  });
});
