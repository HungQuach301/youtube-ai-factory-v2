import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const migration0014 = readFileSync(
  new URL("../../drizzle/0014_stage10_command_contract.sql", import.meta.url),
  "utf8",
);
const migration0018 = readFileSync(
  new URL("../../drizzle/0018_stage12_command_contract_allowlist.sql", import.meta.url),
  "utf8",
);

function applyMigration(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function insertCommand(
  db: DatabaseSync,
  commandType: string,
  prevState: string,
  nextState: string,
) {
  db.prepare(`INSERT INTO command_log
    (command_type, idempotency_key, prev_state, next_state)
    VALUES (?, ?, ?, ?)`).run(commandType, "a".repeat(64), prevState, nextState);
}

describe("migration 0018 Stage 12 command contract allowlist", () => {
  test("preserves fail-closed validation while admitting exact Stage 12 transitions", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE command_log (
      command_type text NOT NULL,
      idempotency_key text NOT NULL,
      prev_state text,
      next_state text NOT NULL
    );
    CREATE TRIGGER command_log_validate_insert
    BEFORE INSERT ON command_log
    BEGIN SELECT RAISE(ABORT, 'legacy-placeholder'); END;`);

    applyMigration(db, migration0014);
    expect(() => insertCommand(
      db,
      "START_TRACK_G_VIDEO_1_STAGE_12",
      "TRACK_G_VIDEO_1_STAGE_12_READY",
      "TRACK_G_VIDEO_1_STAGE_12_PENDING",
    )).toThrow(/COMMAND_CONTRACT_VIOLATION/u);

    applyMigration(db, migration0018);
    expect(() => insertCommand(
      db,
      "START_TRACK_G_VIDEO_1_STAGE_12",
      "TRACK_G_VIDEO_1_STAGE_12_READY",
      "TRACK_G_VIDEO_1_STAGE_12_PENDING",
    )).not.toThrow();
    expect(() => insertCommand(
      db,
      "FINALIZE_TRACK_G_VIDEO_1_STAGE_12",
      "TRACK_G_VIDEO_1_STAGE_12_READY",
      "TRACK_G_VIDEO_1_STAGE_13_READY",
    )).not.toThrow();
    expect(() => insertCommand(
      db,
      "START_TRACK_G_VIDEO_1_STAGE_10",
      "TRACK_G_VIDEO_1_STAGE_10_READY",
      "TRACK_G_VIDEO_1_STAGE_10_PENDING",
    )).not.toThrow();
    expect(() => insertCommand(
      db,
      "START_TRACK_G_VIDEO_1_STAGE_12",
      "TRACK_G_VIDEO_1_STAGE_11_READY",
      "TRACK_G_VIDEO_1_STAGE_12_PENDING",
    )).toThrow(/COMMAND_CONTRACT_VIOLATION/u);
    expect(() => insertCommand(
      db,
      "UNKNOWN_COMMAND",
      "TRACK_G_VIDEO_1_STAGE_12_READY",
      "TRACK_G_VIDEO_1_STAGE_12_PENDING",
    )).toThrow(/COMMAND_CONTRACT_VIOLATION/u);
  });
});
