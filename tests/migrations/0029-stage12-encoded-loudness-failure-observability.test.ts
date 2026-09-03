import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import { parseStage12EncodedLoudnessFailureDiagnostic } from
  "../../sites/control-plane/app/stage12-pre-master.js";

const ordinalThreeMigration = readFileSync(
  new URL(
    "../../sites/control-plane/drizzle/0028_stage12_audio_p0_correction_ordinal_three.sql",
    import.meta.url,
  ),
  "utf8",
);
const observabilityMigration = readFileSync(
  new URL(
    "../../sites/control-plane/drizzle/0029_stage12_encoded_loudness_failure_observability.sql",
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

function measurementsByPass() {
  return JSON.stringify([
    { correctionPass: 0, phase: "INITIAL_ENCODED_MEASUREMENT", integratedLufs: -14.51,
      truePeakDbtp: -0.9, loudnessRangeLu: 3,
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"] },
    { correctionPass: 1, phase: "POST_CORRECTION_PASS", integratedLufs: -14.2,
      truePeakDbtp: -1.3, loudnessRangeLu: 3.4,
      failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
    { correctionPass: 2, phase: "POST_CORRECTION_PASS", integratedLufs: -13.9,
      truePeakDbtp: -1.5, loudnessRangeLu: 3.8,
      failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
    { correctionPass: 3, phase: "FINAL_POST_ENCODE_VERIFICATION", integratedLufs: -13.8,
      truePeakDbtp: -0.8, loudnessRangeLu: 3.9,
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"] },
  ]);
}

function failureDiagnostic() {
  const measurements = JSON.parse(measurementsByPass()) as unknown[];
  return {
    schemaVersion: 1,
    boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
    correctionPass: 3,
    correctionPassLimit: 3,
    measurementsByPass: measurements,
    finalMeasurements: { integratedLufs: -13.8, truePeakDbtp: -0.8, loudnessRangeLu: 3.9 },
    failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
    workerImageDigest: `sha256:${hex("f")}`,
  };
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE command_log (
      id text PRIMARY KEY, command_type text NOT NULL, idempotency_key text NOT NULL,
      prev_state text, next_state text
    );
    CREATE TRIGGER command_log_validate_insert
    BEFORE INSERT ON command_log
    BEGIN SELECT RAISE(ABORT, 'LEGACY_TRIGGER_MUST_BE_REPLACED'); END;
    CREATE TABLE stage12_media_job (id text PRIMARY KEY, attempt_ordinal integer NOT NULL);
    CREATE TABLE stage12_audio_p0_correction_job (
      id text PRIMARY KEY, stage12_job_id text NOT NULL, correction_ordinal integer NOT NULL,
      state text NOT NULL, corrected_pre_master_r2_key text,
      corrected_pre_master_sha256 text, corrected_pre_master_byte_length integer,
      receipt_sha256 text, outcome text, failures_json text, measurements_json text,
      provider_call_count integer NOT NULL, provider_dispatch text NOT NULL,
      auto_publish text NOT NULL
    );
    INSERT INTO stage12_media_job VALUES ('job-3', 3);
    INSERT INTO stage12_audio_p0_correction_job VALUES (
      'correction-2','job-3',2,'READY','prod/audio-p0/${hex("a")}.webm','${hex("a")}',
      16795484,'${hex("b")}','FAIL',
      '["CONTROL_CONTRACT","TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.9,"loudnessRangeLu":3,"p0DefectCount":1}',
      0,'OFF','OFF'
    );`);
  apply(db, ordinalThreeMigration);
  db.exec(`INSERT INTO stage12_audio_p0_correction_retry_job
    (id, predecessor_correction_job_id, stage12_job_id, correction_ordinal,
     correction_strategy_version, retry_reason_code, idempotency_key, callback_token_hash,
     actor_identity, owner_approval_text, state, source_pre_master_r2_key,
     source_pre_master_sha256, source_pre_master_byte_length, source_receipt_sha256)
    VALUES ('correction-3','correction-2','job-3',3,3,
      'STAGE12_AUDIO_P0_ENCODED_QA_FAIL','${hex("c")}','${hex("d")}',
      'owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION','PENDING',
      'prod/audio-p0/${hex("a")}.webm','${hex("a")}',16795484,'${hex("b")}');
    UPDATE stage12_audio_p0_correction_retry_job
      SET state='FAILED', error_code='STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
      WHERE id='correction-3';`);
  apply(db, observabilityMigration);
  return db;
}

function insertEvidence(db: DatabaseSync, overrides: {
  finalIntegratedLufs?: number;
  finalTruePeakDbtp?: number;
  finalLoudnessRangeLu?: number;
  failedPredicatesJson?: string;
  sourceSha256?: string;
} = {}) {
  db.prepare(`INSERT INTO stage12_audio_p0_correction_failure_evidence
    (id, correction_job_id, stage12_job_id, correction_ordinal,
     correction_strategy_version, error_code, failure_boundary, correction_pass,
     correction_pass_limit, measurements_by_pass_json, final_integrated_lufs,
     final_true_peak_dbtp, final_loudness_range_lu, failed_predicates_json,
     worker_image_digest, source_pre_master_r2_key, source_pre_master_sha256,
     source_pre_master_byte_length, source_receipt_sha256)
    VALUES (?, 'correction-3', 'job-3', 3, 3, 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED',
      'FINAL_POST_ENCODE_LOUDNESS_VERIFICATION', 3, 3, ?, ?, ?, ?, ?, ?,
      'prod/audio-p0/${hex("a")}.webm', ?, 16795484, '${hex("b")}')`)
    .run(hex("e"), measurementsByPass(), overrides.finalIntegratedLufs ?? -13.8,
      overrides.finalTruePeakDbtp ?? -0.8, overrides.finalLoudnessRangeLu ?? 3.9,
      overrides.failedPredicatesJson
        ?? '["TRUE_PEAK_DBTP_ABOVE_MAX","LOUDNESS_RANGE_LU_BELOW_MIN"]',
      `sha256:${hex("f")}`, overrides.sourceSha256 ?? hex("a"));
}

describe("migration 0029 Stage 12 encoded-loudness failure observability", () => {
  test("accepts only a complete threshold-consistent ordinal-3 diagnostic", () => {
    expect(parseStage12EncodedLoudnessFailureDiagnostic(failureDiagnostic()))
      .toMatchObject({ correctionPass: 3, correctionPassLimit: 3,
        finalMeasurements: { integratedLufs: -13.8, truePeakDbtp: -0.8,
          loudnessRangeLu: 3.9 } });
    for (const candidate of [
      { ...failureDiagnostic(), correctionPass: 2 },
      { ...failureDiagnostic(), finalMeasurements: {
        integratedLufs: -14, truePeakDbtp: -0.8, loudnessRangeLu: 3.9,
      } },
      { ...failureDiagnostic(), failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { ...failureDiagnostic(), workerImageDigest: "sha256:unknown" },
    ]) {
      expect(() => parseStage12EncodedLoudnessFailureDiagnostic(candidate))
        .toThrow(/STAGE12_ENCODED_LOUDNESS_FAILURE_DIAGNOSTIC_INVALID/u);
    }
  });

  test("adds no guessed backfill and preserves the existing ordinal-2/3 history", () => {
    const db = fixture();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_audio_p0_correction_failure_evidence")
      .get()).toEqual({ count: 0 });
    expect(db.prepare(`SELECT state, error_code, source_pre_master_sha256,
      corrected_pre_master_sha256 FROM stage12_audio_p0_correction_retry_job`).get())
      .toEqual({ state: "FAILED", error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
        source_pre_master_sha256: hex("a"), corrected_pre_master_sha256: null });
  });

  test("seals exact per-pass and final failure measurements append-only", () => {
    const db = fixture();
    insertEvidence(db);
    const row = db.prepare(`SELECT correction_pass, correction_pass_limit,
      final_integrated_lufs, final_true_peak_dbtp, final_loudness_range_lu,
      failed_predicates_json, worker_image_digest, source_pre_master_sha256
      FROM stage12_audio_p0_correction_failure_evidence`).get();
    expect(row).toEqual({ correction_pass: 3, correction_pass_limit: 3,
      final_integrated_lufs: -13.8, final_true_peak_dbtp: -0.8,
      final_loudness_range_lu: 3.9,
      failed_predicates_json:
        '["TRUE_PEAK_DBTP_ABOVE_MAX","LOUDNESS_RANGE_LU_BELOW_MIN"]',
      worker_image_digest: `sha256:${hex("f")}`, source_pre_master_sha256: hex("a") });
    expect(() => db.exec(`UPDATE stage12_audio_p0_correction_failure_evidence
      SET final_integrated_lufs=-14`)).toThrow(/FAILURE_EVIDENCE_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_audio_p0_correction_failure_evidence"))
      .toThrow(/FAILURE_EVIDENCE_IMMUTABLE/u);
    expect(db.prepare("SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4")
      .get()).toEqual({ count: 0 });
  });

  test("rejects mismatched final values, predicates and immutable source identity", () => {
    for (const overrides of [
      { finalIntegratedLufs: -14 },
      { failedPredicatesJson: '["LOUDNESS_RANGE_LU_BELOW_MIN"]' },
      { sourceSha256: hex("9") },
    ]) {
      const db = fixture();
      expect(() => insertEvidence(db, overrides))
        .toThrow(/STAGE12_ENCODED_LOUDNESS_FAILURE_EVIDENCE_INVALID/u);
    }
  });
});
