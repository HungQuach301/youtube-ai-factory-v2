import { describe, expect, it } from "vitest";

import {
  classifyStage12CodecSafeLraGuardCandidate,
  finalizeStage12CodecSafeLraGuardTrace,
  planStage12CodecSafeLraGuardCandidate,
  stage12CodecSafeLraGuardFingerprints,
} from "../stage12-runtime.mjs";
import {
  stage12CodecSafeLraGuardFingerprints as controlPlaneFingerprints,
} from "../../../sites/control-plane/app/stage12-pre-master";
import { STAGE12_CODEC_SAFE_LRA_GUARD } from "../../contracts/src/thresholds";

const hex = (value: string) => value.repeat(64).slice(0, 64);
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

const referenceCandidate = (candidatePass: number, values: {
  integratedTargetLufs: number; limiterCeilingDbtp: number; macroDepthDb: number;
  integratedLufs: number; integratedLufsExact: string; truePeakDbtp: number;
  truePeakDbtpExact: string; loudnessRangeLu: number; loudnessRangeLuExact: string;
  audioFrameMd5Sha256: string;
}) => ({
  candidatePass,
  phase: candidatePass === 0 ? "INITIAL_CODEC_SAFE_CANDIDATE"
    : "POST_OPUS_FEEDBACK_CANDIDATE",
  losslessReferenceSha256: hex("4"),
  codecOvershootDb: Math.max(0, values.truePeakDbtp - values.limiterCeilingDbtp),
  failedPredicates: [
    ...(values.integratedLufs < -15 ? ["INTEGRATED_LUFS_BELOW_MIN"] : []),
    ...(values.integratedLufs > -13 ? ["INTEGRATED_LUFS_ABOVE_MAX"] : []),
    ...(values.truePeakDbtp > -1 ? ["TRUE_PEAK_DBTP_ABOVE_MAX"] : []),
    ...(values.loudnessRangeLu < 4 ? ["LOUDNESS_RANGE_LU_BELOW_MIN"] : []),
    ...(values.loudnessRangeLu > 8 ? ["LOUDNESS_RANGE_LU_ABOVE_MAX"] : []),
  ],
  ...values,
});

const anchorReference = referenceCandidate(1, {
  integratedTargetLufs: -14,
  limiterCeilingDbtp: -2.67,
  macroDepthDb: 7.8,
  integratedLufs: -15.09,
  integratedLufsExact: "-15.09",
  truePeakDbtp: -1.04,
  truePeakDbtpExact: "-1.04",
  loudnessRangeLu: 2.8,
  loudnessRangeLuExact: "2.80",
  audioFrameMd5Sha256: hex("1"),
});

const highBracketReference = referenceCandidate(3, {
  integratedTargetLufs: -11.79,
  limiterCeilingDbtp: -2.67,
  macroDepthDb: 14,
  integratedLufs: -14.94,
  integratedLufsExact: "-14.94",
  truePeakDbtp: 4.22,
  truePeakDbtpExact: "4.22",
  loudnessRangeLu: 14.4,
  loudnessRangeLuExact: "14.40",
  audioFrameMd5Sha256: hex("3"),
});

const replay = {
  controllerPolicy: {
    maxCandidateCount: STAGE12_CODEC_SAFE_LRA_GUARD.MAX_CANDIDATES,
    codecOvershootRegressionMaxDb:
      STAGE12_CODEC_SAFE_LRA_GUARD.CODEC_OVERSHOOT_REGRESSION_MAX_DB,
    integratedBoundaryMarginLu:
      STAGE12_CODEC_SAFE_LRA_GUARD.INTEGRATED_BOUNDARY_MARGIN_LU,
    maxIntegratedTargetStepLu:
      STAGE12_CODEC_SAFE_LRA_GUARD.MAX_INTEGRATED_TARGET_STEP_LU,
  },
  anchorReference,
  highBracketReference,
};

function measured(plan: ReturnType<typeof planStage12CodecSafeLraGuardCandidate>, values: {
  integratedLufs: number; integratedLufsExact: string; truePeakDbtp: number;
  truePeakDbtpExact: string; loudnessRangeLu: number; loudnessRangeLuExact: string;
  audioFrameMd5Sha256?: string;
}) {
  if (plan.done) throw new Error("unexpected terminal plan");
  return classifyStage12CodecSafeLraGuardCandidate(payload, replay, plan, {
    ...values,
    audioFrameMd5Sha256: values.audioFrameMd5Sha256 ?? hex(String(plan.candidatePass + 5)),
  });
}

describe("Stage 12 codec-safe LRA convergence guard", () => {
  it("reproduces the true-peak-safe anchor before any search", () => {
    const plan = planStage12CodecSafeLraGuardCandidate(payload, replay, []);
    expect(plan).toMatchObject({ done: false, candidatePass: 0,
      phase: "ANCHOR_REPRODUCTION", decision: "ANCHOR",
      integratedTargetLufs: -14, limiterCeilingDbtp: -2.67, macroDepthDb: 7.8,
      bracketLowDepthDb: 7.8, bracketHighDepthDb: 14, targetStepLufs: 0 });
    const anchor = measured(plan, { integratedLufs: -15.09, integratedLufsExact: "-15.09",
      truePeakDbtp: -1.04, truePeakDbtpExact: "-1.04",
      loudnessRangeLu: 2.8, loudnessRangeLuExact: "2.80",
      audioFrameMd5Sha256: hex("1") });
    expect(anchor.disposition).toBe("SAFE_ANCHOR");
  });

  it("bisects the bounded LRA bracket without loudness or limiter feedback", () => {
    const firstPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, []);
    const anchor = measured(firstPlan, { integratedLufs: -15.09,
      integratedLufsExact: "-15.09", truePeakDbtp: -1.04,
      truePeakDbtpExact: "-1.04", loudnessRangeLu: 2.8,
      loudnessRangeLuExact: "2.80", audioFrameMd5Sha256: hex("1") });
    const next = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor]);
    expect(next).toMatchObject({ done: false, decision: "BISECTION",
      phase: "LRA_BRACKET_SEARCH", parentCandidatePass: 0,
      integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
      macroDepthDb: 10.9, bracketLowDepthDb: 7.8, bracketHighDepthDb: 14 });
  });

  it("trims LUFS toward the nearest interior boundary with a bounded step", () => {
    const firstPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, []);
    const anchor = measured(firstPlan, { integratedLufs: -15.09,
      integratedLufsExact: "-15.09", truePeakDbtp: -1.04,
      truePeakDbtpExact: "-1.04", loudnessRangeLu: 2.8,
      loudnessRangeLuExact: "2.80", audioFrameMd5Sha256: hex("1") });
    const bracketPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor]);
    const lraSafe = measured(bracketPlan, { integratedLufs: -15.09,
      integratedLufsExact: "-15.09", truePeakDbtp: -1.08,
      truePeakDbtpExact: "-1.08", loudnessRangeLu: 5.5,
      loudnessRangeLuExact: "5.50" });
    expect(lraSafe.disposition).toBe("LRA_ACCEPTED");
    const trim = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor, lraSafe]);
    expect(trim).toMatchObject({ done: false, phase: "INTEGRATED_LUFS_TRIM",
      decision: "NEAREST_BOUNDARY_TRIM", parentCandidatePass: 1,
      limiterCeilingDbtp: -2.67, macroDepthDb: 10.9 });
    if (!trim.done) {
      expect(trim.targetStepLufs).toBeCloseTo(0.14, 8);
      expect(trim.integratedTargetLufs).toBeCloseTo(-13.86, 8);
      expect(Math.abs(trim.targetStepLufs)).toBeLessThanOrEqual(0.25);
      expect(trim.integratedTargetLufs).not.toBe(-11.79);
    }
  });

  it("rejects the legacy overshoot cliff and rolls back to the safe anchor", () => {
    const firstPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, []);
    const anchor = measured(firstPlan, { integratedLufs: -15.09,
      integratedLufsExact: "-15.09", truePeakDbtp: -1.04,
      truePeakDbtpExact: "-1.04", loudnessRangeLu: 2.8,
      loudnessRangeLuExact: "2.80", audioFrameMd5Sha256: hex("1") });
    const bracketPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor]);
    const rejected = measured(bracketPlan, { integratedLufs: -14.94,
      integratedLufsExact: "-14.94", truePeakDbtp: 4.22,
      truePeakDbtpExact: "4.22", loudnessRangeLu: 14.4,
      loudnessRangeLuExact: "14.40" });
    expect(rejected.disposition).toBe("REGRESSION_REJECTED");
    const rollback = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor, rejected]);
    expect(rollback).toMatchObject({ done: false, phase: "LRA_BRACKET_SEARCH",
      decision: "BISECTION", parentCandidatePass: 0, rollbackToCandidatePass: 0,
      bracketLowDepthDb: 7.8, bracketHighDepthDb: 10.9, macroDepthDb: 9.35,
      integratedTargetLufs: -14, limiterCeilingDbtp: -2.67 });
  });

  it("selects the first full pass and otherwise the best safe candidate, never the last reject", () => {
    const firstPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, []);
    const anchor = measured(firstPlan, { integratedLufs: -15.09,
      integratedLufsExact: "-15.09", truePeakDbtp: -1.04,
      truePeakDbtpExact: "-1.04", loudnessRangeLu: 2.8,
      loudnessRangeLuExact: "2.80", audioFrameMd5Sha256: hex("1") });
    const bracketPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor]);
    const lraSafe = measured(bracketPlan, { integratedLufs: -15.09,
      integratedLufsExact: "-15.09", truePeakDbtp: -1.08,
      truePeakDbtpExact: "-1.08", loudnessRangeLu: 5.5,
      loudnessRangeLuExact: "5.50" });
    const trimPlan = planStage12CodecSafeLraGuardCandidate(payload, replay, [anchor, lraSafe]);
    const pass = measured(trimPlan, { integratedLufs: -14.98,
      integratedLufsExact: "-14.98", truePeakDbtp: -1.03,
      truePeakDbtpExact: "-1.03", loudnessRangeLu: 5.3,
      loudnessRangeLuExact: "5.30" });
    expect(pass.disposition).toBe("FULL_PASS");
    expect(finalizeStage12CodecSafeLraGuardTrace(payload, replay,
      [anchor, lraSafe, pass])).toMatchObject({ shadowOutcome: "PASS",
      terminalReason: "PASS", lastEvaluatedCandidatePass: 2,
      bestSafeCandidatePass: 2, selectedCandidatePass: 2, failedPredicates: [] });
  });

  it("pins the algorithm policy while preserving the existing loudness thresholds", () => {
    const worker = stage12CodecSafeLraGuardFingerprints(payload, replay.controllerPolicy);
    expect(controlPlaneFingerprints(payload as never, replay.controllerPolicy)).toEqual(worker);
    expect(payload.qa.loudness).toEqual({ integratedLufs: -14, toleranceLufs: 1,
      truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8 });
    expect(worker.controllerPolicySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(worker.renderKernelFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });
});
