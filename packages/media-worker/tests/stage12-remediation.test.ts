import { describe, expect, it } from "vitest";

import {
  buildStage12AudioP0CorrectionFilter,
  buildStage12RemediationAudioFilter,
  buildStage12RemediationVideoFilter,
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

  it("adds deterministic macro dynamics and encoded true-peak headroom without changing QA thresholds", () => {
    const filter = buildStage12AudioP0CorrectionFilter(payload);
    expect(filter).toContain("volume=");
    expect(filter).toContain("compand=");
    expect(filter).toContain("loudnorm=I=-14:TP=-1.5:LRA=6:linear=false");
    expect(payload.qa.loudness).toEqual({ integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 });
  });
});
