import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "sites/control-plane/drizzle/0034_stage12_lra_feasibility_command_contract.sql", "utf8",
);
const terminalSql = readFileSync(
  "sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql", "utf8",
);

function databaseBefore0034() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE command_log (
    id TEXT PRIMARY KEY, command_type TEXT NOT NULL, payload_json TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, actor_identity TEXT NOT NULL,
    prev_state TEXT, next_state TEXT, trace_id TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TRIGGER command_log_validate_insert BEFORE INSERT ON command_log
  BEGIN SELECT RAISE(ABORT, 'OLD_TRIGGER'); END;`);
  db.exec(terminalSql);
  return db;
}

function database() {
  const db = databaseBefore0034();
  db.exec(sql);
  return db;
}

function insert(db: DatabaseSync, id: string, commandType: string,
  prevState: string, nextState: string) {
  return db.prepare(`INSERT INTO command_log VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, commandType, "{}", keyFor(id), "owner@example.com",
    prevState, nextState, id, new Date(0).toISOString(),
  );
}

function keyFor(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const SOURCE_SHA256 =
  "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2";
const PARENT_EVIDENCE_ID =
  "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb";
const LRA_GUARD_EVIDENCE_ID =
  "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9";
const REQUEST_SHA256 = "a".repeat(64);
const WORKER_IMAGE_DIGEST = `sha256:${"b".repeat(64)}`;
const ALGORITHM_FINGERPRINT = "c".repeat(64);
const THRESHOLD_SNAPSHOT_SHA256 = "d".repeat(64);
const TERMINAL_RECEIPT_SHA256 = "5".repeat(64);
const RESULT_SHA256 = "6".repeat(64);
const SELECTED_CANDIDATE_SHA256 = "7".repeat(64);
const PARENT_RUNTIME_PROVENANCE_SHA256 = "8".repeat(64);
const RUNTIME_PROVENANCE_SHA256 = "9".repeat(64);
const CLOCK_BASE_MS = Date.now();
const eventTime = (offsetMs: number) => new Date(CLOCK_BASE_MS + offsetMs).toISOString();
const CLAIM_AT = eventTime(0);
const LEASE_EXPIRES_AT = eventTime(90_000);

function insertOutbox(db: DatabaseSync, commandId = "cmd",
  workerImageDigest = WORKER_IMAGE_DIGEST) {
  const key = keyFor(commandId);
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_outbox
    (idempotency_key,command_id,request_payload_json,request_sha256,
     source_attempt_ordinal,source_correction_ordinal,source_sha256,parent_evidence_id,
     lra_guard_evidence_id,expected_worker_image_digest,algorithm_fingerprint,
     threshold_snapshot_sha256,created_at) VALUES (?,?,?,?,3,2,?,?,?,?,?,?,?)`).run(
      key, commandId, "{}", REQUEST_SHA256, SOURCE_SHA256, PARENT_EVIDENCE_ID,
      LRA_GUARD_EVIDENCE_ID, workerImageDigest, ALGORITHM_FINGERPRINT,
      THRESHOLD_SNAPSHOT_SHA256, "2026-01-01T00:00:00.000Z",
    );
  return key;
}

function insertTerminalPair(db: DatabaseSync, input: {
  traceOutcome?: "PASS" | "FAIL";
  selectedCandidateSha256?: string | null;
} = {}) {
  const traceOutcome = input.traceOutcome ?? "PASS";
  const selectedCandidateSha256 = input.selectedCandidateSha256 === undefined
    ? SELECTED_CANDIDATE_SHA256 : input.selectedCandidateSha256;
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
    (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,
     parent_evidence_id,lra_guard_evidence_id,status,shadow_only,
     upload_corrected_output,provider_call_count,calibration,finalize,
     production_activation,release,auto_publish,created_at)
    VALUES (?,2,3,?,?,?,'READY',1,0,0,0,0,0,0,0,?)`).run(
      "job", SOURCE_SHA256, PARENT_EVIDENCE_ID, LRA_GUARD_EVIDENCE_ID,
      "2026-01-01T00:00:01.000Z",
    );
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_evidence
    (id,job_id,algorithm_fingerprint,threshold_snapshot_sha256,phase_budget_json,
     candidate_trace_json,selected_candidate_sha256,terminal_reason,
     evidence_semantics,created_at) VALUES (?,?,?,?,?,?,?,'PASS',?,?)`).run(
      "evidence", "job", ALGORITHM_FINGERPRINT, THRESHOLD_SNAPSHOT_SHA256,
      "{}", JSON.stringify({ outcome: traceOutcome,
        terminalReceiptSha256: TERMINAL_RECEIPT_SHA256,
        resultSha256: RESULT_SHA256,
        parentRuntimeProvenanceSha256: PARENT_RUNTIME_PROVENANCE_SHA256,
        runtimeProvenanceSha256: RUNTIME_PROVENANCE_SHA256 }),
      selectedCandidateSha256,
      "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
      "2026-01-01T00:00:01.000Z",
    );
}

function insertTerminalReceipt(db: DatabaseSync, key: string,
  resultSha256 = RESULT_SHA256, selectedCandidateSha256: string | null
    = SELECTED_CANDIDATE_SHA256) {
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_terminal_receipt
    (idempotency_key,request_sha256,fencing_token,lease_holder,
     terminal_receipt_sha256,result_sha256,job_id,evidence_id,job_status,outcome,
     terminal_reason,selected_candidate_sha256,algorithm_fingerprint,
     threshold_snapshot_sha256,worker_image_digest,parent_runtime_provenance_sha256,
     runtime_provenance_sha256,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      key, REQUEST_SHA256, 1, "holder", TERMINAL_RECEIPT_SHA256, resultSha256,
      "job", "evidence", "READY", "PASS", "PASS", selectedCandidateSha256,
      ALGORITHM_FINGERPRINT, THRESHOLD_SNAPSHOT_SHA256, WORKER_IMAGE_DIGEST,
      PARENT_RUNTIME_PROVENANCE_SHA256, RUNTIME_PROVENANCE_SHA256,
      "2026-01-01T00:00:02.000Z",
    );
}

function insertRejectedTerminal(db: DatabaseSync, key: string,
  selectedCandidateSha256: string | null = null) {
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
    (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,
     parent_evidence_id,lra_guard_evidence_id,status,shadow_only,
     upload_corrected_output,provider_call_count,calibration,finalize,
     production_activation,release,auto_publish,created_at)
    VALUES ('rejected-job',2,3,?,?,?,'FAILED',1,0,0,0,0,0,0,0,?)`).run(
      SOURCE_SHA256, PARENT_EVIDENCE_ID, LRA_GUARD_EVIDENCE_ID,
      eventTime(1_000),
    );
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_evidence
    (id,job_id,algorithm_fingerprint,threshold_snapshot_sha256,phase_budget_json,
     candidate_trace_json,selected_candidate_sha256,terminal_reason,
     evidence_semantics,created_at) VALUES
    ('rejected-evidence','rejected-job',?,?,?, ?,?,'LINEAGE_DRIFT',?,?)`).run(
      ALGORITHM_FINGERPRINT, THRESHOLD_SNAPSHOT_SHA256, "{}",
      JSON.stringify({ outcome: "FAIL", terminalReceiptSha256: TERMINAL_RECEIPT_SHA256,
        resultSha256: RESULT_SHA256,
        parentRuntimeProvenanceSha256: PARENT_RUNTIME_PROVENANCE_SHA256,
        runtimeProvenanceSha256: RUNTIME_PROVENANCE_SHA256 }),
      selectedCandidateSha256, "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
      eventTime(1_000),
    );
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_terminal_receipt
    (idempotency_key,request_sha256,fencing_token,lease_holder,
     terminal_receipt_sha256,result_sha256,job_id,evidence_id,job_status,outcome,
     terminal_reason,selected_candidate_sha256,algorithm_fingerprint,
     threshold_snapshot_sha256,worker_image_digest,parent_runtime_provenance_sha256,
     runtime_provenance_sha256,created_at)
    VALUES (?,?,?,?,?,?,'rejected-job','rejected-evidence','FAILED','FAIL',
      'LINEAGE_DRIFT',?, ?,?,?,?,?,?)`).run(
      key, REQUEST_SHA256, 1, "holder", TERMINAL_RECEIPT_SHA256, RESULT_SHA256,
      selectedCandidateSha256, ALGORITHM_FINGERPRINT, THRESHOLD_SNAPSHOT_SHA256,
      WORKER_IMAGE_DIGEST,
      PARENT_RUNTIME_PROVENANCE_SHA256, RUNTIME_PROVENANCE_SHA256, eventTime(1_000),
    );
}

function terminalEventPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ requestSha256: REQUEST_SHA256,
    terminalReceiptSha256: TERMINAL_RECEIPT_SHA256, resultSha256: RESULT_SHA256,
    jobId: "job", evidenceId: "evidence", jobStatus: "READY", outcome: "PASS",
    terminalReason: "PASS", selectedCandidateSha256: SELECTED_CANDIDATE_SHA256,
    algorithmFingerprint: ALGORITHM_FINGERPRINT,
    thresholdSnapshotSha256: THRESHOLD_SNAPSHOT_SHA256,
    workerImageDigest: WORKER_IMAGE_DIGEST,
    parentRuntimeProvenanceSha256: PARENT_RUNTIME_PROVENANCE_SHA256,
    runtimeProvenanceSha256: RUNTIME_PROVENANCE_SHA256, ...overrides });
}

function insertClaimedIntent(db: DatabaseSync) {
  insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
    "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
    "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
  const key = insertOutbox(db);
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run("claim", key, 1, "CLAIMED", 1, "holder",
    LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
  return key;
}

describe("migration 0034 Stage 12 LRA feasibility command contract", () => {
  it("extends only the reserved migration with a forward-only append-only lifecycle", () => {
    const statements = sql.split("--> statement-breakpoint")
      .map((value) => value.trim()).filter(Boolean);
    expect(statements[0]).toMatch(
      /^CREATE TABLE stage12_codec_safe_lra_feasibility_migration_guard/u,
    );
    expect(statements[1]).toMatch(
      /^CREATE TRIGGER trg_stage12_lra_feasibility_migration_guard_empty/u,
    );
    expect(statements[2]).toMatch(
      /^INSERT INTO stage12_codec_safe_lra_feasibility_migration_guard/u,
    );
    expect(statements[5]).toBe("DROP TRIGGER command_log_validate_insert;");
    expect(statements[6]).toMatch(/^CREATE TRIGGER command_log_validate_insert/u);
    expect(sql).toMatch(/STAGE12_LRA_FEASIBILITY_PREEXISTING_STATE/u);
    expect(sql).toMatch(/CREATE TABLE stage12_codec_safe_lra_feasibility_dispatch_outbox/u);
    expect(sql).toMatch(/CREATE TABLE stage12_codec_safe_lra_feasibility_dispatch_event/u);
    expect(sql).toMatch(/CREATE TABLE stage12_codec_safe_lra_feasibility_terminal_receipt/u);
    expect(sql).toMatch(/stage12_lra_feasibility_dispatch_outbox_lineage_unique/u);
    expect(sql).toMatch(/stage12_lra_feasibility_dispatch_event_terminal_unique/u);
    expect(sql).toMatch(/DISPATCH_REJECTED/u);
    expect(sql).toMatch(/STAGE12_LRA_FEASIBILITY_OUTBOX_IMMUTABLE/u);
    expect(sql).toMatch(/STAGE12_LRA_FEASIBILITY_DISPATCH_EVENT_IMMUTABLE/u);
    expect(sql).toMatch(/STAGE12_LRA_FEASIBILITY_TERMINAL_RECEIPT_IMMUTABLE/u);
    expect(sql).not.toMatch(/ALTER TABLE|UPDATE\s+\w+\s+SET|DELETE FROM/u);
  });

  it("aborts before gateway changes when any sealed 0033 feasibility state exists", () => {
    const db = databaseBefore0034();
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
      (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,
       parent_evidence_id,lra_guard_evidence_id,status,shadow_only,
       upload_corrected_output,provider_call_count,calibration,finalize,
       production_activation,release,auto_publish,created_at)
      VALUES ('legacy',2,3,?,?,?,'FAILED',1,0,0,0,0,0,0,0,?)`).run(
        SOURCE_SHA256, PARENT_EVIDENCE_ID, LRA_GUARD_EVIDENCE_ID,
        "2026-01-01T00:00:00.000Z",
      );

    expect(() => db.exec(sql)).toThrow(/STAGE12_LRA_FEASIBILITY_PREEXISTING_STATE/u);
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type='table'
        AND name='stage12_codec_safe_lra_feasibility_dispatch_outbox'`).get())
      .toBeUndefined();
    expect(() => insert(db, "still-old", "PREPARE_CHANNEL", "EMPTY", "CHANNEL_PREPARED"))
      .toThrow(/OLD_TRIGGER/u);
    db.close();
  });

  it("persists an immutable zero-state migration receipt", () => {
    const db = database();
    expect(db.prepare(`SELECT migration_id,preexisting_job_count,
      preexisting_evidence_count FROM
      stage12_codec_safe_lra_feasibility_migration_guard`).get()).toEqual({
      migration_id: 34, preexisting_job_count: 0, preexisting_evidence_count: 0,
    });
    expect(() => db.prepare(`UPDATE stage12_codec_safe_lra_feasibility_migration_guard
      SET checked_at='forged' WHERE migration_id=34`).run())
      .toThrow(/MIGRATION_GUARD_IMMUTABLE/u);
    expect(() => db.prepare(`DELETE FROM stage12_codec_safe_lra_feasibility_migration_guard
      WHERE migration_id=34`).run()).toThrow(/MIGRATION_GUARD_IMMUTABLE/u);
    db.close();
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

  it("enforces one live claim and rejects absent reconciliation before DB-clock expiry", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = keyFor("cmd");
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_outbox
      (idempotency_key,command_id,request_payload_json,request_sha256,
       source_attempt_ordinal,source_correction_ordinal,source_sha256,parent_evidence_id,
       lra_guard_evidence_id,expected_worker_image_digest,algorithm_fingerprint,
       threshold_snapshot_sha256,created_at) VALUES (?,?,?,?,3,2,?,?,?,?,?,?,?)`).run(
        key, "cmd", "{}", "a".repeat(64),
        "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2",
        "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb",
        "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9",
        `sha256:${"b".repeat(64)}`, "c".repeat(64), "d".repeat(64),
        "2026-01-01T00:00:00.000Z",
      );
    const event = db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      (id,idempotency_key,event_ordinal,event_type,fencing_token,lease_holder,
       lease_expires_at,payload_json,payload_sha256,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`);
    event.run("claim-1", key, 1, "CLAIMED", 1, "holder-1",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    expect(() => event.run("claim-race", key, 2, "CLAIMED", 2, "holder-2",
      eventTime(90_001), "{}", "f".repeat(64), eventTime(1)))
      .toThrow(/LEASE_HELD/u);
    event.run("present-1", key, 2, "RECONCILED_PRESENT", 1, "holder-1",
      null, "{}", "0".repeat(64), eventTime(2));
    expect(() => event.run("early-absent", key, 3, "RECONCILED_EXPIRED", 1,
      "holder-1", null, "{}", "1".repeat(64),
      eventTime(3))).toThrow(/LEASE_NOT_EXPIRED/u);
    expect(() => event.run("claim-before-absent", key, 3, "CLAIMED", 2,
      "holder-2", eventTime(90_004), "{}", "2".repeat(64), eventTime(4)))
      .toThrow(/LEASE_HELD/u);
    expect(db.prepare(`SELECT fencing_token,event_type FROM
      stage12_codec_safe_lra_feasibility_dispatch_event ORDER BY event_ordinal`).all())
      .toEqual([
        { fencing_token: 1, event_type: "CLAIMED" },
        { fencing_token: 1, event_type: "RECONCILED_PRESENT" },
      ]);
    db.close();
  });

  it("rejects null or missing observedState in an expired-fence closure", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = insertOutbox(db);
    const transition = sql.split("--> statement-breakpoint")
      .map((value) => value.trim()).find((value) => value.startsWith(
        "CREATE TRIGGER trg_stage12_lra_feasibility_dispatch_event_transition",
      ));
    expect(transition).toBeDefined();
    db.exec("DROP TRIGGER trg_stage12_lra_feasibility_dispatch_event_transition");
    const expiredCreatedAt = new Date(Date.now() - 91_000).toISOString();
    const expiredLeaseAt = new Date(Date.parse(expiredCreatedAt) + 90_000).toISOString();
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("expired-claim", key, 1, "CLAIMED", 1,
      "holder", expiredLeaseAt, "{}", "e".repeat(64), expiredCreatedAt);
    db.exec(transition!);
    const observedAt = new Date().toISOString();
    const validFields = `"observedAt":"${observedAt}","requestSha256":"${REQUEST_SHA256}",`
      + `"workerStatusSha256":"${"f".repeat(64)}"`;
    const appendExpired = db.prepare(`INSERT INTO
      stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    expect(() => appendExpired.run("null-state", key, 2, "RECONCILED_EXPIRED", 1,
      "holder", null, `{${validFields},"observedState":null}`, "1".repeat(64),
      observedAt)).toThrow(/LEASE_NOT_EXPIRED/u);
    expect(() => appendExpired.run("missing-state", key, 2, "RECONCILED_EXPIRED", 1,
      "holder", null,
      `{${validFields},"workerStatusSha256":"${"f".repeat(64)}"}`,
      "2".repeat(64), observedAt)).toThrow(/LEASE_NOT_EXPIRED/u);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM
      stage12_codec_safe_lra_feasibility_dispatch_event`).get()).toEqual({ count: 1 });
    db.close();
  });

  it("keeps outbox and dispatch events immutable", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = keyFor("cmd");
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_outbox
      (idempotency_key,command_id,request_payload_json,request_sha256,
       source_attempt_ordinal,source_correction_ordinal,source_sha256,parent_evidence_id,
       lra_guard_evidence_id,expected_worker_image_digest,algorithm_fingerprint,
       threshold_snapshot_sha256,created_at) VALUES (?,?,?,?,3,2,?,?,?,?,?,?,?)`).run(
        key, "cmd", "{}", "a".repeat(64),
        "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2",
        "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb",
        "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9",
        `sha256:${"b".repeat(64)}`, "c".repeat(64), "d".repeat(64),
        "2026-01-01T00:00:00.000Z",
      );
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("claim", key, 1, "CLAIMED", 1, "holder",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    expect(() => db.prepare(`UPDATE stage12_codec_safe_lra_feasibility_dispatch_outbox
      SET request_sha256=?`).run("f".repeat(64))).toThrow(/OUTBOX_IMMUTABLE/u);
    expect(() => db.prepare(`DELETE FROM stage12_codec_safe_lra_feasibility_dispatch_event`)
      .run()).toThrow(/DISPATCH_EVENT_IMMUTABLE/u);
    db.close();
  });

  it("binds an outbox intent to the exact command and immutable lineage", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const statement = db.prepare(`INSERT INTO
      stage12_codec_safe_lra_feasibility_dispatch_outbox
      (idempotency_key,command_id,request_payload_json,request_sha256,
       source_attempt_ordinal,source_correction_ordinal,source_sha256,parent_evidence_id,
       lra_guard_evidence_id,expected_worker_image_digest,algorithm_fingerprint,
       threshold_snapshot_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const values = [keyFor("cmd"), "cmd", "{}", "a".repeat(64), 3, 2,
      "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2",
      "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb",
      "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9",
      `sha256:${"b".repeat(64)}`, "c".repeat(64), "d".repeat(64),
      "2026-01-01T00:00:00.000Z"] as const;
    expect(() => statement.run(...values.slice(0, 6), "f".repeat(64),
      ...values.slice(7))).toThrow();
    expect(() => statement.run(keyFor("other"), ...values.slice(1)))
      .toThrow(/OUTBOX_COMMAND_INVALID/u);
    expect(() => statement.run(...values)).not.toThrow();
    expect(() => statement.run(...values)).toThrow();
    db.close();
  });

  it("permits only one outbox intent for the immutable lineage despite a different key or image", () => {
    const db = database();
    insert(db, "cmd-1", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    insert(db, "cmd-2", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    insertOutbox(db, "cmd-1");
    expect(() => insertOutbox(db, "cmd-2", `sha256:${"e".repeat(64)}`))
      .toThrow(/UNIQUE constraint failed/u);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM
      stage12_codec_safe_lra_feasibility_dispatch_outbox`).get())
      .toEqual({ count: 1 });
    db.close();
  });

  it("makes a definitive dispatch rejection terminal for the intent", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = insertOutbox(db);
    const event = db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      (id,idempotency_key,event_ordinal,event_type,fencing_token,lease_holder,
       lease_expires_at,payload_json,payload_sha256,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`);
    event.run("claim", key, 1, "CLAIMED", 1, "holder",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    insertRejectedTerminal(db, key);
    const rejectedPayload = terminalEventPayload({ jobId: "rejected-job",
      evidenceId: "rejected-evidence", jobStatus: "FAILED", outcome: "FAIL",
      terminalReason: "LINEAGE_DRIFT", selectedCandidateSha256: null });
    event.run("rejected", key, 2, "DISPATCH_REJECTED", 1, "holder", null,
      rejectedPayload, "f".repeat(64),
      eventTime(1_000));
    expect(() => event.run("absent", key, 3, "RECONCILED_EXPIRED", 1, "holder",
      null, "{}", "1".repeat(64), eventTime(2_000)))
      .toThrow(/DISPATCH_REJECTED_TERMINAL/u);
    expect(() => event.run("claim-2", key, 3, "CLAIMED", 2, "holder-2",
      eventTime(92_000), "{}", "2".repeat(64), eventTime(2_000)))
      .toThrow(/DISPATCH_REJECTED_TERMINAL/u);
    expect(() => event.run("late-callback", key, 3, "CALLBACK_TERMINAL", 1, "holder",
      null, rejectedPayload, "3".repeat(64), eventTime(2_000)))
      .toThrow(/DISPATCH_REJECTED_TERMINAL/u);
    db.close();
  });

  it("accepts a terminal callback event only beside a consistent immutable receipt", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = insertOutbox(db);
    const event = db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      (id,idempotency_key,event_ordinal,event_type,fencing_token,lease_holder,
       lease_expires_at,payload_json,payload_sha256,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`);
    event.run("claim", key, 1, "CLAIMED", 1, "holder",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    expect(() => event.run("terminal-early", key, 2, "CALLBACK_TERMINAL", 1,
      "holder", null, "{}", "f".repeat(64), eventTime(1_000)))
      .toThrow(/TERMINAL_RECEIPT_MISSING/u);

    insertTerminalPair(db);
    expect(() => insertTerminalReceipt(db, key, "0".repeat(64)))
      .toThrow(/TERMINAL_RECEIPT_INVALID/u);
    insertTerminalReceipt(db, key);
    const payload = terminalEventPayload();
    expect(() => event.run("terminal", key, 2, "CALLBACK_TERMINAL", 1,
      "holder", null, payload, "f".repeat(64), eventTime(2_000)))
      .not.toThrow();
    expect(() => db.prepare(`UPDATE stage12_codec_safe_lra_feasibility_terminal_receipt
      SET result_sha256=?`).run("0".repeat(64)))
      .toThrow(/TERMINAL_RECEIPT_IMMUTABLE/u);
    expect(() => event.run("late-dispatch", key, 3, "DISPATCH_ACCEPTED", 1,
      "holder", null, "{}", "1".repeat(64), eventTime(3_000)))
      .toThrow(/ALREADY_TERMINAL/u);
    expect(() => event.run("late-rejection", key, 3, "DISPATCH_REJECTED", 1,
      "holder", null, payload, "2".repeat(64), eventTime(3_000)))
      .toThrow(/DISPATCH_STATE_CONFLICT|UNIQUE constraint failed/u);
    db.close();
  });

  it("rejects a callback whose event payload conflicts with the bound terminal receipt", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = insertOutbox(db);
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("claim", key, 1, "CLAIMED", 1, "holder",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    insertTerminalPair(db);
    insertTerminalReceipt(db, key);
    expect(() => db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("forged", key, 2, "CALLBACK_TERMINAL", 1,
      "holder", null, terminalEventPayload({ outcome: "FAIL" }), "f".repeat(64),
      eventTime(2_000)))
      .toThrow(/TERMINAL_RECEIPT_MISSING/u);
    db.close();
  });

  it("rejects terminal receipts whose stored outcome or selected candidate poisons semantics", () => {
    const mismatchedOutcome = database();
    const mismatchKey = insertClaimedIntent(mismatchedOutcome);
    insertTerminalPair(mismatchedOutcome, { traceOutcome: "FAIL" });
    expect(() => insertTerminalReceipt(mismatchedOutcome, mismatchKey))
      .toThrow(/TERMINAL_RECEIPT_INVALID/u);
    mismatchedOutcome.close();

    const readyWithoutCandidate = database();
    const readyKey = insertClaimedIntent(readyWithoutCandidate);
    insertTerminalPair(readyWithoutCandidate, { selectedCandidateSha256: null });
    expect(() => insertTerminalReceipt(readyWithoutCandidate, readyKey, RESULT_SHA256, null))
      .toThrow(/CHECK constraint failed/u);
    readyWithoutCandidate.close();

    const failedWithCandidate = database();
    const failedKey = insertClaimedIntent(failedWithCandidate);
    expect(() => insertRejectedTerminal(failedWithCandidate, failedKey,
      SELECTED_CANDIDATE_SHA256)).toThrow(/CHECK constraint failed/u);
    failedWithCandidate.close();
  });

  it("rejects legacy PENDING jobs and permits only one terminal job for the lineage", () => {
    const db = database();
    const job = db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_job
      (id,source_correction_ordinal,historical_failure_correction_ordinal,source_sha256,
       parent_evidence_id,lra_guard_evidence_id,status,shadow_only,
       upload_corrected_output,provider_call_count,calibration,finalize,
       production_activation,release,auto_publish,created_at)
      VALUES (?,2,3,?,?,?, ?,1,0,0,0,0,0,0,0,?)`);
    const values = [SOURCE_SHA256, PARENT_EVIDENCE_ID, LRA_GUARD_EVIDENCE_ID,
      "2026-01-01T00:00:01.000Z"] as const;
    expect(() => job.run("pending", ...values.slice(0, 3), "PENDING", values[3]))
      .toThrow(/PENDING_MUST_USE_OUTBOX/u);
    expect(() => job.run("terminal-1", ...values.slice(0, 3), "FAILED", values[3]))
      .not.toThrow();
    expect(() => job.run("terminal-2", ...values.slice(0, 3), "FAILED", values[3]))
      .toThrow(/UNIQUE constraint failed/u);
    db.close();
  });

  it("pins claim leases to 90 seconds and rejects event time regression", () => {
    const db = database();
    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = insertOutbox(db);
    const event = db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const expiredCreatedAt = new Date(Date.now() - 120_000).toISOString();
    const expiredLeaseAt = new Date(Date.parse(expiredCreatedAt) + 90_000).toISOString();
    expect(() => event.run("born-expired", key, 1, "CLAIMED", 1, "holder",
      expiredLeaseAt, "{}", "e".repeat(64), expiredCreatedAt))
      .toThrow(/LEASE_ALREADY_EXPIRED/u);
    const skewedCreatedAt = new Date(Date.now() - 60_000).toISOString();
    const skewedLeaseAt = new Date(Date.parse(skewedCreatedAt) + 90_000).toISOString();
    expect(() => event.run("clock-skew", key, 1, "CLAIMED", 1, "holder",
      skewedLeaseAt, "{}", "e".repeat(64), skewedCreatedAt))
      .toThrow(/EVENT_CLOCK_DRIFT/u);
    expect(() => event.run("long", key, 1, "CLAIMED", 1, "holder",
      eventTime(600_000), "{}", "e".repeat(64), CLAIM_AT))
      .toThrow(/CHECK constraint failed/u);
    expect(() => event.run("invalid", key, 1, "CLAIMED", 1, "holder",
      "not-a-date", "{}", "e".repeat(64), "also-not-a-date"))
      .toThrow(/CHECK constraint failed/u);
    event.run("claim", key, 1, "CLAIMED", 1, "holder",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    const heartbeatOne = JSON.stringify({ heartbeatId: "1".repeat(64),
      heartbeatSequence: 1, requestSha256: REQUEST_SHA256 });
    event.run("renew-1", key, 2, "LEASE_RENEWED", 1, "holder",
      eventTime(91_000), heartbeatOne, "1".repeat(64), eventTime(1_000));
    expect(() => event.run("renew-1-replay", key, 3, "LEASE_RENEWED", 1, "holder",
      eventTime(92_000), heartbeatOne, "1".repeat(64), eventTime(2_000)))
      .toThrow(/LEASE_RENEWAL_INVALID|UNIQUE constraint failed/u);
    const heartbeatTwo = JSON.stringify({ heartbeatId: "2".repeat(64),
      heartbeatSequence: 2, requestSha256: REQUEST_SHA256 });
    expect(() => event.run("renew-wrong-sequence", key, 3, "LEASE_RENEWED", 1,
      "holder", eventTime(92_000), JSON.stringify({ heartbeatId: "2".repeat(64),
        heartbeatSequence: 3, requestSha256: REQUEST_SHA256 }), "2".repeat(64),
      eventTime(2_000))).toThrow(/LEASE_RENEWAL_INVALID/u);
    event.run("renew-2", key, 3, "LEASE_RENEWED", 1, "holder",
      eventTime(92_000), heartbeatTwo, "2".repeat(64), eventTime(2_000));
    expect(() => event.run("regressed", key, 2, "DISPATCH_AMBIGUOUS", 1, "holder",
      null, "{}", "f".repeat(64), eventTime(-1)))
      .toThrow(/EVENT_ORDINAL_INVALID|EVENT_TIME_REGRESSION/u);
    db.close();
  });

  it("rolls back command/outbox and terminal snapshots atomically on a failed batch", () => {
    const db = database();
    db.exec("BEGIN");
    try {
      insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
        "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
        "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
      insertOutbox(db, "missing-command");
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
    }
    expect(db.prepare("SELECT COUNT(*) AS count FROM command_log").get())
      .toEqual({ count: 0 });

    insert(db, "cmd", "RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL",
      "TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING");
    const key = insertOutbox(db);
    db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run("claim", key, 1, "CLAIMED", 1, "holder",
      LEASE_EXPIRES_AT, "{}", "e".repeat(64), CLAIM_AT);
    db.exec("BEGIN");
    try {
      insertTerminalPair(db);
      insertTerminalReceipt(db, key);
      db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_dispatch_event
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run("bad-terminal", key, 2,
        "CALLBACK_TERMINAL", 1, "holder", null,
        terminalEventPayload({ outcome: "FAIL" }), "f".repeat(64),
        eventTime(2_000));
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
    }
    for (const table of ["stage12_codec_safe_lra_feasibility_job",
      "stage12_codec_safe_lra_feasibility_evidence",
      "stage12_codec_safe_lra_feasibility_terminal_receipt"]) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
        .toEqual({ count: 0 });
    }
    expect(db.prepare(`SELECT COUNT(*) AS count FROM
      stage12_codec_safe_lra_feasibility_dispatch_event`).get()).toEqual({ count: 1 });
    db.close();
  });
});
