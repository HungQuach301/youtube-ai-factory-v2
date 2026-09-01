import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0020_stage12_attempt_three.sql", import.meta.url),
  "utf8",
);

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE production_package (id text PRIMARY KEY);
  CREATE TABLE operation_run (id text PRIMARY KEY);
  CREATE TABLE stage12_media_job (
    id text PRIMARY KEY NOT NULL,
    package_id text NOT NULL,
    operation_run_id text NOT NULL,
    stage_instance_id text NOT NULL,
    idempotency_key text NOT NULL CHECK (length(idempotency_key) = 64),
    callback_token_hash text NOT NULL CHECK (length(callback_token_hash) = 64),
    state text NOT NULL CHECK (state IN ('PENDING', 'READY', 'FAILED')),
    receipt_r2_key text,
    receipt_sha256 text,
    worker_image_digest text,
    error_code text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    attempt_ordinal integer NOT NULL CHECK (attempt_ordinal BETWEEN 1 AND 2),
    retry_of_job_id text,
    FOREIGN KEY (package_id) REFERENCES production_package(id),
    FOREIGN KEY (operation_run_id) REFERENCES operation_run(id)
  );
  CREATE UNIQUE INDEX stage12_media_job_package_attempt_unique
    ON stage12_media_job (package_id, attempt_ordinal);
  CREATE UNIQUE INDEX stage12_media_job_retry_of_unique
    ON stage12_media_job (retry_of_job_id) WHERE retry_of_job_id IS NOT NULL;
  CREATE UNIQUE INDEX stage12_media_job_key_unique
    ON stage12_media_job (idempotency_key);
  INSERT INTO production_package VALUES ('pkg');
  INSERT INTO operation_run VALUES ('run');`);
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

function applyMigration(db: DatabaseSync) {
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

describe("migration 0020 Stage 12 attempt three", () => {
  test("preserves attempts one and two and permits only one eligible attempt three", () => {
    const db = database();
    insert(db, { id: "attempt-1", attempt: 1, retryOf: null,
      state: "FAILED", error: "MEDIA_TOOL_FAILED" });
    insert(db, { id: "attempt-2", attempt: 2, retryOf: "attempt-1",
      state: "FAILED", error: "STAGE12_RENDER_FAILED" });
    applyMigration(db);
    expect(db.prepare("SELECT count(*) AS count FROM stage12_media_job").get()).toEqual({ count: 2 });
    expect(() => insert(db, { id: "attempt-3", attempt: 3, retryOf: "attempt-2",
      state: "PENDING", error: null })).not.toThrow();
    expect(() => insert(db, { id: "attempt-4", attempt: 4, retryOf: "attempt-3",
      state: "PENDING", error: null })).toThrow();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("rejects attempt three when attempt two did not fail with a runtime code", () => {
    const db = database();
    insert(db, { id: "attempt-1", attempt: 1, retryOf: null,
      state: "FAILED", error: "MEDIA_TOOL_FAILED" });
    insert(db, { id: "attempt-2", attempt: 2, retryOf: "attempt-1",
      state: "FAILED", error: "TRACK_G_STAGE_12_QA_FAILED" });
    applyMigration(db);
    expect(() => insert(db, { id: "attempt-3", attempt: 3, retryOf: "attempt-2",
      state: "PENDING", error: null })).toThrow(/STAGE12_RETRY_CONTRACT_VIOLATION/u);
  });
});
