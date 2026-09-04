import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import {
  classifyStage12CodecSafeLraGuardCandidate,
  finalizeStage12CodecSafeLraGuardTrace,
  planStage12CodecSafeLraGuardCandidate,
} from "../../packages/media-worker/stage12-runtime.mjs";
import {
  parseStage12CodecSafeLraGuardShadowResult,
  stage12CodecSafeLraGuardFingerprints,
  STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY,
} from "../../sites/control-plane/app/stage12-pre-master.js";

const migration = readFileSync(new URL(
  "../../sites/control-plane/drizzle/0032_stage12_codec_safe_lra_guard_shadow.sql",
  import.meta.url,
), "utf8");
const hex = (value: string) => value.repeat(64).slice(0, 64);
const parentEvidenceId = "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb";

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value !== "object") throw new TypeError("Unsupported canonical value");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key.normalize("NFC"))}:${canonicalize(record[key])}`).join(",")}}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function apply(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

const source = {
  r2Key: `prod/audio-p0/${hex("a")}.webm`,
  sha256: hex("a"),
  byteLength: 16_795_484,
  receiptSha256: hex("b"),
};
const parentWorkerImageDigest =
  "sha256:6f7e4ff3e112c0f3cafb2c2c13769f4bd96edb22eab6e039a1ddaced1634731f";
const losslessReference = {
  sha256: hex("1"),
  byteLength: 33_554_432,
  audioFrameMd5Sha256: hex("0"),
  codec: "pcm_f32le" as const,
  sampleRateHz: 48_000,
};

function failedPredicates(integratedLufs: number, truePeakDbtp: number,
  loudnessRangeLu: number) {
  return [
    ...(integratedLufs < -15 ? ["INTEGRATED_LUFS_BELOW_MIN"] : []),
    ...(integratedLufs > -13 ? ["INTEGRATED_LUFS_ABOVE_MAX"] : []),
    ...(truePeakDbtp > -1 ? ["TRUE_PEAK_DBTP_ABOVE_MAX"] : []),
    ...(loudnessRangeLu < 4 ? ["LOUDNESS_RANGE_LU_BELOW_MIN"] : []),
    ...(loudnessRangeLu > 8 ? ["LOUDNESS_RANGE_LU_ABOVE_MAX"] : []),
  ];
}

function parentCandidate(candidatePass: number, controller: {
  integratedTargetLufs: number; limiterCeilingDbtp: number; macroDepthDb: number;
}, measured: { integratedLufs: number; integratedLufsExact: string;
  truePeakDbtp: number; truePeakDbtpExact: string; loudnessRangeLu: number;
  loudnessRangeLuExact: string; }) {
  return {
    candidatePass,
    phase: candidatePass === 0 ? "INITIAL_CODEC_SAFE_CANDIDATE"
      : "POST_OPUS_FEEDBACK_CANDIDATE",
    losslessReferenceSha256: losslessReference.sha256,
    ...controller,
    codecOvershootDb: Math.max(0, measured.truePeakDbtp - controller.limiterCeilingDbtp),
    ...measured,
    failedPredicates: failedPredicates(measured.integratedLufs, measured.truePeakDbtp,
      measured.loudnessRangeLu),
    audioFrameMd5Sha256: hex(String(candidatePass + 1)),
  };
}

const parentCandidates = [
  parentCandidate(0, { integratedTargetLufs: -14, limiterCeilingDbtp: -2,
    macroDepthDb: 5 }, { integratedLufs: -14.8, integratedLufsExact: "-14.80",
    truePeakDbtp: -0.33, truePeakDbtpExact: "-0.33",
    loudnessRangeLu: 3.2, loudnessRangeLuExact: "3.20" }),
  parentCandidate(1, { integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
    macroDepthDb: 7.8 }, { integratedLufs: -15.09, integratedLufsExact: "-15.09",
    truePeakDbtp: -1.04, truePeakDbtpExact: "-1.04",
    loudnessRangeLu: 2.8, loudnessRangeLuExact: "2.80" }),
  parentCandidate(2, { integratedTargetLufs: -12.91, limiterCeilingDbtp: -2.67,
    macroDepthDb: 11 }, { integratedLufs: -15.12, integratedLufsExact: "-15.12",
    truePeakDbtp: -1, truePeakDbtpExact: "-1.00",
    loudnessRangeLu: 3, loudnessRangeLuExact: "3.00" }),
  parentCandidate(3, { integratedTargetLufs: -11.79, limiterCeilingDbtp: -2.67,
    macroDepthDb: 14 }, { integratedLufs: -14.94, integratedLufsExact: "-14.94",
    truePeakDbtp: 4.22, truePeakDbtpExact: "4.22",
    loudnessRangeLu: 14.4, loudnessRangeLuExact: "14.40" }),
];

const payload = {
  schemaVersion: 1,
  idempotencyKey: hex("c"),
  packageId: "package-test",
  stageInstanceId: "stage12-test",
  durationSec: 510,
  narration: { r2Key: "prod/narration.mp3", sha256: hex("d") },
  render: { width: 1920, height: 1080, fps: 30, sampleRateHz: 48_000 },
  timeline: { expectedFrames: 15_300, shots: [{ startFrame: 0, endFrame: 15_300,
    headline: "Immutable source", background: "#071816", accent: "#71f6c5",
    signal: "#ffb84d" }] },
  qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
    truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
  controls: { providerDispatch: "OFF", providerCallCount: 0, autoPublish: "OFF" },
  objectAccess: { url: "https://example.com/source", token: hex("e") },
  callback: { url: "https://example.com/callback", token: hex("f") },
};

const parentRuntimeProvenance = {
  ffmpegVersion: "ffmpeg version 7.1.1",
  ffmpegBuildFingerprint: hex("6"),
  libopusEncoderFingerprint: hex("7"),
};

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE command_log (
      id text PRIMARY KEY, command_type text NOT NULL, idempotency_key text NOT NULL,
      prev_state text, next_state text, actor_identity text, payload_json text,
      created_at text
    );
    CREATE TRIGGER command_log_validate_insert BEFORE INSERT ON command_log
      BEGIN SELECT RAISE(ABORT, 'LEGACY_TRIGGER_MUST_BE_REPLACED'); END;
    CREATE TABLE stage12_media_job (
      id text PRIMARY KEY, attempt_ordinal integer NOT NULL
    );
    CREATE TABLE stage12_audio_p0_correction_job (
      id text PRIMARY KEY, correction_ordinal integer NOT NULL, state text NOT NULL,
      outcome text, corrected_pre_master_sha256 text
    );
    CREATE TABLE stage12_audio_p0_correction_retry_job (
      id text PRIMARY KEY, correction_ordinal integer NOT NULL, state text NOT NULL,
      error_code text, corrected_pre_master_sha256 text
    );
    CREATE TABLE stage12_encoded_loudness_diagnostic_replay_job (
      id text PRIMARY KEY, state text NOT NULL, replay_outcome text
    );
    CREATE TABLE stage12_encoded_loudness_diagnostic_replay_evidence (
      id text PRIMARY KEY, replay_job_id text NOT NULL
    );
    CREATE TABLE stage12_codec_safe_true_peak_shadow_job (
      id text PRIMARY KEY, stage12_job_id text NOT NULL,
      source_correction_job_id text NOT NULL, historical_failure_job_id text NOT NULL,
      diagnostic_replay_job_id text NOT NULL, diagnostic_replay_evidence_id text NOT NULL,
      state text NOT NULL, shadow_outcome text
    );
    CREATE TABLE stage12_codec_safe_true_peak_shadow_evidence (
      id text PRIMARY KEY, shadow_job_id text NOT NULL,
      source_pre_master_r2_key text NOT NULL, source_pre_master_sha256 text NOT NULL,
      source_pre_master_byte_length integer NOT NULL, source_receipt_sha256 text NOT NULL,
      threshold_snapshot_sha256 text NOT NULL, expected_worker_image_digest text NOT NULL,
      worker_image_digest text NOT NULL, candidates_json text NOT NULL,
      shadow_outcome text NOT NULL, corrected_output_uploaded integer NOT NULL,
      historical_backfill integer NOT NULL, provider_call_count integer NOT NULL,
      provider_dispatch text NOT NULL, calibration_executed integer NOT NULL,
      finalize_executed integer NOT NULL, release_eligible integer NOT NULL,
      production_activation_executed integer NOT NULL, auto_publish text NOT NULL
    );
    INSERT INTO stage12_media_job VALUES ('job-3',3);
    INSERT INTO stage12_audio_p0_correction_job VALUES
      ('correction-2',2,'READY','FAIL','${source.sha256}');
    INSERT INTO stage12_audio_p0_correction_retry_job VALUES
      ('correction-3',3,'FAILED','STAGE12_ENCODED_LOUDNESS_UNRESOLVED',NULL);
    INSERT INTO stage12_encoded_loudness_diagnostic_replay_job VALUES
      ('replay-1','READY','FAIL');
    INSERT INTO stage12_encoded_loudness_diagnostic_replay_evidence VALUES
      ('${hex("8")}','replay-1');
    INSERT INTO stage12_codec_safe_true_peak_shadow_job VALUES
      ('shadow-1','job-3','correction-2','correction-3','replay-1','${hex("8")}',
       'READY','FAIL');`);
  db.prepare(`INSERT INTO stage12_codec_safe_true_peak_shadow_evidence VALUES
    (@id,'shadow-1',@r2Key,@sha256,@byteLength,@receiptSha256,@thresholdSha,
     @expectedDigest,@workerDigest,@candidates,'FAIL',0,0,0,'OFF',0,0,0,0,'OFF')`).run({
    id: parentEvidenceId,
    r2Key: source.r2Key,
    sha256: source.sha256,
    byteLength: source.byteLength,
    receiptSha256: source.receiptSha256,
    thresholdSha: stage12CodecSafeLraGuardFingerprints(
      payload as never, STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY,
    ).thresholdSnapshotSha256,
    expectedDigest: parentWorkerImageDigest,
    workerDigest: parentWorkerImageDigest,
    candidates: JSON.stringify(parentCandidates),
  });
  apply(db, migration);
  return db;
}

function replayState() {
  return {
    controllerPolicy: STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY,
    anchorReference: parentCandidates[1],
    highBracketReference: parentCandidates[3],
  };
}

function classify(plan: ReturnType<typeof planStage12CodecSafeLraGuardCandidate>, values: {
  integratedLufs: number; integratedLufsExact: string; truePeakDbtp: number;
  truePeakDbtpExact: string; loudnessRangeLu: number; loudnessRangeLuExact: string;
  audioFrameMd5Sha256: string;
}) {
  if (plan.done) throw new Error("unexpected terminal plan");
  return classifyStage12CodecSafeLraGuardCandidate(payload, replayState(), plan, values);
}

function validResult() {
  const replay = replayState();
  const anchorPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, []);
  const anchor = classify(anchorPlan, { integratedLufs: -15.09,
    integratedLufsExact: "-15.09", truePeakDbtp: -1.04,
    truePeakDbtpExact: "-1.04", loudnessRangeLu: 2.8,
    loudnessRangeLuExact: "2.80", audioFrameMd5Sha256: hex("2") });
  const bracketPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor]);
  const bracket = classify(bracketPlan, { integratedLufs: -15.09,
    integratedLufsExact: "-15.09", truePeakDbtp: -1.08,
    truePeakDbtpExact: "-1.08", loudnessRangeLu: 5.5,
    loudnessRangeLuExact: "5.50", audioFrameMd5Sha256: hex("3") });
  const trimPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor, bracket]);
  const trim = classify(trimPlan, { integratedLufs: -14.98,
    integratedLufsExact: "-14.98", truePeakDbtp: -1.03,
    truePeakDbtpExact: "-1.03", loudnessRangeLu: 5.3,
    loudnessRangeLuExact: "5.30", audioFrameMd5Sha256: hex("4") });
  const candidates = [anchor, bracket, trim];
  const terminal = finalizeStage12CodecSafeLraGuardTrace(payload, replay, candidates);
  const fingerprints = stage12CodecSafeLraGuardFingerprints(
    payload as never, STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY,
  );
  const currentWorkerImageDigest = `sha256:${hex("9")}`;
  const renderRuntimeFingerprint = sha256(canonicalize({
    renderKernelFingerprint: fingerprints.renderKernelFingerprint,
    runtimeProvenance: parentRuntimeProvenance,
  }));
  return parseStage12CodecSafeLraGuardShadowResult({
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION",
    boundary: "POST_OPUS_LRA_GUARD_FEEDBACK",
    source: { correctionOrdinal: 2, correctionJobId: "correction-2", ...source },
    historicalFailure: { correctionOrdinal: 3, correctionJobId: "correction-3",
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
    diagnosticReplay: { jobId: "replay-1", evidenceId: hex("8") },
    parentShadow: { jobId: "shadow-1", evidenceId: parentEvidenceId },
    losslessReference,
    anchorReference: parentCandidates[1],
    highBracketReference: parentCandidates[3],
    controllerPolicy: STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY,
    candidates,
    ...terminal,
    expectedWorkerImageDigest: currentWorkerImageDigest,
    parentWorkerImageDigest,
    workerImageDigest: currentWorkerImageDigest,
    ...fingerprints,
    parentRenderRuntimeFingerprint: renderRuntimeFingerprint,
    renderRuntimeFingerprint,
    parentRuntimeProvenance,
    runtimeProvenance: parentRuntimeProvenance,
    correctedOutputUploaded: false,
    historicalBackfill: false,
    providerCallCount: 0,
    providerDispatch: "OFF",
    calibration: false,
    finalize: false,
    releaseEligible: false,
    productionActivation: false,
    autoPublish: "OFF",
  });
}

function insertJob(db: DatabaseSync, parentId = parentEvidenceId) {
  const result = validResult();
  db.prepare(`INSERT INTO stage12_codec_safe_lra_guard_shadow_job
    (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     diagnostic_replay_job_id,diagnostic_replay_evidence_id,parent_shadow_job_id,
     parent_shadow_evidence_id,idempotency_key,callback_token_hash,actor_identity,
     owner_approval_text,state,evidence_semantics,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256,
     expected_worker_image_digest,parent_worker_image_digest,algorithm_fingerprint,
     threshold_snapshot_sha256,controller_policy_sha256,render_kernel_fingerprint,
     parent_render_runtime_fingerprint)
    VALUES ('guard-1','job-3','correction-2','correction-3','replay-1','${hex("8")}',
      'shadow-1',@parentId,'${hex("5")}','${hex("6")}','owner@example.com',
      'RUN STAGE 12 CODEC SAFE LRA GUARD SHADOW REPLAY','PENDING',
      'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION',@r2Key,@sha256,@byteLength,
      @receiptSha256,@expectedDigest,@parentDigest,@algorithm,@threshold,@policy,
      @renderKernel,@parentRenderRuntime)`).run({
    parentId,
    r2Key: source.r2Key,
    sha256: source.sha256,
    byteLength: source.byteLength,
    receiptSha256: source.receiptSha256,
    expectedDigest: result.expectedWorkerImageDigest,
    parentDigest: result.parentWorkerImageDigest,
    algorithm: result.algorithmFingerprint,
    threshold: result.thresholdSnapshotSha256,
    policy: result.controllerPolicySha256,
    renderKernel: result.renderKernelFingerprint,
    parentRenderRuntime: result.parentRenderRuntimeFingerprint,
  });
  return result;
}

function insertEvidence(db: DatabaseSync, result = validResult()) {
  db.prepare(`INSERT INTO stage12_codec_safe_lra_guard_shadow_evidence
    (id,shadow_job_id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     diagnostic_replay_job_id,diagnostic_replay_evidence_id,parent_shadow_job_id,
     parent_shadow_evidence_id,evidence_semantics,lossless_reference_sha256,
     lossless_reference_byte_length,lossless_reference_frame_md5_sha256,
     lossless_reference_codec,lossless_reference_sample_rate_hz,anchor_reference_json,
     high_bracket_reference_json,controller_policy_json,candidates_json,
     last_evaluated_candidate_pass,best_safe_candidate_pass,selected_candidate_pass,
     terminal_reason,final_integrated_lufs,final_integrated_lufs_exact,
     final_true_peak_dbtp,final_true_peak_dbtp_exact,final_loudness_range_lu,
     final_loudness_range_lu_exact,failed_predicates_json,shadow_outcome,
     expected_worker_image_digest,parent_worker_image_digest,worker_image_digest,
     algorithm_fingerprint,threshold_snapshot_sha256,controller_policy_sha256,
     render_kernel_fingerprint,parent_render_runtime_fingerprint,render_runtime_fingerprint,
     parent_runtime_provenance_json,runtime_provenance_json,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256)
    VALUES ('guard-evidence-1','guard-1','job-3','correction-2','correction-3','replay-1',
      '${hex("8")}','shadow-1',@parentEvidenceId,@semantics,@losslessSha,@losslessLength,
      @losslessFrame,'pcm_f32le',48000,@anchor,@high,@policyJson,@candidates,@lastPass,
      @bestPass,@selectedPass,@terminalReason,@integrated,@integratedExact,@truePeak,
      @truePeakExact,@lra,@lraExact,@failed,@outcome,@expectedDigest,@parentDigest,
      @workerDigest,@algorithm,@threshold,@policySha,@renderKernel,@parentRuntimeSha,
      @runtimeSha,@parentRuntime,@runtime,@r2Key,@sourceSha,@sourceLength,@receiptSha)`).run({
    parentEvidenceId,
    semantics: result.evidenceSemantics,
    losslessSha: result.losslessReference.sha256,
    losslessLength: result.losslessReference.byteLength,
    losslessFrame: result.losslessReference.audioFrameMd5Sha256,
    anchor: JSON.stringify(result.anchorReference),
    high: JSON.stringify(result.highBracketReference),
    policyJson: JSON.stringify(result.controllerPolicy),
    candidates: JSON.stringify(result.candidates),
    lastPass: result.lastEvaluatedCandidatePass,
    bestPass: result.bestSafeCandidatePass,
    selectedPass: result.selectedCandidatePass,
    terminalReason: result.terminalReason,
    integrated: result.finalMeasurements.integratedLufs,
    integratedExact: result.finalMeasurements.integratedLufsExact,
    truePeak: result.finalMeasurements.truePeakDbtp,
    truePeakExact: result.finalMeasurements.truePeakDbtpExact,
    lra: result.finalMeasurements.loudnessRangeLu,
    lraExact: result.finalMeasurements.loudnessRangeLuExact,
    failed: JSON.stringify(result.failedPredicates),
    outcome: result.shadowOutcome,
    expectedDigest: result.expectedWorkerImageDigest,
    parentDigest: result.parentWorkerImageDigest,
    workerDigest: result.workerImageDigest,
    algorithm: result.algorithmFingerprint,
    threshold: result.thresholdSnapshotSha256,
    policySha: result.controllerPolicySha256,
    renderKernel: result.renderKernelFingerprint,
    parentRuntimeSha: result.parentRenderRuntimeFingerprint,
    runtimeSha: result.renderRuntimeFingerprint,
    parentRuntime: JSON.stringify(result.parentRuntimeProvenance),
    runtime: JSON.stringify(result.runtimeProvenance),
    r2Key: result.source.r2Key,
    sourceSha: result.source.sha256,
    sourceLength: result.source.byteLength,
    receiptSha: result.source.receiptSha256,
  });
}

describe("migration 0032 Stage 12 codec-safe LRA guard shadow", () => {
  test("adds no backfill and preserves ordinal 2/3 plus both replay histories", () => {
    const db = fixture();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_codec_safe_lra_guard_shadow_job")
      .get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT correction_ordinal,state,outcome FROM stage12_audio_p0_correction_job")
      .get()).toEqual({ correction_ordinal: 2, state: "READY", outcome: "FAIL" });
    expect(db.prepare("SELECT correction_ordinal,state,error_code FROM stage12_audio_p0_correction_retry_job")
      .get()).toEqual({ correction_ordinal: 3, state: "FAILED",
        error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" });
    expect(db.prepare("SELECT id,state,shadow_outcome FROM stage12_codec_safe_true_peak_shadow_job")
      .get()).toEqual({ id: "shadow-1", state: "READY", shadow_outcome: "FAIL" });
    expect(db.prepare("SELECT id FROM stage12_codec_safe_true_peak_shadow_evidence").get())
      .toEqual({ id: parentEvidenceId });
  });

  test("requires the exact parent evidence and typed shadow transition", () => {
    const db = fixture();
    insertJob(db);
    expect(() => insertJob(fixture(), hex("f")))
      .toThrow(/STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_LINEAGE_INVALID|FOREIGN KEY/u);
    expect(() => db.prepare(`INSERT INTO command_log
      (id,command_type,idempotency_key,prev_state,next_state) VALUES
      ('cmd','RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY',
       '${hex("7")}','TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_SHADOW_FAIL',
       'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_PENDING')`).run())
      .not.toThrow();
  });

  test("seals anchor, bracket, trim, rollback policy and pinned provenance", () => {
    const db = fixture();
    const result = insertJob(db);
    insertEvidence(db, result);
    db.prepare(`UPDATE stage12_codec_safe_lra_guard_shadow_job SET state='READY',
      shadow_outcome=@outcome,terminal_reason=@reason,last_evaluated_candidate_pass=@last,
      best_safe_candidate_pass=@best,selected_candidate_pass=@selected,
      worker_image_digest=@worker,render_runtime_fingerprint=@runtime
      WHERE id='guard-1'`).run({ outcome: result.shadowOutcome,
      reason: result.terminalReason, last: result.lastEvaluatedCandidatePass,
      best: result.bestSafeCandidatePass, selected: result.selectedCandidatePass,
      worker: result.workerImageDigest, runtime: result.renderRuntimeFingerprint });
    expect(db.prepare(`SELECT state,shadow_outcome,terminal_reason,
      last_evaluated_candidate_pass,best_safe_candidate_pass,selected_candidate_pass,
      corrected_output_uploaded,production_activation_executed
      FROM stage12_codec_safe_lra_guard_shadow_job`).get()).toEqual({
      state: "READY", shadow_outcome: "PASS", terminal_reason: "PASS",
      last_evaluated_candidate_pass: 2, best_safe_candidate_pass: 2,
      selected_candidate_pass: 2, corrected_output_uploaded: 0,
      production_activation_executed: 0,
    });
    expect(() => db.exec(`UPDATE stage12_codec_safe_lra_guard_shadow_evidence
      SET final_true_peak_dbtp=-2`))
      .toThrow(/STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_codec_safe_lra_guard_shadow_job"))
      .toThrow(/STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_JOB_IMMUTABLE/u);
  });

  test("rejects unbounded candidates and every forbidden side effect", () => {
    const db = fixture();
    const result = insertJob(db);
    const bad = { ...result, candidates: result.candidates.map((candidate, index) =>
      index === 1 ? { ...candidate, targetStepLufs: 0.5 } : candidate) };
    expect(() => insertEvidence(db, bad as typeof result))
      .toThrow(/STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_INVALID/u);
    expect(() => db.exec(`UPDATE stage12_codec_safe_lra_guard_shadow_job
      SET production_activation_executed=1 WHERE id='guard-1'`)).toThrow();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4")
      .get()).toEqual({ count: 0 });
  });
});
