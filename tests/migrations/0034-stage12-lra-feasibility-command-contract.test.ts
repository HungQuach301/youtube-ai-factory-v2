import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "sites/control-plane/drizzle/0034_stage12_lra_feasibility_command_contract.sql", "utf8",
);

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE command_log (
    id TEXT PRIMARY KEY, command_type TEXT NOT NULL, payload_json TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, actor_identity TEXT NOT NULL,
    prev_state TEXT, next_state TEXT, trace_id TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TRIGGER command_log_validate_insert BEFORE INSERT ON command_log
  BEGIN SELECT RAISE(ABORT, 'OLD_TRIGGER'); END;`);
  db.exec(sql);
  return db;
}

function insert(db: DatabaseSync, id: string, commandType: string,
  prevState: string, nextState: string) {
  return db.prepare(`INSERT INTO command_log VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, commandType, "{}", id.padEnd(64, "0").slice(0, 64), "owner@example.com",
    prevState, nextState, id, new Date(0).toISOString(),
  );
}

describe("migration 0034 Stage 12 LRA feasibility command contract", () => {
  it("only replaces the command allowlist trigger", () => {
    const statements = sql.split("--> statement-breakpoint")
      .map((value) => value.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe("DROP TRIGGER command_log_validate_insert;");
    expect(statements[1]).toMatch(/^CREATE TRIGGER command_log_validate_insert/u);
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|UPDATE |DELETE FROM/u);
  });

  it("allows exactly the new feasibility transition and preserves old commands", () => {
    const db = database();
    expect(() => insert(db, "new", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING")).not.toThrow();
    expect(() => insert(db, "old", "PREPARE_CHANNEL", "EMPTY", "CHANNEL_PREPARED"))
      .not.toThrow();
    expect(() => insert(db, "bad-state",
      "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_PASS",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING"))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
    expect(() => insert(db, "unknown", "RUN_UNALLOWLISTED", "A", "B"))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
    db.close();
  });
});
