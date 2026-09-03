import { describe, expect, it } from "vitest";

import {
  buildStage12CodecSafeTruePeakShadowEvidence,
  initialStage12CodecSafeTruePeakController,
  nextStage12CodecSafeTruePeakController,
  stage12CodecSafeTruePeakFingerprints,
  validateStage12CodecSafeTruePeakShadowPayload,
} from "../stage12-runtime.mjs";
import {
  stage12CodecSafeTruePeakFingerprints as controlPlaneFingerprints,
} from "../../../sites/control-plane/app/stage12-pre-master";

const hex = (value: string) => value.repeat(64).slice(0, 64);
const imageDigest = `sha256:${hex("9")}`;
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
  objectAccess: { url: "https://example.com/object", token: hex("c") },
  callback: { url: "https://example.com/callback", token: hex("d") },
};

function shadowPayload() {
  const fingerprints = stage12CodecSafeTruePeakFingerprints(payload, 3);
  return { ...payload, codecSafeShadowReplay: {
    schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION",
    sourceAttemptOrdinal: 3,
    sourceCorrectionOrdinal: 2,
    historicalFailureCorrectionOrdinal: 3,
    correctionPassLimit: 3,
    sourceCorrectionJobId: "correction-2",
    historicalFailureJobId: "correction-3",
    diagnosticReplayJobId: "diagnostic-replay-1",
    diagnosticReplayEvidenceId: hex("e"),
    sourceCorrectedPreMaster: {
      r2Key: "prod/audio-p0/source.webm", sha256: hex("1"), byteLength: 16_795_484,
    },
    sourceCorrectionReceiptSha256: hex("2"),
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
  } };
}

const exactCandidate = (candidatePass: number, values: {
  integratedLufs: number; integratedLufsExact: string;
  truePeakDbtp: number; truePeakDbtpExact: string;
  loudnessRangeLu: number; loudnessRangeLuExact: string;
}, parameters: { integratedTargetLufs: number; limiterCeilingDbtp: number;
  macroDepthDb: number; }) => ({
  candidatePass,
  phase: candidatePass === 0 ? "INITIAL_CODEC_SAFE_CANDIDATE"
    : "POST_OPUS_FEEDBACK_CANDIDATE",
  losslessReferenceSha256: hex("4"),
  ...parameters,
  codecOvershootDb: Math.max(0, values.truePeakDbtp - parameters.limiterCeilingDbtp),
  ...values,
  failedPredicates: [
    ...(values.integratedLufs < -15 ? ["INTEGRATED_LUFS_BELOW_MIN"] : []),
    ...(values.integratedLufs > -13 ? ["INTEGRATED_LUFS_ABOVE_MAX"] : []),
    ...(values.truePeakDbtp > -1 ? ["TRUE_PEAK_DBTP_ABOVE_MAX"] : []),
    ...(values.loudnessRangeLu < 4 ? ["LOUDNESS_RANGE_LU_BELOW_MIN"] : []),
    ...(values.loudnessRangeLu > 8 ? ["LOUDNESS_RANGE_LU_ABOVE_MAX"] : []),
  ],
  audioFrameMd5Sha256: hex(String(candidatePass + 5)),
});

describe("Stage 12 codec-safe true-peak convergence", () => {
  it("derives every controller target from the immutable loudness contract", () => {
    const initial = initialStage12CodecSafeTruePeakController(payload);
    expect(initial).toEqual({
      integratedTargetLufs: -14,
      limiterCeilingDbtp: -2,
      macroDepthDb: 5,
      lowLraDepthDb: null,
      highLraDepthDb: null,
    });
    expect(payload.qa.loudness).toEqual({ integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 });
  });

  it("uses post-Opus overshoot and never raises the limiter ceiling", () => {
    const initial = initialStage12CodecSafeTruePeakController(payload);
    const afterInitial = nextStage12CodecSafeTruePeakController(payload, initial, {
      integratedLufs: -15.14, truePeakDbtp: -0.83, loudnessRangeLu: 3.7,
    });
    expect(afterInitial.integratedTargetLufs).toBeCloseTo(-12.86, 8);
    expect(afterInitial.limiterCeilingDbtp).toBeCloseTo(-2.17, 8);
    expect(afterInitial.macroDepthDb).toBeCloseTo(7.3, 8);
    expect(afterInitial.lowLraDepthDb).toBe(5);

    const afterPass = nextStage12CodecSafeTruePeakController(payload, afterInitial, {
      integratedLufs: -14.6, truePeakDbtp: -1.08, loudnessRangeLu: 7.8,
    });
    expect(afterPass.limiterCeilingDbtp).toBe(afterInitial.limiterCeilingDbtp);
    expect(afterPass.macroDepthDb).toBe(afterInitial.macroDepthDb);
  });

  it("pins exact source, replay evidence, runtime and zero-side-effect controls", () => {
    const value = shadowPayload();
    expect(validateStage12CodecSafeTruePeakShadowPayload(value, imageDigest))
      .toBe(value);
    expect(controlPlaneFingerprints(payload as never, 3))
      .toEqual(stage12CodecSafeTruePeakFingerprints(payload, 3));
    for (const codecSafeShadowReplay of [
      { ...value.codecSafeShadowReplay, sourceCorrectionOrdinal: 3 },
      { ...value.codecSafeShadowReplay, diagnosticReplayEvidenceId: "missing" },
      { ...value.codecSafeShadowReplay, uploadCorrectedOutput: true },
      { ...value.codecSafeShadowReplay, productionActivation: true },
      { ...value.codecSafeShadowReplay, providerCallCount: 1 },
    ]) {
      expect(() => validateStage12CodecSafeTruePeakShadowPayload(
        { ...value, codecSafeShadowReplay }, imageDigest,
      )).toThrowError(expect.objectContaining({
        code: "INVALID_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_ENVELOPE",
      }));
    }
  });

  it("seals a lossless-reference candidate trace without a corrected artifact", () => {
    const first = { integratedTargetLufs: -14, limiterCeilingDbtp: -2, macroDepthDb: 5 };
    const second = { integratedTargetLufs: -12.86, limiterCeilingDbtp: -2.17,
      macroDepthDb: 7.3 };
    const candidates = [
      exactCandidate(0, { integratedLufs: -15.14, integratedLufsExact: "-15.14",
        truePeakDbtp: -0.83, truePeakDbtpExact: "-0.83",
        loudnessRangeLu: 3.7, loudnessRangeLuExact: "3.70" }, first),
      exactCandidate(1, { integratedLufs: -14.1, integratedLufsExact: "-14.10",
        truePeakDbtp: -1.08, truePeakDbtpExact: "-1.08",
        loudnessRangeLu: 6.2, loudnessRangeLuExact: "6.20" }, second),
    ];
    const value = shadowPayload();
    const result = buildStage12CodecSafeTruePeakShadowEvidence(payload, {
      evidenceSemantics: value.codecSafeShadowReplay.evidenceSemantics,
      source: { correctionOrdinal: 2, correctionJobId: "correction-2",
        r2Key: "prod/audio-p0/source.webm", sha256: hex("1"), byteLength: 16_795_484,
        receiptSha256: hex("2") },
      historicalFailure: { correctionOrdinal: 3, correctionJobId: "correction-3",
        errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
      diagnosticReplay: { jobId: "diagnostic-replay-1", evidenceId: hex("e") },
      losslessReference: { sha256: hex("4"), byteLength: 195_840_044,
        audioFrameMd5Sha256: hex("3"), codec: "pcm_f32le", sampleRateHz: 48_000 },
      candidates,
      workerImageDigest: imageDigest,
      expectedWorkerImageDigest: imageDigest,
      algorithmFingerprint: value.codecSafeShadowReplay.algorithmFingerprint,
      thresholdSnapshotSha256: value.codecSafeShadowReplay.thresholdSnapshotSha256,
      runtimeProvenance: { ffmpegVersion: "ffmpeg version 5.1.9",
        ffmpegBuildFingerprint: hex("6"), libopusEncoderFingerprint: hex("7") },
    });
    expect(result).toMatchObject({ shadowOutcome: "PASS", terminalCandidatePass: 1,
      failedPredicates: [], correctedOutputUploaded: false, productionActivation: false,
      providerCallCount: 0, providerDispatch: "OFF", autoPublish: "OFF" });
    expect(result.candidates.every((candidate: { losslessReferenceSha256: string }) =>
      candidate.losslessReferenceSha256 === result.losslessReference.sha256)).toBe(true);
    expect(result).not.toHaveProperty("preMaster");
  });
});
