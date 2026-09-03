import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import { parseStage12EncodedLoudnessDiagnosticReplayResult } from
  "../../sites/control-plane/app/stage12-pre-master.js";

const migration0028 = readFileSync(new URL(
  "../../sites/control-plane/drizzle/0028_stage12_audio_p0_correction_ordinal_three.sql",
  import.meta.url,
), "utf8");
const migration0029 = readFileSync(new URL(
  "../../sites/control-plane/drizzle/0029_stage12_encoded_loudness_failure_observability.sql",
  import.meta.url,
), "utf8");
const migration0030 = readFileSync(new URL(
  "../../sites/control-plane/drizzle/0030_stage12_encoded_loudness_diagnostic_replay.sql",
  import.meta.url,
), "utf8");
const hex = (value: string) => value.repeat(64).slice(0, 64);

function apply(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function exactMeasurement(correctionPass: number, phase: string, values: {
  integratedLufs: number; integratedLufsExact: string;
  truePeakDbtp: number; truePeakDbtpExact: string;
  loudnessRangeLu: number; loudnessRangeLuExact: string;
  failedPredicates: string[];
}) {
  return { correctionPass, phase, ...values,
    audioFrameMd5Sha256: hex(String(correctionPass + 1)) };
}

function replayResult() {
  const sourceBaseline = {
    phase: "SOURCE_ORDINAL2_BASELINE",
    integratedLufs: -14.51, integratedLufsExact: "-14.51",
    truePeakDbtp: -0.9, truePeakDbtpExact: "-0.90",
    loudnessRangeLu: 3, loudnessRangeLuExact: "3.00",
    failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
    audioFrameMd5Sha256: hex("5"),
  };
  const measurementsByPass = [
    exactMeasurement(0, "INITIAL_ENCODED_MEASUREMENT", {
      integratedLufs: -14.4, integratedLufsExact: "-14.40",
      truePeakDbtp: -1.2, truePeakDbtpExact: "-1.20",
      loudnessRangeLu: 3.2, loudnessRangeLuExact: "3.20",
      failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"],
    }),
    exactMeasurement(1, "POST_CORRECTION_PASS", {
      integratedLufs: -14.1, integratedLufsExact: "-14.10",
      truePeakDbtp: -1.3, truePeakDbtpExact: "-1.30",
      loudnessRangeLu: 3.6, loudnessRangeLuExact: "3.60",
      failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"],
    }),
    exactMeasurement(2, "POST_CORRECTION_PASS", {
      integratedLufs: -13.9, integratedLufsExact: "-13.90",
      truePeakDbtp: -1.4, truePeakDbtpExact: "-1.40",
      loudnessRangeLu: 3.8, loudnessRangeLuExact: "3.80",
      failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"],
    }),
    exactMeasurement(3, "FINAL_POST_ENCODE_VERIFICATION", {
      integratedLufs: -13.8, integratedLufsExact: "-13.80",
      truePeakDbtp: -0.8, truePeakDbtpExact: "-0.80",
      loudnessRangeLu: 3.9, loudnessRangeLuExact: "3.90",
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
    }),
  ];
  return {
    accepted: true, schemaVersion: 1,
    evidenceSemantics: "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL",
    boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
    source: { correctionOrdinal: 2, correctionJobId: "correction-2",
      r2Key: `prod/audio-p0/${hex("a")}.webm`, sha256: hex("a"), byteLength: 16_795_484,
      receiptSha256: hex("b") },
    historicalFailure: { correctionOrdinal: 3, correctionJobId: "correction-3",
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
    sourceBaseline, measurementsByPass,
    terminalCorrectionPass: 3,
    finalMeasurements: { integratedLufs: -13.8, integratedLufsExact: "-13.80",
      truePeakDbtp: -0.8, truePeakDbtpExact: "-0.80",
      loudnessRangeLu: 3.9, loudnessRangeLuExact: "3.90" },
    failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
    replayOutcome: "FAIL",
    workerImageDigest: `sha256:${hex("9")}`,
    expectedWorkerImageDigest: `sha256:${hex("9")}`,
    algorithmFingerprint: hex("3"), thresholdSnapshotSha256: hex("4"),
    runtimeProvenance: { ffmpegVersion: "ffmpeg version 7.1.1",
      ffmpegBuildFingerprint: hex("6"), libopusEncoderFingerprint: hex("7") },
    correctionStrategyVersion: 3, correctionPassLimit: 3,
    correctedOutputUploaded: false, historicalBackfill: false,
    providerCallCount: 0, providerDispatch: "OFF", calibration: false,
    finalize: false, releaseEligible: false, autoPublish: "OFF",
  };
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE command_log (
      id text PRIMARY KEY, command_type text NOT NULL, idempotency_key text NOT NULL,
      prev_state text, next_state text
    );
    CREATE TRIGGER command_log_validate_insert BEFORE INSERT ON command_log
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
    INSERT INTO stage12_media_job VALUES ('job-3',3);
    INSERT INTO stage12_audio_p0_correction_job VALUES (
      'correction-2','job-3',2,'READY','prod/audio-p0/${hex("a")}.webm','${hex("a")}',
      16795484,'${hex("b")}','FAIL',
      '["CONTROL_CONTRACT","TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.9,"loudnessRangeLu":3,"p0DefectCount":1}',
      0,'OFF','OFF');`);
  apply(db, migration0028);
  db.exec(`INSERT INTO stage12_audio_p0_correction_retry_job
    (id, predecessor_correction_job_id, stage12_job_id, correction_ordinal,
     correction_strategy_version, retry_reason_code, idempotency_key, callback_token_hash,
     actor_identity, owner_approval_text, state, source_pre_master_r2_key,
     source_pre_master_sha256, source_pre_master_byte_length, source_receipt_sha256)
    VALUES ('correction-3','correction-2','job-3',3,3,
      'STAGE12_AUDIO_P0_ENCODED_QA_FAIL','${hex("c")}','${hex("d")}',
      'owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION','PENDING',
      'prod/audio-p0/${hex("a")}.webm','${hex("a")}',16795484,'${hex("b")}');
    UPDATE stage12_audio_p0_correction_retry_job SET state='FAILED',
      error_code='STAGE12_ENCODED_LOUDNESS_UNRESOLVED' WHERE id='correction-3';`);
  apply(db, migration0029);
  apply(db, migration0030);
  return db;
}

function insertReplayJob(db: DatabaseSync, overrides: { sourceSha256?: string;
  expectedWorkerImageDigest?: string } = {}) {
  db.prepare(`INSERT INTO stage12_encoded_loudness_diagnostic_replay_job
    (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,idempotency_key,
     callback_token_hash,actor_identity,owner_approval_text,state,evidence_semantics,
     source_pre_master_r2_key,source_pre_master_sha256,source_pre_master_byte_length,
     source_receipt_sha256,correction_strategy_version,correction_pass_limit,
     expected_worker_image_digest,algorithm_fingerprint,threshold_snapshot_sha256)
    VALUES ('replay-1','job-3','correction-2','correction-3','${hex("e")}','${hex("f")}',
      'owner@example.com','RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY','PENDING',
      'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL','prod/audio-p0/${hex("a")}.webm',?,
      16795484,'${hex("b")}',3,3,?,'${hex("3")}','${hex("4")}')`)
    .run(overrides.sourceSha256 ?? hex("a"),
      overrides.expectedWorkerImageDigest ?? `sha256:${hex("9")}`);
}

function insertEvidence(db: DatabaseSync, result = replayResult()) {
  db.prepare(`INSERT INTO stage12_encoded_loudness_diagnostic_replay_evidence
    (id,replay_job_id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     evidence_semantics,source_baseline_json,measurements_by_pass_json,terminal_correction_pass,
     final_integrated_lufs,final_integrated_lufs_exact,final_true_peak_dbtp,
     final_true_peak_dbtp_exact,final_loudness_range_lu,final_loudness_range_lu_exact,
     failed_predicates_json,replay_outcome,expected_worker_image_digest,worker_image_digest,
     algorithm_fingerprint,threshold_snapshot_sha256,ffmpeg_version,
     ffmpeg_build_fingerprint,libopus_encoder_fingerprint,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256)
    VALUES ('evidence-1','replay-1','job-3','correction-2','correction-3',
      ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,
      'prod/audio-p0/${hex("a")}.webm','${hex("a")}',16795484,
      '${hex("b")}')`)
    .run(result.evidenceSemantics, JSON.stringify(result.sourceBaseline),
      JSON.stringify(result.measurementsByPass), result.terminalCorrectionPass,
      result.finalMeasurements.integratedLufs, result.finalMeasurements.integratedLufsExact,
      result.finalMeasurements.truePeakDbtp, result.finalMeasurements.truePeakDbtpExact,
      result.finalMeasurements.loudnessRangeLu, result.finalMeasurements.loudnessRangeLuExact,
      JSON.stringify(result.failedPredicates), result.replayOutcome,
      result.expectedWorkerImageDigest, result.workerImageDigest,
      result.algorithmFingerprint, result.thresholdSnapshotSha256,
      result.runtimeProvenance.ffmpegVersion, result.runtimeProvenance.ffmpegBuildFingerprint,
      result.runtimeProvenance.libopusEncoderFingerprint);
}

describe("migration 0030 Stage 12 encoded-loudness diagnostic replay", () => {
  test("adds no backfill and preserves immutable ordinal-2/3 history", () => {
    const db = fixture();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_encoded_loudness_diagnostic_replay_job")
      .get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT count(*) AS count FROM stage12_encoded_loudness_diagnostic_replay_evidence")
      .get()).toEqual({ count: 0 });
    expect(db.prepare(`SELECT state,outcome,corrected_pre_master_sha256
      FROM stage12_audio_p0_correction_job WHERE id='correction-2'`).get())
      .toEqual({ state: "READY", outcome: "FAIL", corrected_pre_master_sha256: hex("a") });
    expect(db.prepare(`SELECT state,error_code,corrected_pre_master_sha256
      FROM stage12_audio_p0_correction_retry_job WHERE id='correction-3'`).get())
      .toEqual({ state: "FAILED", error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
        corrected_pre_master_sha256: null });
  });

  test("accepts only exact ordinal-2/3 lineage and the typed command transition", () => {
    const db = fixture();
    insertReplayJob(db);
    expect(() => insertReplayJob(fixture(), { sourceSha256: hex("8") }))
      .toThrow(/STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_LINEAGE_INVALID/u);
    expect(() => insertReplayJob(fixture(), { expectedWorkerImageDigest: "sha256:unknown" }))
      .toThrow();
    expect(() => db.prepare(`INSERT INTO command_log
      VALUES ('cmd','RUN_TRACK_G_VIDEO_1_STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY',
      '${hex("7")}','TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_FAIL',
      'TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_PENDING')`).run()).not.toThrow();
    expect(() => fixture().prepare(`INSERT INTO command_log
      VALUES ('bad','RUN_TRACK_G_VIDEO_1_STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY',
      '${hex("7")}','TRACK_G_VIDEO_1_STAGE_12_READY','TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_PENDING')`)
      .run()).toThrow(/COMMAND_CONTRACT_VIOLATION/u);
  });

  test("seals exact per-pass/final evidence and pinned runtime provenance append-only", () => {
    const db = fixture();
    const result = parseStage12EncodedLoudnessDiagnosticReplayResult(replayResult());
    insertReplayJob(db);
    insertEvidence(db, result);
    db.prepare(`UPDATE stage12_encoded_loudness_diagnostic_replay_job SET state='READY',
      replay_outcome=?,terminal_correction_pass=?,worker_image_digest=? WHERE id='replay-1'`)
      .run(result.replayOutcome, result.terminalCorrectionPass, result.workerImageDigest);
    expect(db.prepare(`SELECT state,replay_outcome,terminal_correction_pass,
      expected_worker_image_digest,worker_image_digest,corrected_output_uploaded,
      historical_backfill FROM stage12_encoded_loudness_diagnostic_replay_job`).get())
      .toEqual({ state: "READY", replay_outcome: "FAIL", terminal_correction_pass: 3,
        expected_worker_image_digest: `sha256:${hex("9")}`,
        worker_image_digest: `sha256:${hex("9")}`, corrected_output_uploaded: 0,
        historical_backfill: 0 });
    expect(() => db.exec(`UPDATE stage12_encoded_loudness_diagnostic_replay_evidence
      SET final_integrated_lufs=-14`))
      .toThrow(/STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_encoded_loudness_diagnostic_replay_job"))
      .toThrow(/STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_JOB_IMMUTABLE/u);
    expect(db.prepare("SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4")
      .get()).toEqual({ count: 0 });
  });

  test("rejects inconsistent final exact values, predicates and worker digest", () => {
    for (const mutate of [
      (value: ReturnType<typeof replayResult>) => ({ ...value,
        finalMeasurements: { ...value.finalMeasurements, integratedLufsExact: "-13.81" } }),
      (value: ReturnType<typeof replayResult>) => ({ ...value, failedPredicates: [] }),
      (value: ReturnType<typeof replayResult>) => ({ ...value,
        measurementsByPass: value.measurementsByPass.map((measurement, index) => index === 1
          ? { ...measurement, failedPredicates: [] }
          : measurement) }),
      (value: ReturnType<typeof replayResult>) => ({ ...value,
        workerImageDigest: `sha256:${hex("8")}` }),
    ]) {
      const db = fixture();
      insertReplayJob(db);
      expect(() => insertEvidence(db, mutate(replayResult()) as ReturnType<typeof replayResult>))
        .toThrow(/STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_INVALID/u);
    }
  });
});
