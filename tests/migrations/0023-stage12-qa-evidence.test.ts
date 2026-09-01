import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import {
  evaluateTrackGVideoOneStage12Receipt,
  type Stage12MediaReceipt,
} from "../../sites/control-plane/app/stage12-pre-master.js";

const migration = readFileSync(
  new URL("../../sites/control-plane/drizzle/0023_stage12_qa_evidence.sql", import.meta.url),
  "utf8",
);
const hex = (value: string) => value.repeat(64).slice(0, 64);

function failedReceipt(): Stage12MediaReceipt {
  return {
    accepted: true,
    imageDigest: `sha256:${hex("a")}`,
    preMaster: { r2Key: "prod/pre-master.webm", sha256: hex("b"), byteLength: 1,
      frameMd5Sha256: hex("c") },
    measurements: {
      scannedDurationSec: 510,
      blackFrameIntervalCount: 0,
      freezeFrameIntervalCount: 1,
      silenceIntervalCount: 0,
      missingFrameCount: 0,
      nearStaticViolationCount: 1,
      clippingSampleCount: 1,
      integratedLufs: -16,
      truePeakDbtp: -0.4,
      loudnessRangeLu: 2,
      avSyncOffsetMs: 0,
      mobileLegibilityPass: true,
      safeZonePass: true,
      timelineIssueCount: 0,
      debugOverlayCount: 0,
      watermarkCount: 0,
      templateResidueCount: 0,
      missingInputCount: 0,
      unresolvedRightsCount: 0,
      p0DefectCount: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      colorPrimaries: "bt709",
    },
    reportSha256: hex("d"),
    renderAuthorized: false,
    providerCallCount: 0,
    providerDispatch: "OFF",
    autoPublish: "OFF",
  };
}

describe("migration 0023 Stage 12 QA evidence", () => {
  test("returns typed failed measurements without weakening validation", () => {
    const evaluation = evaluateTrackGVideoOneStage12Receipt(failedReceipt(), 510);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toEqual([
      "CONTROL_CONTRACT", "TECHNICAL_DEFECT", "LOUDNESS", "M0_INPUT_RIGHTS_P0",
    ]);
    expect(evaluation.receipt.measurements).toMatchObject({
      freezeFrameIntervalCount: 1,
      integratedLufs: -16,
      truePeakDbtp: -0.4,
      loudnessRangeLu: 2,
    });
  });

  test("stores append-only QA evidence with provider and publish disabled", () => {
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
      BEGIN SELECT 1; END;`);
    db.exec(`INSERT INTO stage12_media_job
      (id, package_id, operation_run_id, stage_instance_id, attempt_ordinal,
       retry_of_job_id, state, error_code)
      VALUES ('job-3', 'pkg', 'run', 's12', 3, NULL, 'FAILED', 'S12QA:LOUDNESS'),
      ('job-bad', 'pkg-bad', 'run-bad', 's12', 3, NULL, 'FAILED', 'STAGE12_RENDER_FAILED')`);
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) db.exec(statement);
    }
    expect(() => db.exec(`INSERT INTO stage12_qa_diagnostic_job
      (id, stage12_job_id, idempotency_key, callback_token_hash, state)
      VALUES ('diagnostic-3', 'job-3', '${hex("e")}', '${hex("f")}', 'PENDING')`))
      .not.toThrow();
    expect(() => db.exec(`INSERT INTO stage12_qa_diagnostic_job
      (id, stage12_job_id, idempotency_key, callback_token_hash, state)
      VALUES ('diagnostic-bad', 'job-bad', '${hex("3")}', '${hex("4")}', 'PENDING')`))
      .toThrow(/STAGE12_QA_DIAGNOSTIC_SOURCE_NOT_ELIGIBLE/u);
    expect(() => db.exec("UPDATE stage12_qa_diagnostic_job SET state = 'READY' WHERE id = 'diagnostic-3'"))
      .toThrow(/STAGE12_QA_DIAGNOSTIC_RECEIPT_REQUIRED/u);
    expect(() => db.exec(`INSERT INTO command_log
      (command_type, idempotency_key, prev_state, next_state)
      VALUES ('SCAN_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3', '${hex("1")}',
      'TRACK_G_VIDEO_1_STAGE_12_FAILED', 'TRACK_G_VIDEO_1_STAGE_12_DIAGNOSTIC_PENDING')`))
      .not.toThrow();
    expect(() => db.exec(`INSERT INTO command_log
      (command_type, idempotency_key, prev_state, next_state)
      VALUES ('SCAN_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3', '${hex("2")}',
      'TRACK_G_VIDEO_1_STAGE_12_READY', 'TRACK_G_VIDEO_1_STAGE_12_DIAGNOSTIC_PENDING')`))
      .toThrow(/COMMAND_CONTRACT_VIOLATION/u);
    db.prepare(`INSERT INTO stage12_qa_evidence
      (id, job_id, source, outcome, pre_master_r2_key, pre_master_sha256,
       receipt_r2_key, receipt_sha256, worker_image_digest, report_sha256,
       failures_json, measurements_json, render_authorized, provider_call_count,
       provider_dispatch, auto_publish)
       VALUES (?, 'job-3', 'DIAGNOSTIC', 'FAIL', 'prod/pre.webm', ?,
       'prod/receipt.json', ?, ?, ?, ?, ?, 0, 0, 'OFF', 'OFF')`).run(
      "evidence-3", hex("a"), hex("b"), `sha256:${hex("c")}`, hex("d"),
      JSON.stringify(["LOUDNESS"]), JSON.stringify({ integratedLufs: -16 }),
    );
    expect(() => db.exec("UPDATE stage12_qa_evidence SET outcome = 'PASS'"))
      .toThrow(/STAGE12_QA_EVIDENCE_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_qa_evidence"))
      .toThrow(/STAGE12_QA_EVIDENCE_IMMUTABLE/u);
  });
});
