import { describe, expect, it } from "vitest";

import {
  buildStage12AudioP0CorrectionFilter,
  buildStage12EncodedLoudnessFailure,
  buildStage12RemediationAudioFilter,
  buildStage12RemediationVideoFilter,
  stage12EncodedLoudnessFailureDiagnostic,
  stage12LoudnessFailedPredicates,
  validateStage12AudioP0CorrectionPayload,
  validateStage12RemediationPayload,
} from "../stage12-runtime.mjs";

const hex = (value: string) => value.repeat(64).slice(0, 64);
const payload = {
  schemaVersion: 1, idempotencyKey: hex("a"), packageId: "pkg", stageInstanceId: "s12",
  durationSec: 510, narration: { r2Key: "prod/narration.mp3", sha256: hex("b") },
  render: { width: 1920, height: 1080, fps: 30, sampleRateHz: 48_000 },
  timeline: { expectedFrames: 15_300, shots: [{ startFrame: 0, endFrame: 15_300,
    headline: "Immutable source", background: "#071816", accent: "#71f6c5", signal: "#ffb84d" }] },
  qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1,
    truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 } },
  controls: { providerDispatch: "OFF", providerCallCount: 0, autoPublish: "OFF" },
  objectAccess: { url: "https://example.com/object", token: hex("c") },
  callback: { url: "https://example.com/callback", token: hex("d") },
  remediation: { sourceAttemptOrdinal: 3, diagnosticOrdinal: 2, strategyVersion: 1,
    sourcePreMaster: { r2Key: "prod/source.webm", sha256: hex("e"), byteLength: 6_264_904 },
    diagnosticReceiptSha256: hex("f"), providerDispatch: "OFF", providerCallCount: 0,
    autoPublish: "OFF" },
};

describe("Stage 12 corrected pre-master runtime", () => {
  it("requires exact ordinal-2 immutable lineage and zero provider/publish controls", () => {
    expect(validateStage12RemediationPayload(payload).idempotencyKey).toBe(hex("a"));
    for (const remediation of [
      { ...payload.remediation, diagnosticOrdinal: 1 },
      { ...payload.remediation, providerCallCount: 1 },
    ]) {
      try {
        validateStage12RemediationPayload({ ...payload, remediation });
        throw new Error("expected validation failure");
      } catch (error) {
        expect((error as { code?: string }).code).toBe("INVALID_STAGE12_REMEDIATION_ENVELOPE");
      }
    }
  });

  it("uses temporal visual repair and dynamic-range expansion without changing thresholds", () => {
    const video = buildStage12RemediationVideoFilter(payload);
    const audio = buildStage12RemediationAudioFilter(payload);
    expect(video).toMatch(/noise=alls=4:allf=t\+u/u);
    expect(video).toMatch(/mod\(t\*480/u);
    expect(audio).toMatch(/^compand=/u);
    expect(audio).toContain("loudnorm=I=-14:TP=-1:LRA=7:linear=false");
  });

  it("requires immutable correction-ordinal-2 lineage from the failed corrected artifact", () => {
    const audioCorrectionPayload = { ...payload, remediation: {
      sourceAttemptOrdinal: 3, diagnosticOrdinal: 2, strategyVersion: 2,
      correctionOrdinal: 2, predecessorCorrectionJobId: "correction-1",
      sourceCorrectedPreMaster: {
        r2Key: "prod/corrected/source.webm", sha256: hex("1"), byteLength: 7_000_000,
      },
      sourceCorrectionReceiptSha256: hex("2"), correctionPassLimit: 3, providerDispatch: "OFF",
      providerCallCount: 0, autoPublish: "OFF",
    } };
    expect(validateStage12AudioP0CorrectionPayload(audioCorrectionPayload).idempotencyKey)
      .toBe(hex("a"));
    for (const remediation of [
      { ...audioCorrectionPayload.remediation, correctionOrdinal: 1 },
      { ...audioCorrectionPayload.remediation, strategyVersion: 1 },
      { ...audioCorrectionPayload.remediation, providerCallCount: 1 },
    ]) {
      expect(() => validateStage12AudioP0CorrectionPayload({
        ...audioCorrectionPayload, remediation,
      })).toThrowError(expect.objectContaining({ code: "INVALID_STAGE12_AUDIO_P0_CORRECTION_ENVELOPE" }));
    }
  });

  it("uses ordinal-3 square-wave macro dynamics, full encoded headroom and a limiter", () => {
    const filter = buildStage12AudioP0CorrectionFilter(payload, 3);
    expect(filter).toContain("volume='if(lt(mod(t\\,28)\\,14)");
    expect(filter).toContain("loudnorm=I=-14:TP=-2:LRA=6:linear=false");
    expect(filter).toContain("alimiter=limit=0.794328");
    expect(payload.qa.loudness).toEqual({ integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 });
  });

  it("accepts only matched strategy/ordinal pairs for correction lineage", () => {
    const base = { ...payload, remediation: {
      sourceAttemptOrdinal: 3, diagnosticOrdinal: 2, strategyVersion: 3,
      correctionOrdinal: 3, predecessorCorrectionJobId: "correction-2",
      sourceCorrectedPreMaster: {
        r2Key: "prod/audio-p0/source.webm", sha256: hex("1"), byteLength: 7_100_000,
      },
      sourceCorrectionReceiptSha256: hex("2"), correctionPassLimit: 3,
      providerDispatch: "OFF", providerCallCount: 0, autoPublish: "OFF",
    } };
    expect(validateStage12AudioP0CorrectionPayload(base).idempotencyKey).toBe(hex("a"));
    for (const remediation of [
      { ...base.remediation, correctionOrdinal: 2 },
      { ...base.remediation, strategyVersion: 2 },
    ]) {
      expect(() => validateStage12AudioP0CorrectionPayload({ ...base, remediation }))
        .toThrowError(expect.objectContaining({
          code: "INVALID_STAGE12_AUDIO_P0_CORRECTION_ENVELOPE",
        }));
    }
  });

  it("preserves exact per-pass encoded measurements and failed predicates on failure", () => {
    const measurementsByPass = [
      { correctionPass: 0, phase: "INITIAL_ENCODED_MEASUREMENT", integratedLufs: -14.51,
        truePeakDbtp: -0.9, loudnessRangeLu: 3,
        failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { correctionPass: 1, phase: "POST_CORRECTION_PASS", integratedLufs: -14.2,
        truePeakDbtp: -1.3, loudnessRangeLu: 3.4,
        failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { correctionPass: 2, phase: "POST_CORRECTION_PASS", integratedLufs: -13.9,
        truePeakDbtp: -1.5, loudnessRangeLu: 3.8,
        failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { correctionPass: 3, phase: "FINAL_POST_ENCODE_VERIFICATION", integratedLufs: -13.8,
        truePeakDbtp: -0.8, loudnessRangeLu: 3.9,
        failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"] },
    ];
    const error = buildStage12EncodedLoudnessFailure(payload, 3, measurementsByPass);
    expect(error).toMatchObject({
      code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
      measurements: { integratedLufs: -13.8, truePeakDbtp: -0.8, loudnessRangeLu: 3.9 },
      failureDiagnostic: {
        boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
        correctionPass: 3,
        correctionPassLimit: 3,
        measurementsByPass,
        failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
      },
    });
    expect(stage12LoudnessFailedPredicates(payload, error.measurements))
      .toEqual(["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"]);
    expect(stage12EncodedLoudnessFailureDiagnostic(error, `sha256:${hex("9")}`))
      .toMatchObject({ workerImageDigest: `sha256:${hex("9")}`, measurementsByPass });
    expect(stage12EncodedLoudnessFailureDiagnostic(new Error("unrelated"), `sha256:${hex("9")}`))
      .toBeUndefined();
  });
});
