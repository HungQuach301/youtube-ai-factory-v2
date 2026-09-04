import { createHash } from "node:crypto";
import type {
  RunStage12CodecSafeLraFeasibilitySearchCommand,
  Stage12CodecSafeLraFeasibilityCandidate,
  Stage12CodecSafeLraFeasibilityPhase,
  Stage12CodecSafeLraFeasibilityResult,
  Stage12CodecSafeLraFeasibilityRuntimeProvenance,
} from "../../../packages/contracts/src/stage12-lra-feasibility";

export type { RunStage12CodecSafeLraFeasibilitySearchCommand,
  Stage12CodecSafeLraFeasibilityCandidate, Stage12CodecSafeLraFeasibilityMeasurement,
  Stage12CodecSafeLraFeasibilityPhase, Stage12CodecSafeLraFeasibilityPhaseBudget,
  Stage12CodecSafeLraFeasibilityResult, Stage12CodecSafeLraFeasibilityRuntimeProvenance,
} from "../../../packages/contracts/src/stage12-lra-feasibility";

const HEX64 = /^[a-f0-9]{64}$/u;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const PHASES = ["LRA_MAP", "TRUE_PEAK_CONTAINMENT", "LUFS_TRIM",
  "POST_TRIM_TRUE_PEAK", "FINAL_VERIFICATION", "SAFE_ROLLBACK"] as const;

export const STAGE12_LRA_FEASIBILITY_POLICY = {
  schemaVersion: 1,
  macroDepthMinDb: 10.9,
  macroDepthMaxDb: 14,
  lattice: [14, 12.45, 11.675, 13.225, 11.2875, 12.0625, 12.8375, 13.6125],
  phaseBudget: { LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 4, LUFS_TRIM: 3,
    POST_TRIM_TRUE_PEAK: 2, FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1 },
  truePeakInteriorDbtp: -1.05,
  maxLufsTrimStepLu: 0.25,
  integratedInteriorMinLufs: -14.95,
  integratedInteriorMaxLufs: -13.05,
} as const;

export const STAGE12_LRA_FEASIBILITY_LINEAGE = {
  sourceAttemptOrdinal: 3,
  sourceCorrectionOrdinal: 2,
  historicalFailureCorrectionOrdinal: 3,
  sourceSha256: "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2",
  parentEvidenceId: "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb",
  lraGuardEvidenceId: "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9",
} as const;

export const STAGE12_LRA_FEASIBILITY_COMMAND = {
  commandType: "RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH",
  ownerApprovalText: "RUN STAGE 12 CODEC SAFE LRA FEASIBILITY SEARCH",
  ...STAGE12_LRA_FEASIBILITY_LINEAGE,
  shadowOnly: true,
  uploadCorrectedOutput: false,
  providerDispatch: "OFF",
  providerCallCount: 0,
  calibration: false,
  finalize: false,
  productionActivation: false,
  release: false,
  autoPublish: "OFF",
} as const satisfies RunStage12CodecSafeLraFeasibilitySearchCommand;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("NON_FINITE_FEASIBILITY_VALUE");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!isRecord(value)) throw new TypeError("INVALID_FEASIBILITY_VALUE");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function stage12LraFeasibilityFingerprints(request: {
  qa: { nearStaticMaxSec: number; loudness: { integratedLufs: number;
    toleranceLufs: number; truePeakMaxDbtp: number; lraMin: number; lraMax: number } };
  render: { sampleRateHz: number };
}) {
  const thresholds = {
    integratedLufs: request.qa.loudness.integratedLufs,
    toleranceLufs: request.qa.loudness.toleranceLufs,
    truePeakMaxDbtp: request.qa.loudness.truePeakMaxDbtp,
    lraMin: request.qa.loudness.lraMin,
    lraMax: request.qa.loudness.lraMax,
    nearStaticMaxSec: request.qa.nearStaticMaxSec,
    sampleRateHz: request.render.sampleRateHz,
  };
  return {
    thresholdSnapshotSha256: hash(thresholds),
    algorithmFingerprint: hash({ algorithm: "stage12-codec-safe-lra-feasibility-v1",
      candidateInput: "IMMUTABLE_CORRECTION_ORDINAL_2",
      search: "NON_MONOTONIC_LARGEST_GAP_LATTICE",
      phases: [...PHASES], thresholds, policy: STAGE12_LRA_FEASIBILITY_POLICY }),
  };
}

function parseRuntime(value: unknown): Stage12CodecSafeLraFeasibilityRuntimeProvenance {
  if (!isRecord(value) || typeof value.ffmpegVersion !== "string"
    || value.ffmpegVersion.length === 0
    || !HEX64.test(String(value.ffmpegBuildFingerprint ?? ""))
    || !HEX64.test(String(value.libopusEncoderFingerprint ?? ""))) {
    throw new Error("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  }
  return value as Stage12CodecSafeLraFeasibilityRuntimeProvenance;
}

function expectedFailedPredicates(candidate: { integratedLufs: number; truePeakDbtp: number;
  loudnessRangeLu: number }) {
  const failed: string[] = [];
  if (candidate.integratedLufs < -15) failed.push("INTEGRATED_LUFS_BELOW_MIN");
  if (candidate.integratedLufs > -13) failed.push("INTEGRATED_LUFS_ABOVE_MAX");
  if (candidate.truePeakDbtp > -1) failed.push("TRUE_PEAK_DBTP_ABOVE_MAX");
  if (candidate.loudnessRangeLu < 4) failed.push("LOUDNESS_RANGE_LU_BELOW_MIN");
  if (candidate.loudnessRangeLu > 8) failed.push("LOUDNESS_RANGE_LU_ABOVE_MAX");
  return failed;
}

function parseCandidate(value: unknown, ordinal: number): Stage12CodecSafeLraFeasibilityCandidate {
  if (!isRecord(value) || value.candidateOrdinal !== ordinal
    || !PHASES.includes(value.phase as Stage12CodecSafeLraFeasibilityPhase)
    || !Number.isInteger(value.phaseOrdinal) || Number(value.phaseOrdinal) < 0
    || !(value.seedProbeOrdinal === null || (Number.isInteger(value.seedProbeOrdinal)
      && Number(value.seedProbeOrdinal) >= 0 && Number(value.seedProbeOrdinal) < 8))
    || !["macroDepthDb", "integratedTargetLufs", "limiterCeilingDbtp", "targetStepLufs",
      "integratedLufs", "truePeakDbtp", "loudnessRangeLu"]
      .every((key) => Number.isFinite(value[key]))
    || !["integratedLufsExact", "truePeakDbtpExact", "loudnessRangeLuExact"]
      .every((key) => typeof value[key] === "string" && String(value[key]).length > 0)
    || !HEX64.test(String(value.candidateSha256 ?? ""))
    || !HEX64.test(String(value.audioFrameMd5Sha256 ?? ""))
    || !Array.isArray(value.failedPredicates)
    || canonical(value.failedPredicates) !== canonical(expectedFailedPredicates({
      integratedLufs: Number(value.integratedLufs), truePeakDbtp: Number(value.truePeakDbtp),
      loudnessRangeLu: Number(value.loudnessRangeLu),
    }))
    || value.lraFeasible !== (Number(value.loudnessRangeLu) >= 4
      && Number(value.loudnessRangeLu) <= 8)
    || value.truePeakContained !== (Number(value.truePeakDbtp) <= -1)
    || typeof value.disposition !== "string") {
    throw new Error("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  }
  return value as unknown as Stage12CodecSafeLraFeasibilityCandidate;
}

export function parseStage12LraFeasibilityResult(value: unknown):
Stage12CodecSafeLraFeasibilityResult {
  const invalid = () => new Error("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  if (!isRecord(value) || value.accepted !== true || value.schemaVersion !== 1
    || value.evidenceSemantics !== "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION"
    || value.boundary !== "POST_OPUS_CODEC_SAFE_LRA_FEASIBILITY"
    || canonical(value.lineage) !== canonical(STAGE12_LRA_FEASIBILITY_LINEAGE)
    || canonical(value.phaseBudget) !== canonical(STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget)
    || !isRecord(value.phaseBudgetUsed) || !Array.isArray(value.candidateTrace)
    || !["PASS", "FAIL"].includes(String(value.outcome))
    || !["PASS", "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED", "ENCODE_FAILED",
      "MEASUREMENT_FAILED", "LINEAGE_DRIFT"].includes(String(value.terminalReason))
    || !(value.errorCode === null || /^[A-Z0-9_:.-]{1,160}$/u.test(String(value.errorCode)))
    || !(value.selectedCandidateSha256 === null
      || HEX64.test(String(value.selectedCandidateSha256)))
    || !IMAGE_DIGEST.test(String(value.expectedWorkerImageDigest ?? ""))
    || value.workerImageDigest !== value.expectedWorkerImageDigest
    || !HEX64.test(String(value.algorithmFingerprint ?? ""))
    || !HEX64.test(String(value.thresholdSnapshotSha256 ?? ""))
    || value.shadowOnly !== true || value.correctedOutputUploaded !== false
    || value.historicalBackfill !== false || value.providerDispatch !== "OFF"
    || value.providerCallCount !== 0 || value.calibration !== false
    || value.finalize !== false || value.productionActivation !== false
    || value.releaseEligible !== false || value.autoPublish !== "OFF") throw invalid();

  const trace = value.candidateTrace.map(parseCandidate);
  for (const phase of PHASES) {
    const count = trace.filter((candidate) => candidate.phase === phase).length;
    if (value.phaseBudgetUsed[phase] !== count
      || count > STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget[phase]) throw invalid();
  }
  const terminal = String(value.terminalReason);
  const normal = terminal === "PASS"
    || terminal === "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED";
  if (normal) {
    if (!value.losslessReference || !isRecord(value.losslessReference)
      || !HEX64.test(String(value.losslessReference.sha256 ?? ""))
      || !Number.isInteger(value.losslessReference.byteLength)
      || Number(value.losslessReference.byteLength) < 1
      || !HEX64.test(String(value.losslessReference.audioFrameMd5Sha256 ?? ""))
      || value.losslessReference.codec !== "pcm_f32le"
      || value.losslessReference.sampleRateHz !== 48000
      || !value.runtimeProvenance || value.errorCode !== null) throw invalid();
    parseRuntime(value.parentRuntimeProvenance);
    parseRuntime(value.runtimeProvenance);
  } else if (value.outcome !== "FAIL" || value.errorCode === null
    || value.selectedCandidateSha256 !== null || value.losslessReference !== null
    || value.runtimeProvenance !== null || trace.length !== 0) throw invalid();
  const selected = trace.find((candidate) =>
    candidate.candidateSha256 === value.selectedCandidateSha256);
  if (terminal === "PASS") {
    if (value.outcome !== "PASS" || !selected || selected.phase !== "FINAL_VERIFICATION"
      || selected.failedPredicates.length !== 0 || selected.disposition !== "FULL_PASS") {
      throw invalid();
    }
  } else if (terminal === "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED"
    && (value.outcome !== "FAIL" || !selected || selected.phase !== "SAFE_ROLLBACK"
      || selected.disposition !== "SAFE_ROLLBACK")) throw invalid();
  return value as unknown as Stage12CodecSafeLraFeasibilityResult;
}

export function terminalStage12LraFeasibilityFailure(input: {
  errorCode: string;
  terminalReason: "ENCODE_FAILED" | "MEASUREMENT_FAILED" | "LINEAGE_DRIFT";
  expectedWorkerImageDigest: string;
  algorithmFingerprint: string;
  thresholdSnapshotSha256: string;
  parentRuntimeProvenance: Stage12CodecSafeLraFeasibilityRuntimeProvenance;
}): Stage12CodecSafeLraFeasibilityResult {
  return parseStage12LraFeasibilityResult({ accepted: true, schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
    boundary: "POST_OPUS_CODEC_SAFE_LRA_FEASIBILITY",
    lineage: STAGE12_LRA_FEASIBILITY_LINEAGE,
    phaseBudget: STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget,
    phaseBudgetUsed: { LRA_MAP: 0, TRUE_PEAK_CONTAINMENT: 0, LUFS_TRIM: 0,
      POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 0 },
    candidateTrace: [], outcome: "FAIL", terminalReason: input.terminalReason,
    errorCode: input.errorCode, selectedCandidateSha256: null, losslessReference: null,
    parentRuntimeProvenance: input.parentRuntimeProvenance, runtimeProvenance: null,
    expectedWorkerImageDigest: input.expectedWorkerImageDigest,
    workerImageDigest: input.expectedWorkerImageDigest,
    algorithmFingerprint: input.algorithmFingerprint,
    thresholdSnapshotSha256: input.thresholdSnapshotSha256,
    shadowOnly: true, correctedOutputUploaded: false, historicalBackfill: false,
    providerDispatch: "OFF", providerCallCount: 0, calibration: false, finalize: false,
    productionActivation: false, releaseEligible: false, autoPublish: "OFF" });
}
