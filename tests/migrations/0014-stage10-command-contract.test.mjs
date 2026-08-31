import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0014_stage10_command_contract.sql", import.meta.url),
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

function insertCommand(db, commandType, prevState, nextState, suffix) {
  db.prepare(`INSERT INTO command_log
    (id, command_type, payload_json, idempotency_key, actor_identity,
     prev_state, next_state, trace_id, created_at)
    VALUES (?, ?, '{}', ?, 'owner@example.com', ?, ?, ?, '2026-08-31T00:00:00.000Z')`)
    .run(`command-${suffix}`, commandType, suffix.padEnd(64, "a"), prevState,
      nextState, `trace-${suffix}`);
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE command_log (
    id text PRIMARY KEY NOT NULL,
    command_type text NOT NULL,
    payload_json text NOT NULL,
    idempotency_key text NOT NULL,
    actor_identity text NOT NULL,
    prev_state text NOT NULL,
    next_state text NOT NULL,
    trace_id text NOT NULL,
    created_at text NOT NULL
  );
  CREATE TRIGGER command_log_validate_insert
  BEFORE INSERT ON command_log
  WHEN 0
  BEGIN SELECT RAISE(ABORT, 'OLD_TRIGGER'); END;`);
  return db;
}

describe("migration 0014 Stage 10 command contract", () => {
  test("admits only the exact durable START and FINALIZE transitions", () => {
    const db = fixture();
    applyMigration(db);

    insertCommand(db, "START_TRACK_G_VIDEO_1_STAGE_10",
      "TRACK_G_VIDEO_1_STAGE_10_READY", "TRACK_G_VIDEO_1_STAGE_10_PENDING", "start");
    insertCommand(db, "FINALIZE_TRACK_G_VIDEO_1_STAGE_10",
      "TRACK_G_VIDEO_1_STAGE_10_READY", "TRACK_G_VIDEO_1_STAGE_11_READY", "finalize");

    assert.throws(() => insertCommand(db, "START_TRACK_G_VIDEO_1_STAGE_10",
      "TRACK_G_VIDEO_1_STAGE_10_READY", "TRACK_G_VIDEO_1_STAGE_11_READY", "bad-start"),
    /COMMAND_CONTRACT_VIOLATION/u);
    assert.throws(() => insertCommand(db, "FINALIZE_TRACK_G_VIDEO_1_STAGE_10",
      "TRACK_G_VIDEO_1_STAGE_10_PENDING", "TRACK_G_VIDEO_1_STAGE_11_READY", "bad-finalize"),
    /COMMAND_CONTRACT_VIOLATION/u);
  });

  test("preserves legacy commands, unknown-command denial, and repeatable application", () => {
    const db = fixture();
    applyMigration(db);
    applyMigration(db);

    insertCommand(db, "PREPARE_CHANNEL", "HP01_SEALED", "CHANNEL_PREPARED", "legacy");
    assert.throws(() => insertCommand(db, "UNREGISTERED_COMMAND",
      "ANY", "ANY", "unknown"), /COMMAND_CONTRACT_VIOLATION/u);
  });
});
