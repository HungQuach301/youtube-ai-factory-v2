import { describe, expect, it } from "vitest";

import { STAGE12_LRA_FEASIBILITY_POLICY } from
  "../stage12-lra-feasibility-controller.mjs";
import { stage12LraFeasibilityRequestSha256 } from
  "../stage12-lra-feasibility-delivery.mjs";
import { stage12LraFeasibilityFailureResult,
  validateStage12CodecSafeLraFeasibilityPayload } from "../stage12-runtime.mjs";
import { stage12LraFeasibilityFingerprints,
  terminalStage12LraFeasibilityFailure } from
  "../../../sites/control-plane/app/stage12-lra-feasibility-contract";

const hex = (value: string) => value.repeat(64).slice(0, 64);
const imageDigest = `sha256:${hex("e")}`;
const parentRuntimeProvenance = { ffmpegVersion: "ffmpeg version test",
  ffmpegBuildFingerprint: hex("a"), libopusEncoderFingerprint: hex("b") };

function payload() {
  const base = {
    schemaVersion: 1,
    idempotencyKey: hex("1"),
    packageId: "pkg",
    stageInstanceId: "s12",
    durationSec: 510,
    narration: { r2Key: "prod/narration.mp3", sha256: hex("2") },
    render: { width: 1920, height: 1080, fps: 30, sampleRateHz: 48_000 },
    timeline: { expectedFrames: 15_300, shots: [{ startFrame: 0, endFrame: 15_300,
      headline: "Immutable source", background: "#071816", accent: "#71f6c5",
      signal: "#ffb84d" }] },
    qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
    controls: { providerDispatch: "OFF", providerCallCount: 0, autoPublish: "OFF" },
    objectAccess: { url: "https://example.com/object", token: hex("3") },
    callback: { url: "https://example.com/callback", token: hex("4") },
  };
  const fingerprints = stage12LraFeasibilityFingerprints(base);
  const result = { ...base, codecSafeLraFeasibilitySearch: {
    schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
    sourceAttemptOrdinal: 3, sourceCorrectionOrdinal: 2,
    historicalFailureCorrectionOrdinal: 3,
    sourceSha256: "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2",
    parentEvidenceId: "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb",
    lraGuardEvidenceId: "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9",
    sourceCorrectionJobId: "ordinal-2", lraGuardJobId: "lra-guard",
    sourceCorrectedPreMaster: { r2Key: "prod/source.webm",
      sha256: "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2",
      byteLength: 1 },
    sourceCorrectionReceiptSha256: hex("5"),
    parentLosslessReference: { sha256: hex("6"), byteLength: 2,
      audioFrameMd5Sha256: hex("7"), codec: "pcm_f32le", sampleRateHz: 48000 },
    safeRollbackReference: { candidatePass: 5, macroDepthDb: 10.70625,
      integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
      losslessReferenceSha256: hex("6"), integratedLufs: -15.25,
      integratedLufsExact: "-15.25", truePeakDbtp: -1.06,
      truePeakDbtpExact: "-1.06", loudnessRangeLu: 3.2,
      loudnessRangeLuExact: "3.20", audioFrameMd5Sha256: hex("7") },
    parentRuntimeProvenance, policy: STAGE12_LRA_FEASIBILITY_POLICY,
    expectedWorkerImageDigest: imageDigest, ...fingerprints,
    shadowOnly: true, historicalBackfill: false, uploadCorrectedOutput: false,
    providerDispatch: "OFF", providerCallCount: 0, calibration: false,
    finalize: false, release: false, productionActivation: false, autoPublish: "OFF",
  }, durability: { requestSha256: "", fencingToken: 1, leaseId: "lease-1" } };
  result.durability.requestSha256 = stage12LraFeasibilityRequestSha256(result);
  return result;
}

describe("Stage 12 LRA feasibility worker envelope", () => {
  it("accepts only the exact immutable lineage and worker image pin", () => {
    expect(validateStage12CodecSafeLraFeasibilityPayload(payload(), imageDigest))
      .toMatchObject({ codecSafeLraFeasibilitySearch: { sourceAttemptOrdinal: 3,
        sourceCorrectionOrdinal: 2, shadowOnly: true, uploadCorrectedOutput: false } });
    const sourceDrift = structuredClone(payload());
    sourceDrift.codecSafeLraFeasibilitySearch.sourceCorrectedPreMaster.sha256 = hex("8");
    expect(() => validateStage12CodecSafeLraFeasibilityPayload(sourceDrift, imageDigest))
      .toThrow(/feasibility envelope/iu);
    expect(() => validateStage12CodecSafeLraFeasibilityPayload(payload(),
      `sha256:${hex("9")}`)).toThrow(/worker image/iu);
    const requestDrift = structuredClone(payload());
    requestDrift.durability.fencingToken = 2;
    expect(() => validateStage12CodecSafeLraFeasibilityPayload(requestDrift, imageDigest))
      .not.toThrow();
    requestDrift.timeline.shots[0].headline = "Changed work";
    expect(() => validateStage12CodecSafeLraFeasibilityPayload(requestDrift, imageDigest))
      .toThrow(/request hash/iu);
    const extraRollbackField = structuredClone(payload()) as ReturnType<typeof payload>
      & { codecSafeLraFeasibilitySearch: { safeRollbackReference: Record<string, unknown> } };
    extraRollbackField.codecSafeLraFeasibilitySearch.safeRollbackReference.unexpected = true;
    extraRollbackField.durability.requestSha256 = stage12LraFeasibilityRequestSha256(
      extraRollbackField,
    );
    expect(() => validateStage12CodecSafeLraFeasibilityPayload(extraRollbackField, imageDigest))
      .toThrow(/feasibility envelope/iu);
  });

  it("preserves an attempted probe and consumed budget in a typed runtime failure", () => {
    const value = payload();
    const failedProbe = { phase: "LRA_MAP", phaseOrdinal: 0, seedProbeOrdinal: null,
      macroDepthDb: 14, integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
      targetStepLufs: 0 };
    const error = Object.assign(new Error("measurement invalid"), {
      code: "STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID",
      feasibilityState: { candidateTrace: [], phaseBudgetUsed: { LRA_MAP: 1,
        TRUE_PEAK_CONTAINMENT: 0, LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0,
        FINAL_VERIFICATION: 0, SAFE_ROLLBACK: 0 }, failedProbes: [failedProbe], failedProbe },
    });
    const result = stage12LraFeasibilityFailureResult({
      search: value.codecSafeLraFeasibilitySearch, imageDigest, error,
      losslessReference: value.codecSafeLraFeasibilitySearch.parentLosslessReference,
      runtimeProvenance: parentRuntimeProvenance,
    });
    expect(result).toMatchObject({ outcome: "FAIL", terminalReason: "MEASUREMENT_FAILED",
      failedProbes: [failedProbe], failedProbe, phaseBudgetUsed: { LRA_MAP: 1 }, candidateTrace: [],
      correctedOutputUploaded: false, providerCallCount: 0, autoPublish: "OFF" });
  });

  it("keeps a worker failure terminal, typed and zero-side-effect", () => {
    const fingerprints = stage12LraFeasibilityFingerprints(payload());
    const result = terminalStage12LraFeasibilityFailure({
      errorCode: "STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID",
      terminalReason: "MEASUREMENT_FAILED", expectedWorkerImageDigest: imageDigest,
      parentRuntimeProvenance,
      safeRollbackReference: payload().codecSafeLraFeasibilitySearch.safeRollbackReference,
      ...fingerprints,
    });
    expect(result).toMatchObject({ outcome: "FAIL", terminalReason: "MEASUREMENT_FAILED",
      selectedCandidateSha256: null, correctedOutputUploaded: false,
      providerCallCount: 0, calibration: false, finalize: false,
      productionActivation: false, releaseEligible: false, autoPublish: "OFF" });
  });
});
