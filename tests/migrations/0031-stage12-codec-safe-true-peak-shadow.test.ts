import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import { parseStage12CodecSafeTruePeakShadowResult } from
  "../../sites/control-plane/app/stage12-pre-master.js";

const migration = (name: string) => readFileSync(new URL(
  `../../sites/control-plane/drizzle/${name}`,
  import.meta.url,
), "utf8");
const hex = (value: string) => value.repeat(64).slice(0, 64);

function apply(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function replayMeasurements() {
  const values = [
    [-15.14, "-15.14", -0.83, "-0.83", 3.7, "3.70",
      ["INTEGRATED_LUFS_BELOW_MIN", "TRUE_PEAK_DBTP_ABOVE_MAX",
        "LOUDNESS_RANGE_LU_BELOW_MIN"]],
    [-15.41, "-15.41", -0.04, "-0.04", 8.4, "8.40",
      ["INTEGRATED_LUFS_BELOW_MIN", "TRUE_PEAK_DBTP_ABOVE_MAX",
        "LOUDNESS_RANGE_LU_ABOVE_MAX"]],
    [-14.6, "-14.60", 0.08, "0.08", 7.8, "7.80", ["TRUE_PEAK_DBTP_ABOVE_MAX"]],
    [-14.35, "-14.35", 0.17, "0.17", 7.4, "7.40", ["TRUE_PEAK_DBTP_ABOVE_MAX"]],
  ] as const;
  return values.map((value, correctionPass) => ({ correctionPass,
    phase: correctionPass === 0 ? "INITIAL_ENCODED_MEASUREMENT"
      : correctionPass === 3 ? "FINAL_POST_ENCODE_VERIFICATION"
        : "POST_CORRECTION_PASS",
    integratedLufs: value[0], integratedLufsExact: value[1],
    truePeakDbtp: value[2], truePeakDbtpExact: value[3],
    loudnessRangeLu: value[4], loudnessRangeLuExact: value[5],
    failedPredicates: value[6], audioFrameMd5Sha256: hex(String(correctionPass + 1)) }));
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
  apply(db, migration("0028_stage12_audio_p0_correction_ordinal_three.sql"));
  db.exec(`INSERT INTO stage12_audio_p0_correction_retry_job
    (id,predecessor_correction_job_id,stage12_job_id,correction_ordinal,
     correction_strategy_version,retry_reason_code,idempotency_key,callback_token_hash,
     actor_identity,owner_approval_text,state,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256)
    VALUES ('correction-3','correction-2','job-3',3,3,
      'STAGE12_AUDIO_P0_ENCODED_QA_FAIL','${hex("c")}','${hex("d")}',
      'owner@example.com','CREATE STAGE 12 AUDIO P0 CORRECTION','PENDING',
      'prod/audio-p0/${hex("a")}.webm','${hex("a")}',16795484,'${hex("b")}');
    UPDATE stage12_audio_p0_correction_retry_job SET state='FAILED',
      error_code='STAGE12_ENCODED_LOUDNESS_UNRESOLVED' WHERE id='correction-3';`);
  apply(db, migration("0029_stage12_encoded_loudness_failure_observability.sql"));
  apply(db, migration("0030_stage12_encoded_loudness_diagnostic_replay.sql"));
  db.exec(`INSERT INTO stage12_encoded_loudness_diagnostic_replay_job
    (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,idempotency_key,
     callback_token_hash,actor_identity,owner_approval_text,state,evidence_semantics,
     source_pre_master_r2_key,source_pre_master_sha256,source_pre_master_byte_length,
     source_receipt_sha256,correction_strategy_version,correction_pass_limit,
     expected_worker_image_digest,algorithm_fingerprint,threshold_snapshot_sha256)
    VALUES ('replay-1','job-3','correction-2','correction-3','${hex("e")}','${hex("f")}',
      'owner@example.com','RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY','PENDING',
      'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL','prod/audio-p0/${hex("a")}.webm',
      '${hex("a")}',16795484,'${hex("b")}',3,3,'sha256:${hex("9")}',
      '${hex("3")}','${hex("4")}');`);
  const measurements = replayMeasurements();
  const sourceBaseline = { phase: "SOURCE_ORDINAL2_BASELINE",
    integratedLufs: -14.51, integratedLufsExact: "-14.51",
    truePeakDbtp: -0.9, truePeakDbtpExact: "-0.90",
    loudnessRangeLu: 3, loudnessRangeLuExact: "3.00",
    failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
    audioFrameMd5Sha256: hex("5") };
  db.prepare(`INSERT INTO stage12_encoded_loudness_diagnostic_replay_evidence
    (id,replay_job_id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     evidence_semantics,source_baseline_json,measurements_by_pass_json,terminal_correction_pass,
     final_integrated_lufs,final_integrated_lufs_exact,final_true_peak_dbtp,
     final_true_peak_dbtp_exact,final_loudness_range_lu,final_loudness_range_lu_exact,
     failed_predicates_json,replay_outcome,expected_worker_image_digest,worker_image_digest,
     algorithm_fingerprint,threshold_snapshot_sha256,ffmpeg_version,
     ffmpeg_build_fingerprint,libopus_encoder_fingerprint,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256)
    VALUES ('${hex("8")}','replay-1','job-3','correction-2','correction-3',
      'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL',?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,
      'sha256:${hex("9")}','sha256:${hex("9")}','${hex("3")}','${hex("4")}',
      'ffmpeg version 7.1.1','${hex("6")}','${hex("7")}',
      'prod/audio-p0/${hex("a")}.webm','${hex("a")}',16795484,'${hex("b")}')`)
    .run(JSON.stringify(sourceBaseline), JSON.stringify(measurements), 3,
      -14.35, "-14.35", 0.17, "0.17", 7.4, "7.40",
      JSON.stringify(["TRUE_PEAK_DBTP_ABOVE_MAX"]), "FAIL");
  db.exec(`UPDATE stage12_encoded_loudness_diagnostic_replay_job SET state='READY',
    replay_outcome='FAIL',terminal_correction_pass=3,worker_image_digest='sha256:${hex("9")}'
    WHERE id='replay-1';`);
  apply(db, migration("0031_stage12_codec_safe_true_peak_shadow.sql"));
  return db;
}

function shadowResult() {
  const candidate = { candidatePass: 0, phase: "INITIAL_CODEC_SAFE_CANDIDATE",
    losslessReferenceSha256: hex("1"), integratedTargetLufs: -14,
    limiterCeilingDbtp: -2, macroDepthDb: 5, codecOvershootDb: 0.8,
    integratedLufs: -14, integratedLufsExact: "-14.00",
    truePeakDbtp: -1.2, truePeakDbtpExact: "-1.20",
    loudnessRangeLu: 5, loudnessRangeLuExact: "5.00", failedPredicates: [],
    audioFrameMd5Sha256: hex("2") };
  return { accepted: true, schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION",
    boundary: "POST_OPUS_TRUE_PEAK_FEEDBACK",
    source: { correctionOrdinal: 2, correctionJobId: "correction-2",
      r2Key: `prod/audio-p0/${hex("a")}.webm`, sha256: hex("a"), byteLength: 16795484,
      receiptSha256: hex("b") },
    historicalFailure: { correctionOrdinal: 3, correctionJobId: "correction-3",
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
    diagnosticReplay: { jobId: "replay-1", evidenceId: hex("8") },
    losslessReference: { sha256: hex("1"), byteLength: 33554432,
      audioFrameMd5Sha256: hex("0"), codec: "pcm_f32le", sampleRateHz: 48000 },
    candidates: [candidate], terminalCandidatePass: 0,
    finalMeasurements: { integratedLufs: -14, integratedLufsExact: "-14.00",
      truePeakDbtp: -1.2, truePeakDbtpExact: "-1.20",
      loudnessRangeLu: 5, loudnessRangeLuExact: "5.00" },
    failedPredicates: [], shadowOutcome: "PASS",
    expectedWorkerImageDigest: `sha256:${hex("5")}`,
    workerImageDigest: `sha256:${hex("5")}`,
    algorithmFingerprint: hex("6"), thresholdSnapshotSha256: hex("4"),
    runtimeProvenance: { ffmpegVersion: "ffmpeg version 7.1.1",
      ffmpegBuildFingerprint: hex("7"), libopusEncoderFingerprint: hex("9") },
    correctionPassLimit: 3, correctedOutputUploaded: false, historicalBackfill: false,
    providerCallCount: 0, providerDispatch: "OFF", calibration: false, finalize: false,
    releaseEligible: false, productionActivation: false, autoPublish: "OFF" };
}

function insertShadowJob(db: DatabaseSync, replayEvidenceId = hex("8")) {
  db.prepare(`INSERT INTO stage12_codec_safe_true_peak_shadow_job
    (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     diagnostic_replay_job_id,diagnostic_replay_evidence_id,idempotency_key,
     callback_token_hash,actor_identity,owner_approval_text,state,evidence_semantics,
     source_pre_master_r2_key,source_pre_master_sha256,source_pre_master_byte_length,
     source_receipt_sha256,correction_pass_limit,expected_worker_image_digest,
     algorithm_fingerprint,threshold_snapshot_sha256)
    VALUES ('shadow-1','job-3','correction-2','correction-3','replay-1',?,
      '${hex("1")}','${hex("2")}','owner@example.com',
      'RUN STAGE 12 CODEC SAFE TRUE PEAK SHADOW REPLAY','PENDING',
      'CODEC_SAFE_SHADOW_NOT_CORRECTION','prod/audio-p0/${hex("a")}.webm',
      '${hex("a")}',16795484,'${hex("b")}',3,'sha256:${hex("5")}',
      '${hex("6")}','${hex("4")}')`).run(replayEvidenceId);
}

function insertShadowEvidence(db: DatabaseSync, result = shadowResult()) {
  db.prepare(`INSERT INTO stage12_codec_safe_true_peak_shadow_evidence
    (id,shadow_job_id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     diagnostic_replay_job_id,diagnostic_replay_evidence_id,evidence_semantics,
     lossless_reference_sha256,lossless_reference_byte_length,
     lossless_reference_frame_md5_sha256,lossless_reference_codec,
     lossless_reference_sample_rate_hz,candidates_json,terminal_candidate_pass,
     final_integrated_lufs,final_integrated_lufs_exact,final_true_peak_dbtp,
     final_true_peak_dbtp_exact,final_loudness_range_lu,final_loudness_range_lu_exact,
     failed_predicates_json,shadow_outcome,expected_worker_image_digest,
     worker_image_digest,algorithm_fingerprint,threshold_snapshot_sha256,ffmpeg_version,
     ffmpeg_build_fingerprint,libopus_encoder_fingerprint,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256)
    VALUES ('shadow-evidence-1','shadow-1','job-3','correction-2','correction-3',
      'replay-1','${hex("8")}',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      'prod/audio-p0/${hex("a")}.webm','${hex("a")}',16795484,'${hex("b")}')`)
    .run(result.evidenceSemantics, result.losslessReference.sha256,
      result.losslessReference.byteLength, result.losslessReference.audioFrameMd5Sha256,
      result.losslessReference.codec, result.losslessReference.sampleRateHz,
      JSON.stringify(result.candidates), result.terminalCandidatePass,
      result.finalMeasurements.integratedLufs, result.finalMeasurements.integratedLufsExact,
      result.finalMeasurements.truePeakDbtp, result.finalMeasurements.truePeakDbtpExact,
      result.finalMeasurements.loudnessRangeLu, result.finalMeasurements.loudnessRangeLuExact,
      JSON.stringify(result.failedPredicates), result.shadowOutcome,
      result.expectedWorkerImageDigest, result.workerImageDigest,
      result.algorithmFingerprint, result.thresholdSnapshotSha256,
      result.runtimeProvenance.ffmpegVersion, result.runtimeProvenance.ffmpegBuildFingerprint,
      result.runtimeProvenance.libopusEncoderFingerprint);
}

describe("migration 0031 Stage 12 codec-safe true-peak shadow", () => {
  test("adds no backfill and preserves ordinal 2/3 and diagnostic history", () => {
    const db = fixture();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_codec_safe_true_peak_shadow_job")
      .get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT state,outcome FROM stage12_audio_p0_correction_job").get())
      .toEqual({ state: "READY", outcome: "FAIL" });
    expect(db.prepare("SELECT state,error_code FROM stage12_audio_p0_correction_retry_job").get())
      .toEqual({ state: "FAILED", error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" });
    expect(db.prepare("SELECT state,replay_outcome FROM stage12_encoded_loudness_diagnostic_replay_job")
      .get()).toEqual({ state: "READY", replay_outcome: "FAIL" });
  });

  test("requires the exact replay evidence lineage and typed transition", () => {
    const db = fixture();
    insertShadowJob(db);
    expect(() => insertShadowJob(fixture(), hex("7")))
      .toThrow(/STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_LINEAGE_INVALID|FOREIGN KEY/u);
    expect(() => db.prepare(`INSERT INTO command_log VALUES
      ('cmd','RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY',
      '${hex("7")}','TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_FAIL',
      'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_SHADOW_PENDING')`).run()).not.toThrow();
  });

  test("seals the canonical lossless reference and post-Opus candidate evidence", () => {
    const db = fixture();
    const result = parseStage12CodecSafeTruePeakShadowResult(shadowResult());
    insertShadowJob(db);
    insertShadowEvidence(db, result);
    db.prepare(`UPDATE stage12_codec_safe_true_peak_shadow_job SET state='READY',
      shadow_outcome=?,terminal_candidate_pass=?,worker_image_digest=? WHERE id='shadow-1'`)
      .run(result.shadowOutcome, result.terminalCandidatePass, result.workerImageDigest);
    expect(db.prepare(`SELECT state,shadow_outcome,terminal_candidate_pass,
      corrected_output_uploaded,production_activation_executed
      FROM stage12_codec_safe_true_peak_shadow_job`).get())
      .toEqual({ state: "READY", shadow_outcome: "PASS", terminal_candidate_pass: 0,
        corrected_output_uploaded: 0, production_activation_executed: 0 });
    expect(() => db.exec(`UPDATE stage12_codec_safe_true_peak_shadow_evidence
      SET final_true_peak_dbtp=-2`))
      .toThrow(/STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_EVIDENCE_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_codec_safe_true_peak_shadow_job"))
      .toThrow(/STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_JOB_IMMUTABLE/u);
  });

  test("rejects candidate source drift and every forbidden side effect", () => {
    const drifted = shadowResult();
    drifted.candidates[0] = { ...drifted.candidates[0],
      losslessReferenceSha256: hex("3") };
    const db = fixture();
    insertShadowJob(db);
    expect(() => insertShadowEvidence(db, drifted))
      .toThrow(/STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_EVIDENCE_INVALID/u);
    expect(() => db.exec(`UPDATE stage12_codec_safe_true_peak_shadow_job
      SET production_activation_executed=1 WHERE id='shadow-1'`)).toThrow();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4")
      .get()).toEqual({ count: 0 });
  });
});
