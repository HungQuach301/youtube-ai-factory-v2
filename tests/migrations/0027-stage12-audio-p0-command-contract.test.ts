import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  new URL(
    "../../sites/control-plane/drizzle/0027_stage12_audio_p0_command_contract.sql",
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

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE command_log (
    id TEXT PRIMARY KEY,
    command_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    prev_state TEXT,
    next_state TEXT
  );
  CREATE TRIGGER command_log_validate_insert
  BEFORE INSERT ON command_log
  BEGIN SELECT RAISE(ABORT, 'LEGACY_TRIGGER_MUST_BE_REPLACED'); END;`);
  apply(db, migration);
  return db;
}

function insert(
  db: DatabaseSync,
  id: string,
  commandType: string,
  prevState: string | null,
  nextState: string,
) {
  db.prepare(`INSERT INTO command_log
    (id, command_type, idempotency_key, prev_state, next_state)
    VALUES (?, ?, ?, ?, ?)`)
    .run(id, commandType, hex(id), prevState, nextState);
}

const existingCommandContract = [
  ["PREPARE_CHANNEL", null, "CHANNEL_PREPARED"],
  ["REGISTER_QUALIFIED_VOICE", null, "VOICE_QUALIFIED"],
  ["START_TRACK_G_VIDEO_1_QUALIFICATION", null, "TRACK_G_VIDEO_1_STAGE_00_READY"],
  ["START_STAGE", "TRACK_G_VIDEO_1_STAGE_00_READY", "TRACK_G_VIDEO_1_STAGE_01_READY"],
  ["PREPARE_TRACK_G_VIDEO_1_STAGE_04_TOURNAMENT", "TRACK_G_VIDEO_1_STAGE_04_READY", "TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION"],
  ["SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION", "TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION", "TRACK_G_VIDEO_1_STAGE_05_READY"],
  ["PREPARE_TRACK_G_VIDEO_1_STAGE_06_SCRIPT", "TRACK_G_VIDEO_1_STAGE_06_READY", "TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL"],
  ["APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL", "TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL", "TRACK_G_VIDEO_1_STAGE_07A_READY"],
  ["PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT", "TRACK_G_VIDEO_1_STAGE_07A_READY", "TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE"],
  ["SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE", "TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE", "TRACK_G_VIDEO_1_STAGE_07B_READY"],
  ["PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW", "TRACK_G_VIDEO_1_STAGE_09_READY", "TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL"],
  ["SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL", "TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL", "TRACK_G_VIDEO_1_STAGE_10_READY"],
  ["START_TRACK_G_VIDEO_1_STAGE_10", "TRACK_G_VIDEO_1_STAGE_10_READY", "TRACK_G_VIDEO_1_STAGE_10_PENDING"],
  ["FINALIZE_TRACK_G_VIDEO_1_STAGE_10", "TRACK_G_VIDEO_1_STAGE_10_READY", "TRACK_G_VIDEO_1_STAGE_11_READY"],
  ["START_TRACK_G_VIDEO_1_STAGE_12", "TRACK_G_VIDEO_1_STAGE_12_READY", "TRACK_G_VIDEO_1_STAGE_12_PENDING"],
  ["RECOVER_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3", "TRACK_G_VIDEO_1_STAGE_12_FAILED", "TRACK_G_VIDEO_1_STAGE_12_PENDING"],
  ["SCAN_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3", "TRACK_G_VIDEO_1_STAGE_12_FAILED", "TRACK_G_VIDEO_1_STAGE_12_DIAGNOSTIC_PENDING"],
  ["FINALIZE_TRACK_G_VIDEO_1_STAGE_12", "TRACK_G_VIDEO_1_STAGE_12_READY", "TRACK_G_VIDEO_1_STAGE_13_READY"],
] as const;

const advanceContract = [
  ["01", "02"], ["02", "03"], ["03", "04"], ["04", "05"],
  ["05", "06"], ["06", "07A"], ["07A", "07B"], ["07B", "08"],
  ["08", "09"], ["09", "10"], ["10", "11"], ["11", "12"],
  ["12", "13"], ["13", "14"], ["14", "15"],
] as const;

describe("migration 0027 Stage 12 audio/P0 command contract", () => {
  test("preserves every existing allowlisted command and transition", () => {
    const db = fixture();
    existingCommandContract.forEach(([commandType, prevState, nextState], index) => {
      expect(() => insert(db, `old${index}`, commandType, prevState, nextState)).not.toThrow();
    });
    advanceContract.forEach(([from, to], index) => {
      expect(() => insert(db, `advance${index}`, "ADVANCE_TRACK_G_VIDEO_1_STAGE",
        `TRACK_G_VIDEO_1_STAGE_${from}_READY`, `TRACK_G_VIDEO_1_STAGE_${to}_READY`))
        .not.toThrow();
    });
  });

  test("allows only the typed audio/P0 correction transition", () => {
    const db = fixture();
    expect(() => insert(db, "audio", "CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION",
      "TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING")).not.toThrow();
    expect(() => insert(db, "bad-prev", "CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION",
      "TRACK_G_VIDEO_1_STAGE_12_READY",
      "TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING"))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
    expect(() => insert(db, "bad-next", "CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION",
      "TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL",
      "TRACK_G_VIDEO_1_STAGE_13_READY"))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
  });

  test("remains fail-closed for malformed keys and unknown commands", () => {
    const db = fixture();
    expect(() => db.prepare(`INSERT INTO command_log
      (id, command_type, idempotency_key, prev_state, next_state)
      VALUES ('short-key', 'PREPARE_CHANNEL', 'short', NULL, 'CHANNEL_PREPARED')`).run())
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
    expect(() => insert(db, "unknown", "UNREGISTERED_COMMAND", "ANY", "ANY"))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
  });
});
