import { describe, expect, it } from "vitest";

import { STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY } from
  "../../contracts/src/stage12-codec-safe-lra-feasibility";
import {
  buildStage12CodecSafeLraFeasibilityEvidence,
  classifyStage12CodecSafeLraFeasibilityCandidate,
  finalizeStage12CodecSafeLraFeasibilityTrace,
  planStage12CodecSafeLraFeasibilityCandidate,
  stage12CodecSafeLraFeasibilityFingerprints,
  stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint,
  validateStage12CodecSafeLraFeasibilityContract,
} from "../stage12-codec-safe-lra-feasibility-controller.mjs";
import {
  stage12CodecSafeLraFeasibilitySearchFingerprints as controlPlaneFingerprints,
} from "../../../sites/control-plane/app/stage12-pre-master";

const ORDINAL_TWO_SHA256 =
  "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2";
const TRUE_PEAK_PARENT_EVIDENCE_ID =
  "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb";
const LRA_GUARD_PARENT_EVIDENCE_ID =
  "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9";
const EXPECTED_MAP_DEPTHS = [
  14,
  12.45,
  11.675,
  13.225,
  11.2875,
  12.0625,
  12.8375,
  13.6125,
];
type FeasibilityCandidate = ReturnType<
  typeof classifyStage12CodecSafeLraFeasibilityCandidate
>;

const hex = (value: string) => value.repeat(64).slice(0, 64);
const imageDigest = `sha256:${hex("9")}`;
const losslessReference = {
  sha256: hex("4"),
  byteLength: 195_840_044,
  audioFrameMd5Sha256: hex("0"),
  codec: "pcm_f32le" as const,
  sampleRateHz: 48_000,
};

const payload = {
  schemaVersion: 1,
  idempotencyKey: hex("a"),
  packageId: "pkg",
  stageInstanceId: "s12",
  durationSec: 510,
  narration: { r2Key: "prod/narration.mp3", sha256: hex("b") },
  render: { width: 1920, height: 1080, fps: 30, sampleRateHz: 48_000 },
  timeline: {
    expectedFrames: 15_300,
    shots: [{
      startFrame: 0,
      endFrame: 15_300,
      headline: "Immutable source",
      background: "#071816",
      accent: "#71f6c5",
      signal: "#ffb84d",
    }],
  },
  qa: {
    nearStaticMaxSec: 7,
    loudness: {
      integratedLufs: -14,
      toleranceLufs: 1,
      truePeakMaxDbtp: -1,
      lraMin: 4,
      lraMax: 8,
    },
  },
  controls: { providerDispatch: "OFF", providerCallCount: 0, autoPublish: "OFF" },
  objectAccess: { url: "https://example.com/object", token: hex("c") },
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

const productionMeasurements = [
  [-15.09, "-15.09", -1.04, "-1.04", 2.8, "2.80"],
  [-15.29, "-15.29", -0.96, "-0.96", 3.5, "3.50"],
  [-15.19, "-15.19", -1.04, "-1.04", 2.9, "2.90"],
  [-15.23, "-15.23", -1.05, "-1.05", 3.1, "3.10"],
  [-15.24, "-15.24", -1.05, "-1.05", 3.1, "3.10"],
  [-15.25, "-15.25", -1.06, "-1.06", 3.2, "3.20"],
  [-15.26, "-15.26", -1.03, "-1.03", 3.2, "3.20"],
  [-15.29, "-15.29", -0.98, "-0.98", 3.4, "3.40"],
] as const;
const productionDepths = [7.8, 10.9, 9.35, 10.125, 10.5125, 10.70625,
  10.803125, 10.851563] as const;

function productionCandidate(candidatePass: number) {
  const observation = productionMeasurements[candidatePass]!;
  const integratedLufs = observation[0];
  const truePeakDbtp = observation[2];
  const loudnessRangeLu = observation[4];
  const lows = [7.8, 7.8, 7.8, 9.35, 10.125, 10.5125, 10.70625, 10.803125];
  const highs = [14, 14, 10.9, 10.9, 10.9, 10.9, 10.9, 10.9];
  const parents = [null, 0, 0, 2, 3, 4, 5, 6];
  return {
    candidatePass,
    phase: candidatePass === 0 ? "ANCHOR_REPRODUCTION" : "LRA_BRACKET_SEARCH",
    decision: candidatePass === 0 ? "ANCHOR" : "BISECTION",
    parentCandidatePass: parents[candidatePass],
    rollbackToCandidatePass: candidatePass === 2 ? 0 : null,
    bracketLowDepthDb: lows[candidatePass],
    bracketHighDepthDb: highs[candidatePass],
    integratedTargetLufs: -14,
    limiterCeilingDbtp: -2.67,
    macroDepthDb: productionDepths[candidatePass],
    targetStepLufs: 0,
    disposition: candidatePass === 0 ? "SAFE_ANCHOR"
      : candidatePass === 1 || candidatePass === 7
        ? "REGRESSION_REJECTED" : "LOW_BRACKET",
    losslessReferenceSha256: losslessReference.sha256,
    codecOvershootDb: Math.max(0, truePeakDbtp - -2.67),
    integratedLufs,
    integratedLufsExact: observation[1],
    truePeakDbtp,
    truePeakDbtpExact: observation[3],
    loudnessRangeLu,
    loudnessRangeLuExact: observation[5],
    failedPredicates: failedPredicates(integratedLufs, truePeakDbtp, loudnessRangeLu),
    audioFrameMd5Sha256: hex(String(candidatePass + 1)),
  };
}

const parentGuardCandidates = Array.from({ length: 8 }, (_, index) =>
  productionCandidate(index));

function replay() {
  const controllerPolicy = STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY;
  const fingerprints = stage12CodecSafeLraFeasibilityFingerprints(
    payload,
    controllerPolicy,
  );
  const parentRuntimeProvenance = {
    ffmpegVersion: "ffmpeg version 7.1.1",
    ffmpegBuildFingerprint: hex("6"),
    libopusEncoderFingerprint: hex("7"),
  };
  const parentRenderKernelFingerprint = fingerprints.renderKernelFingerprint;
  return {
    schemaVersion: 1,
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
    sourceAttemptOrdinal: 3,
    sourceCorrectionOrdinal: 2,
    historicalFailureCorrectionOrdinal: 3,
    sourceCorrectionJobId: "correction-2",
    historicalFailureJobId: "correction-3",
    diagnosticReplayJobId: "diagnostic-replay-1",
    diagnosticReplayEvidenceId: hex("e"),
    codecSafeTruePeakShadowJobId: "true-peak-shadow-1",
    codecSafeTruePeakShadowEvidenceId: TRUE_PEAK_PARENT_EVIDENCE_ID,
    codecSafeLraGuardShadowJobId: "lra-guard-shadow-1",
    codecSafeLraGuardShadowEvidenceId: LRA_GUARD_PARENT_EVIDENCE_ID,
    sourceCorrectedPreMaster: {
      r2Key: `prod/audio-p0/${ORDINAL_TWO_SHA256}.webm`,
      sha256: ORDINAL_TWO_SHA256,
      byteLength: 16_795_484,
    },
    sourceCorrectionReceiptSha256: hex("f"),
    parentWorkerImageDigest: imageDigest,
    parentAlgorithmFingerprint: hex("a"),
    parentThresholdSnapshotSha256: fingerprints.thresholdSnapshotSha256,
    parentControllerPolicySha256: hex("b"),
    parentRenderKernelFingerprint,
    parentRenderRuntimeFingerprint:
      stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
        parentRenderKernelFingerprint,
        parentRuntimeProvenance,
      ),
    parentRuntimeProvenance,
    parentLosslessReference: losslessReference,
    parentGuardTrace: {
      shadowOutcome: "FAIL",
      terminalReason: "BUDGET_EXHAUSTED",
      lastEvaluatedCandidatePass: 7,
      bestSafeCandidatePass: 5,
      selectedCandidatePass: 5,
      finalMeasurements: {
        integratedLufs: -15.25,
        integratedLufsExact: "-15.25",
        truePeakDbtp: -1.06,
        truePeakDbtpExact: "-1.06",
        loudnessRangeLu: 3.2,
        loudnessRangeLuExact: "3.20",
      },
      failedPredicates: [
        "INTEGRATED_LUFS_BELOW_MIN",
        "LOUDNESS_RANGE_LU_BELOW_MIN",
      ],
      candidates: parentGuardCandidates,
    },
    controllerPolicy,
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
  loudnessRangeLu: number, frame = hex("1"), artifact = frame) {
  return {
    integratedLufs,
    integratedLufsExact: exact(integratedLufs),
    truePeakDbtp,
    truePeakDbtpExact: exact(truePeakDbtp),
    loudnessRangeLu,
    loudnessRangeLuExact: exact(loudnessRangeLu),
    encodedArtifactSha256: artifact,
    audioFrameMd5Sha256: frame,
  };
}

function addCandidate(currentReplay: ReturnType<typeof replay>,
  candidates: FeasibilityCandidate[],
  observed: ReturnType<typeof measurement>) {
  const plan = planStage12CodecSafeLraFeasibilityCandidate(
    payload,
    currentReplay,
    candidates,
  );
  if (plan.done) throw new Error("Expected a candidate plan, received terminal state.");
  const candidate = classifyStage12CodecSafeLraFeasibilityCandidate(
    payload,
    currentReplay,
    plan,
    observed,
  );
  candidates.push(candidate);
  return { plan, candidate };
}

function runMap(currentReplay: ReturnType<typeof replay>, values: Array<{
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
}>) {
  const candidates: FeasibilityCandidate[] = [];
  const plans = values.map((value, index) => addCandidate(
    currentReplay,
    candidates,
    measurement(value.integratedLufs, value.truePeakDbtp, value.loudnessRangeLu,
      hex(String((index + 1) % 10))),
  ).plan);
  return { candidates, plans };
}

const belowMap = EXPECTED_MAP_DEPTHS.map((_, index) => ({
  integratedLufs: -14.2,
  truePeakDbtp: index === 0 ? 0.25 : -1.1,
  loudnessRangeLu: 3.2,
}));

function successTrace(finalFrame = hex("f"), trimTwoTruePeakDbtp = -1.03,
  finalArtifact = finalFrame) {
  const currentReplay = replay();
  const mapValues = EXPECTED_MAP_DEPTHS.map((_, index) => index === 1
    ? { integratedLufs: -15.25, truePeakDbtp: -0.8, loudnessRangeLu: 5.5 }
    : { integratedLufs: -14.2, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 });
  const { candidates } = runMap(currentReplay, mapValues);

  const containment = addCandidate(currentReplay, candidates,
    measurement(-15.25, -1.06, 5.5, hex("a")));
  const trimOne = addCandidate(currentReplay, candidates,
    measurement(-15.05, -1.04, 5.5, hex("b")));
  const trimTwo = addCandidate(currentReplay, candidates,
    measurement(-14.95, trimTwoTruePeakDbtp, 5.5, hex("c")));
  const stabilizationOne = addCandidate(currentReplay, candidates,
    measurement(-14.95, -1.06, 5.5, hex("f")));
  const final = addCandidate(currentReplay, candidates,
    measurement(-14.95, -1.06, 5.5, finalFrame, finalArtifact));

  return {
    currentReplay,
    candidates,
    containment,
    trimOne,
    trimTwo,
    stabilizationOne,
    final,
  };
}

function evidenceFor(trace: ReturnType<typeof successTrace>) {
  const currentReplay = trace.currentReplay;
  return {
    evidenceSemantics: currentReplay.evidenceSemantics,
    replay: currentReplay,
    source: {
      correctionOrdinal: 2,
      correctionJobId: currentReplay.sourceCorrectionJobId,
      r2Key: currentReplay.sourceCorrectedPreMaster.r2Key,
      sha256: currentReplay.sourceCorrectedPreMaster.sha256,
      byteLength: currentReplay.sourceCorrectedPreMaster.byteLength,
      receiptSha256: currentReplay.sourceCorrectionReceiptSha256,
    },
    historicalFailure: {
      correctionOrdinal: 3,
      correctionJobId: currentReplay.historicalFailureJobId,
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
    },
    diagnosticReplay: {
      jobId: currentReplay.diagnosticReplayJobId,
      evidenceId: currentReplay.diagnosticReplayEvidenceId,
    },
    parentTruePeakShadow: {
      jobId: currentReplay.codecSafeTruePeakShadowJobId,
      evidenceId: currentReplay.codecSafeTruePeakShadowEvidenceId,
    },
    parentLraGuard: {
      jobId: currentReplay.codecSafeLraGuardShadowJobId,
      evidenceId: currentReplay.codecSafeLraGuardShadowEvidenceId,
    },
    losslessReference: currentReplay.parentLosslessReference,
    parentGuardTrace: currentReplay.parentGuardTrace,
    candidates: trace.candidates,
    workerImageDigest: imageDigest,
    expectedWorkerImageDigest: imageDigest,
    algorithmFingerprint: currentReplay.algorithmFingerprint,
    thresholdSnapshotSha256: currentReplay.thresholdSnapshotSha256,
    controllerPolicySha256: currentReplay.controllerPolicySha256,
    renderKernelFingerprint: currentReplay.renderKernelFingerprint,
    renderRuntimeFingerprint:
      stage12CodecSafeLraFeasibilityRenderRuntimeFingerprint(
        currentReplay.renderKernelFingerprint,
        currentReplay.parentRuntimeProvenance,
      ),
    runtimeProvenance: currentReplay.parentRuntimeProvenance,
  };
}

function finishWithRollback(currentReplay: ReturnType<typeof replay>,
  candidates: FeasibilityCandidate[]) {
  const safe = currentReplay.parentGuardTrace.candidates[5]!;
  const rollback = addCandidate(currentReplay, candidates, {
    integratedLufs: safe.integratedLufs,
    integratedLufsExact: safe.integratedLufsExact,
    truePeakDbtp: safe.truePeakDbtp,
    truePeakDbtpExact: safe.truePeakDbtpExact,
    loudnessRangeLu: safe.loudnessRangeLu,
    loudnessRangeLuExact: safe.loudnessRangeLuExact,
    encodedArtifactSha256: hex("e"),
    audioFrameMd5Sha256: safe.audioFrameMd5Sha256,
  });
  return {
    rollback,
    terminal: finalizeStage12CodecSafeLraFeasibilityTrace(
      payload,
      currentReplay,
      candidates,
    ),
  };
}

describe("Stage 12 codec-safe LRA feasibility search", () => {
  it("accepts the exact production response trace pass 0-7 and rejects structural drift", () => {
    const currentReplay = replay();
    const value = { ...payload, codecSafeLraFeasibilitySearch: currentReplay };

    expect(validateStage12CodecSafeLraFeasibilityContract(value, imageDigest)).toBe(value);
    expect(currentReplay.parentGuardTrace.candidates.map((candidate) => ({
      candidatePass: candidate.candidatePass,
      macroDepthDb: candidate.macroDepthDb,
      integratedLufs: candidate.integratedLufs,
      truePeakDbtp: candidate.truePeakDbtp,
      loudnessRangeLu: candidate.loudnessRangeLu,
    }))).toEqual([
      { candidatePass: 0, macroDepthDb: 7.8, integratedLufs: -15.09,
        truePeakDbtp: -1.04, loudnessRangeLu: 2.8 },
      { candidatePass: 1, macroDepthDb: 10.9, integratedLufs: -15.29,
        truePeakDbtp: -0.96, loudnessRangeLu: 3.5 },
      { candidatePass: 2, macroDepthDb: 9.35, integratedLufs: -15.19,
        truePeakDbtp: -1.04, loudnessRangeLu: 2.9 },
      { candidatePass: 3, macroDepthDb: 10.125, integratedLufs: -15.23,
        truePeakDbtp: -1.05, loudnessRangeLu: 3.1 },
      { candidatePass: 4, macroDepthDb: 10.5125, integratedLufs: -15.24,
        truePeakDbtp: -1.05, loudnessRangeLu: 3.1 },
      { candidatePass: 5, macroDepthDb: 10.70625, integratedLufs: -15.25,
        truePeakDbtp: -1.06, loudnessRangeLu: 3.2 },
      { candidatePass: 6, macroDepthDb: 10.803125, integratedLufs: -15.26,
        truePeakDbtp: -1.03, loudnessRangeLu: 3.2 },
      { candidatePass: 7, macroDepthDb: 10.851563, integratedLufs: -15.29,
        truePeakDbtp: -0.98, loudnessRangeLu: 3.4 },
    ]);

    for (const parentGuardTrace of [
      { ...currentReplay.parentGuardTrace,
        candidates: currentReplay.parentGuardTrace.candidates.slice(0, 7) },
      { ...currentReplay.parentGuardTrace,
        candidates: [currentReplay.parentGuardTrace.candidates[1],
          currentReplay.parentGuardTrace.candidates[0],
          ...currentReplay.parentGuardTrace.candidates.slice(2)] },
      { ...currentReplay.parentGuardTrace,
        finalMeasurements: { ...currentReplay.parentGuardTrace.finalMeasurements,
          integratedLufs: -15.24, integratedLufsExact: "-15.24" } },
      { ...currentReplay.parentGuardTrace,
        candidates: currentReplay.parentGuardTrace.candidates.map((candidate, index) =>
          index === 2 ? { ...candidate, integratedLufs: -15.18,
            integratedLufsExact: "-15.18" } : candidate) },
      { ...currentReplay.parentGuardTrace,
        candidates: currentReplay.parentGuardTrace.candidates.map((candidate, index) =>
          index === 2 ? { ...candidate, loudnessRangeLuExact: "2.900" } : candidate) },
      { ...currentReplay.parentGuardTrace,
        candidates: currentReplay.parentGuardTrace.candidates.map((candidate, index) =>
          index === 5 ? { ...candidate, integratedTargetLufs: -13.9 } : candidate) },
      { ...currentReplay.parentGuardTrace,
        candidates: currentReplay.parentGuardTrace.candidates.map((candidate, index) =>
          index === 5 ? { ...candidate, limiterCeilingDbtp: -2.5,
            codecOvershootDb: 1.44 } : candidate) },
    ]) {
      expect(() => validateStage12CodecSafeLraFeasibilityContract({
        ...payload,
        codecSafeLraFeasibilitySearch: { ...currentReplay, parentGuardTrace },
      }, imageDigest)).toThrowError(expect.objectContaining({
        code: "INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENVELOPE",
      }));
    }
  });

  it("fails closed on drift from the approved ordinal-two SHA or either parent evidence", () => {
    const currentReplay = replay();
    for (const codecSafeLraFeasibilitySearch of [
      { ...currentReplay, sourceCorrectedPreMaster: {
        ...currentReplay.sourceCorrectedPreMaster, sha256: hex("1") } },
      { ...currentReplay, codecSafeTruePeakShadowEvidenceId: hex("2") },
      { ...currentReplay, codecSafeLraGuardShadowEvidenceId: hex("3") },
    ]) {
      expect(() => validateStage12CodecSafeLraFeasibilityContract({
        ...payload,
        codecSafeLraFeasibilitySearch,
      }, imageDigest)).toThrowError(expect.objectContaining({
        code: "INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENVELOPE",
      }));
    }
  });

  it("remeasures the confounded 14 dB endpoint at target -14 and follows the exact lattice despite TP failure", () => {
    const currentReplay = replay();
    const { plans } = runMap(currentReplay, belowMap);

    expect(plans.map((plan) => plan.macroDepthDb)).toEqual(EXPECTED_MAP_DEPTHS);
    expect(plans[0]).toMatchObject({
      phase: "LRA_MAP",
      integratedTargetLufs: -14,
      macroDepthDb: 14,
      targetStepLufs: 0,
      ceilingStepDb: 0,
    });
    expect(plans.every((plan) => plan.integratedTargetLufs === -14
      && plan.limiterCeilingDbtp === -2.67
      && plan.targetStepLufs === 0
      && plan.ceilingStepDb === 0)).toBe(true);
    expect(productionCandidate(3).integratedTargetLufs).toBe(-14);
    expect(-11.79).not.toBe(plans[0].integratedTargetLufs);
  });

  it("finds nonlinear interior islands without using a true-peak failure as an LRA bound", () => {
    const currentReplay = replay();
    const response = [
      { integratedLufs: -14.1, truePeakDbtp: 0.4, loudnessRangeLu: 3.0 },
      { integratedLufs: -14.1, truePeakDbtp: -1.1, loudnessRangeLu: 3.5 },
      { integratedLufs: -14.1, truePeakDbtp: 0.2, loudnessRangeLu: 4.5 },
      { integratedLufs: -14.1, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 },
      { integratedLufs: -14.1, truePeakDbtp: -1.1, loudnessRangeLu: 5.0 },
      { integratedLufs: -14.1, truePeakDbtp: -1.1, loudnessRangeLu: 2.9 },
      { integratedLufs: -14.1, truePeakDbtp: -1.1, loudnessRangeLu: 8.4 },
      { integratedLufs: -14.1, truePeakDbtp: -1.1, loudnessRangeLu: 3.8 },
    ];
    const { candidates, plans } = runMap(currentReplay, response);

    expect(plans.map((plan) => plan.macroDepthDb)).toEqual(EXPECTED_MAP_DEPTHS);
    expect(candidates.map((candidate) => candidate.disposition)).toEqual([
      "LRA_BELOW_MIN",
      "LRA_BELOW_MIN",
      "LRA_FEASIBLE_TP_UNCONTAINED",
      "LRA_BELOW_MIN",
      "LRA_FEASIBLE_TP_SAFE",
      "LRA_BELOW_MIN",
      "LRA_ABOVE_MAX",
      "LRA_BELOW_MIN",
    ]);
    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({ seedMapCandidateOrdinal: 4 });
  });

  it("detects endpoint-only feasibility", () => {
    const currentReplay = replay();
    const response = EXPECTED_MAP_DEPTHS.map((_, index) => ({
      integratedLufs: -14,
      truePeakDbtp: -1.1,
      loudnessRangeLu: index === 0 ? 5.5 : 3.5,
    }));
    const { candidates } = runMap(currentReplay, response);
    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({ seedMapCandidateOrdinal: 0, macroDepthDb: 14 });
  });

  it("ranks at most two seeds by margin, TP excess, target error, depth and stable ordinal", () => {
    const currentReplay = replay();
    const response = [
      { integratedLufs: -14, truePeakDbtp: -0.6, loudnessRangeLu: 6 },
      { integratedLufs: -13.2, truePeakDbtp: -0.6, loudnessRangeLu: 6 },
      { integratedLufs: -14, truePeakDbtp: -0.6, loudnessRangeLu: 6 },
      { integratedLufs: -14, truePeakDbtp: -0.5, loudnessRangeLu: 6 },
      { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 5.8 },
      { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 },
      { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 8.2 },
      { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 5.9 },
    ];
    const { candidates } = runMap(currentReplay, response);
    const firstPlan = planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    );
    expect(firstPlan).toMatchObject({ seedOrdinal: 0, seedMapCandidateOrdinal: 2 });
    if (firstPlan.done) throw new Error("Expected first seed plan.");
    candidates.push(classifyStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      firstPlan,
      measurement(-14, -0.6, 6, hex("a")),
    ));
    const secondPlan = planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    );
    expect(secondPlan).toMatchObject({ seedOrdinal: 1, seedMapCandidateOrdinal: 0 });
    if (secondPlan.done) throw new Error("Expected second seed plan.");
    candidates.push(classifyStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      secondPlan,
      measurement(-14, -0.6, 6, hex("b")),
    ));
    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({ phase: "ROLLBACK_VERIFY", seedOrdinal: null });
  });

  it("breaks a symmetric LRA-interior-margin tie by fixed-point depth order", () => {
    const currentReplay = replay();
    const response = EXPECTED_MAP_DEPTHS.map((_, index) => index === 0
      ? { integratedLufs: -14, truePeakDbtp: -0.6, loudnessRangeLu: 7 }
      : index === 2
        ? { integratedLufs: -14, truePeakDbtp: -0.6, loudnessRangeLu: 5 }
        : { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 });
    const { candidates } = runMap(currentReplay, response);

    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({
      seedOrdinal: 0,
      seedMapCandidateOrdinal: 2,
      macroDepthDb: 11.675,
    });
  });

  it("isolates macro, ceiling and LUFS target controls and requires two reserved trim steps", () => {
    const trace = successTrace();

    expect(trace.containment.plan).toMatchObject({
      phase: "TP_CONTAINMENT",
      seedMapCandidateOrdinal: 1,
      integratedTargetLufs: -14,
      macroDepthDb: 12.45,
      targetStepLufs: 0,
      ceilingStepDb: 0.25,
      limiterCeilingDbtp: -2.92,
    });
    expect(trace.trimOne.plan).toMatchObject({
      phase: "LUFS_TRIM",
      macroDepthDb: 12.45,
      limiterCeilingDbtp: -2.92,
      targetStepLufs: 0.25,
      integratedTargetLufs: -13.75,
      ceilingStepDb: 0,
    });
    expect(trace.trimOne.candidate.disposition).toBe("LUFS_TRIM_ACCEPTED");
    expect(trace.trimTwo.plan).toMatchObject({
      phase: "LUFS_TRIM",
      targetStepLufs: 0.1,
      integratedTargetLufs: -13.65,
    });
    expect(trace.trimTwo.candidate.disposition).toBe("LUFS_TRIM_COMPLETE");
    expect(trace.stabilizationOne.plan).toMatchObject({
      phase: "POST_TRIM_STABILIZATION",
      integratedTargetLufs: -13.65,
      macroDepthDb: 12.45,
      ceilingStepDb: 0.02,
      limiterCeilingDbtp: -2.94,
    });
    expect(trace.final.plan).toMatchObject({
      phase: "FINAL_VERIFY",
      integratedTargetLufs: -13.65,
      limiterCeilingDbtp: -2.94,
      macroDepthDb: 12.45,
      targetStepLufs: 0,
      ceilingStepDb: 0,
    });
  });

  it("passes only one same decoded-Opus artifact and keeps the six budget ledgers separate", () => {
    const trace = successTrace();
    const terminal = finalizeStage12CodecSafeLraFeasibilityTrace(
      payload,
      trace.currentReplay,
      trace.candidates,
    );

    expect(trace.final.candidate.disposition).toBe("FINAL_PASS");
    expect(trace.final.candidate.audioFrameMd5Sha256)
      .toBe(trace.stabilizationOne.candidate.audioFrameMd5Sha256);
    expect(trace.final.candidate.encodedArtifactSha256)
      .toBe(trace.stabilizationOne.candidate.encodedArtifactSha256);
    expect(Object.keys(trace.final.candidate).sort()).toEqual([
      "audioFrameMd5Sha256", "candidateOrdinal", "ceilingStepDb", "codecOvershootDb",
      "disposition", "encodedArtifactSha256", "failedPredicates", "integratedLufs",
      "integratedLufsExact", "integratedTargetLufs", "limiterCeilingDbtp",
      "losslessReferenceSha256", "loudnessRangeLu", "loudnessRangeLuExact",
      "macroDepthDb", "parentCandidateOrdinal", "phase", "phaseSlot",
      "rollbackToCandidateOrdinal", "seedMapCandidateOrdinal", "seedOrdinal",
      "targetStepLufs", "truePeakDbtp", "truePeakDbtpExact",
    ].sort());
    expect(terminal).toMatchObject({
      shadowOutcome: "PASS",
      terminalReason: "PASS",
      selectedSeedOrdinal: 0,
      selectedCandidateOrdinal: trace.stabilizationOne.candidate.candidateOrdinal,
      verifiedCandidateOrdinal: trace.stabilizationOne.candidate.candidateOrdinal,
      lastEvaluatedCandidateOrdinal: trace.final.candidate.candidateOrdinal,
      budgetLedger: {
        LRA_MAP: { limit: 8, used: 8, remaining: 0 },
        TP_CONTAINMENT: { limit: 4, used: 1, remaining: 3 },
        LUFS_TRIM: { limit: 3, used: 2, remaining: 1 },
        POST_TRIM_STABILIZATION: { limit: 2, used: 1, remaining: 1 },
        FINAL_VERIFY: { limit: 1, used: 1, remaining: 0 },
        ROLLBACK_VERIFY: { limit: 1, used: 0, remaining: 1 },
        TOTAL: { limit: 19, used: 13, remaining: 6 },
      },
      failedPredicates: [],
    });
  });

  it("uses the dedicated post-trim stabilization reserve when LUFS trim raises true peak", () => {
    const trace = successTrace(hex("f"), -0.98);

    expect(trace.trimTwo.candidate.disposition).toBe("LUFS_TRIM_COMPLETE");
    expect(trace.stabilizationOne.plan).toMatchObject({
      phase: "POST_TRIM_STABILIZATION",
      targetStepLufs: 0,
      ceilingStepDb: 0.07,
      integratedTargetLufs: -13.65,
      macroDepthDb: 12.45,
    });
    expect(trace.final.candidate.disposition).toBe("FINAL_PASS");
  });

  it("rejects a final encoded-artifact SHA drift and reports same-artifact verification failure", () => {
    const trace = successTrace(hex("f"), -1.03, hex("0"));
    expect(trace.final.candidate.disposition).toBe("FINAL_FAIL");
    const rollback = addCandidate(
      trace.currentReplay,
      trace.candidates,
      measurement(-15.25, -1.06, 3.2, hex("6"), hex("e")),
    );
    expect(rollback.candidate.disposition).toBe("ROLLBACK_SAFE");
    expect(rollback.candidate.encodedArtifactSha256).toBe(hex("e"));
    expect(rollback.plan).toMatchObject({
      phase: "ROLLBACK_VERIFY",
      macroDepthDb: 10.70625,
    });
    expect(rollback.plan.macroDepthDb)
      .toBeLessThan(trace.currentReplay.controllerPolicy.macroDepthMinDb);
    expect(trace.candidates
      .filter((candidate) => candidate.phase !== "ROLLBACK_VERIFY")
      .every((candidate) => candidate.macroDepthDb
        >= trace.currentReplay.controllerPolicy.macroDepthMinDb
        && candidate.macroDepthDb
          <= trace.currentReplay.controllerPolicy.macroDepthMaxDb))
      .toBe(true);
    expect(finalizeStage12CodecSafeLraFeasibilityTrace(
      payload,
      trace.currentReplay,
      trace.candidates,
    )).toMatchObject({
      shadowOutcome: "FAIL",
      terminalReason: "FINAL_SAME_ARTIFACT_VERIFICATION_FAILED",
      safeRollback: { parentCandidatePass: 5 },
    });
  });

  it("does not borrow unused phase budget and never promotes parent pass 5 to PASS", () => {
    const currentReplay = replay();
    const { candidates } = runMap(currentReplay, belowMap);
    const { rollback } = finishWithRollback(currentReplay, candidates);
    const terminalPlan = planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    );

    expect(rollback.candidate.disposition).toBe("ROLLBACK_SAFE");
    expect(terminalPlan).toMatchObject({
      done: true,
      shadowOutcome: "FAIL",
      terminalReason: "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED",
      selectedSeedOrdinal: null,
      budgetLedger: {
        LRA_MAP: { limit: 8, used: 8, remaining: 0 },
        TP_CONTAINMENT: { limit: 4, used: 0, remaining: 4 },
        LUFS_TRIM: { limit: 3, used: 0, remaining: 3 },
        POST_TRIM_STABILIZATION: { limit: 2, used: 0, remaining: 2 },
        FINAL_VERIFY: { limit: 1, used: 0, remaining: 1 },
        ROLLBACK_VERIFY: { limit: 1, used: 1, remaining: 0 },
        TOTAL: { limit: 19, used: 9, remaining: 10 },
      },
      safeRollback: {
        parentCandidatePass: 5,
        verificationCandidateOrdinal: 8,
      },
    });
  });

  it("fails closed when fresh pass-5 rollback reproduction drifts", () => {
    const currentReplay = replay();
    const { candidates } = runMap(currentReplay, belowMap);
    const rollback = addCandidate(currentReplay, candidates,
      measurement(-15.24, -1.06, 3.2, hex("6"), hex("e")));

    expect(rollback.plan).toMatchObject({ phase: "ROLLBACK_VERIFY",
      macroDepthDb: 10.70625 });
    expect(rollback.candidate.disposition).toBe("ROLLBACK_DRIFT");
    expect(finalizeStage12CodecSafeLraFeasibilityTrace(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({
      shadowOutcome: "FAIL",
      terminalReason: "SAFE_ROLLBACK_REPRODUCTION_DRIFT",
      verifiedCandidateOrdinal: null,
      selectedCandidateOrdinal: rollback.candidate.candidateOrdinal,
    });
  });

  it("does not borrow LUFS slots after true-peak containment exhausts", () => {
    const currentReplay = replay();
    const values = EXPECTED_MAP_DEPTHS.map((_, index) => index === 0
      ? { integratedLufs: -14, truePeakDbtp: -0.6, loudnessRangeLu: 5.5 }
      : { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 });
    const { candidates } = runMap(currentReplay, values);
    for (const [index, truePeakDbtp] of [-0.7, -0.8, -0.9, -1].entries()) {
      const step = addCandidate(currentReplay, candidates,
        measurement(-14, truePeakDbtp, 5.5, hex(String(index + 1))));
      expect(step.plan.phase).toBe("TP_CONTAINMENT");
      expect(step.candidate.disposition).toBe("TP_IMPROVING");
    }
    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({ phase: "ROLLBACK_VERIFY" });
    const { terminal } = finishWithRollback(currentReplay, candidates);
    expect(terminal.budgetLedger).toMatchObject({
      TP_CONTAINMENT: { limit: 4, used: 4, remaining: 0 },
      LUFS_TRIM: { limit: 3, used: 0, remaining: 3 },
      POST_TRIM_STABILIZATION: { limit: 2, used: 0, remaining: 2 },
    });
  });

  it("does not borrow stabilization slots after the reserved LUFS trim budget exhausts", () => {
    const currentReplay = replay();
    const values = EXPECTED_MAP_DEPTHS.map((_, index) => index === 0
      ? { integratedLufs: -15.8, truePeakDbtp: -1.1, loudnessRangeLu: 5.5 }
      : { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 });
    const { candidates } = runMap(currentReplay, values);
    for (const [index, integratedLufs] of [-15.6, -15.4, -15.2].entries()) {
      const step = addCandidate(currentReplay, candidates,
        measurement(integratedLufs, -1.1, 5.5, hex(String(index + 1))));
      expect(step.plan.phase).toBe("LUFS_TRIM");
      expect(step.candidate.disposition).toBe("LUFS_TRIM_ACCEPTED");
    }
    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({ phase: "ROLLBACK_VERIFY" });
    const { terminal } = finishWithRollback(currentReplay, candidates);
    expect(terminal.budgetLedger).toMatchObject({
      LUFS_TRIM: { limit: 3, used: 3, remaining: 0 },
      POST_TRIM_STABILIZATION: { limit: 2, used: 0, remaining: 2 },
      FINAL_VERIFY: { limit: 1, used: 0, remaining: 1 },
    });
  });

  it("does not borrow final verification after stabilization budget exhausts", () => {
    const currentReplay = replay();
    const values = EXPECTED_MAP_DEPTHS.map((_, index) => index === 0
      ? { integratedLufs: -15.25, truePeakDbtp: -1.1, loudnessRangeLu: 5.5 }
      : { integratedLufs: -14, truePeakDbtp: -1.1, loudnessRangeLu: 3.2 });
    const { candidates } = runMap(currentReplay, values);
    const trimOne = addCandidate(currentReplay, candidates,
      measurement(-15.05, -0.7, 5.5, hex("8")));
    const trimTwo = addCandidate(currentReplay, candidates,
      measurement(-14.95, -0.7, 5.5, hex("9")));
    expect(trimOne.candidate.disposition).toBe("LUFS_TRIM_ACCEPTED");
    expect(trimTwo.candidate.disposition).toBe("LUFS_TRIM_COMPLETE");

    // TP is deliberately still outside the -1.05 interior after both slots.
    for (const [index, truePeakDbtp] of [-0.8, -0.9].entries()) {
      const step = addCandidate(currentReplay, candidates,
        measurement(-14, truePeakDbtp, 5.5, hex(String(index + 1))));
      expect(step.plan.phase).toBe("POST_TRIM_STABILIZATION");
      expect(step.candidate.disposition).toBe("TP_STABILIZING");
    }
    expect(planStage12CodecSafeLraFeasibilityCandidate(
      payload,
      currentReplay,
      candidates,
    )).toMatchObject({ phase: "ROLLBACK_VERIFY" });
    const { terminal } = finishWithRollback(currentReplay, candidates);
    expect(terminal.budgetLedger).toMatchObject({
      POST_TRIM_STABILIZATION: { limit: 2, used: 2, remaining: 0 },
      FINAL_VERIFY: { limit: 1, used: 0, remaining: 1 },
      ROLLBACK_VERIFY: { limit: 1, used: 1, remaining: 0 },
    });
  });

  it("pins threshold fingerprints across worker/control-plane and rejects every side effect", () => {
    const currentReplay = replay();
    expect(controlPlaneFingerprints(payload as never, currentReplay.controllerPolicy))
      .toEqual(stage12CodecSafeLraFeasibilityFingerprints(
        payload,
        currentReplay.controllerPolicy,
      ));
    expect(payload.qa.loudness).toEqual({
      integratedLufs: -14,
      toleranceLufs: 1,
      truePeakMaxDbtp: -1,
      lraMin: 4,
      lraMax: 8,
    });
    for (const codecSafeLraFeasibilitySearch of [
      { ...currentReplay, uploadCorrectedOutput: true },
      { ...currentReplay, providerCallCount: 1 },
      { ...currentReplay, calibration: true },
      { ...currentReplay, finalize: true },
      { ...currentReplay, release: true },
      { ...currentReplay, productionActivation: true },
      { ...currentReplay, autoPublish: "ON" },
    ]) {
      expect(() => validateStage12CodecSafeLraFeasibilityContract({
        ...payload,
        codecSafeLraFeasibilitySearch,
      }, imageDigest)).toThrowError(expect.objectContaining({
        code: "INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENVELOPE",
      }));
    }
  });

  it("seals exact lineage and fingerprints in evidence and rejects boundary drift", () => {
    const trace = successTrace();
    const evidence = evidenceFor(trace);
    const result = buildStage12CodecSafeLraFeasibilityEvidence({
      ...payload,
      codecSafeLraFeasibilitySearch: trace.currentReplay,
    }, evidence);

    expect(result).toMatchObject({
      accepted: true,
      evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION",
      boundary: "POST_OPUS_LRA_FEASIBILITY_SEARCH",
      source: { sha256: ORDINAL_TWO_SHA256 },
      parentTruePeakShadow: { evidenceId: TRUE_PEAK_PARENT_EVIDENCE_ID },
      parentLraGuard: { evidenceId: LRA_GUARD_PARENT_EVIDENCE_ID },
      shadowOutcome: "PASS",
      correctedOutputUploaded: false,
      providerCallCount: 0,
      productionActivation: false,
    });
    expect(result).not.toHaveProperty("preMaster");

    for (const changed of [
      { source: { ...evidence.source, sha256: hex("1") } },
      { parentTruePeakShadow: { ...evidence.parentTruePeakShadow,
        evidenceId: hex("2") } },
      { parentLraGuard: { ...evidence.parentLraGuard, evidenceId: hex("3") } },
      { algorithmFingerprint: hex("4") },
      { thresholdSnapshotSha256: hex("5") },
      { controllerPolicySha256: hex("6") },
      { renderKernelFingerprint: hex("7") },
    ]) {
      expect(() => buildStage12CodecSafeLraFeasibilityEvidence({
        ...payload,
        codecSafeLraFeasibilitySearch: trace.currentReplay,
      }, {
        ...evidence,
        ...changed,
      })).toThrowError(expect.objectContaining({
        code: "INVALID_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_EVIDENCE",
      }));
    }
  });
});
