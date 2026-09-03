import { createHash } from "node:crypto";
import { ASSURANCE, AUDIO, AV_SYNC_MS, MASTER, RETRY, VISUAL } from "../packages/contracts/src/thresholds";

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
