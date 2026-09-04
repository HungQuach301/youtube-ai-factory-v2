import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import { STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY } from
  "../../packages/contracts/src/stage12-codec-safe-lra-feasibility";
import {
  buildStage12CodecSafeLraFeasibilityEvidence,
  classifyStage12CodecSafeLraFeasibilityCandidate,
  planStage12CodecSafeLraFeasibilityCandidate,
  stage12CodecSafeLraFeasibilityFingerprints,
  stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint,
} from "../../packages/media-worker/stage12-codec-safe-lra-feasibility-controller.mjs";
import { parseStage12CodecSafeLraFeasibilitySearchResult } from
  "../../sites/control-plane/app/stage12-pre-master.js";

const migration = readFileSync(new URL(
  "../../sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql",
  import.meta.url,
), "utf8");
const hex = (value: string) => value.repeat(64).slice(0, 64);
const sourceSha =
  "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2";
const truePeakEvidenceId =
  "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb";
const guardEvidenceId =
  "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9";
const imageDigest = `sha256:${hex("9")}`;
const source = {
  r2Key: `prod/audio-p0/${sourceSha}.webm`,
  sha256: sourceSha,
  byteLength: 16_795_484,
  receiptSha256: hex("f"),
};
const losslessReference = {
  sha256: hex("4"),
  byteLength: 195_840_044,
  audioFrameMd5Sha256: hex("0"),
  codec: "pcm_f32le" as const,
  sampleRateHz: 48_000,
};
const runtimeProvenance = {
  ffmpegVersion: "ffmpeg version 7.1.1",
  ffmpegBuildFingerprint: hex("6"),
  libopusEncoderFingerprint: hex("7"),
};
const payload = {
  schemaVersion: 1,
  idempotencyKey: hex("a"),
  packageId: "pkg",
  stageInstanceId: "s12",
  durationSec: 510,
  narration: { r2Key: "prod/narration.mp3", sha256: hex("b") },
  render: { width: 1920, height: 1080, fps: 30, sampleRateHz: 48_000 },
  timeline: { expectedFrames: 15_300, shots: [{ startFrame: 0, endFrame: 15_300,
    headline: "Immutable source", background: "#071816", accent: "#71f6c5",
    signal: "#ffb84d" }] },
  qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
    truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
  controls: { providerDispatch: "OFF", providerCallCount: 0, autoPublish: "OFF" },
  objectAccess: { url: "https://example.com/source", token: hex("c") },
  callback: { url: "https://example.com/callback", token: hex("d") },
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

const parentRows = [
  [7.8, -15.09, "-15.09", -1.04, "-1.04", 2.8, "2.80"],
  [10.9, -15.29, "-15.29", -0.96, "-0.96", 3.5, "3.50"],
  [9.35, -15.19, "-15.19", -1.04, "-1.04", 2.9, "2.90"],
  [10.125, -15.23, "-15.23", -1.05, "-1.05", 3.1, "3.10"],
  [10.5125, -15.24, "-15.24", -1.05, "-1.05", 3.1, "3.10"],
  [10.70625, -15.25, "-15.25", -1.06, "-1.06", 3.2, "3.20"],
  [10.803125, -15.26, "-15.26", -1.03, "-1.03", 3.2, "3.20"],
  [10.851563, -15.29, "-15.29", -0.98, "-0.98", 3.4, "3.40"],
] as const;

const parentCandidates = parentRows.map((row, candidatePass) => ({
  done: false,
  candidatePass,
  phase: candidatePass === 0 ? "ANCHOR_REPRODUCTION" : "LRA_BRACKET_SEARCH",
  decision: candidatePass === 0 ? "ANCHOR" : "BISECTION",
  parentCandidatePass: [null, 0, 0, 2, 3, 4, 5, 6][candidatePass],
  rollbackToCandidatePass: candidatePass === 2 ? 0 : null,
  bracketLowDepthDb: [7.8, 7.8, 7.8, 9.35, 10.125, 10.5125,
    10.70625, 10.803125][candidatePass],
  bracketHighDepthDb: [14, 14, 10.9, 10.9, 10.9, 10.9, 10.9, 10.9][candidatePass],
  integratedTargetLufs: -14,
  limiterCeilingDbtp: -2.67,
  macroDepthDb: row[0],
  targetStepLufs: 0,
  disposition: candidatePass === 0 ? "SAFE_ANCHOR"
    : candidatePass === 1 || candidatePass === 7 ? "REGRESSION_REJECTED" : "LOW_BRACKET",
  losslessReferenceSha256: losslessReference.sha256,
  codecOvershootDb: Math.max(0, row[3] - -2.67),
  integratedLufs: row[1],
  integratedLufsExact: row[2],
  truePeakDbtp: row[3],
  truePeakDbtpExact: row[4],
  loudnessRangeLu: row[5],
  loudnessRangeLuExact: row[6],
  failedPredicates: failedPredicates(row[1], row[3], row[5]),
  audioFrameMd5Sha256: hex(String(candidatePass + 1)),
}));

function replay() {
  const fingerprints = stage12CodecSafeLraFeasibilityFingerprints(
    payload,
    STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY,
  );
  const parentRenderRuntimeFingerprint =
    stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
      fingerprints.renderKernelFingerprint,
      runtimeProvenance,
    );
  return {
    schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
    sourceAttemptOrdinal: 3,
    sourceCorrectionOrdinal: 2,
    historicalFailureCorrectionOrdinal: 3,
    sourceCorrectionJobId: "correction-2",
    historicalFailureJobId: "correction-3",
    diagnosticReplayJobId: "replay-1",
    diagnosticReplayEvidenceId: hex("8"),
    codecSafeTruePeakShadowJobId: "true-peak-1",
    codecSafeTruePeakShadowEvidenceId: truePeakEvidenceId,
    codecSafeLraGuardShadowJobId: "guard-1",
    codecSafeLraGuardShadowEvidenceId: guardEvidenceId,
    sourceCorrectedPreMaster: { r2Key: source.r2Key, sha256: source.sha256,
      byteLength: source.byteLength },
    sourceCorrectionReceiptSha256: source.receiptSha256,
    parentWorkerImageDigest: imageDigest,
    parentAlgorithmFingerprint: hex("a"),
    parentThresholdSnapshotSha256: fingerprints.thresholdSnapshotSha256,
    parentControllerPolicySha256: hex("b"),
    parentRenderKernelFingerprint: fingerprints.renderKernelFingerprint,
    parentRenderRuntimeFingerprint,
    parentRuntimeProvenance: runtimeProvenance,
    parentLosslessReference: losslessReference,
    parentGuardTrace: {
      shadowOutcome: "FAIL",
      terminalReason: "BUDGET_EXHAUSTED",
      lastEvaluatedCandidatePass: 7,
      bestSafeCandidatePass: 5,
      selectedCandidatePass: 5,
      finalMeasurements: { integratedLufs: -15.25, integratedLufsExact: "-15.25",
        truePeakDbtp: -1.06, truePeakDbtpExact: "-1.06",
        loudnessRangeLu: 3.2, loudnessRangeLuExact: "3.20" },
      failedPredicates: ["INTEGRATED_LUFS_BELOW_MIN", "LOUDNESS_RANGE_LU_BELOW_MIN"],
      candidates: parentCandidates,
    },
    controllerPolicy: STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY,
    expectedWorkerImageDigest: imageDigest,
    ...fingerprints,
    historicalBackfill: false,
    uploadCorrectedOutput: false,
    providerDispatch: "OFF",
    providerCallCount: 0,
    calibration: false,
    finalize: false,
    release: false,
    productionActivation: false,
    autoPublish: "OFF",
  };
}

function exact(value: number) {
  return value.toFixed(2);
}

function measurement(integratedLufs: number, truePeakDbtp: number,
  loudnessRangeLu: number, marker: string) {
  return { integratedLufs, integratedLufsExact: exact(integratedLufs),
    truePeakDbtp, truePeakDbtpExact: exact(truePeakDbtp), loudnessRangeLu,
    loudnessRangeLuExact: exact(loudnessRangeLu),
    encodedArtifactSha256: hex(marker), audioFrameMd5Sha256: hex(marker) };
}

type FeasibilityCandidate = ReturnType<
  typeof classifyStage12CodecSafeLraFeasibilityCandidate
>;

function resultFor(currentReplay: ReturnType<typeof replay>,
  candidates: FeasibilityCandidate[]) {
  const result = buildStage12CodecSafeLraFeasibilityEvidence({
    ...payload,
    codecSafeLraFeasibilitySearch: currentReplay,
  }, {
    evidenceSemantics: currentReplay.evidenceSemantics,
    replay: currentReplay,
    source: { correctionOrdinal: 2, correctionJobId: "correction-2", ...source },
    historicalFailure: { correctionOrdinal: 3, correctionJobId: "correction-3",
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
    diagnosticReplay: { jobId: "replay-1", evidenceId: hex("8") },
    parentTruePeakShadow: { jobId: "true-peak-1", evidenceId: truePeakEvidenceId },
    parentLraGuard: { jobId: "guard-1", evidenceId: guardEvidenceId },
    parentGuardTrace: currentReplay.parentGuardTrace,
    losslessReference,
    candidates,
    workerImageDigest: imageDigest,
    expectedWorkerImageDigest: imageDigest,
    algorithmFingerprint: currentReplay.algorithmFingerprint,
    thresholdSnapshotSha256: currentReplay.thresholdSnapshotSha256,
    controllerPolicySha256: currentReplay.controllerPolicySha256,
    renderKernelFingerprint: currentReplay.renderKernelFingerprint,
    renderRuntimeFingerprint: currentReplay.parentRenderRuntimeFingerprint,
    runtimeProvenance,
  });
  return parseStage12CodecSafeLraFeasibilitySearchResult(result);
}

function validResult() {
  const currentReplay = replay();
  const candidates: FeasibilityCandidate[] = [];
  for (let index = 0; index < currentReplay.controllerPolicy.lraMapBudget; index += 1) {
    const plan = planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    );
    if (plan.done) throw new Error("Unexpected map terminal state.");
    candidates.push(classifyStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      plan,
      measurement(-14.2, -1.1, 3.2, String(index + 1)),
    ));
  }
  const rollbackPlan = planStage12CodecSafeLraFeasibilityCandidate(
    payload,
    currentReplay,
    candidates,
  );
  if (rollbackPlan.done) throw new Error("Rollback was not planned.");
  const safe = currentReplay.parentGuardTrace.candidates[5]!;
  candidates.push(classifyStage12CodecSafeLraFeasibilityCandidate(
    payload,
    currentReplay,
    rollbackPlan,
    { integratedLufs: safe.integratedLufs, integratedLufsExact: safe.integratedLufsExact,
      truePeakDbtp: safe.truePeakDbtp, truePeakDbtpExact: safe.truePeakDbtpExact,
      loudnessRangeLu: safe.loudnessRangeLu,
      loudnessRangeLuExact: safe.loudnessRangeLuExact,
      encodedArtifactSha256: hex("e"),
      audioFrameMd5Sha256: safe.audioFrameMd5Sha256 },
  ));
  return resultFor(currentReplay, candidates);
}

function passResult() {
  const currentReplay = replay();
  const candidates: FeasibilityCandidate[] = [];
  for (let index = 0; index < currentReplay.controllerPolicy.lraMapBudget; index += 1) {
    const plan = planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    );
    if (plan.done) throw new Error("Unexpected map terminal state.");
    const observed = index === 1
      ? measurement(-15.25, -0.8, 5.5, String(index + 1))
      : measurement(-14.2, -1.1, 3.2, String(index + 1));
    candidates.push(classifyStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      plan,
      observed,
    ));
  }
  for (const observed of [
    measurement(-15.25, -1.06, 5.5, "a"),
    measurement(-15.05, -1.04, 5.5, "b"),
    measurement(-14.95, -1.03, 5.5, "c"),
    measurement(-14.95, -1.06, 5.5, "f"),
    measurement(-14.95, -1.06, 5.5, "f"),
  ]) {
    const plan = planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    );
    if (plan.done) throw new Error("Unexpected success terminal state.");
    candidates.push(classifyStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      plan,
      observed,
    ));
  }
  return resultFor(currentReplay, candidates);
}

function apply(db: DatabaseSync, sql: string) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function fixture() {
  const result = validResult();
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE command_log (
      id text PRIMARY KEY, command_type text NOT NULL, idempotency_key text NOT NULL,
      prev_state text, next_state text, actor_identity text, payload_json text, created_at text
    );
    CREATE TRIGGER command_log_validate_insert BEFORE INSERT ON command_log
      BEGIN SELECT RAISE(ABORT, 'LEGACY_TRIGGER_MUST_BE_REPLACED'); END;
    CREATE TABLE stage12_media_job (id text PRIMARY KEY, attempt_ordinal integer NOT NULL);
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
      id text PRIMARY KEY, state text NOT NULL, shadow_outcome text
    );
    CREATE TABLE stage12_codec_safe_true_peak_shadow_evidence (
      id text PRIMARY KEY, shadow_job_id text NOT NULL
    );
    CREATE TABLE stage12_codec_safe_lra_guard_shadow_job (
      id text PRIMARY KEY, stage12_job_id text NOT NULL, source_correction_job_id text NOT NULL,
      historical_failure_job_id text NOT NULL, diagnostic_replay_job_id text NOT NULL,
      diagnostic_replay_evidence_id text NOT NULL, parent_shadow_job_id text NOT NULL,
      parent_shadow_evidence_id text NOT NULL, state text NOT NULL, shadow_outcome text,
      terminal_reason text, last_evaluated_candidate_pass integer,
      best_safe_candidate_pass integer, selected_candidate_pass integer
    );
    CREATE TABLE stage12_codec_safe_lra_guard_shadow_evidence (
      id text PRIMARY KEY, shadow_job_id text NOT NULL, parent_shadow_job_id text NOT NULL,
      parent_shadow_evidence_id text NOT NULL, source_pre_master_r2_key text NOT NULL,
      source_pre_master_sha256 text NOT NULL, source_pre_master_byte_length integer NOT NULL,
      source_receipt_sha256 text NOT NULL, threshold_snapshot_sha256 text NOT NULL,
      render_kernel_fingerprint text NOT NULL,
      lossless_reference_sha256 text NOT NULL, lossless_reference_byte_length integer NOT NULL,
      lossless_reference_frame_md5_sha256 text NOT NULL,
      lossless_reference_codec text NOT NULL, lossless_reference_sample_rate_hz integer NOT NULL,
      expected_worker_image_digest text NOT NULL, worker_image_digest text NOT NULL,
      render_runtime_fingerprint text NOT NULL, candidates_json text NOT NULL,
      final_integrated_lufs real NOT NULL, final_integrated_lufs_exact text NOT NULL,
      final_true_peak_dbtp real NOT NULL, final_true_peak_dbtp_exact text NOT NULL,
      final_loudness_range_lu real NOT NULL, final_loudness_range_lu_exact text NOT NULL,
      failed_predicates_json text NOT NULL, shadow_outcome text NOT NULL,
      terminal_reason text NOT NULL, last_evaluated_candidate_pass integer NOT NULL,
      best_safe_candidate_pass integer, selected_candidate_pass integer NOT NULL,
      corrected_output_uploaded integer NOT NULL, historical_backfill integer NOT NULL,
      provider_call_count integer NOT NULL, provider_dispatch text NOT NULL,
      calibration_executed integer NOT NULL, finalize_executed integer NOT NULL,
      release_eligible integer NOT NULL, production_activation_executed integer NOT NULL,
      auto_publish text NOT NULL
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
      ('true-peak-1','READY','FAIL');
    INSERT INTO stage12_codec_safe_true_peak_shadow_evidence VALUES
      ('${truePeakEvidenceId}','true-peak-1');
    INSERT INTO stage12_codec_safe_lra_guard_shadow_job VALUES
      ('guard-1','job-3','correction-2','correction-3','replay-1','${hex("8")}',
       'true-peak-1','${truePeakEvidenceId}','READY','FAIL','BUDGET_EXHAUSTED',7,5,5);`);
  db.prepare(`INSERT INTO stage12_codec_safe_lra_guard_shadow_evidence VALUES
    (@id,'guard-1','true-peak-1',@parentId,@r2Key,@sha256,@byteLength,@receipt,
     @threshold,@kernel,@losslessSha,@losslessLength,@losslessFrame,'pcm_f32le',48000,
     @expected,@worker,@runtime,@candidates,-15.25,'-15.25',
     -1.06,'-1.06',3.2,'3.20',@failed,'FAIL','BUDGET_EXHAUSTED',7,5,5,
     0,0,0,'OFF',0,0,0,0,'OFF')`).run({ id: guardEvidenceId,
    parentId: truePeakEvidenceId, r2Key: source.r2Key, sha256: source.sha256,
    byteLength: source.byteLength, receipt: source.receiptSha256,
    threshold: result.thresholdSnapshotSha256, kernel: result.renderKernelFingerprint,
    losslessSha: result.losslessReference.sha256,
    losslessLength: result.losslessReference.byteLength,
    losslessFrame: result.losslessReference.audioFrameMd5Sha256,
    expected: result.parentWorkerImageDigest,
    worker: result.parentWorkerImageDigest, runtime: result.parentRenderRuntimeFingerprint,
    candidates: JSON.stringify(result.parentGuardTrace.candidates),
    failed: JSON.stringify(result.parentGuardTrace.failedPredicates) });
  apply(db, migration);
  return { db, result };
}

function insertJob(db: DatabaseSync, result = validResult()) {
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_search_job
    (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
     diagnostic_replay_job_id,diagnostic_replay_evidence_id,parent_true_peak_shadow_job_id,
     parent_true_peak_shadow_evidence_id,parent_lra_guard_shadow_job_id,
     parent_lra_guard_shadow_evidence_id,idempotency_key,callback_token_hash,actor_identity,
     owner_approval_text,state,evidence_semantics,source_pre_master_r2_key,
     source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256,
     expected_worker_image_digest,parent_worker_image_digest,algorithm_fingerprint,
     threshold_snapshot_sha256,controller_policy_sha256,render_kernel_fingerprint,
     parent_render_kernel_fingerprint,parent_render_runtime_fingerprint)
    VALUES ('search-1','job-3','correction-2','correction-3','replay-1','${hex("8")}',
      'true-peak-1',@truePeakEvidence,'guard-1',@guardEvidence,'${hex("5")}',
      '${hex("6")}','owner@example.com','RUN STAGE 12 CODEC SAFE LRA FEASIBILITY SEARCH',
      'PENDING',@semantics,@r2Key,@sourceSha,@sourceLength,@receipt,@expected,@parent,
      @algorithm,@threshold,@policy,@kernel,@parentKernel,@parentRuntime)`).run({
    truePeakEvidence: truePeakEvidenceId, guardEvidence: guardEvidenceId,
    semantics: result.evidenceSemantics, r2Key: result.source.r2Key,
    sourceSha: result.source.sha256, sourceLength: result.source.byteLength,
    receipt: result.source.receiptSha256, expected: result.expectedWorkerImageDigest,
    parent: result.parentWorkerImageDigest, algorithm: result.algorithmFingerprint,
    threshold: result.thresholdSnapshotSha256, policy: result.controllerPolicySha256,
    kernel: result.renderKernelFingerprint,
    parentKernel: result.parentRenderKernelFingerprint,
    parentRuntime: result.parentRenderRuntimeFingerprint,
  });
  return result;
}

function insertEvidence(db: DatabaseSync, result = validResult()) {
  const columns = [
    "id", "search_job_id", "stage12_job_id", "source_correction_job_id",
    "historical_failure_job_id", "diagnostic_replay_job_id",
    "diagnostic_replay_evidence_id", "parent_true_peak_shadow_job_id",
    "parent_true_peak_shadow_evidence_id", "parent_lra_guard_shadow_job_id",
    "parent_lra_guard_shadow_evidence_id", "evidence_semantics",
    "lossless_reference_sha256", "lossless_reference_byte_length",
    "lossless_reference_frame_md5_sha256", "lossless_reference_codec",
    "lossless_reference_sample_rate_hz", "parent_guard_trace_json",
    "controller_policy_json", "candidates_json", "budget_ledger_json",
    "last_candidate_ordinal", "selected_seed_ordinal", "selected_candidate_ordinal",
    "verified_candidate_ordinal", "safe_rollback_json", "terminal_reason",
    "final_integrated_lufs", "final_integrated_lufs_exact", "final_true_peak_dbtp",
    "final_true_peak_dbtp_exact", "final_loudness_range_lu",
    "final_loudness_range_lu_exact", "failed_predicates_json", "shadow_outcome",
    "expected_worker_image_digest", "parent_worker_image_digest", "worker_image_digest",
    "algorithm_fingerprint", "threshold_snapshot_sha256", "controller_policy_sha256",
    "render_kernel_fingerprint", "parent_render_kernel_fingerprint",
    "parent_render_runtime_fingerprint",
    "render_runtime_fingerprint", "parent_runtime_provenance_json",
    "runtime_provenance_json", "source_pre_master_r2_key", "source_pre_master_sha256",
    "source_pre_master_byte_length", "source_receipt_sha256",
  ];
  const values: Record<string, string | number | null> = {
    id: "search-evidence-1", search_job_id: "search-1", stage12_job_id: "job-3",
    source_correction_job_id: "correction-2", historical_failure_job_id: "correction-3",
    diagnostic_replay_job_id: "replay-1", diagnostic_replay_evidence_id: hex("8"),
    parent_true_peak_shadow_job_id: "true-peak-1",
    parent_true_peak_shadow_evidence_id: truePeakEvidenceId,
    parent_lra_guard_shadow_job_id: "guard-1",
    parent_lra_guard_shadow_evidence_id: guardEvidenceId,
    evidence_semantics: result.evidenceSemantics,
    lossless_reference_sha256: result.losslessReference.sha256,
    lossless_reference_byte_length: result.losslessReference.byteLength,
    lossless_reference_frame_md5_sha256: result.losslessReference.audioFrameMd5Sha256,
    lossless_reference_codec: result.losslessReference.codec,
    lossless_reference_sample_rate_hz: result.losslessReference.sampleRateHz,
    parent_guard_trace_json: JSON.stringify(result.parentGuardTrace),
    controller_policy_json: JSON.stringify(result.controllerPolicy),
    candidates_json: JSON.stringify(result.candidates),
    budget_ledger_json: JSON.stringify(result.budgetLedger),
    last_candidate_ordinal: result.lastEvaluatedCandidateOrdinal,
    selected_seed_ordinal: result.selectedSeedOrdinal,
    selected_candidate_ordinal: result.selectedCandidateOrdinal,
    verified_candidate_ordinal: result.verifiedCandidateOrdinal,
    safe_rollback_json: JSON.stringify(result.safeRollback),
    terminal_reason: result.terminalReason,
    final_integrated_lufs: result.finalMeasurements.integratedLufs,
    final_integrated_lufs_exact: result.finalMeasurements.integratedLufsExact,
    final_true_peak_dbtp: result.finalMeasurements.truePeakDbtp,
    final_true_peak_dbtp_exact: result.finalMeasurements.truePeakDbtpExact,
    final_loudness_range_lu: result.finalMeasurements.loudnessRangeLu,
    final_loudness_range_lu_exact: result.finalMeasurements.loudnessRangeLuExact,
    failed_predicates_json: JSON.stringify(result.failedPredicates),
    shadow_outcome: result.shadowOutcome,
    expected_worker_image_digest: result.expectedWorkerImageDigest,
    parent_worker_image_digest: result.parentWorkerImageDigest,
    worker_image_digest: result.workerImageDigest,
    algorithm_fingerprint: result.algorithmFingerprint,
    threshold_snapshot_sha256: result.thresholdSnapshotSha256,
    controller_policy_sha256: result.controllerPolicySha256,
    render_kernel_fingerprint: result.renderKernelFingerprint,
    parent_render_kernel_fingerprint: result.parentRenderKernelFingerprint,
    parent_render_runtime_fingerprint: result.parentRenderRuntimeFingerprint,
    render_runtime_fingerprint: result.renderRuntimeFingerprint,
    parent_runtime_provenance_json: JSON.stringify(result.parentRuntimeProvenance),
    runtime_provenance_json: JSON.stringify(result.runtimeProvenance),
    source_pre_master_r2_key: result.source.r2Key,
    source_pre_master_sha256: result.source.sha256,
    source_pre_master_byte_length: result.source.byteLength,
    source_receipt_sha256: result.source.receiptSha256,
  };
  db.prepare(`INSERT INTO stage12_codec_safe_lra_feasibility_search_evidence
    (${columns.join(",")}) VALUES (${columns.map((column) => `@${column}`).join(",")})`)
    .run(values);
}

describe("migration 0033 Stage 12 codec-safe LRA feasibility search", () => {
  test("is append-only and preserves the immutable attempt/correction/replay histories", () => {
    const { db } = fixture();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_codec_safe_lra_feasibility_search_job")
      .get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT attempt_ordinal FROM stage12_media_job").get())
      .toEqual({ attempt_ordinal: 3 });
    expect(db.prepare("SELECT correction_ordinal,state,outcome FROM stage12_audio_p0_correction_job")
      .get()).toEqual({ correction_ordinal: 2, state: "READY", outcome: "FAIL" });
    expect(db.prepare("SELECT correction_ordinal,state,error_code FROM stage12_audio_p0_correction_retry_job")
      .get()).toEqual({ correction_ordinal: 3, state: "FAILED",
        error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" });
    expect(db.prepare("SELECT state,shadow_outcome,terminal_reason FROM stage12_codec_safe_lra_guard_shadow_job")
      .get()).toEqual({ state: "READY", shadow_outcome: "FAIL",
        terminal_reason: "BUDGET_EXHAUSTED" });
  });

  test("requires both exact parents and admits only the typed shadow transition", () => {
    const { db } = fixture();
    insertJob(db);
    const wrongParent = fixture();
    wrongParent.db.exec(`UPDATE stage12_codec_safe_lra_guard_shadow_evidence
      SET id='${hex("1")}'`);
    expect(() => insertJob(wrongParent.db)).toThrow(/FOREIGN KEY|LINEAGE_INVALID/u);
    expect(() => db.prepare(`INSERT INTO command_log
      (id,command_type,idempotency_key,prev_state,next_state) VALUES
      ('cmd','RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH',
       '${hex("7")}','TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL',
       'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_PENDING')`).run())
      .not.toThrow();
    const bad = fixture();
    bad.db.exec(`UPDATE stage12_codec_safe_lra_guard_shadow_evidence
      SET shadow_outcome='PASS'`);
    expect(() => insertJob(bad.db)).toThrow(
      /STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_LINEAGE_INVALID/u,
    );
  });

  test("accepts pass-5 rollback below the lattice floor and seals terminal evidence", () => {
    const { db, result } = fixture();
    insertJob(db, result);
    insertEvidence(db, result);
    db.prepare(`UPDATE stage12_codec_safe_lra_feasibility_search_job SET state='READY',
      shadow_outcome=@outcome,terminal_reason=@reason,last_candidate_ordinal=@last,
      selected_seed_ordinal=@seed,selected_candidate_ordinal=@selected,
      verified_candidate_ordinal=@verified,worker_image_digest=@worker,
      render_runtime_fingerprint=@runtime WHERE id='search-1'`).run({
      outcome: result.shadowOutcome, reason: result.terminalReason,
      last: result.lastEvaluatedCandidateOrdinal, seed: result.selectedSeedOrdinal,
      selected: result.selectedCandidateOrdinal, verified: result.verifiedCandidateOrdinal,
      worker: result.workerImageDigest, runtime: result.renderRuntimeFingerprint,
    });
    expect(result.candidates.at(-1)).toMatchObject({ phase: "ROLLBACK_VERIFY",
      disposition: "ROLLBACK_SAFE", macroDepthDb: 10.70625 });
    expect(result.candidates.slice(0, 8).every((candidate) =>
      candidate.macroDepthDb >= 10.9 && candidate.macroDepthDb <= 14)).toBe(true);
    expect(db.prepare(`SELECT state,shadow_outcome,terminal_reason,last_candidate_ordinal,
      selected_candidate_ordinal,verified_candidate_ordinal,corrected_output_uploaded,
      provider_call_count,production_activation_executed
      FROM stage12_codec_safe_lra_feasibility_search_job`).get()).toEqual({
      state: "READY", shadow_outcome: "FAIL",
      terminal_reason: "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED",
      last_candidate_ordinal: 8, selected_candidate_ordinal: 8,
      verified_candidate_ordinal: null, corrected_output_uploaded: 0,
      provider_call_count: 0, production_activation_executed: 0,
    });
    expect(() => db.exec(`UPDATE stage12_codec_safe_lra_feasibility_search_evidence
      SET final_true_peak_dbtp=-2`)).toThrow(/FEASIBILITY_SEARCH_EVIDENCE_IMMUTABLE/u);
    expect(() => db.exec("DELETE FROM stage12_codec_safe_lra_feasibility_search_job"))
      .toThrow(/FEASIBILITY_SEARCH_JOB_IMMUTABLE/u);
  });

  test("persists PASS against the verified encoded artifact, not the verification row", () => {
    const { db } = fixture();
    const result = passResult();
    insertJob(db, result);
    insertEvidence(db, result);
    db.prepare(`UPDATE stage12_codec_safe_lra_feasibility_search_job SET state='READY',
      shadow_outcome=@outcome,terminal_reason=@reason,last_candidate_ordinal=@last,
      selected_seed_ordinal=@seed,selected_candidate_ordinal=@selected,
      verified_candidate_ordinal=@verified,worker_image_digest=@worker,
      render_runtime_fingerprint=@runtime WHERE id='search-1'`).run({
      outcome: result.shadowOutcome, reason: result.terminalReason,
      last: result.lastEvaluatedCandidateOrdinal, seed: result.selectedSeedOrdinal,
      selected: result.selectedCandidateOrdinal, verified: result.verifiedCandidateOrdinal,
      worker: result.workerImageDigest, runtime: result.renderRuntimeFingerprint,
    });
    const last = result.candidates[result.lastEvaluatedCandidateOrdinal]!;
    const selected = result.candidates[result.selectedCandidateOrdinal]!;
    expect(last).toMatchObject({ phase: "FINAL_VERIFY", disposition: "FINAL_PASS" });
    expect(result.selectedCandidateOrdinal).toBe(result.verifiedCandidateOrdinal);
    expect(result.lastEvaluatedCandidateOrdinal).not.toBe(result.selectedCandidateOrdinal);
    expect(last.encodedArtifactSha256).toBe(selected.encodedArtifactSha256);
    expect(db.prepare(`SELECT shadow_outcome,terminal_reason,last_candidate_ordinal,
      selected_candidate_ordinal,verified_candidate_ordinal
      FROM stage12_codec_safe_lra_feasibility_search_job`).get()).toEqual({
      shadow_outcome: "PASS", terminal_reason: "PASS",
      last_candidate_ordinal: result.lastEvaluatedCandidateOrdinal,
      selected_candidate_ordinal: result.selectedCandidateOrdinal,
      verified_candidate_ordinal: result.verifiedCandidateOrdinal,
    });
  });

  test("rejects mismatched terminal reason, outcome, and selected row shapes", () => {
    for (const changed of [
      { terminalReason: "PASS", shadowOutcome: "PASS" },
      { terminalReason: "FINAL_SAME_ARTIFACT_VERIFICATION_FAILED" },
      { terminalReason: "SAFE_ROLLBACK_REPRODUCTION_DRIFT" },
      { selectedCandidateOrdinal: 0 },
      { verifiedCandidateOrdinal: 0 },
    ]) {
      const { db, result } = fixture();
      insertJob(db, result);
      expect(() => insertEvidence(db, { ...result, ...changed } as typeof result))
        .toThrow(/STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID/u);
    }
    const { db, result } = fixture();
    insertJob(db, result);
    expect(() => insertEvidence(db, {
      ...result,
      losslessReference: { ...result.losslessReference, sha256: hex("1") },
    } as typeof result)).toThrow(
      /STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID/u,
    );
  });

  test("parser rejects lineage, fingerprint, artifact, and non-rollback depth drift", () => {
    const result = validResult();
    for (const changed of [
      { source: { ...result.source, sha256: hex("1") } },
      { parentTruePeakShadow: { ...result.parentTruePeakShadow, evidenceId: hex("2") } },
      { parentLraGuard: { ...result.parentLraGuard, evidenceId: hex("3") } },
      { algorithmFingerprint: hex("4") },
      { thresholdSnapshotSha256: hex("5") },
      { controllerPolicySha256: hex("6") },
      { parentGuardTrace: { ...result.parentGuardTrace,
        candidates: result.parentGuardTrace.candidates.map((candidate, index) => index === 2
          ? { ...candidate, loudnessRangeLuExact: "2.900" }
          : candidate) } },
      { candidates: result.candidates.map((candidate, index) => index === 0
        ? { ...candidate, macroDepthDb: 10.70625 } : candidate) },
    ]) {
      expect(() => parseStage12CodecSafeLraFeasibilitySearchResult({
        ...result,
        ...changed,
      })).toThrow(/STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_RESULT_INVALID/u);
    }
    const passed = passResult();
    expect(() => parseStage12CodecSafeLraFeasibilitySearchResult({
      ...passed,
      candidates: passed.candidates.map((candidate, index) =>
        index === passed.lastEvaluatedCandidateOrdinal
          ? { ...candidate, encodedArtifactSha256: hex("7") }
          : candidate),
    })).toThrow(/STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_RESULT_INVALID/u);
  });

  test("rejects forbidden side effects and cannot synthesize ordinal or attempt four", () => {
    const { db, result } = fixture();
    insertJob(db, result);
    expect(() => db.exec(`UPDATE stage12_codec_safe_lra_feasibility_search_job
      SET production_activation_executed=1 WHERE id='search-1'`)).toThrow();
    expect(() => db.exec(`UPDATE stage12_codec_safe_lra_feasibility_search_job
      SET provider_call_count=1 WHERE id='search-1'`)).toThrow();
    expect(db.prepare("SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4")
      .get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT count(*) AS count FROM stage12_audio_p0_correction_retry_job WHERE correction_ordinal=4")
      .get()).toEqual({ count: 0 });
  });
});
