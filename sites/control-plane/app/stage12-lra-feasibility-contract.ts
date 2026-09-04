import { createHash } from "node:crypto";
import type {
  RunStage12CodecSafeLraFeasibilitySearchCommand,
  Stage12CodecSafeLraFeasibilityCandidate,
  Stage12CodecSafeLraFeasibilityPhase,
  Stage12CodecSafeLraFeasibilityResult,
  Stage12CodecSafeLraFeasibilityRuntimeProvenance,
  Stage12CodecSafeLraFeasibilitySafeRollbackReference,
} from "../../../packages/contracts/src/stage12-lra-feasibility";

export type { RunStage12CodecSafeLraFeasibilitySearchCommand,
  Stage12CodecSafeLraFeasibilityCandidate, Stage12CodecSafeLraFeasibilityMeasurement,
  Stage12CodecSafeLraFeasibilityFailedProbe, Stage12CodecSafeLraFeasibilityPhase,
  Stage12CodecSafeLraFeasibilityPhaseBudget,
  Stage12CodecSafeLraFeasibilityResult, Stage12CodecSafeLraFeasibilityRuntimeProvenance,
  Stage12CodecSafeLraFeasibilitySafeRollbackReference,
} from "../../../packages/contracts/src/stage12-lra-feasibility";

const HEX64 = /^[a-f0-9]{64}$/u;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const EXACT_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const PHASES = ["LRA_MAP", "TRUE_PEAK_CONTAINMENT", "LUFS_TRIM",
  "POST_TRIM_TRUE_PEAK", "FINAL_VERIFICATION", "SAFE_ROLLBACK"] as const;
const RESULT_KEYS = ["accepted", "algorithmFingerprint", "autoPublish", "boundary",
  "calibration", "candidateTrace", "correctedOutputUploaded", "errorCode",
  "evidenceSemantics", "expectedWorkerImageDigest", "failedProbe", "failedProbes",
  "finalize", "historicalBackfill", "lineage", "losslessReference", "outcome",
  "parentRuntimeProvenance", "phaseBudget", "phaseBudgetUsed", "productionActivation",
  "providerCallCount", "providerDispatch", "releaseEligible", "runtimeProvenance",
  "safeRollbackReference", "schemaVersion", "selectedCandidateSha256", "shadowOnly",
  "terminalReason", "thresholdSnapshotSha256", "workerImageDigest"] as const;
const RUNTIME_KEYS = ["ffmpegBuildFingerprint", "ffmpegVersion",
  "libopusEncoderFingerprint"] as const;
const LOSSLESS_REFERENCE_KEYS = ["audioFrameMd5Sha256", "byteLength", "codec",
  "sampleRateHz", "sha256"] as const;
const CANDIDATE_KEYS = ["audioFrameMd5Sha256", "candidateOrdinal", "candidateSha256",
  "disposition", "failedPredicates", "integratedLufs", "integratedLufsExact",
  "integratedTargetLufs", "limiterCeilingDbtp", "loudnessRangeLu",
  "loudnessRangeLuExact", "lraFeasible", "macroDepthDb", "phase", "phaseOrdinal",
  "seedProbeOrdinal", "targetStepLufs", "truePeakContained", "truePeakDbtp",
  "truePeakDbtpExact"] as const;

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

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64.test(value);
}

function isImageDigest(value: unknown): value is string {
  return typeof value === "string" && IMAGE_DIGEST.test(value);
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
    algorithmFingerprint: hash({ algorithm: "stage12-codec-safe-lra-feasibility-v2",
      candidateInput: "IMMUTABLE_CORRECTION_ORDINAL_2",
      search: "NON_MONOTONIC_LARGEST_GAP_LATTICE",
      terminalPolicy: "TWO_SEEDS_SINGLE_FINAL_THEN_ROLLBACK",
      phases: [...PHASES], thresholds, policy: STAGE12_LRA_FEASIBILITY_POLICY }),
  };
}

function parseRuntime(value: unknown): Stage12CodecSafeLraFeasibilityRuntimeProvenance {
  if (!isRecord(value)
    || canonical(Object.keys(value).sort()) !== canonical([...RUNTIME_KEYS].sort())
    || typeof value.ffmpegVersion !== "string"
    || value.ffmpegVersion.length === 0
    || !isHex64(value.ffmpegBuildFingerprint)
    || !isHex64(value.libopusEncoderFingerprint)) {
    throw new Error("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  }
  return value as Stage12CodecSafeLraFeasibilityRuntimeProvenance;
}

function sameMeasurement(left: Record<string, unknown>, right: Record<string, unknown>) {
  return ["integratedLufs", "truePeakDbtp", "loudnessRangeLu"]
    .every((key) => left[key] === right[key])
    && ["integratedLufsExact", "truePeakDbtpExact", "loudnessRangeLuExact"]
      .every((key) => left[key] === right[key]);
}

function parseSafeRollbackReference(value: unknown):
Stage12CodecSafeLraFeasibilitySafeRollbackReference {
  const keys = ["audioFrameMd5Sha256", "candidatePass", "integratedLufs",
    "integratedLufsExact", "integratedTargetLufs", "limiterCeilingDbtp",
    "losslessReferenceSha256", "loudnessRangeLu", "loudnessRangeLuExact",
    "macroDepthDb", "truePeakDbtp", "truePeakDbtpExact"].sort();
  if (!isRecord(value) || canonical(Object.keys(value).sort()) !== canonical(keys)
    || value.candidatePass !== 5 || value.macroDepthDb !== 10.70625
    || value.integratedTargetLufs !== -14 || value.limiterCeilingDbtp !== -2.67
    || value.integratedLufs !== -15.25 || value.integratedLufsExact !== "-15.25"
    || value.truePeakDbtp !== -1.06 || value.truePeakDbtpExact !== "-1.06"
    || value.loudnessRangeLu !== 3.2 || value.loudnessRangeLuExact !== "3.20"
    || !isHex64(value.losslessReferenceSha256)
    || !isHex64(value.audioFrameMd5Sha256)) {
    throw new Error("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  }
  return value as unknown as Stage12CodecSafeLraFeasibilitySafeRollbackReference;
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
  if (!isRecord(value)
    || canonical(Object.keys(value).sort()) !== canonical([...CANDIDATE_KEYS].sort())
    || value.candidateOrdinal !== ordinal
    || !PHASES.includes(value.phase as Stage12CodecSafeLraFeasibilityPhase)
    || !Number.isInteger(value.phaseOrdinal) || Number(value.phaseOrdinal) < 0
    || !(value.seedProbeOrdinal === null || (Number.isInteger(value.seedProbeOrdinal)
      && Number(value.seedProbeOrdinal) >= 0 && Number(value.seedProbeOrdinal) < 8))
    || !["macroDepthDb", "integratedTargetLufs", "limiterCeilingDbtp", "targetStepLufs",
      "integratedLufs", "truePeakDbtp", "loudnessRangeLu"]
      .every((key) => Number.isFinite(value[key]))
    || !["integratedLufsExact", "truePeakDbtpExact", "loudnessRangeLuExact"]
      .every((key) => typeof value[key] === "string"
        && EXACT_DECIMAL.test(String(value[key])))
    || Number(value.integratedLufsExact) !== Number(value.integratedLufs)
    || Number(value.truePeakDbtpExact) !== Number(value.truePeakDbtp)
    || Number(value.loudnessRangeLuExact) !== Number(value.loudnessRangeLu)
    || !isHex64(value.candidateSha256)
    || !isHex64(value.audioFrameMd5Sha256)
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

type FailedProbe = Stage12CodecSafeLraFeasibilityResult["failedProbe"];

function rounded(value: number) {
  return Number(value.toFixed(6));
}

function sameNumber(left: number, right: number) {
  return Object.is(left, right) || left === right;
}

function lufsInterior(candidate: Stage12CodecSafeLraFeasibilityCandidate) {
  return candidate.integratedLufs >= STAGE12_LRA_FEASIBILITY_POLICY.integratedInteriorMinLufs
    && candidate.integratedLufs <= STAGE12_LRA_FEASIBILITY_POLICY.integratedInteriorMaxLufs;
}

function publicPass(candidate: Stage12CodecSafeLraFeasibilityCandidate) {
  return candidate.failedPredicates.length === 0;
}

function expectedMapDisposition(candidate: Stage12CodecSafeLraFeasibilityCandidate) {
  if (!candidate.lraFeasible) return "LRA_INFEASIBLE";
  return candidate.truePeakContained ? "LRA_PROBE" : "LRA_FEASIBLE_TP_UNCONTAINED";
}

function selectSemanticSeeds(trace: Stage12CodecSafeLraFeasibilityCandidate[]) {
  return trace.filter((candidate) => candidate.phase === "LRA_MAP" && candidate.lraFeasible)
    .sort((left, right) => {
      const margin = (value: number) => Math.min(value - 4, 8 - value);
      return margin(right.loudnessRangeLu) - margin(left.loudnessRangeLu)
        || Math.max(0, left.truePeakDbtp + 1) - Math.max(0, right.truePeakDbtp + 1)
        || Math.abs(left.integratedLufs + 14) - Math.abs(right.integratedLufs + 14)
        || left.macroDepthDb - right.macroDepthDb
        || left.phaseOrdinal - right.phaseOrdinal;
    }).slice(0, 2);
}

function validFailedProbe(value: unknown): value is NonNullable<FailedProbe> {
  if (!isRecord(value)) return false;
  const baseKeys = ["integratedTargetLufs", "limiterCeilingDbtp", "macroDepthDb",
    "phase", "phaseOrdinal", "seedProbeOrdinal", "targetStepLufs"];
  const codeOnlyKeys = [...baseKeys, "failureCode"];
  const enrichedKeys = [...baseKeys, "failureCode", "observedMeasurement"];
  const keys = Object.keys(value).sort();
  const baseShape = canonical(keys) === canonical(baseKeys.sort());
  const codeOnlyShape = canonical(keys) === canonical(codeOnlyKeys.sort());
  const enrichedShape = canonical(keys) === canonical(enrichedKeys.sort());
  const observed = value.observedMeasurement;
  const observedValid = isRecord(observed)
    && canonical(Object.keys(observed).sort()) === canonical([
      "audioFrameMd5Sha256", "candidateSha256", "integratedLufs",
      "integratedLufsExact", "loudnessRangeLu", "loudnessRangeLuExact",
      "truePeakDbtp", "truePeakDbtpExact",
    ].sort())
    && ["integratedLufs", "truePeakDbtp", "loudnessRangeLu"]
      .every((key) => Number.isFinite(observed[key]))
    && ["integratedLufsExact", "truePeakDbtpExact", "loudnessRangeLuExact"]
      .every((key) => typeof observed[key] === "string"
        && EXACT_DECIMAL.test(String(observed[key])))
    && Number(observed.integratedLufsExact) === observed.integratedLufs
    && Number(observed.truePeakDbtpExact) === observed.truePeakDbtp
    && Number(observed.loudnessRangeLuExact) === observed.loudnessRangeLu
    && isHex64(observed.candidateSha256)
    && isHex64(observed.audioFrameMd5Sha256);
  return (baseShape || (codeOnlyShape
      && value.phase === "FINAL_VERIFICATION"
      && value.failureCode === "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE")
    || (enrichedShape
      && value.phase === "FINAL_VERIFICATION"
      && value.failureCode === "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT"
      && observedValid))
    && PHASES.includes(value.phase as Stage12CodecSafeLraFeasibilityPhase)
    && Number.isInteger(value.phaseOrdinal) && Number(value.phaseOrdinal) >= 0
    && (value.seedProbeOrdinal === null || (Number.isInteger(value.seedProbeOrdinal)
      && Number(value.seedProbeOrdinal) >= 0 && Number(value.seedProbeOrdinal) < 8))
    && ["macroDepthDb", "integratedTargetLufs", "limiterCeilingDbtp", "targetStepLufs"]
      .every((key) => Number.isFinite(value[key]));
}

function validateSemanticTrace(
  trace: Stage12CodecSafeLraFeasibilityCandidate[],
  terminalReason: string,
  selectedCandidateSha256: unknown,
  failedProbes: NonNullable<FailedProbe>[],
  safeRollbackReference: Stage12CodecSafeLraFeasibilitySafeRollbackReference,
) {
  const counts = Object.fromEntries(PHASES.map((phase) => [phase, 0])) as
    Record<Stage12CodecSafeLraFeasibilityPhase, number>;
  for (const candidate of trace) {
    if (candidate.phaseOrdinal !== counts[candidate.phase]) return false;
    counts[candidate.phase] += 1;
  }
  for (let leftIndex = 0; leftIndex < trace.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < trace.length; rightIndex += 1) {
      const left = trace[leftIndex] as unknown as Record<string, unknown>;
      const right = trace[rightIndex] as unknown as Record<string, unknown>;
      const identityOverlap = left.candidateSha256 === right.candidateSha256
        || left.audioFrameMd5Sha256 === right.audioFrameMd5Sha256;
      if (identityOverlap && (left.candidateSha256 !== right.candidateSha256
        || left.audioFrameMd5Sha256 !== right.audioFrameMd5Sha256
        || !sameMeasurement(left, right))) return false;
    }
  }

  let mapCount = 0;
  while (trace[mapCount]?.phase === "LRA_MAP") mapCount += 1;
  for (let index = 0; index < mapCount; index += 1) {
    const candidate = trace[index];
    if (!sameNumber(candidate.macroDepthDb, STAGE12_LRA_FEASIBILITY_POLICY.lattice[index])
      || !sameNumber(candidate.integratedTargetLufs, -14)
      || !sameNumber(candidate.limiterCeilingDbtp, -2.67)
      || !sameNumber(candidate.targetStepLufs, 0)
      || candidate.seedProbeOrdinal !== null
      || candidate.disposition !== expectedMapDisposition(candidate)) return false;
  }
  if (trace.slice(mapCount).some((candidate) => candidate.phase === "LRA_MAP")) return false;

  const technical = ["ENCODE_FAILED", "MEASUREMENT_FAILED", "LINEAGE_DRIFT"]
    .includes(terminalReason);
  if (!technical && mapCount !== STAGE12_LRA_FEASIBILITY_POLICY.lattice.length) return false;
  if (mapCount < STAGE12_LRA_FEASIBILITY_POLICY.lattice.length
    && trace.length !== mapCount) return false;

  if (technical && trace.length === 0 && failedProbes.length === 0) return true;
  if (mapCount < STAGE12_LRA_FEASIBILITY_POLICY.lattice.length) {
    const failure = failedProbes[0];
    if (!technical || failedProbes.length !== 1 || !failure
      || failure.phase !== "LRA_MAP"
      || trace.length !== mapCount || failure.phaseOrdinal !== mapCount
      || failure.seedProbeOrdinal !== null
      || !sameNumber(failure.macroDepthDb,
        STAGE12_LRA_FEASIBILITY_POLICY.lattice[mapCount])
      || !sameNumber(failure.integratedTargetLufs, -14)
      || !sameNumber(failure.limiterCeilingDbtp, -2.67)
      || !sameNumber(failure.targetStepLufs, 0)) return false;
    return true;
  }
  if (failedProbes.some((failure) => failure.phase === "LRA_MAP")) return false;

  const seeds = selectSemanticSeeds(trace.slice(0, mapCount));
  const postMapTrace = trace.slice(mapCount);
  const used = { LRA_MAP: mapCount, TRUE_PEAK_CONTAINMENT: 0, LUFS_TRIM: 0,
    POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 0 };
  let cursor = 0;
  let failureCursor = 0;
  type Controller = { macroDepthDb: number; integratedTargetLufs: number;
    limiterCeilingDbtp: number; targetStepLufs: number };
  type Attempt = { kind: "candidate"; candidate: Stage12CodecSafeLraFeasibilityCandidate }
    | { kind: "failure"; failure: NonNullable<FailedProbe> } | { kind: "invalid" };
  const samePlan = (value: Stage12CodecSafeLraFeasibilityCandidate
    | NonNullable<FailedProbe>, phase: Stage12CodecSafeLraFeasibilityPhase,
  seedProbeOrdinal: number | null, controller: Controller) =>
    value.phase === phase && value.phaseOrdinal === used[phase]
      && value.seedProbeOrdinal === seedProbeOrdinal
      && sameNumber(value.macroDepthDb, controller.macroDepthDb)
      && sameNumber(value.integratedTargetLufs, controller.integratedTargetLufs)
      && sameNumber(value.limiterCeilingDbtp, controller.limiterCeilingDbtp)
      && sameNumber(value.targetStepLufs, controller.targetStepLufs);
  const consume = (phase: Stage12CodecSafeLraFeasibilityPhase,
    seedProbeOrdinal: number | null, controller: Controller): Attempt => {
    const candidate = postMapTrace[cursor];
    if (candidate && samePlan(candidate, phase, seedProbeOrdinal, controller)) {
      cursor += 1;
      used[phase] += 1;
      return { kind: "candidate", candidate };
    }
    const failure = failedProbes[failureCursor];
    if (failure && samePlan(failure, phase, seedProbeOrdinal, controller)) {
      failureCursor += 1;
      used[phase] += 1;
      return { kind: "failure", failure };
    }
    return { kind: "invalid" };
  };
  const technicalEnd = (attempt: Attempt) => attempt.kind === "failure" && technical
    && cursor === postMapTrace.length && failureCursor === failedProbes.length;

  for (const seed of seeds) {
    let current = seed;
    let controller: Controller = { macroDepthDb: seed.macroDepthDb,
      integratedTargetLufs: seed.integratedTargetLufs,
      limiterCeilingDbtp: seed.limiterCeilingDbtp, targetStepLufs: 0 };
    let rejected = false;

    while (current.truePeakDbtp > STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp
      && used.TRUE_PEAK_CONTAINMENT
        < STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget.TRUE_PEAK_CONTAINMENT) {
      const previousTruePeak = current.truePeakDbtp;
      const correction = Math.max(0.01,
        previousTruePeak - STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp);
      controller = { ...controller,
        limiterCeilingDbtp: rounded(controller.limiterCeilingDbtp - correction),
        targetStepLufs: 0 };
      const attempt = consume("TRUE_PEAK_CONTAINMENT", seed.phaseOrdinal, controller);
      if (technicalEnd(attempt)) return true;
      if (attempt.kind !== "candidate") return false;
      const candidate = attempt.candidate;
      const disposition = !candidate.lraFeasible ? "LRA_REGRESSION"
        : candidate.truePeakDbtp >= previousTruePeak ? "TP_NON_IMPROVING"
          : candidate.truePeakDbtp <= STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp
            ? "TP_CONTAINED" : "TP_IMPROVING";
      if (candidate.disposition !== disposition) return false;
      if (!candidate.lraFeasible || candidate.truePeakDbtp >= previousTruePeak) {
        rejected = true;
        break;
      }
      current = candidate;
    }
    if (rejected
      || current.truePeakDbtp > STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp) continue;

    while (!lufsInterior(current) && used.LUFS_TRIM
      < STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget.LUFS_TRIM) {
      const desired = current.integratedLufs
        < STAGE12_LRA_FEASIBILITY_POLICY.integratedInteriorMinLufs
        ? STAGE12_LRA_FEASIBILITY_POLICY.integratedInteriorMinLufs
        : STAGE12_LRA_FEASIBILITY_POLICY.integratedInteriorMaxLufs;
      const delta = Math.max(-STAGE12_LRA_FEASIBILITY_POLICY.maxLufsTrimStepLu,
        Math.min(STAGE12_LRA_FEASIBILITY_POLICY.maxLufsTrimStepLu,
          desired - current.integratedLufs));
      controller = { ...controller,
        integratedTargetLufs: rounded(controller.integratedTargetLufs + delta),
        targetStepLufs: rounded(delta) };
      const attempt = consume("LUFS_TRIM", seed.phaseOrdinal, controller);
      if (technicalEnd(attempt)) return true;
      if (attempt.kind !== "candidate") return false;
      const candidate = attempt.candidate;
      const disposition = candidate.lraFeasible ? "LUFS_TRIMMED" : "LRA_REGRESSION";
      if (candidate.disposition !== disposition) return false;
      if (!candidate.lraFeasible) {
        rejected = true;
        break;
      }
      current = candidate;
    }
    if (rejected || !lufsInterior(current)) continue;

    while (current.truePeakDbtp > STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp
      && used.POST_TRIM_TRUE_PEAK
        < STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget.POST_TRIM_TRUE_PEAK) {
      const previousTruePeak = current.truePeakDbtp;
      const correction = Math.max(0.01,
        previousTruePeak - STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp);
      controller = { ...controller,
        limiterCeilingDbtp: rounded(controller.limiterCeilingDbtp - correction),
        targetStepLufs: 0 };
      const attempt = consume("POST_TRIM_TRUE_PEAK", seed.phaseOrdinal, controller);
      if (technicalEnd(attempt)) return true;
      if (attempt.kind !== "candidate") return false;
      const candidate = attempt.candidate;
      const disposition = !candidate.lraFeasible ? "LRA_REGRESSION"
        : candidate.truePeakDbtp >= previousTruePeak ? "TP_NON_IMPROVING"
          : candidate.truePeakDbtp <= STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp
            ? "POST_TRIM_TP_CONTAINED" : "POST_TRIM_TP_IMPROVING";
      if (candidate.disposition !== disposition) return false;
      if (!candidate.lraFeasible || candidate.truePeakDbtp >= previousTruePeak) {
        rejected = true;
        break;
      }
      current = candidate;
    }
    if (rejected
      || current.truePeakDbtp > STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp
      || !publicPass(current)) continue;
    if (used.FINAL_VERIFICATION
      >= STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget.FINAL_VERIFICATION) {
      break;
    }
    controller = { ...controller, targetStepLufs: 0 };
    const finalAttempt = consume("FINAL_VERIFICATION", seed.phaseOrdinal, controller);
    if (finalAttempt.kind === "failure") {
      const failure = finalAttempt.failure;
      const recoverable = ["STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT",
        "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE"]
        .includes(failure.failureCode ?? "");
      if (!recoverable) return technicalEnd(finalAttempt);
      if (failure.failureCode === "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT") {
        if (!failure.observedMeasurement) return false;
        const observed = failure.observedMeasurement as unknown as Record<string, unknown>;
        const expected = current as unknown as Record<string, unknown>;
        const drifted = observed.candidateSha256 !== expected.candidateSha256
          || observed.audioFrameMd5Sha256 !== expected.audioFrameMd5Sha256
          || !sameMeasurement(observed, expected);
        if (!drifted) return false;
      } else if (failure.observedMeasurement !== undefined) return false;
      break;
    }
    if (finalAttempt.kind !== "candidate") return false;
    const verified = finalAttempt.candidate;
    if (verified.candidateSha256 !== current.candidateSha256
      || verified.audioFrameMd5Sha256 !== current.audioFrameMd5Sha256
      || !sameMeasurement(verified as unknown as Record<string, unknown>,
        current as unknown as Record<string, unknown>)
      || verified.truePeakDbtp > STAGE12_LRA_FEASIBILITY_POLICY.truePeakInteriorDbtp
      || !publicPass(verified) || verified.disposition !== "FULL_PASS") return false;
    return terminalReason === "PASS" && cursor === postMapTrace.length
      && failedProbes.length === 0
      && selectedCandidateSha256 === verified.candidateSha256;
  }

  const rollbackController = { macroDepthDb: 10.70625, integratedTargetLufs: -14,
    limiterCeilingDbtp: -2.67, targetStepLufs: 0 };
  const rollbackAttempt = consume("SAFE_ROLLBACK", null, rollbackController);
  if (technicalEnd(rollbackAttempt)) return true;
  if (rollbackAttempt.kind !== "candidate") return false;
  const rollback = rollbackAttempt.candidate;
  return rollback.disposition === "SAFE_ROLLBACK"
    && rollback.audioFrameMd5Sha256 === safeRollbackReference.audioFrameMd5Sha256
    && sameMeasurement(rollback as unknown as Record<string, unknown>,
      safeRollbackReference as unknown as Record<string, unknown>)
    && rollback.truePeakDbtp <= -1
    && terminalReason === "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED"
    && cursor === postMapTrace.length
    && (failedProbes.length === 0 || (failureCursor === failedProbes.length
      && failedProbes.length === 1
      && failedProbes[0].phase === "FINAL_VERIFICATION"
      && ["STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT",
        "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE"]
        .includes(String(failedProbes[0].failureCode))))
    && selectedCandidateSha256 === rollback.candidateSha256;
}

export function parseStage12LraFeasibilityResult(value: unknown,
  expectedSafeRollbackReference?: Stage12CodecSafeLraFeasibilitySafeRollbackReference):
Stage12CodecSafeLraFeasibilityResult {
  const invalid = () => new Error("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  if (!isRecord(value)
    || canonical(Object.keys(value).sort()) !== canonical([...RESULT_KEYS].sort())
    || value.accepted !== true || value.schemaVersion !== 1
    || value.evidenceSemantics !== "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION"
    || value.boundary !== "POST_OPUS_CODEC_SAFE_LRA_FEASIBILITY"
    || canonical(value.lineage) !== canonical(STAGE12_LRA_FEASIBILITY_LINEAGE)
    || canonical(value.phaseBudget) !== canonical(STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget)
    || !isRecord(value.phaseBudgetUsed) || !Array.isArray(value.candidateTrace)
    || !Array.isArray(value.failedProbes)
    || !value.failedProbes.every(validFailedProbe)
    || !(value.failedProbe === null || validFailedProbe(value.failedProbe))
    || !["PASS", "FAIL"].includes(value.outcome as string)
    || !["PASS", "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED", "ENCODE_FAILED",
      "MEASUREMENT_FAILED", "LINEAGE_DRIFT"].includes(value.terminalReason as string)
    || !(value.errorCode === null || (typeof value.errorCode === "string"
      && /^[A-Z0-9_:.-]{1,160}$/u.test(value.errorCode)))
    || !(value.selectedCandidateSha256 === null
      || isHex64(value.selectedCandidateSha256))
    || !isImageDigest(value.expectedWorkerImageDigest)
    || value.workerImageDigest !== value.expectedWorkerImageDigest
    || !isHex64(value.algorithmFingerprint)
    || !isHex64(value.thresholdSnapshotSha256)
    || value.shadowOnly !== true || value.correctedOutputUploaded !== false
    || value.historicalBackfill !== false || value.providerDispatch !== "OFF"
    || value.providerCallCount !== 0 || value.calibration !== false
    || value.finalize !== false || value.productionActivation !== false
    || value.releaseEligible !== false || value.autoPublish !== "OFF") throw invalid();

  let safeRollbackReference: Stage12CodecSafeLraFeasibilitySafeRollbackReference;
  try {
    safeRollbackReference = parseSafeRollbackReference(value.safeRollbackReference);
  } catch {
    throw invalid();
  }
  if (expectedSafeRollbackReference
    && canonical(safeRollbackReference) !== canonical(expectedSafeRollbackReference)) {
    throw invalid();
  }
  const failedProbes = value.failedProbes as NonNullable<FailedProbe>[];
  const lastFailedProbe = failedProbes.at(-1) ?? null;
  if (canonical(value.failedProbe) !== canonical(lastFailedProbe)) throw invalid();
  const trace = value.candidateTrace.map(parseCandidate);
  const budgetKeys = Object.keys(value.phaseBudgetUsed).sort();
  if (canonical(budgetKeys) !== canonical([...PHASES].sort())) throw invalid();
  const traceCounts = Object.fromEntries(PHASES.map((phase) => [phase,
    trace.filter((candidate) => candidate.phase === phase).length])) as
    Record<Stage12CodecSafeLraFeasibilityPhase, number>;
  for (const phase of PHASES) {
    const used = value.phaseBudgetUsed[phase];
    const attemptedFailure = failedProbes
      .filter((failedProbe) => failedProbe.phase === phase).length;
    if (!Number.isInteger(used) || used !== traceCounts[phase] + attemptedFailure
      || used < 0 || used > STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget[phase]) throw invalid();
  }
  const terminal = value.terminalReason as string;
  const normal = terminal === "PASS"
    || terminal === "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED";
  const parentRuntimeProvenance = parseRuntime(value.parentRuntimeProvenance);
  if (normal) {
    const normalFinalIntegrityFailure = terminal
      === "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED"
      && failedProbes.length === 1
      && failedProbes[0].phase === "FINAL_VERIFICATION"
      && ["STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT",
        "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE"]
        .includes(String(failedProbes[0].failureCode));
    if (!value.losslessReference || !isRecord(value.losslessReference)
      || canonical(Object.keys(value.losslessReference).sort())
        !== canonical([...LOSSLESS_REFERENCE_KEYS].sort())
      || !isHex64(value.losslessReference.sha256)
      || !Number.isInteger(value.losslessReference.byteLength)
      || Number(value.losslessReference.byteLength) < 1
      || !isHex64(value.losslessReference.audioFrameMd5Sha256)
      || value.losslessReference.codec !== "pcm_f32le"
      || value.losslessReference.sampleRateHz !== 48000
      || safeRollbackReference.losslessReferenceSha256
        !== value.losslessReference.sha256
      || !value.runtimeProvenance || value.errorCode !== null
      || (value.failedProbe !== null && !normalFinalIntegrityFailure)) throw invalid();
    const runtimeProvenance = parseRuntime(value.runtimeProvenance);
    if (canonical(runtimeProvenance) !== canonical(parentRuntimeProvenance)) throw invalid();
  } else {
    if (value.outcome !== "FAIL" || value.errorCode === null
      || value.selectedCandidateSha256 !== null) throw invalid();
    if (value.losslessReference !== null) {
      if (!isRecord(value.losslessReference)
        || canonical(Object.keys(value.losslessReference).sort())
          !== canonical([...LOSSLESS_REFERENCE_KEYS].sort())
        || !isHex64(value.losslessReference.sha256)
        || !Number.isInteger(value.losslessReference.byteLength)
        || Number(value.losslessReference.byteLength) < 1
        || !isHex64(value.losslessReference.audioFrameMd5Sha256)
        || value.losslessReference.codec !== "pcm_f32le"
        || value.losslessReference.sampleRateHz !== 48000
        || safeRollbackReference.losslessReferenceSha256
          !== value.losslessReference.sha256) throw invalid();
    }
    const runtimeProvenance = value.runtimeProvenance === null ? null
      : parseRuntime(value.runtimeProvenance);
    if (value.runtimeProvenance !== null && value.losslessReference === null) throw invalid();
    if ((trace.length > 0 || failedProbes.length > 0)
      && (!value.losslessReference || !value.runtimeProvenance)) throw invalid();
    const runtimeMatchesParent = runtimeProvenance !== null
      && canonical(runtimeProvenance) === canonical(parentRuntimeProvenance);
    const preProbeRuntimeDrift = value.errorCode === "STAGE12_LRA_FEASIBILITY_RUNTIME_DRIFT"
      && terminal === "LINEAGE_DRIFT"
      && trace.length === 0
      && failedProbes.length === 0
      && value.losslessReference !== null
      && runtimeProvenance !== null
      && !runtimeMatchesParent;
    if (value.errorCode === "STAGE12_LRA_FEASIBILITY_RUNTIME_DRIFT") {
      if (!preProbeRuntimeDrift) throw invalid();
    } else if (runtimeProvenance !== null && !runtimeMatchesParent) throw invalid();
  }
  if ((terminal === "PASS" && value.outcome !== "PASS")
    || (terminal !== "PASS" && value.outcome !== "FAIL")
    || !validateSemanticTrace(trace, terminal, value.selectedCandidateSha256,
      failedProbes, safeRollbackReference)) throw invalid();
  return value as unknown as Stage12CodecSafeLraFeasibilityResult;
}

export function terminalStage12LraFeasibilityFailure(input: {
  errorCode: string;
  terminalReason: "ENCODE_FAILED" | "MEASUREMENT_FAILED" | "LINEAGE_DRIFT";
  expectedWorkerImageDigest: string;
  algorithmFingerprint: string;
  thresholdSnapshotSha256: string;
  parentRuntimeProvenance: Stage12CodecSafeLraFeasibilityRuntimeProvenance;
  safeRollbackReference: Stage12CodecSafeLraFeasibilitySafeRollbackReference;
  partial?: Pick<Stage12CodecSafeLraFeasibilityResult,
    "phaseBudgetUsed" | "candidateTrace" | "failedProbes" | "failedProbe" | "losslessReference"
      | "runtimeProvenance">;
}): Stage12CodecSafeLraFeasibilityResult {
  const partial = input.partial ?? { phaseBudgetUsed: { LRA_MAP: 0,
    TRUE_PEAK_CONTAINMENT: 0, LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0,
    FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 0 }, candidateTrace: [],
    failedProbes: [], failedProbe: null, losslessReference: null, runtimeProvenance: null };
  return parseStage12LraFeasibilityResult({ accepted: true, schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
    boundary: "POST_OPUS_CODEC_SAFE_LRA_FEASIBILITY",
    lineage: STAGE12_LRA_FEASIBILITY_LINEAGE,
    phaseBudget: STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget,
    phaseBudgetUsed: partial.phaseBudgetUsed, candidateTrace: partial.candidateTrace,
    failedProbes: partial.failedProbes, failedProbe: partial.failedProbe,
    outcome: "FAIL", terminalReason: input.terminalReason,
    errorCode: input.errorCode, selectedCandidateSha256: null,
    safeRollbackReference: input.safeRollbackReference,
    losslessReference: partial.losslessReference,
    parentRuntimeProvenance: input.parentRuntimeProvenance,
    runtimeProvenance: partial.runtimeProvenance,
    expectedWorkerImageDigest: input.expectedWorkerImageDigest,
    workerImageDigest: input.expectedWorkerImageDigest,
    algorithmFingerprint: input.algorithmFingerprint,
    thresholdSnapshotSha256: input.thresholdSnapshotSha256,
    shadowOnly: true, correctedOutputUploaded: false, historicalBackfill: false,
    providerDispatch: "OFF", providerCallCount: 0, calibration: false, finalize: false,
    productionActivation: false, releaseEligible: false, autoPublish: "OFF" });
}
