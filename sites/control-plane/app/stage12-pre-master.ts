import { createHash } from "node:crypto";
import { ASSURANCE, AUDIO, AV_SYNC_MS, MASTER, RETRY,
  STAGE12_CODEC_SAFE_LRA_GUARD, VISUAL } from "../packages/contracts/src/thresholds";

const HEX64 = /^[0-9a-f]{64}$/u;

export type Stage12Shot = {
  shotId: string;
  startFrame: number;
  endFrame: number;
  headline: string;
  background: string;
  accent: string;
  signal: string;
};

export type Stage12RequestInput = {
  idempotencyKey: string;
  packageId: string;
  stageInstanceId: string;
  durationSec: number;
  narration: { r2Key: string; sha256: string };
  stage09ArtifactSha256: string;
  stage11ArtifactSha256: string;
  rightsEvidenceSha256: string;
  shots: Stage12Shot[];
  transcript: string;
};

export type Stage12MediaRequest = ReturnType<typeof buildTrackGVideoOneStage12Request>;

export type Stage12Measurements = {
  scannedDurationSec: number;
  blackFrameIntervalCount: number;
  freezeFrameIntervalCount: number;
  silenceIntervalCount: number;
  missingFrameCount: number;
  nearStaticViolationCount: number;
  clippingSampleCount: number;
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
  avSyncOffsetMs: number;
  mobileLegibilityPass: boolean;
  safeZonePass: boolean;
  timelineIssueCount: number;
  debugOverlayCount: number;
  watermarkCount: number;
  templateResidueCount: number;
  missingInputCount: number;
  unresolvedRightsCount: number;
  p0DefectCount: number;
  width: number;
  height: number;
  fps: number;
  colorPrimaries: string;
};

export type Stage12MediaReceipt = {
  accepted: true;
  imageDigest: string;
  preMaster: {
    r2Key: string;
    sha256: string;
    byteLength: number;
    frameMd5Sha256: string;
  };
  measurements: Stage12Measurements;
  reportSha256: string;
  renderAuthorized: boolean;
  providerCallCount: 0;
  providerDispatch: "OFF";
  autoPublish: "OFF";
};

export const STAGE12_ENCODED_LOUDNESS_FAILURE_PREDICATES = [
  "INTEGRATED_LUFS_BELOW_MIN",
  "INTEGRATED_LUFS_ABOVE_MAX",
  "TRUE_PEAK_DBTP_ABOVE_MAX",
  "LOUDNESS_RANGE_LU_BELOW_MIN",
  "LOUDNESS_RANGE_LU_ABOVE_MAX",
] as const;

export type Stage12EncodedLoudnessFailurePredicate =
  typeof STAGE12_ENCODED_LOUDNESS_FAILURE_PREDICATES[number];

export type Stage12EncodedLoudnessPassMeasurement = {
  correctionPass: number;
  phase: "INITIAL_ENCODED_MEASUREMENT" | "POST_CORRECTION_PASS"
    | "FINAL_POST_ENCODE_VERIFICATION";
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
};

export type Stage12EncodedLoudnessFailureDiagnostic = {
  schemaVersion: 1;
  boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION";
  correctionPass: number;
  correctionPassLimit: number;
  measurementsByPass: Stage12EncodedLoudnessPassMeasurement[];
  finalMeasurements: {
    integratedLufs: number;
    truePeakDbtp: number;
    loudnessRangeLu: number;
  };
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  workerImageDigest: string;
};

export type Stage12EncodedLoudnessExactMeasurement = {
  correctionPass: number;
  phase: "INITIAL_ENCODED_MEASUREMENT" | "POST_CORRECTION_PASS"
    | "FINAL_POST_ENCODE_VERIFICATION";
  integratedLufs: number;
  integratedLufsExact: string;
  truePeakDbtp: number;
  truePeakDbtpExact: string;
  loudnessRangeLu: number;
  loudnessRangeLuExact: string;
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  audioFrameMd5Sha256: string;
};

export type Stage12EncodedLoudnessDiagnosticReplayResult = {
  accepted: true;
  schemaVersion: 1;
  evidenceSemantics: "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL";
  boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION";
  source: { correctionOrdinal: 2; correctionJobId: string; r2Key: string; sha256: string;
    byteLength: number; receiptSha256: string };
  historicalFailure: { correctionOrdinal: 3; correctionJobId: string;
    errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" };
  sourceBaseline: Omit<Stage12EncodedLoudnessExactMeasurement, "correctionPass" | "phase"> & {
    phase: "SOURCE_ORDINAL2_BASELINE";
  };
  measurementsByPass: Stage12EncodedLoudnessExactMeasurement[];
  terminalCorrectionPass: number;
  finalMeasurements: {
    integratedLufs: number; integratedLufsExact: string;
    truePeakDbtp: number; truePeakDbtpExact: string;
    loudnessRangeLu: number; loudnessRangeLuExact: string;
  };
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  replayOutcome: "PASS" | "FAIL";
  workerImageDigest: string;
  expectedWorkerImageDigest: string;
  algorithmFingerprint: string;
  thresholdSnapshotSha256: string;
  runtimeProvenance: { ffmpegVersion: string; ffmpegBuildFingerprint: string;
    libopusEncoderFingerprint: string };
  correctionStrategyVersion: 3;
  correctionPassLimit: 3;
  correctedOutputUploaded: false;
  historicalBackfill: false;
  providerCallCount: 0;
  providerDispatch: "OFF";
  calibration: false;
  finalize: false;
  releaseEligible: false;
  autoPublish: "OFF";
};

export type Stage12CodecSafeTruePeakCandidate = {
  candidatePass: number;
  phase: "INITIAL_CODEC_SAFE_CANDIDATE" | "POST_OPUS_FEEDBACK_CANDIDATE";
  losslessReferenceSha256: string;
  integratedTargetLufs: number;
  limiterCeilingDbtp: number;
  macroDepthDb: number;
  codecOvershootDb: number;
  integratedLufs: number;
  integratedLufsExact: string;
  truePeakDbtp: number;
  truePeakDbtpExact: string;
  loudnessRangeLu: number;
  loudnessRangeLuExact: string;
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  audioFrameMd5Sha256: string;
};

export type Stage12CodecSafeTruePeakShadowResult = {
  accepted: true;
  schemaVersion: 1;
  evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION";
  boundary: "POST_OPUS_TRUE_PEAK_FEEDBACK";
  source: { correctionOrdinal: 2; correctionJobId: string; r2Key: string; sha256: string;
    byteLength: number; receiptSha256: string };
  historicalFailure: { correctionOrdinal: 3; correctionJobId: string;
    errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" };
  diagnosticReplay: { jobId: string; evidenceId: string };
  losslessReference: { sha256: string; byteLength: number; audioFrameMd5Sha256: string;
    codec: "pcm_f32le"; sampleRateHz: number };
  candidates: Stage12CodecSafeTruePeakCandidate[];
  terminalCandidatePass: number;
  finalMeasurements: {
    integratedLufs: number; integratedLufsExact: string;
    truePeakDbtp: number; truePeakDbtpExact: string;
    loudnessRangeLu: number; loudnessRangeLuExact: string;
  };
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  shadowOutcome: "PASS" | "FAIL";
  workerImageDigest: string;
  expectedWorkerImageDigest: string;
  algorithmFingerprint: string;
  thresholdSnapshotSha256: string;
  runtimeProvenance: { ffmpegVersion: string; ffmpegBuildFingerprint: string;
    libopusEncoderFingerprint: string };
  correctionPassLimit: 3;
  correctedOutputUploaded: false;
  historicalBackfill: false;
  providerCallCount: 0;
  providerDispatch: "OFF";
  calibration: false;
  finalize: false;
  releaseEligible: false;
  productionActivation: false;
  autoPublish: "OFF";
};

export type Stage12CodecSafeLraGuardCandidate = {
  done: false;
  candidatePass: number;
  phase: "ANCHOR_REPRODUCTION" | "LRA_BRACKET_SEARCH" | "INTEGRATED_LUFS_TRIM";
  decision: "ANCHOR" | "BISECTION" | "NEAREST_BOUNDARY_TRIM";
  disposition: "SAFE_ANCHOR" | "ANCHOR_DRIFT" | "LOW_BRACKET" | "HIGH_BRACKET"
    | "LRA_ACCEPTED" | "TRIM_ACCEPTED" | "REGRESSION_REJECTED" | "FULL_PASS";
  parentCandidatePass: number | null;
  rollbackToCandidatePass: number | null;
  bracketLowDepthDb: number;
  bracketHighDepthDb: number;
  integratedTargetLufs: number;
  limiterCeilingDbtp: number;
  macroDepthDb: number;
  targetStepLufs: number;
  losslessReferenceSha256: string;
  codecOvershootDb: number;
  integratedLufs: number;
  integratedLufsExact: string;
  truePeakDbtp: number;
  truePeakDbtpExact: string;
  loudnessRangeLu: number;
  loudnessRangeLuExact: string;
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  audioFrameMd5Sha256: string;
};

export type Stage12CodecSafeLraGuardShadowResult = {
  accepted: true;
  schemaVersion: 1;
  evidenceSemantics: "CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION";
  boundary: "POST_OPUS_LRA_GUARD_FEEDBACK";
  source: { correctionOrdinal: 2; correctionJobId: string; r2Key: string; sha256: string;
    byteLength: number; receiptSha256: string };
  historicalFailure: { correctionOrdinal: 3; correctionJobId: string;
    errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" };
  diagnosticReplay: { jobId: string; evidenceId: string };
  parentShadow: { jobId: string; evidenceId: string };
  losslessReference: { sha256: string; byteLength: number; audioFrameMd5Sha256: string;
    codec: "pcm_f32le"; sampleRateHz: number };
  anchorReference: Stage12CodecSafeTruePeakCandidate;
  highBracketReference: Stage12CodecSafeTruePeakCandidate;
  controllerPolicy: Stage12CodecSafeLraGuardControllerPolicy;
  candidates: Stage12CodecSafeLraGuardCandidate[];
  shadowOutcome: "PASS" | "FAIL";
  terminalReason: "PASS" | "ANCHOR_REPRODUCTION_DRIFT" | "BUDGET_EXHAUSTED";
  lastEvaluatedCandidatePass: number;
  bestSafeCandidatePass: number | null;
  selectedCandidatePass: number;
  finalMeasurements: {
    integratedLufs: number; integratedLufsExact: string;
    truePeakDbtp: number; truePeakDbtpExact: string;
    loudnessRangeLu: number; loudnessRangeLuExact: string;
  };
  failedPredicates: Stage12EncodedLoudnessFailurePredicate[];
  workerImageDigest: string;
  expectedWorkerImageDigest: string;
  parentWorkerImageDigest: string;
  algorithmFingerprint: string;
  thresholdSnapshotSha256: string;
  controllerPolicySha256: string;
  renderKernelFingerprint: string;
  parentRenderRuntimeFingerprint: string;
  renderRuntimeFingerprint: string;
  parentRuntimeProvenance: { ffmpegVersion: string; ffmpegBuildFingerprint: string;
    libopusEncoderFingerprint: string };
  runtimeProvenance: { ffmpegVersion: string; ffmpegBuildFingerprint: string;
    libopusEncoderFingerprint: string };
  correctedOutputUploaded: false;
  historicalBackfill: false;
  providerCallCount: 0;
  providerDispatch: "OFF";
  calibration: false;
  finalize: false;
  releaseEligible: false;
  productionActivation: false;
  autoPublish: "OFF";
};

export type Stage12GateResult = {
  gate: string;
  state: "PASS";
  evidence: string;
};

export type Stage12ReceiptEvaluation = {
  receipt: Stage12MediaReceipt;
  failures: string[];
  passed: boolean;
};

function assertHex64(value: string, code: string): void {
  if (!HEX64.test(value)) throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function loudnessFailurePredicates(measurement: {
  integratedLufs: number; truePeakDbtp: number; loudnessRangeLu: number;
}): Stage12EncodedLoudnessFailurePredicate[] {
  const failed: Stage12EncodedLoudnessFailurePredicate[] = [];
  if (measurement.integratedLufs < AUDIO.LUFS_I.target - AUDIO.LUFS_I.tolerance) {
    failed.push("INTEGRATED_LUFS_BELOW_MIN");
  }
  if (measurement.integratedLufs > AUDIO.LUFS_I.target + AUDIO.LUFS_I.tolerance) {
    failed.push("INTEGRATED_LUFS_ABOVE_MAX");
  }
  if (measurement.truePeakDbtp > AUDIO.TRUE_PEAK_MAX_DBTP) {
    failed.push("TRUE_PEAK_DBTP_ABOVE_MAX");
  }
  if (measurement.loudnessRangeLu < AUDIO.LRA.min) {
    failed.push("LOUDNESS_RANGE_LU_BELOW_MIN");
  }
  if (measurement.loudnessRangeLu > AUDIO.LRA.max) {
    failed.push("LOUDNESS_RANGE_LU_ABOVE_MAX");
  }
  return failed;
}

function parseFailurePredicates(value: unknown): Stage12EncodedLoudnessFailurePredicate[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length
    || !value.every((entry) => typeof entry === "string"
      && STAGE12_ENCODED_LOUDNESS_FAILURE_PREDICATES.includes(
        entry as Stage12EncodedLoudnessFailurePredicate,
      ))) {
    throw new Error("STAGE12_ENCODED_LOUDNESS_FAILURE_DIAGNOSTIC_INVALID");
  }
  return [...value] as Stage12EncodedLoudnessFailurePredicate[];
}

function predicatesMatch(left: Stage12EncodedLoudnessFailurePredicate[],
  right: Stage12EncodedLoudnessFailurePredicate[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonicalizeReplayValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite replay value.");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalizeReplayValue).join(",")}]`;
  if (!isRecord(value)) throw new TypeError("Unsupported replay value.");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key.normalize("NFC"))}:${canonicalizeReplayValue(value[key])}`).join(",")}}`;
}

function replayHash(value: unknown): string {
  return createHash("sha256").update(canonicalizeReplayValue(value)).digest("hex");
}

export function stage12EncodedLoudnessDiagnosticReplayFingerprints(
  request: Stage12MediaRequest,
  correctionPassLimit: number = RETRY.MAX_ATTEMPTS,
) {
  const thresholdSnapshotSha256 = replayHash({
    integratedLufs: request.qa.loudness.integratedLufs,
    toleranceLufs: request.qa.loudness.toleranceLufs,
    truePeakMaxDbtp: request.qa.loudness.truePeakMaxDbtp,
    lraMin: request.qa.loudness.lraMin,
    lraMax: request.qa.loudness.lraMax,
    nearStaticMaxSec: request.qa.nearStaticMaxSec,
    sampleRateHz: request.render.sampleRateHz,
  });
  return {
    thresholdSnapshotSha256,
    algorithmFingerprint: replayHash({
      algorithmVersion: "stage12-encoded-loudness-diagnostic-replay-v1",
      correctionStrategyVersion: 3,
      correctionPassLimit,
      thresholdSnapshotSha256,
    }),
  };
}

export function stage12CodecSafeTruePeakFingerprints(
  request: Stage12MediaRequest,
  correctionPassLimit: number = RETRY.MAX_ATTEMPTS,
) {
  const thresholdSnapshotSha256 = replayHash({
    integratedLufs: request.qa.loudness.integratedLufs,
    toleranceLufs: request.qa.loudness.toleranceLufs,
    truePeakMaxDbtp: request.qa.loudness.truePeakMaxDbtp,
    lraMin: request.qa.loudness.lraMin,
    lraMax: request.qa.loudness.lraMax,
    nearStaticMaxSec: request.qa.nearStaticMaxSec,
    sampleRateHz: request.render.sampleRateHz,
  });
  return {
    thresholdSnapshotSha256,
    algorithmFingerprint: replayHash({
      algorithmVersion: "stage12-codec-safe-true-peak-shadow-v1",
      correctionPassLimit,
      losslessCodec: "pcm_f32le",
      candidateInput: "CANONICAL_LOSSLESS_REFERENCE",
      feedback: "POST_OPUS_TRUE_PEAK",
      thresholdSnapshotSha256,
    }),
  };
}

export type Stage12CodecSafeLraGuardControllerPolicy = {
  maxCandidateCount: number;
  codecOvershootRegressionMaxDb: number;
  integratedBoundaryMarginLu: number;
  maxIntegratedTargetStepLu: number;
};

export const STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY:
Stage12CodecSafeLraGuardControllerPolicy = {
  maxCandidateCount: STAGE12_CODEC_SAFE_LRA_GUARD.MAX_CANDIDATES,
  codecOvershootRegressionMaxDb:
    STAGE12_CODEC_SAFE_LRA_GUARD.CODEC_OVERSHOOT_REGRESSION_MAX_DB,
  integratedBoundaryMarginLu:
    STAGE12_CODEC_SAFE_LRA_GUARD.INTEGRATED_BOUNDARY_MARGIN_LU,
  maxIntegratedTargetStepLu:
    STAGE12_CODEC_SAFE_LRA_GUARD.MAX_INTEGRATED_TARGET_STEP_LU,
};

export function stage12CodecSafeLraGuardFingerprints(
  request: Stage12MediaRequest,
  controllerPolicy: Stage12CodecSafeLraGuardControllerPolicy =
    STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY,
) {
  const thresholdSnapshotSha256 = replayHash({
    integratedLufs: request.qa.loudness.integratedLufs,
    toleranceLufs: request.qa.loudness.toleranceLufs,
    truePeakMaxDbtp: request.qa.loudness.truePeakMaxDbtp,
    lraMin: request.qa.loudness.lraMin,
    lraMax: request.qa.loudness.lraMax,
    nearStaticMaxSec: request.qa.nearStaticMaxSec,
    sampleRateHz: request.render.sampleRateHz,
  });
  const controllerPolicySha256 = replayHash(controllerPolicy);
  const renderKernelFingerprint = replayHash({
    renderKernelVersion: "stage12-codec-safe-render-kernel-v1",
    losslessCodec: "pcm_f32le",
    candidateInput: "CANONICAL_LOSSLESS_REFERENCE",
    macroDynamics: "ALTERNATING_HALF_PERIOD_V1",
    loudnormMode: "TWO_PASS_LINEAR_FALSE_WITH_LIMITER",
    sampleRateHz: request.render.sampleRateHz,
  });
  return {
    algorithmFingerprint: replayHash({
      algorithmVersion: "stage12-codec-safe-lra-guard-shadow-v1",
      anchor: "PRIOR_SHADOW_CANDIDATE_PASS_1",
      highBracket: "PRIOR_SHADOW_CANDIDATE_PASS_3",
      lraSearch: "BOUNDED_BISECTION",
      integratedTrim: "NEAREST_INTERIOR_BOUNDARY",
      regression: "ROLLBACK_TO_BEST_SAFE",
      controllerPolicySha256,
      renderKernelFingerprint,
      thresholdSnapshotSha256,
    }),
    thresholdSnapshotSha256,
    controllerPolicySha256,
    renderKernelFingerprint,
  };
}

function parseExactReplayMeasurement(value: unknown, expectedPass: number,
  expectedPhase: Stage12EncodedLoudnessExactMeasurement["phase"]
    | "SOURCE_ORDINAL2_BASELINE", includePass: boolean) {
  const invalid = () => new Error("STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_RESULT_INVALID");
  const keys = ["phase", "integratedLufs", "integratedLufsExact", "truePeakDbtp",
    "truePeakDbtpExact", "loudnessRangeLu", "loudnessRangeLuExact", "failedPredicates",
    "audioFrameMd5Sha256", ...(includePass ? ["correctionPass"] : [])];
  if (!isRecord(value) || !hasExactKeys(value, keys)
    || value.phase !== expectedPhase
    || (includePass && value.correctionPass !== expectedPass)
    || !Number.isFinite(value.integratedLufs) || !Number.isFinite(value.truePeakDbtp)
    || !Number.isFinite(value.loudnessRangeLu)
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.integratedLufsExact ?? ""))
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.truePeakDbtpExact ?? ""))
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.loudnessRangeLuExact ?? ""))
    || Number(value.integratedLufsExact) !== value.integratedLufs
    || Number(value.truePeakDbtpExact) !== value.truePeakDbtp
    || Number(value.loudnessRangeLuExact) !== value.loudnessRangeLu
    || !HEX64.test(String(value.audioFrameMd5Sha256 ?? ""))) throw invalid();
  const measurement = {
    ...(includePass ? { correctionPass: expectedPass } : {}),
    phase: expectedPhase,
    integratedLufs: Number(value.integratedLufs),
    integratedLufsExact: String(value.integratedLufsExact),
    truePeakDbtp: Number(value.truePeakDbtp),
    truePeakDbtpExact: String(value.truePeakDbtpExact),
    loudnessRangeLu: Number(value.loudnessRangeLu),
    loudnessRangeLuExact: String(value.loudnessRangeLuExact),
    failedPredicates: parseFailurePredicates(value.failedPredicates),
    audioFrameMd5Sha256: String(value.audioFrameMd5Sha256),
  };
  if (!predicatesMatch(measurement.failedPredicates,
    loudnessFailurePredicates(measurement))) throw invalid();
  return measurement;
}

export function parseStage12EncodedLoudnessDiagnosticReplayResult(
  value: unknown,
): Stage12EncodedLoudnessDiagnosticReplayResult {
  const invalid = () => new Error("STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_RESULT_INVALID");
  const topKeys = ["accepted", "schemaVersion", "evidenceSemantics", "boundary", "source",
    "historicalFailure", "sourceBaseline", "measurementsByPass", "terminalCorrectionPass",
    "finalMeasurements", "failedPredicates", "replayOutcome", "workerImageDigest",
    "expectedWorkerImageDigest", "algorithmFingerprint", "thresholdSnapshotSha256",
    "runtimeProvenance", "correctionStrategyVersion", "correctionPassLimit",
    "correctedOutputUploaded", "historicalBackfill", "providerCallCount", "providerDispatch",
    "calibration", "finalize", "releaseEligible", "autoPublish"];
  if (!isRecord(value) || !hasExactKeys(value, topKeys)
    || value.accepted !== true || value.schemaVersion !== 1
    || value.evidenceSemantics !== "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL"
    || value.boundary !== "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION"
    || value.correctionStrategyVersion !== 3 || value.correctionPassLimit !== RETRY.MAX_ATTEMPTS
    || value.correctedOutputUploaded !== false || value.historicalBackfill !== false
    || value.providerCallCount !== 0 || value.providerDispatch !== "OFF"
    || value.calibration !== false || value.finalize !== false || value.releaseEligible !== false
    || value.autoPublish !== "OFF"
    || !/^sha256:[a-f0-9]{64}$/u.test(String(value.workerImageDigest ?? ""))
    || value.workerImageDigest !== value.expectedWorkerImageDigest
    || !HEX64.test(String(value.algorithmFingerprint ?? ""))
    || !HEX64.test(String(value.thresholdSnapshotSha256 ?? ""))
    || !isRecord(value.source) || !hasExactKeys(value.source,
      ["correctionOrdinal", "correctionJobId", "r2Key", "sha256", "byteLength", "receiptSha256"])
    || value.source.correctionOrdinal !== 2
    || typeof value.source.correctionJobId !== "string" || value.source.correctionJobId.length < 3
    || !String(value.source.r2Key ?? "").startsWith("prod/")
    || String(value.source.r2Key).includes("..") || !HEX64.test(String(value.source.sha256 ?? ""))
    || !Number.isInteger(value.source.byteLength) || Number(value.source.byteLength) < 1
    || !HEX64.test(String(value.source.receiptSha256 ?? ""))
    || !isRecord(value.historicalFailure) || !hasExactKeys(value.historicalFailure,
      ["correctionOrdinal", "correctionJobId", "errorCode"])
    || value.historicalFailure.correctionOrdinal !== 3
    || typeof value.historicalFailure.correctionJobId !== "string"
    || value.historicalFailure.correctionJobId.length < 3
    || value.historicalFailure.errorCode !== "STAGE12_ENCODED_LOUDNESS_UNRESOLVED"
    || !Array.isArray(value.measurementsByPass) || value.measurementsByPass.length < 1
    || value.measurementsByPass.length > RETRY.MAX_ATTEMPTS + 1
    || value.terminalCorrectionPass !== value.measurementsByPass.length - 1
    || !isRecord(value.finalMeasurements) || !hasExactKeys(value.finalMeasurements,
      ["integratedLufs", "integratedLufsExact", "truePeakDbtp", "truePeakDbtpExact",
        "loudnessRangeLu", "loudnessRangeLuExact"])
    || !isRecord(value.runtimeProvenance) || !hasExactKeys(value.runtimeProvenance,
      ["ffmpegVersion", "ffmpegBuildFingerprint", "libopusEncoderFingerprint"])
    || typeof value.runtimeProvenance.ffmpegVersion !== "string"
    || value.runtimeProvenance.ffmpegVersion.length < 8
    || !HEX64.test(String(value.runtimeProvenance.ffmpegBuildFingerprint ?? ""))
    || !HEX64.test(String(value.runtimeProvenance.libopusEncoderFingerprint ?? ""))) throw invalid();
  const sourceBaseline = parseExactReplayMeasurement(
    value.sourceBaseline, -1, "SOURCE_ORDINAL2_BASELINE", false,
  );
  const measurementsByPass = value.measurementsByPass.map((entry, index) =>
    parseExactReplayMeasurement(entry, index,
      index === 0 ? "INITIAL_ENCODED_MEASUREMENT"
        : index === RETRY.MAX_ATTEMPTS ? "FINAL_POST_ENCODE_VERIFICATION"
          : "POST_CORRECTION_PASS", true)) as Stage12EncodedLoudnessExactMeasurement[];
  const finalObservation = measurementsByPass.at(-1)!;
  const finalMeasurements = {
    integratedLufs: Number(value.finalMeasurements.integratedLufs),
    integratedLufsExact: String(value.finalMeasurements.integratedLufsExact),
    truePeakDbtp: Number(value.finalMeasurements.truePeakDbtp),
    truePeakDbtpExact: String(value.finalMeasurements.truePeakDbtpExact),
    loudnessRangeLu: Number(value.finalMeasurements.loudnessRangeLu),
    loudnessRangeLuExact: String(value.finalMeasurements.loudnessRangeLuExact),
  };
  for (const key of ["integratedLufs", "integratedLufsExact", "truePeakDbtp",
    "truePeakDbtpExact", "loudnessRangeLu", "loudnessRangeLuExact"] as const) {
    if (finalMeasurements[key] !== finalObservation[key]) throw invalid();
  }
  const failedPredicates = parseFailurePredicates(value.failedPredicates);
  if (!predicatesMatch(failedPredicates, finalObservation.failedPredicates)
    || value.replayOutcome !== (failedPredicates.length === 0 ? "PASS" : "FAIL")
    || (failedPredicates.length > 0 && value.terminalCorrectionPass !== RETRY.MAX_ATTEMPTS)) {
    throw invalid();
  }
  return {
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL",
    boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
    source: {
      correctionOrdinal: 2,
      correctionJobId: String(value.source.correctionJobId),
      r2Key: String(value.source.r2Key),
      sha256: String(value.source.sha256),
      byteLength: Number(value.source.byteLength),
      receiptSha256: String(value.source.receiptSha256),
    },
    historicalFailure: {
      correctionOrdinal: 3,
      correctionJobId: String(value.historicalFailure.correctionJobId),
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
    },
    sourceBaseline: sourceBaseline as Stage12EncodedLoudnessDiagnosticReplayResult["sourceBaseline"],
    measurementsByPass,
    terminalCorrectionPass: Number(value.terminalCorrectionPass),
    finalMeasurements,
    failedPredicates,
    replayOutcome: value.replayOutcome as "PASS" | "FAIL",
    workerImageDigest: String(value.workerImageDigest),
    expectedWorkerImageDigest: String(value.expectedWorkerImageDigest),
    algorithmFingerprint: String(value.algorithmFingerprint),
    thresholdSnapshotSha256: String(value.thresholdSnapshotSha256),
    runtimeProvenance: {
      ffmpegVersion: value.runtimeProvenance.ffmpegVersion,
      ffmpegBuildFingerprint: String(value.runtimeProvenance.ffmpegBuildFingerprint),
      libopusEncoderFingerprint: String(value.runtimeProvenance.libopusEncoderFingerprint),
    },
    correctionStrategyVersion: 3,
    correctionPassLimit: RETRY.MAX_ATTEMPTS as 3,
    correctedOutputUploaded: false,
    historicalBackfill: false,
    providerCallCount: 0,
    providerDispatch: "OFF",
    calibration: false,
    finalize: false,
    releaseEligible: false,
    autoPublish: "OFF",
  };
}

type CodecSafeController = {
  integratedTargetLufs: number;
  limiterCeilingDbtp: number;
  macroDepthDb: number;
  lowLraDepthDb: number | null;
  highLraDepthDb: number | null;
};

function initialCodecSafeController(): CodecSafeController {
  return {
    integratedTargetLufs: AUDIO.LUFS_I.target,
    limiterCeilingDbtp: AUDIO.TRUE_PEAK_MAX_DBTP - AUDIO.LUFS_I.tolerance,
    macroDepthDb: AUDIO.LRA.min + AUDIO.LUFS_I.tolerance,
    lowLraDepthDb: null,
    highLraDepthDb: null,
  };
}

function nextCodecSafeController(controller: CodecSafeController, measurement: {
  integratedLufs: number; truePeakDbtp: number; loudnessRangeLu: number;
}): CodecSafeController {
  const integratedOutside = measurement.integratedLufs
      < AUDIO.LUFS_I.target - AUDIO.LUFS_I.tolerance
    || measurement.integratedLufs > AUDIO.LUFS_I.target + AUDIO.LUFS_I.tolerance;
  const integratedTargetLufs = integratedOutside
    ? controller.integratedTargetLufs + AUDIO.LUFS_I.target - measurement.integratedLufs
    : controller.integratedTargetLufs;
  const codecOvershootDb = Math.max(0,
    measurement.truePeakDbtp - controller.limiterCeilingDbtp);
  const limiterCeilingDbtp = Math.min(controller.limiterCeilingDbtp,
    AUDIO.TRUE_PEAK_MAX_DBTP - codecOvershootDb);
  const lraTarget = (AUDIO.LRA.min + AUDIO.LRA.max) / 2;
  let lowLraDepthDb = controller.lowLraDepthDb;
  let highLraDepthDb = controller.highLraDepthDb;
  let macroDepthDb = controller.macroDepthDb;
  if (measurement.loudnessRangeLu < AUDIO.LRA.min) {
    lowLraDepthDb = lowLraDepthDb === null
      ? controller.macroDepthDb : Math.max(lowLraDepthDb, controller.macroDepthDb);
    macroDepthDb = highLraDepthDb === null
      ? controller.macroDepthDb + lraTarget - measurement.loudnessRangeLu
      : (lowLraDepthDb + highLraDepthDb) / 2;
  } else if (measurement.loudnessRangeLu > AUDIO.LRA.max) {
    highLraDepthDb = highLraDepthDb === null
      ? controller.macroDepthDb : Math.min(highLraDepthDb, controller.macroDepthDb);
    macroDepthDb = lowLraDepthDb === null
      ? Math.max(0, controller.macroDepthDb - (measurement.loudnessRangeLu - lraTarget))
      : (lowLraDepthDb + highLraDepthDb) / 2;
  }
  return { integratedTargetLufs, limiterCeilingDbtp, macroDepthDb,
    lowLraDepthDb, highLraDepthDb };
}

function parseCodecSafeCandidate(value: unknown, candidatePass: number,
  losslessReferenceSha256: string, controller: CodecSafeController) {
  const invalid = () => new Error("STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_RESULT_INVALID");
  const keys = ["candidatePass", "phase", "losslessReferenceSha256",
    "integratedTargetLufs", "limiterCeilingDbtp", "macroDepthDb", "codecOvershootDb",
    "integratedLufs", "integratedLufsExact", "truePeakDbtp", "truePeakDbtpExact",
    "loudnessRangeLu", "loudnessRangeLuExact", "failedPredicates",
    "audioFrameMd5Sha256"];
  const expectedPhase = candidatePass === 0
    ? "INITIAL_CODEC_SAFE_CANDIDATE" : "POST_OPUS_FEEDBACK_CANDIDATE";
  if (!isRecord(value) || !hasExactKeys(value, keys)
    || value.candidatePass !== candidatePass || value.phase !== expectedPhase
    || value.losslessReferenceSha256 !== losslessReferenceSha256
    || value.integratedTargetLufs !== controller.integratedTargetLufs
    || value.limiterCeilingDbtp !== controller.limiterCeilingDbtp
    || value.macroDepthDb !== controller.macroDepthDb
    || !Number.isFinite(value.codecOvershootDb)
    || !Number.isFinite(value.integratedLufs) || !Number.isFinite(value.truePeakDbtp)
    || !Number.isFinite(value.loudnessRangeLu)
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.integratedLufsExact ?? ""))
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.truePeakDbtpExact ?? ""))
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.loudnessRangeLuExact ?? ""))
    || Number(value.integratedLufsExact) !== value.integratedLufs
    || Number(value.truePeakDbtpExact) !== value.truePeakDbtp
    || Number(value.loudnessRangeLuExact) !== value.loudnessRangeLu
    || !HEX64.test(String(value.audioFrameMd5Sha256 ?? ""))) throw invalid();
  const candidate: Stage12CodecSafeTruePeakCandidate = {
    candidatePass,
    phase: expectedPhase,
    losslessReferenceSha256,
    integratedTargetLufs: Number(value.integratedTargetLufs),
    limiterCeilingDbtp: Number(value.limiterCeilingDbtp),
    macroDepthDb: Number(value.macroDepthDb),
    codecOvershootDb: Number(value.codecOvershootDb),
    integratedLufs: Number(value.integratedLufs),
    integratedLufsExact: String(value.integratedLufsExact),
    truePeakDbtp: Number(value.truePeakDbtp),
    truePeakDbtpExact: String(value.truePeakDbtpExact),
    loudnessRangeLu: Number(value.loudnessRangeLu),
    loudnessRangeLuExact: String(value.loudnessRangeLuExact),
    failedPredicates: parseFailurePredicates(value.failedPredicates),
    audioFrameMd5Sha256: String(value.audioFrameMd5Sha256),
  };
  if (candidate.codecOvershootDb !== Math.max(0,
    candidate.truePeakDbtp - candidate.limiterCeilingDbtp)
    || !predicatesMatch(candidate.failedPredicates, loudnessFailurePredicates(candidate))) {
    throw invalid();
  }
  return candidate;
}

export function parseStage12CodecSafeTruePeakShadowResult(
  value: unknown,
): Stage12CodecSafeTruePeakShadowResult {
  const invalid = () => new Error("STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_RESULT_INVALID");
  const topKeys = ["accepted", "schemaVersion", "evidenceSemantics", "boundary", "source",
    "historicalFailure", "diagnosticReplay", "losslessReference", "candidates",
    "terminalCandidatePass", "finalMeasurements", "failedPredicates", "shadowOutcome",
    "workerImageDigest", "expectedWorkerImageDigest", "algorithmFingerprint",
    "thresholdSnapshotSha256", "runtimeProvenance", "correctionPassLimit",
    "correctedOutputUploaded", "historicalBackfill", "providerCallCount", "providerDispatch",
    "calibration", "finalize", "releaseEligible", "productionActivation", "autoPublish"];
  if (!isRecord(value) || !hasExactKeys(value, topKeys)
    || value.accepted !== true || value.schemaVersion !== 1
    || value.evidenceSemantics !== "CODEC_SAFE_SHADOW_NOT_CORRECTION"
    || value.boundary !== "POST_OPUS_TRUE_PEAK_FEEDBACK"
    || value.correctionPassLimit !== RETRY.MAX_ATTEMPTS
    || value.correctedOutputUploaded !== false || value.historicalBackfill !== false
    || value.providerCallCount !== 0 || value.providerDispatch !== "OFF"
    || value.calibration !== false || value.finalize !== false || value.releaseEligible !== false
    || value.productionActivation !== false || value.autoPublish !== "OFF"
    || !/^sha256:[a-f0-9]{64}$/u.test(String(value.workerImageDigest ?? ""))
    || value.workerImageDigest !== value.expectedWorkerImageDigest
    || !HEX64.test(String(value.algorithmFingerprint ?? ""))
    || !HEX64.test(String(value.thresholdSnapshotSha256 ?? ""))
    || !isRecord(value.source) || !hasExactKeys(value.source,
      ["correctionOrdinal", "correctionJobId", "r2Key", "sha256", "byteLength", "receiptSha256"])
    || value.source.correctionOrdinal !== 2
    || typeof value.source.correctionJobId !== "string" || value.source.correctionJobId.length < 3
    || !String(value.source.r2Key ?? "").startsWith("prod/")
    || String(value.source.r2Key).includes("..") || !HEX64.test(String(value.source.sha256 ?? ""))
    || !Number.isInteger(value.source.byteLength) || Number(value.source.byteLength) < 1
    || !HEX64.test(String(value.source.receiptSha256 ?? ""))
    || !isRecord(value.historicalFailure) || !hasExactKeys(value.historicalFailure,
      ["correctionOrdinal", "correctionJobId", "errorCode"])
    || value.historicalFailure.correctionOrdinal !== 3
    || typeof value.historicalFailure.correctionJobId !== "string"
    || value.historicalFailure.correctionJobId.length < 3
    || value.historicalFailure.errorCode !== "STAGE12_ENCODED_LOUDNESS_UNRESOLVED"
    || !isRecord(value.diagnosticReplay)
    || !hasExactKeys(value.diagnosticReplay, ["jobId", "evidenceId"])
    || typeof value.diagnosticReplay.jobId !== "string"
    || value.diagnosticReplay.jobId.length < 3
    || !HEX64.test(String(value.diagnosticReplay.evidenceId ?? ""))
    || !isRecord(value.losslessReference)
    || !hasExactKeys(value.losslessReference,
      ["sha256", "byteLength", "audioFrameMd5Sha256", "codec", "sampleRateHz"])
    || !HEX64.test(String(value.losslessReference.sha256 ?? ""))
    || !HEX64.test(String(value.losslessReference.audioFrameMd5Sha256 ?? ""))
    || !Number.isInteger(value.losslessReference.byteLength)
    || Number(value.losslessReference.byteLength) < 1
    || value.losslessReference.codec !== "pcm_f32le"
    || value.losslessReference.sampleRateHz !== AUDIO.SAMPLE_RATE_HZ
    || !Array.isArray(value.candidates) || value.candidates.length < 1
    || value.candidates.length > RETRY.MAX_ATTEMPTS + 1
    || value.terminalCandidatePass !== value.candidates.length - 1
    || !isRecord(value.finalMeasurements)
    || !hasExactKeys(value.finalMeasurements, ["integratedLufs", "integratedLufsExact",
      "truePeakDbtp", "truePeakDbtpExact", "loudnessRangeLu", "loudnessRangeLuExact"])
    || !isRecord(value.runtimeProvenance)
    || !hasExactKeys(value.runtimeProvenance,
      ["ffmpegVersion", "ffmpegBuildFingerprint", "libopusEncoderFingerprint"])
    || typeof value.runtimeProvenance.ffmpegVersion !== "string"
    || value.runtimeProvenance.ffmpegVersion.length < 8
    || !HEX64.test(String(value.runtimeProvenance.ffmpegBuildFingerprint ?? ""))
    || !HEX64.test(String(value.runtimeProvenance.libopusEncoderFingerprint ?? ""))) {
    throw invalid();
  }
  let controller = initialCodecSafeController();
  const losslessReferenceSha256 = String(value.losslessReference.sha256);
  const candidateValues = value.candidates as unknown[];
  const candidates = candidateValues.map((entry, index) => {
    const candidate = parseCodecSafeCandidate(
      entry, index, losslessReferenceSha256, controller,
    );
    if (index < candidateValues.length - 1) {
      controller = nextCodecSafeController(controller, candidate);
    }
    return candidate;
  });
  const finalObservation = candidates.at(-1)!;
  const finalMeasurements = {
    integratedLufs: Number(value.finalMeasurements.integratedLufs),
    integratedLufsExact: String(value.finalMeasurements.integratedLufsExact),
    truePeakDbtp: Number(value.finalMeasurements.truePeakDbtp),
    truePeakDbtpExact: String(value.finalMeasurements.truePeakDbtpExact),
    loudnessRangeLu: Number(value.finalMeasurements.loudnessRangeLu),
    loudnessRangeLuExact: String(value.finalMeasurements.loudnessRangeLuExact),
  };
  for (const key of ["integratedLufs", "integratedLufsExact", "truePeakDbtp",
    "truePeakDbtpExact", "loudnessRangeLu", "loudnessRangeLuExact"] as const) {
    if (finalMeasurements[key] !== finalObservation[key]) throw invalid();
  }
  const failedPredicates = parseFailurePredicates(value.failedPredicates);
  if (!predicatesMatch(failedPredicates, finalObservation.failedPredicates)
    || value.shadowOutcome !== (failedPredicates.length === 0 ? "PASS" : "FAIL")
    || (failedPredicates.length > 0 && value.terminalCandidatePass !== RETRY.MAX_ATTEMPTS)) {
    throw invalid();
  }
  return {
    accepted: true,
    schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION",
    boundary: "POST_OPUS_TRUE_PEAK_FEEDBACK",
    source: { correctionOrdinal: 2, correctionJobId: String(value.source.correctionJobId),
      r2Key: String(value.source.r2Key), sha256: String(value.source.sha256),
      byteLength: Number(value.source.byteLength),
      receiptSha256: String(value.source.receiptSha256) },
    historicalFailure: { correctionOrdinal: 3,
      correctionJobId: String(value.historicalFailure.correctionJobId),
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
    diagnosticReplay: { jobId: String(value.diagnosticReplay.jobId),
      evidenceId: String(value.diagnosticReplay.evidenceId) },
    losslessReference: { sha256: losslessReferenceSha256,
      byteLength: Number(value.losslessReference.byteLength),
      audioFrameMd5Sha256: String(value.losslessReference.audioFrameMd5Sha256),
      codec: "pcm_f32le", sampleRateHz: AUDIO.SAMPLE_RATE_HZ },
    candidates,
    terminalCandidatePass: Number(value.terminalCandidatePass),
    finalMeasurements,
    failedPredicates,
    shadowOutcome: value.shadowOutcome as "PASS" | "FAIL",
    workerImageDigest: String(value.workerImageDigest),
    expectedWorkerImageDigest: String(value.expectedWorkerImageDigest),
    algorithmFingerprint: String(value.algorithmFingerprint),
    thresholdSnapshotSha256: String(value.thresholdSnapshotSha256),
    runtimeProvenance: { ffmpegVersion: value.runtimeProvenance.ffmpegVersion,
      ffmpegBuildFingerprint: String(value.runtimeProvenance.ffmpegBuildFingerprint),
      libopusEncoderFingerprint: String(value.runtimeProvenance.libopusEncoderFingerprint) },
    correctionPassLimit: RETRY.MAX_ATTEMPTS as 3,
    correctedOutputUploaded: false,
    historicalBackfill: false,
    providerCallCount: 0,
    providerDispatch: "OFF",
    calibration: false,
    finalize: false,
    releaseEligible: false,
    productionActivation: false,
    autoPublish: "OFF",
  };
}

function parseLraGuardRuntime(value: unknown) {
  const invalid = () => new Error("STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_RESULT_INVALID");
  if (!isRecord(value) || !hasExactKeys(value,
    ["ffmpegVersion", "ffmpegBuildFingerprint", "libopusEncoderFingerprint"])
    || typeof value.ffmpegVersion !== "string" || value.ffmpegVersion.length < 8
    || !HEX64.test(String(value.ffmpegBuildFingerprint ?? ""))
    || !HEX64.test(String(value.libopusEncoderFingerprint ?? ""))) throw invalid();
  return { ffmpegVersion: value.ffmpegVersion,
    ffmpegBuildFingerprint: String(value.ffmpegBuildFingerprint),
    libopusEncoderFingerprint: String(value.libopusEncoderFingerprint) };
}

function parseLraGuardReference(value: unknown, candidatePass: 1 | 3,
  losslessReferenceSha256: string) {
  const invalid = () => new Error("STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_RESULT_INVALID");
  if (!isRecord(value)) throw invalid();
  return parseCodecSafeCandidate(value, candidatePass, losslessReferenceSha256, {
    integratedTargetLufs: Number(value.integratedTargetLufs),
    limiterCeilingDbtp: Number(value.limiterCeilingDbtp),
    macroDepthDb: Number(value.macroDepthDb), lowLraDepthDb: null, highLraDepthDb: null,
  });
}

function lraGuardRangeDistance(value: number, min: number, max: number) {
  return value < min ? min - value : value > max ? value - max : 0;
}

function lraGuardBestSafePass(candidates: Stage12CodecSafeLraGuardCandidate[],
  anchor: Stage12CodecSafeTruePeakCandidate,
  policy: Stage12CodecSafeLraGuardControllerPolicy) {
  const safe = candidates.filter((candidate) =>
    !["ANCHOR_DRIFT", "REGRESSION_REJECTED", "HIGH_BRACKET"]
      .includes(candidate.disposition)
    && candidate.truePeakDbtp <= AUDIO.TRUE_PEAK_MAX_DBTP
    && candidate.codecOvershootDb
      <= anchor.codecOvershootDb + policy.codecOvershootRegressionMaxDb);
  safe.sort((left, right) => {
    const leftScore = [left.failedPredicates.length,
      lraGuardRangeDistance(left.loudnessRangeLu, AUDIO.LRA.min, AUDIO.LRA.max),
      lraGuardRangeDistance(left.integratedLufs,
        AUDIO.LUFS_I.target - AUDIO.LUFS_I.tolerance,
        AUDIO.LUFS_I.target + AUDIO.LUFS_I.tolerance), left.candidatePass];
    const rightScore = [right.failedPredicates.length,
      lraGuardRangeDistance(right.loudnessRangeLu, AUDIO.LRA.min, AUDIO.LRA.max),
      lraGuardRangeDistance(right.integratedLufs,
        AUDIO.LUFS_I.target - AUDIO.LUFS_I.tolerance,
        AUDIO.LUFS_I.target + AUDIO.LUFS_I.tolerance), right.candidatePass];
    for (let index = 0; index < leftScore.length; index += 1) {
      if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index];
    }
    return 0;
  });
  return safe[0]?.candidatePass ?? null;
}

function parseLraGuardCandidate(value: unknown, candidatePass: number,
  losslessReferenceSha256: string) {
  const invalid = () => new Error("STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_RESULT_INVALID");
  const keys = ["done", "candidatePass", "phase", "decision", "disposition",
    "parentCandidatePass", "rollbackToCandidatePass", "bracketLowDepthDb",
    "bracketHighDepthDb", "integratedTargetLufs", "limiterCeilingDbtp", "macroDepthDb",
    "targetStepLufs", "losslessReferenceSha256", "codecOvershootDb", "integratedLufs",
    "integratedLufsExact", "truePeakDbtp", "truePeakDbtpExact", "loudnessRangeLu",
    "loudnessRangeLuExact", "failedPredicates", "audioFrameMd5Sha256"];
  if (!isRecord(value) || !hasExactKeys(value, keys) || value.done !== false
    || value.candidatePass !== candidatePass
    || !["ANCHOR_REPRODUCTION", "LRA_BRACKET_SEARCH", "INTEGRATED_LUFS_TRIM"]
      .includes(String(value.phase))
    || !["ANCHOR", "BISECTION", "NEAREST_BOUNDARY_TRIM"].includes(String(value.decision))
    || !["SAFE_ANCHOR", "ANCHOR_DRIFT", "LOW_BRACKET", "HIGH_BRACKET", "LRA_ACCEPTED",
      "TRIM_ACCEPTED", "REGRESSION_REJECTED", "FULL_PASS"]
      .includes(String(value.disposition))
    || value.losslessReferenceSha256 !== losslessReferenceSha256
    || ![value.parentCandidatePass, value.rollbackToCandidatePass].every((entry) =>
      entry === null || (Number.isInteger(entry) && Number(entry) >= 0
        && Number(entry) < candidatePass))
    || ![value.bracketLowDepthDb, value.bracketHighDepthDb, value.integratedTargetLufs,
      value.limiterCeilingDbtp, value.macroDepthDb, value.targetStepLufs,
      value.codecOvershootDb, value.integratedLufs, value.truePeakDbtp,
      value.loudnessRangeLu].every(Number.isFinite)
    || Number(value.bracketLowDepthDb) > Number(value.bracketHighDepthDb)
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.integratedLufsExact ?? ""))
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.truePeakDbtpExact ?? ""))
    || !/^-?\d+(?:\.\d+)?$/u.test(String(value.loudnessRangeLuExact ?? ""))
    || Number(value.integratedLufsExact) !== value.integratedLufs
    || Number(value.truePeakDbtpExact) !== value.truePeakDbtp
    || Number(value.loudnessRangeLuExact) !== value.loudnessRangeLu
    || !HEX64.test(String(value.audioFrameMd5Sha256 ?? ""))) throw invalid();
  const candidate = {
    done: false as const, candidatePass,
    phase: value.phase as Stage12CodecSafeLraGuardCandidate["phase"],
    decision: value.decision as Stage12CodecSafeLraGuardCandidate["decision"],
    disposition: value.disposition as Stage12CodecSafeLraGuardCandidate["disposition"],
    parentCandidatePass: value.parentCandidatePass as number | null,
    rollbackToCandidatePass: value.rollbackToCandidatePass as number | null,
    bracketLowDepthDb: Number(value.bracketLowDepthDb),
    bracketHighDepthDb: Number(value.bracketHighDepthDb),
    integratedTargetLufs: Number(value.integratedTargetLufs),
    limiterCeilingDbtp: Number(value.limiterCeilingDbtp),
    macroDepthDb: Number(value.macroDepthDb), targetStepLufs: Number(value.targetStepLufs),
    losslessReferenceSha256, codecOvershootDb: Number(value.codecOvershootDb),
    integratedLufs: Number(value.integratedLufs),
    integratedLufsExact: String(value.integratedLufsExact),
    truePeakDbtp: Number(value.truePeakDbtp),
    truePeakDbtpExact: String(value.truePeakDbtpExact),
    loudnessRangeLu: Number(value.loudnessRangeLu),
    loudnessRangeLuExact: String(value.loudnessRangeLuExact),
    failedPredicates: parseFailurePredicates(value.failedPredicates),
    audioFrameMd5Sha256: String(value.audioFrameMd5Sha256),
  };
  if (candidate.codecOvershootDb !== Math.max(0,
    candidate.truePeakDbtp - candidate.limiterCeilingDbtp)
    || !predicatesMatch(candidate.failedPredicates, loudnessFailurePredicates(candidate))) {
    throw invalid();
  }
  return candidate;
}

export function parseStage12CodecSafeLraGuardShadowResult(
  value: unknown,
): Stage12CodecSafeLraGuardShadowResult {
  const invalid = () => new Error("STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_RESULT_INVALID");
  const topKeys = ["accepted", "schemaVersion", "evidenceSemantics", "boundary", "source",
    "historicalFailure", "diagnosticReplay", "parentShadow", "losslessReference",
    "anchorReference", "highBracketReference", "controllerPolicy", "candidates",
    "shadowOutcome", "terminalReason", "lastEvaluatedCandidatePass",
    "bestSafeCandidatePass", "selectedCandidatePass", "finalMeasurements",
    "failedPredicates", "workerImageDigest", "expectedWorkerImageDigest",
    "parentWorkerImageDigest", "algorithmFingerprint", "thresholdSnapshotSha256",
    "controllerPolicySha256", "renderKernelFingerprint", "parentRenderRuntimeFingerprint",
    "renderRuntimeFingerprint", "parentRuntimeProvenance", "runtimeProvenance",
    "correctedOutputUploaded", "historicalBackfill", "providerCallCount", "providerDispatch",
    "calibration", "finalize", "releaseEligible", "productionActivation", "autoPublish"];
  if (!isRecord(value) || !hasExactKeys(value, topKeys) || value.accepted !== true
    || value.schemaVersion !== 1
    || value.evidenceSemantics !== "CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION"
    || value.boundary !== "POST_OPUS_LRA_GUARD_FEEDBACK"
    || value.correctedOutputUploaded !== false || value.historicalBackfill !== false
    || value.providerCallCount !== 0 || value.providerDispatch !== "OFF"
    || value.calibration !== false || value.finalize !== false || value.releaseEligible !== false
    || value.productionActivation !== false || value.autoPublish !== "OFF"
    || !/^sha256:[a-f0-9]{64}$/u.test(String(value.workerImageDigest ?? ""))
    || value.workerImageDigest !== value.expectedWorkerImageDigest
    || !/^sha256:[a-f0-9]{64}$/u.test(String(value.parentWorkerImageDigest ?? ""))
    || ![value.algorithmFingerprint, value.thresholdSnapshotSha256,
      value.controllerPolicySha256, value.renderKernelFingerprint,
      value.parentRenderRuntimeFingerprint, value.renderRuntimeFingerprint]
      .every((entry) => HEX64.test(String(entry ?? "")))
    || !isRecord(value.source) || !hasExactKeys(value.source,
      ["correctionOrdinal", "correctionJobId", "r2Key", "sha256", "byteLength", "receiptSha256"])
    || value.source.correctionOrdinal !== 2 || typeof value.source.correctionJobId !== "string"
    || !String(value.source.r2Key ?? "").startsWith("prod/")
    || !HEX64.test(String(value.source.sha256 ?? ""))
    || !Number.isInteger(value.source.byteLength) || Number(value.source.byteLength) < 1
    || !HEX64.test(String(value.source.receiptSha256 ?? ""))
    || !isRecord(value.historicalFailure) || !hasExactKeys(value.historicalFailure,
      ["correctionOrdinal", "correctionJobId", "errorCode"])
    || value.historicalFailure.correctionOrdinal !== 3
    || value.historicalFailure.errorCode !== "STAGE12_ENCODED_LOUDNESS_UNRESOLVED"
    || !isRecord(value.diagnosticReplay)
    || !hasExactKeys(value.diagnosticReplay, ["jobId", "evidenceId"])
    || typeof value.diagnosticReplay.jobId !== "string"
    || !HEX64.test(String(value.diagnosticReplay.evidenceId ?? ""))
    || !isRecord(value.parentShadow)
    || !hasExactKeys(value.parentShadow, ["jobId", "evidenceId"])
    || typeof value.parentShadow.jobId !== "string"
    || !HEX64.test(String(value.parentShadow.evidenceId ?? ""))
    || !isRecord(value.losslessReference)
    || !hasExactKeys(value.losslessReference,
      ["sha256", "byteLength", "audioFrameMd5Sha256", "codec", "sampleRateHz"])
    || !HEX64.test(String(value.losslessReference.sha256 ?? ""))
    || !HEX64.test(String(value.losslessReference.audioFrameMd5Sha256 ?? ""))
    || !Number.isInteger(value.losslessReference.byteLength)
    || Number(value.losslessReference.byteLength) < 1
    || value.losslessReference.codec !== "pcm_f32le"
    || value.losslessReference.sampleRateHz !== AUDIO.SAMPLE_RATE_HZ
    || !isRecord(value.controllerPolicy)
    || replayHash(value.controllerPolicy)
      !== replayHash(STAGE12_CODEC_SAFE_LRA_GUARD_CONTROLLER_POLICY)
    || !Array.isArray(value.candidates) || value.candidates.length < 1
    || value.candidates.length > STAGE12_CODEC_SAFE_LRA_GUARD.MAX_CANDIDATES
    || !isRecord(value.finalMeasurements)
    || !hasExactKeys(value.finalMeasurements, ["integratedLufs", "integratedLufsExact",
      "truePeakDbtp", "truePeakDbtpExact", "loudnessRangeLu", "loudnessRangeLuExact"])) {
    throw invalid();
  }
  const losslessReferenceSha256 = String(value.losslessReference.sha256);
  const anchorReference = parseLraGuardReference(value.anchorReference, 1,
    losslessReferenceSha256);
  const highBracketReference = parseLraGuardReference(value.highBracketReference, 3,
    losslessReferenceSha256);
  const policy = value.controllerPolicy as Stage12CodecSafeLraGuardControllerPolicy;
  if (anchorReference.truePeakDbtp > AUDIO.TRUE_PEAK_MAX_DBTP
    || anchorReference.loudnessRangeLu >= AUDIO.LRA.min
    || highBracketReference.macroDepthDb <= anchorReference.macroDepthDb
    || highBracketReference.loudnessRangeLu <= AUDIO.LRA.max) throw invalid();
  const candidates = value.candidates.map((entry, index) =>
    parseLraGuardCandidate(entry, index, losslessReferenceSha256));
  let bracketLow = anchorReference.macroDepthDb;
  let bracketHigh = highBracketReference.macroDepthDb;
  let lowPass = 0;
  let acceptedTrim: Stage12CodecSafeLraGuardCandidate | null = null;
  for (const candidate of candidates) {
    const predicates = loudnessFailurePredicates(candidate);
    const truePeakRegression = candidate.truePeakDbtp > AUDIO.TRUE_PEAK_MAX_DBTP
      || candidate.codecOvershootDb
        > anchorReference.codecOvershootDb + policy.codecOvershootRegressionMaxDb;
    if (candidate.candidatePass === 0) {
      const anchorDrift = candidate.integratedLufs !== anchorReference.integratedLufs
        || candidate.integratedLufsExact !== anchorReference.integratedLufsExact
        || candidate.truePeakDbtp !== anchorReference.truePeakDbtp
        || candidate.truePeakDbtpExact !== anchorReference.truePeakDbtpExact
        || candidate.loudnessRangeLu !== anchorReference.loudnessRangeLu
        || candidate.loudnessRangeLuExact !== anchorReference.loudnessRangeLuExact
        || candidate.audioFrameMd5Sha256 !== anchorReference.audioFrameMd5Sha256;
      const expectedDisposition = anchorDrift ? "ANCHOR_DRIFT"
        : predicates.length === 0 ? "FULL_PASS" : "SAFE_ANCHOR";
      if (candidate.phase !== "ANCHOR_REPRODUCTION" || candidate.decision !== "ANCHOR"
        || candidate.disposition !== expectedDisposition
        || candidate.parentCandidatePass !== null || candidate.rollbackToCandidatePass !== null
        || candidate.bracketLowDepthDb !== bracketLow
        || candidate.bracketHighDepthDb !== bracketHigh
        || candidate.integratedTargetLufs !== anchorReference.integratedTargetLufs
        || candidate.limiterCeilingDbtp !== anchorReference.limiterCeilingDbtp
        || candidate.macroDepthDb !== anchorReference.macroDepthDb
        || candidate.targetStepLufs !== 0) throw invalid();
      continue;
    }
    const previous = candidates[candidate.candidatePass - 1];
    if (acceptedTrim) {
      const rollback = previous.phase === "INTEGRATED_LUFS_TRIM"
        && previous.disposition === "REGRESSION_REJECTED";
      const minimum = AUDIO.LUFS_I.target - AUDIO.LUFS_I.tolerance
        + policy.integratedBoundaryMarginLu;
      const maximum = AUDIO.LUFS_I.target + AUDIO.LUFS_I.tolerance
        - policy.integratedBoundaryMarginLu;
      let expectedStep = rollback ? previous.targetStepLufs / 2
        : acceptedTrim.integratedLufs < minimum ? minimum - acceptedTrim.integratedLufs
          : acceptedTrim.integratedLufs > maximum ? maximum - acceptedTrim.integratedLufs : 0;
      expectedStep = Math.max(-policy.maxIntegratedTargetStepLu,
        Math.min(policy.maxIntegratedTargetStepLu, expectedStep));
      expectedStep = Number(expectedStep.toFixed(6));
      const expectedDisposition = truePeakRegression
        || candidate.loudnessRangeLu < AUDIO.LRA.min
        || candidate.loudnessRangeLu > AUDIO.LRA.max ? "REGRESSION_REJECTED"
        : predicates.length === 0 ? "FULL_PASS" : "TRIM_ACCEPTED";
      if (candidate.phase !== "INTEGRATED_LUFS_TRIM"
        || candidate.decision !== "NEAREST_BOUNDARY_TRIM"
        || candidate.disposition !== expectedDisposition
        || candidate.parentCandidatePass !== acceptedTrim.candidatePass
        || candidate.rollbackToCandidatePass !== (rollback ? acceptedTrim.candidatePass : null)
        || candidate.bracketLowDepthDb !== acceptedTrim.macroDepthDb
        || candidate.bracketHighDepthDb !== acceptedTrim.macroDepthDb
        || candidate.macroDepthDb !== acceptedTrim.macroDepthDb
        || candidate.limiterCeilingDbtp !== acceptedTrim.limiterCeilingDbtp
        || candidate.targetStepLufs !== expectedStep
        || candidate.integratedTargetLufs
          !== Number((acceptedTrim.integratedTargetLufs + expectedStep).toFixed(6))) throw invalid();
      if (["TRIM_ACCEPTED", "FULL_PASS"].includes(candidate.disposition)) {
        acceptedTrim = candidate;
      }
    } else {
      const rollback = ["REGRESSION_REJECTED", "HIGH_BRACKET"]
        .includes(previous.disposition);
      const expectedDisposition = truePeakRegression ? "REGRESSION_REJECTED"
        : predicates.length === 0 ? "FULL_PASS"
          : candidate.loudnessRangeLu < AUDIO.LRA.min ? "LOW_BRACKET"
            : candidate.loudnessRangeLu > AUDIO.LRA.max ? "HIGH_BRACKET" : "LRA_ACCEPTED";
      if (candidate.phase !== "LRA_BRACKET_SEARCH" || candidate.decision !== "BISECTION"
        || candidate.disposition !== expectedDisposition
        || candidate.parentCandidatePass !== lowPass
        || candidate.rollbackToCandidatePass !== (rollback ? lowPass : null)
        || candidate.bracketLowDepthDb !== Number(bracketLow.toFixed(6))
        || candidate.bracketHighDepthDb !== Number(bracketHigh.toFixed(6))
        || candidate.integratedTargetLufs !== anchorReference.integratedTargetLufs
        || candidate.limiterCeilingDbtp !== anchorReference.limiterCeilingDbtp
        || candidate.macroDepthDb !== Number(((bracketLow + bracketHigh) / 2).toFixed(6))
        || candidate.targetStepLufs !== 0) throw invalid();
      if (candidate.disposition === "LOW_BRACKET") {
        bracketLow = Math.max(bracketLow, candidate.macroDepthDb);
        lowPass = candidate.candidatePass;
      } else if (["HIGH_BRACKET", "REGRESSION_REJECTED"].includes(candidate.disposition)) {
        bracketHigh = Math.min(bracketHigh, candidate.macroDepthDb);
      } else if (["LRA_ACCEPTED", "FULL_PASS"].includes(candidate.disposition)) {
        acceptedTrim = candidate;
      }
    }
  }
  const last = candidates.at(-1)!;
  const terminalReason = String(value.terminalReason);
  const expectedReason = last.disposition === "FULL_PASS" ? "PASS"
    : candidates[0].disposition === "ANCHOR_DRIFT" ? "ANCHOR_REPRODUCTION_DRIFT"
      : candidates.length === policy.maxCandidateCount ? "BUDGET_EXHAUSTED" : null;
  const bestSafeCandidatePass = lraGuardBestSafePass(candidates, anchorReference, policy);
  const selectedCandidatePass = expectedReason === "PASS"
    ? last.candidatePass : bestSafeCandidatePass ?? 0;
  const selected = candidates[selectedCandidatePass];
  const finalMeasurements = { integratedLufs: Number(value.finalMeasurements.integratedLufs),
    integratedLufsExact: String(value.finalMeasurements.integratedLufsExact),
    truePeakDbtp: Number(value.finalMeasurements.truePeakDbtp),
    truePeakDbtpExact: String(value.finalMeasurements.truePeakDbtpExact),
    loudnessRangeLu: Number(value.finalMeasurements.loudnessRangeLu),
    loudnessRangeLuExact: String(value.finalMeasurements.loudnessRangeLuExact) };
  const failedPredicates = parseFailurePredicates(value.failedPredicates);
  const parentRuntimeProvenance = parseLraGuardRuntime(value.parentRuntimeProvenance);
  const runtimeProvenance = parseLraGuardRuntime(value.runtimeProvenance);
  const expectedRenderRuntimeFingerprint = replayHash({
    renderKernelFingerprint: String(value.renderKernelFingerprint), runtimeProvenance,
  });
  if (!expectedReason || terminalReason !== expectedReason
    || value.shadowOutcome !== (expectedReason === "PASS" ? "PASS" : "FAIL")
    || value.lastEvaluatedCandidatePass !== last.candidatePass
    || value.bestSafeCandidatePass !== bestSafeCandidatePass
    || value.selectedCandidatePass !== selectedCandidatePass
    || !predicatesMatch(failedPredicates, selected.failedPredicates)
    || replayHash(finalMeasurements) !== replayHash({
      integratedLufs: selected.integratedLufs,
      integratedLufsExact: selected.integratedLufsExact,
      truePeakDbtp: selected.truePeakDbtp,
      truePeakDbtpExact: selected.truePeakDbtpExact,
      loudnessRangeLu: selected.loudnessRangeLu,
      loudnessRangeLuExact: selected.loudnessRangeLuExact,
    })
    || replayHash(parentRuntimeProvenance) !== replayHash(runtimeProvenance)
    || value.parentRenderRuntimeFingerprint !== expectedRenderRuntimeFingerprint
    || value.renderRuntimeFingerprint !== expectedRenderRuntimeFingerprint
    || candidates.slice(0, -1).some((candidate) => candidate.disposition === "FULL_PASS")) {
    throw invalid();
  }
  return value as unknown as Stage12CodecSafeLraGuardShadowResult;
}

export function parseStage12EncodedLoudnessFailureDiagnostic(
  value: unknown,
): Stage12EncodedLoudnessFailureDiagnostic {
  const invalid = () => new Error("STAGE12_ENCODED_LOUDNESS_FAILURE_DIAGNOSTIC_INVALID");
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "boundary", "correctionPass", "correctionPassLimit",
    "measurementsByPass", "finalMeasurements", "failedPredicates", "workerImageDigest",
  ]) || value.schemaVersion !== 1
    || value.boundary !== "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION"
    || value.correctionPassLimit !== RETRY.MAX_ATTEMPTS
    || value.correctionPass !== value.correctionPassLimit
    || !/^sha256:[a-f0-9]{64}$/u.test(String(value.workerImageDigest ?? ""))
    || !Array.isArray(value.measurementsByPass)
    || value.measurementsByPass.length !== RETRY.MAX_ATTEMPTS + 1
    || !isRecord(value.finalMeasurements)
    || !hasExactKeys(value.finalMeasurements, [
      "integratedLufs", "truePeakDbtp", "loudnessRangeLu",
    ])) throw invalid();

  const measurementsByPass = value.measurementsByPass.map((entry, index) => {
    if (!isRecord(entry) || !hasExactKeys(entry, [
      "correctionPass", "phase", "integratedLufs", "truePeakDbtp", "loudnessRangeLu",
      "failedPredicates",
    ]) || entry.correctionPass !== index
      || entry.phase !== (index === 0 ? "INITIAL_ENCODED_MEASUREMENT"
        : index === RETRY.MAX_ATTEMPTS ? "FINAL_POST_ENCODE_VERIFICATION"
          : "POST_CORRECTION_PASS")
      || !Number.isFinite(entry.integratedLufs)
      || !Number.isFinite(entry.truePeakDbtp)
      || !Number.isFinite(entry.loudnessRangeLu)) throw invalid();
    const measurement = {
      correctionPass: index,
      phase: entry.phase,
      integratedLufs: Number(entry.integratedLufs),
      truePeakDbtp: Number(entry.truePeakDbtp),
      loudnessRangeLu: Number(entry.loudnessRangeLu),
      failedPredicates: parseFailurePredicates(entry.failedPredicates),
    } as Stage12EncodedLoudnessPassMeasurement;
    if (!predicatesMatch(measurement.failedPredicates,
      loudnessFailurePredicates(measurement))) throw invalid();
    return measurement;
  });
  const finalMeasurements = {
    integratedLufs: Number(value.finalMeasurements.integratedLufs),
    truePeakDbtp: Number(value.finalMeasurements.truePeakDbtp),
    loudnessRangeLu: Number(value.finalMeasurements.loudnessRangeLu),
  };
  if (!Object.values(finalMeasurements).every(Number.isFinite)) throw invalid();
  const finalObservation = measurementsByPass.at(-1)!;
  if (finalMeasurements.integratedLufs !== finalObservation.integratedLufs
    || finalMeasurements.truePeakDbtp !== finalObservation.truePeakDbtp
    || finalMeasurements.loudnessRangeLu !== finalObservation.loudnessRangeLu) throw invalid();
  const failedPredicates = parseFailurePredicates(value.failedPredicates);
  if (failedPredicates.length === 0
    || !predicatesMatch(failedPredicates, finalObservation.failedPredicates)) throw invalid();
  return {
    schemaVersion: 1,
    boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
    correctionPass: RETRY.MAX_ATTEMPTS,
    correctionPassLimit: RETRY.MAX_ATTEMPTS,
    measurementsByPass,
    finalMeasurements,
    failedPredicates,
    workerImageDigest: String(value.workerImageDigest),
  };
}

export function buildTrackGVideoOneStage12Request(input: Stage12RequestInput) {
  assertHex64(input.idempotencyKey, "TRACK_G_STAGE_12_IDEMPOTENCY_INVALID");
  assertHex64(input.narration.sha256, "TRACK_G_STAGE_12_NARRATION_HASH_INVALID");
  assertHex64(input.stage09ArtifactSha256, "TRACK_G_STAGE_12_STAGE09_HASH_INVALID");
  assertHex64(input.stage11ArtifactSha256, "TRACK_G_STAGE_12_STAGE11_HASH_INVALID");
  assertHex64(input.rightsEvidenceSha256, "TRACK_G_STAGE_12_RIGHTS_HASH_INVALID");
  if (!input.narration.r2Key.startsWith("prod/") || input.narration.r2Key.includes("..")) {
    throw new Error("TRACK_G_STAGE_12_NARRATION_KEY_INVALID");
  }
  if (!Number.isFinite(input.durationSec) || input.durationSec <= 0 || input.shots.length === 0) {
    throw new Error("TRACK_G_STAGE_12_TIMELINE_INVALID");
  }
  const expectedFrames = Math.round(input.durationSec * MASTER.FPS);
  const ordered = [...input.shots].sort((left, right) => left.startFrame - right.startFrame);
  let cursor = 0;
  for (const shot of ordered) {
    if (shot.startFrame !== cursor || shot.endFrame <= shot.startFrame
      || shot.headline.trim().length === 0) {
      throw new Error("TRACK_G_STAGE_12_TIMELINE_INVALID");
    }
    cursor = shot.endFrame;
  }
  if (cursor !== expectedFrames || input.transcript.trim().length === 0) {
    throw new Error("TRACK_G_STAGE_12_TIMELINE_INVALID");
  }
  return {
    schemaVersion: 1 as const,
    idempotencyKey: input.idempotencyKey,
    packageId: input.packageId,
    stageInstanceId: input.stageInstanceId,
    durationSec: input.durationSec,
    narration: input.narration,
    provenance: {
      stage09ArtifactSha256: input.stage09ArtifactSha256,
      stage11ArtifactSha256: input.stage11ArtifactSha256,
      rightsEvidenceSha256: input.rightsEvidenceSha256,
    },
    timeline: { expectedFrames, shots: ordered, transcript: input.transcript },
    render: {
      width: MASTER.WIDTH,
      height: MASTER.HEIGHT,
      fps: MASTER.FPS,
      colorPrimaries: MASTER.COLOR,
      format: "STAGE12_PRE_MASTER_WEBM" as const,
      videoCodec: MASTER.DISTRIBUTION_VIDEO_CODEC,
      audioCodec: MASTER.DISTRIBUTION_AUDIO_CODEC,
      sampleRateHz: AUDIO.SAMPLE_RATE_HZ,
    },
    qa: {
      scanStartSec: 0,
      scanEndSec: input.durationSec,
      avSyncMaxMs: AV_SYNC_MS.DEFAULT,
      p0Max: ASSURANCE.P0_MAX,
      nearStaticMaxSec: VISUAL.NEAR_STATIC_MAX_SEC,
      loudness: {
        integratedLufs: AUDIO.LUFS_I.target,
        toleranceLufs: AUDIO.LUFS_I.tolerance,
        truePeakMaxDbtp: AUDIO.TRUE_PEAK_MAX_DBTP,
        lraMin: AUDIO.LRA.min,
        lraMax: AUDIO.LRA.max,
      },
    },
    controls: {
      providerDispatch: "OFF" as const,
      providerCallCount: 0 as const,
      releaseEligible: false as const,
      autoPublish: "OFF" as const,
    },
  };
}

export function stage12GateResults(measurements: Stage12Measurements): Stage12GateResult[] {
  return [
    { gate: "M0_INPUT_RIGHTS_COMPLETE", state: "PASS",
      evidence: `${measurements.missingInputCount} missing inputs and ${measurements.unresolvedRightsCount} unresolved rights.` },
    { gate: "M1_FULL_TIMELINE_SCAN", state: "PASS",
      evidence: `${measurements.scannedDurationSec}s scanned; ${measurements.timelineIssueCount} timeline issues and ${measurements.missingFrameCount} missing frames.` },
    { gate: "M1_AV_SYNC", state: "PASS",
      evidence: `${measurements.avSyncOffsetMs}ms A/V offset is within ${AV_SYNC_MS.DEFAULT}ms.` },
    { gate: "M1_BLACK_FREEZE_SILENCE", state: "PASS",
      evidence: `${measurements.blackFrameIntervalCount} black, ${measurements.freezeFrameIntervalCount} freeze and ${measurements.silenceIntervalCount} silence intervals.` },
    { gate: "M1_LOUDNESS_MEASURED", state: "PASS",
      evidence: `${measurements.integratedLufs} LUFS-I, ${measurements.truePeakDbtp} dBTP, ${measurements.loudnessRangeLu} LU LRA.` },
    { gate: "M1_MOBILE_SAFE_ZONE", state: "PASS",
      evidence: "Mobile legibility and title-safe placement passed across the complete composition." },
    { gate: "M1_PRE_MASTER_RESIDUE", state: "PASS",
      evidence: `${measurements.debugOverlayCount + measurements.watermarkCount + measurements.templateResidueCount} debug, watermark or template residues.` },
  ];
}

export function evaluateTrackGVideoOneStage12Receipt(
  receipt: Stage12MediaReceipt,
  expectedDurationSec: number,
): Stage12ReceiptEvaluation {
  const failures: string[] = [];
  if (receipt.accepted !== true || receipt.renderAuthorized !== true
    || receipt.providerCallCount !== 0 || receipt.providerDispatch !== "OFF"
    || receipt.autoPublish !== "OFF") failures.push("CONTROL_CONTRACT");
  if (!/^sha256:[0-9a-f]{64}$/u.test(receipt.imageDigest)
    || !receipt.preMaster.r2Key.startsWith("prod/")
    || !HEX64.test(receipt.preMaster.sha256)
    || !HEX64.test(receipt.preMaster.frameMd5Sha256)
    || !HEX64.test(receipt.reportSha256)
    || receipt.preMaster.byteLength <= 0) failures.push("ARTIFACT_INTEGRITY");
  const m = receipt.measurements;
  const durationToleranceSec = MASTER.AV_DURATION_TOLERANCE_FRAMES / MASTER.FPS;
  if (Math.abs(m.scannedDurationSec - expectedDurationSec) > durationToleranceSec) failures.push("FULL_TIMELINE_SCAN");
  if (m.blackFrameIntervalCount !== 0 || m.freezeFrameIntervalCount !== 0
    || m.silenceIntervalCount !== 0 || m.missingFrameCount !== 0
    || m.nearStaticViolationCount !== 0 || m.clippingSampleCount !== 0) failures.push("TECHNICAL_DEFECT");
  if (Math.abs(m.avSyncOffsetMs) > AV_SYNC_MS.DEFAULT) failures.push("AV_SYNC");
  if (Math.abs(m.integratedLufs - AUDIO.LUFS_I.target) > AUDIO.LUFS_I.tolerance
    || m.truePeakDbtp > AUDIO.TRUE_PEAK_MAX_DBTP
    || m.loudnessRangeLu < AUDIO.LRA.min || m.loudnessRangeLu > AUDIO.LRA.max) failures.push("LOUDNESS");
  if (!m.mobileLegibilityPass || !m.safeZonePass) failures.push("MOBILE_SAFE_ZONE");
  if (m.timelineIssueCount !== 0 || m.debugOverlayCount !== 0
    || m.watermarkCount !== 0 || m.templateResidueCount !== 0) failures.push("EDIT_RESIDUE");
  if (m.missingInputCount !== 0 || m.unresolvedRightsCount !== 0
    || m.p0DefectCount > ASSURANCE.P0_MAX) failures.push("M0_INPUT_RIGHTS_P0");
  if (m.width !== MASTER.WIDTH || m.height !== MASTER.HEIGHT || m.fps !== MASTER.FPS
    || m.colorPrimaries !== MASTER.COLOR) failures.push("STREAM_PROFILE");
  return { receipt, failures, passed: failures.length === 0 };
}

export function validateTrackGVideoOneStage12Receipt(
  receipt: Stage12MediaReceipt,
  expectedDurationSec: number,
) {
  const evaluation = evaluateTrackGVideoOneStage12Receipt(receipt, expectedDurationSec);
  if (!evaluation.passed) {
    throw new Error(`TRACK_G_STAGE_12_QA_FAILED:${evaluation.failures.join(",")}`);
  }
  return { ...receipt, gateResults: stage12GateResults(receipt.measurements) };
}
