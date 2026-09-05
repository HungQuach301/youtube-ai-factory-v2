import { describe, expect, it } from "vitest";

import { runStage12LraFeasibilityController } from
  "../stage12-lra-feasibility-controller.mjs";
import { parseStage12LraFeasibilityResult,
  stage12LraFeasibilityFingerprints,
  STAGE12_LRA_FEASIBILITY_LINEAGE,
  STAGE12_LRA_FEASIBILITY_POLICY } from
  "../../../sites/control-plane/app/stage12-lra-feasibility-contract";

const thresholds = { integratedLufs: -14, toleranceLufs: 1,
  truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8,
  nearStaticMaxSec: 7, sampleRateHz: 48_000 };
const hex = (value: string) => value.repeat(64).slice(0, 64);
const runtime = { ffmpegVersion: "ffmpeg version test",
  ffmpegBuildFingerprint: hex("a"), libopusEncoderFingerprint: hex("b") };
const safeRollbackReference = { candidatePass: 5 as const, macroDepthDb: 10.70625,
  integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
  losslessReferenceSha256: hex("c"),
  integratedLufs: -15.25, integratedLufsExact: "-15.25",
  truePeakDbtp: -1.06, truePeakDbtpExact: "-1.06",
  loudnessRangeLu: 3.2, loudnessRangeLuExact: "3.20",
  audioFrameMd5Sha256: hex("f") };

const parseReceipt = (value: unknown) =>
  parseStage12LraFeasibilityResult(value, safeRollbackReference);

async function validReceipt() {
  let ordinal = 0;
  const controller = await runStage12LraFeasibilityController({
    thresholds,
    anchorLimiterCeilingDbtp: -2.67,
    safeRollbackReference,
    probe: async (plan: { phase: string; phaseOrdinal: number;
      sameArtifactReference?: Record<string, number | string> }) => {
      if (plan.phase === "FINAL_VERIFICATION") return { ...plan.sameArtifactReference! };
      ordinal += 1;
      const digest = ordinal.toString(16).padStart(64, "0");
      const feasible = plan.phase !== "LRA_MAP" || plan.phaseOrdinal === 2;
      return { integratedLufs: -14.9, integratedLufsExact: "-14.90",
        truePeakDbtp: -1.1, truePeakDbtpExact: "-1.10",
        loudnessRangeLu: feasible ? 4.5 : 3.5,
        loudnessRangeLuExact: feasible ? "4.50" : "3.50",
        candidateSha256: digest, audioFrameMd5Sha256: digest };
    },
  });
  const fingerprints = stage12LraFeasibilityFingerprints({
    qa: { nearStaticMaxSec: 7, loudness: {
      integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1,
      lraMin: 4, lraMax: 8,
    } },
    render: { sampleRateHz: 48_000 },
  });
  return {
    accepted: true as const, schemaVersion: 1 as const,
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION" as const,
    boundary: "POST_OPUS_CODEC_SAFE_LRA_FEASIBILITY" as const,
    lineage: STAGE12_LRA_FEASIBILITY_LINEAGE,
    phaseBudget: STAGE12_LRA_FEASIBILITY_POLICY.phaseBudget,
    phaseBudgetUsed: controller.phaseBudgetUsed,
    candidateTrace: controller.candidateTrace,
    failedProbes: controller.failedProbes,
    failedProbe: null,
    safeRollbackReference: { ...controller.safeRollbackReference },
    outcome: controller.outcome,
    terminalReason: controller.terminalReason,
    errorCode: null,
    selectedCandidateSha256: controller.selectedCandidateSha256,
    losslessReference: { sha256: hex("c"), byteLength: 42,
      audioFrameMd5Sha256: hex("d"), codec: "pcm_f32le" as const,
      sampleRateHz: 48_000 as const },
    parentRuntimeProvenance: { ...runtime }, runtimeProvenance: { ...runtime },
    expectedWorkerImageDigest: `sha256:${hex("e")}`,
    workerImageDigest: `sha256:${hex("e")}`,
    ...fingerprints,
    shadowOnly: true as const, correctedOutputUploaded: false as const,
    historicalBackfill: false as const, providerDispatch: "OFF" as const,
    providerCallCount: 0 as const, calibration: false as const,
    finalize: false as const, productionActivation: false as const,
    releaseEligible: false as const, autoPublish: "OFF" as const,
  };
}

describe("Stage 12 feasibility semantic receipt validation", () => {
  it("accepts a deterministic final verification bound to its immediate predecessor", async () => {
    const receipt = await validReceipt();
    const final = receipt.candidateTrace.at(-1)!;
    const finalReady = receipt.candidateTrace[2];
    expect(final.candidateSha256).toBe(finalReady.candidateSha256);
    expect(final.audioFrameMd5Sha256).toBe(finalReady.audioFrameMd5Sha256);
    expect(() => parseReceipt(receipt)).not.toThrow();
  });

  it.each([
    ["reordered lattice", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      [value.candidateTrace[0].macroDepthDb, value.candidateTrace[1].macroDepthDb]
        = [value.candidateTrace[1].macroDepthDb, value.candidateTrace[0].macroDepthDb];
    }],
    ["forged exact decimal", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      value.candidateTrace[0].integratedLufsExact = "-13.00";
    }],
    ["mutated final controls", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      value.candidateTrace.at(-1)!.macroDepthDb += 0.1;
    }],
    ["non-contiguous phase ordinal", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      value.candidateTrace[1].phaseOrdinal = 7;
    }],
    ["final artifact identity substitution", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      const final = value.candidateTrace.at(-1)!;
      final.candidateSha256 = value.candidateTrace[0].candidateSha256;
      final.audioFrameMd5Sha256 = value.candidateTrace[0].audioFrameMd5Sha256;
      value.selectedCandidateSha256 = final.candidateSha256;
    }],
    ["same-artifact inconsistent final measurement",
      (value: Awaited<ReturnType<typeof validReceipt>>) => {
        const final = value.candidateTrace.at(-1)!;
        final.integratedLufs = -14.8;
        final.integratedLufsExact = "-14.80";
      }],
    ["final internal true-peak regression", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      for (const candidate of [value.candidateTrace[2], value.candidateTrace.at(-1)!]) {
        candidate.truePeakDbtp = -1.01;
        candidate.truePeakDbtpExact = "-1.01";
      }
    }],
    ["safe rollback reference drift", (value: Awaited<ReturnType<typeof validReceipt>>) => {
      value.safeRollbackReference.audioFrameMd5Sha256 = hex("9");
    }],
    ["forged PASS runtime provenance drift",
      (value: Awaited<ReturnType<typeof validReceipt>>) => {
        value.runtimeProvenance!.ffmpegBuildFingerprint = hex("9");
      }],
  ])("rejects %s even when the shape and public predicates remain valid", async (_name, mutate) => {
    const receipt = await validReceipt();
    mutate(receipt);
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("rejects a shape-valid PASS that omits the required feasibility map", async () => {
    const receipt = await validReceipt();
    const final = { ...receipt.candidateTrace.at(-1)!, candidateOrdinal: 0,
      phaseOrdinal: 0 };
    receipt.candidateTrace = [final];
    receipt.phaseBudgetUsed = { LRA_MAP: 0, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 1,
      SAFE_ROLLBACK: 0 };
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("rejects unknown top-level receipt fields before hashing or persistence", async () => {
    const receipt = { ...await validReceipt(), forgedTerminalBinding: hex("9") };
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it.each([
    ["candidate", (receipt: Awaited<ReturnType<typeof validReceipt>>) => {
      Object.assign(receipt.candidateTrace[0], { "forged-e\u0301": true });
    }],
    ["runtime", (receipt: Awaited<ReturnType<typeof validReceipt>>) => {
      Object.assign(receipt.runtimeProvenance!, { "forged-e\u0301": true });
    }],
    ["lossless reference", (receipt: Awaited<ReturnType<typeof validReceipt>>) => {
      Object.assign(receipt.losslessReference!, { "forged-e\u0301": true });
    }],
  ])("rejects an unknown Unicode-decomposed key in %s", async (_name, mutate) => {
    const receipt = await validReceipt();
    mutate(receipt);
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it.each([
    ["candidate hash", (receipt: Awaited<ReturnType<typeof validReceipt>>) => {
      (receipt.candidateTrace[0] as unknown as Record<string, unknown>).candidateSha256
        = [receipt.candidateTrace[0].candidateSha256];
    }],
    ["runtime hash", (receipt: Awaited<ReturnType<typeof validReceipt>>) => {
      (receipt.runtimeProvenance as unknown as Record<string, unknown>)
        .ffmpegBuildFingerprint = [receipt.runtimeProvenance!.ffmpegBuildFingerprint];
    }],
    ["lossless hash", (receipt: Awaited<ReturnType<typeof validReceipt>>) => {
      (receipt.losslessReference as unknown as Record<string, unknown>).sha256
        = [receipt.losslessReference!.sha256];
    }],
  ])("rejects an array-wrapped %s instead of coercing it", async (_name, mutate) => {
    const receipt = await validReceipt();
    mutate(receipt);
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("rejects a failed probe that is not the controller's exact next plan", async () => {
    const receipt = await validReceipt();
    receipt.candidateTrace = receipt.candidateTrace.slice(0, 8);
    receipt.phaseBudgetUsed = { LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 1, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0,
      SAFE_ROLLBACK: 0 };
    receipt.failedProbe = { phase: "LUFS_TRIM", phaseOrdinal: 0,
      seedProbeOrdinal: 2, macroDepthDb: 11.675, integratedTargetLufs: -13.75,
      limiterCeilingDbtp: -999, targetStepLufs: 0.25 };
    receipt.failedProbes = [receipt.failedProbe];
    receipt.outcome = "FAIL";
    receipt.terminalReason = "MEASUREMENT_FAILED";
    receipt.errorCode = "STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID";
    receipt.selectedCandidateSha256 = null;
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("accepts a truthful partial trace with exactly one consumed failed-probe slot", async () => {
    const receipt = await validReceipt();
    receipt.candidateTrace = receipt.candidateTrace.slice(0, 3);
    receipt.phaseBudgetUsed = { LRA_MAP: 4, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0,
      SAFE_ROLLBACK: 0 };
    receipt.failedProbe = { phase: "LRA_MAP", phaseOrdinal: 3,
      seedProbeOrdinal: null, macroDepthDb: 13.225, integratedTargetLufs: -14,
      limiterCeilingDbtp: -2.67, targetStepLufs: 0 };
    receipt.failedProbes = [receipt.failedProbe];
    receipt.outcome = "FAIL";
    receipt.terminalReason = "MEASUREMENT_FAILED";
    receipt.errorCode = "STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID";
    receipt.selectedCandidateSha256 = null;
    expect(() => parseReceipt(receipt)).not.toThrow();
  });

  it("requires runtime and lossless provenance once the first probe is attempted", async () => {
    const firstFailure = { phase: "LRA_MAP" as const, phaseOrdinal: 0,
      seedProbeOrdinal: null, macroDepthDb: 14, integratedTargetLufs: -14,
      limiterCeilingDbtp: -2.67, targetStepLufs: 0 };
    const receipt = await validReceipt();
    receipt.candidateTrace = [];
    receipt.phaseBudgetUsed = { LRA_MAP: 1, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0,
      SAFE_ROLLBACK: 0 };
    receipt.failedProbes = [firstFailure];
    receipt.failedProbe = firstFailure;
    receipt.outcome = "FAIL";
    receipt.terminalReason = "MEASUREMENT_FAILED";
    receipt.errorCode = "STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID";
    receipt.selectedCandidateSha256 = null;
    expect(() => parseReceipt(receipt)).not.toThrow();

    receipt.losslessReference = null;
    receipt.runtimeProvenance = null;
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("rejects runtime provenance without its lossless source binding", async () => {
    const receipt = await validReceipt();
    receipt.candidateTrace = [];
    receipt.phaseBudgetUsed = { LRA_MAP: 0, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0,
      SAFE_ROLLBACK: 0 };
    receipt.failedProbes = [];
    receipt.failedProbe = null;
    receipt.outcome = "FAIL";
    receipt.terminalReason = "LINEAGE_DRIFT";
    receipt.errorCode = "STAGE12_LRA_FEASIBILITY_RUNTIME_CONFLICT";
    receipt.selectedCandidateSha256 = null;
    receipt.losslessReference = null;
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("accepts only an exact pre-probe runtime-drift receipt with observed provenance", async () => {
    const receipt = await validReceipt();
    receipt.candidateTrace = [];
    receipt.phaseBudgetUsed = { LRA_MAP: 0, TRUE_PEAK_CONTAINMENT: 0,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0,
      SAFE_ROLLBACK: 0 };
    receipt.failedProbes = [];
    receipt.failedProbe = null;
    receipt.outcome = "FAIL";
    receipt.terminalReason = "LINEAGE_DRIFT";
    receipt.errorCode = "STAGE12_LRA_FEASIBILITY_RUNTIME_DRIFT";
    receipt.selectedCandidateSha256 = null;
    receipt.runtimeProvenance!.ffmpegBuildFingerprint = hex("9");
    expect(() => parseReceipt(receipt)).not.toThrow();

    receipt.errorCode = "STAGE12_LRA_FEASIBILITY_SOURCE_INTEGRITY_MISMATCH";
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("accepts truthful final-integrity failure followed by the exact safe rollback", async () => {
    let ordinal = 0;
    const controller = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67, safeRollbackReference,
      probe: async (plan: { phase: string; phaseOrdinal: number;
        sameArtifactReference?: Record<string, number | string> }) => {
        ordinal += 1;
        const digest = ordinal.toString(16).padStart(64, "0");
        if (plan.phase === "FINAL_VERIFICATION") return {
          ...plan.sameArtifactReference!, integratedLufs: -14.8,
          integratedLufsExact: "-14.80" };
        if (plan.phase === "SAFE_ROLLBACK") return {
          ...safeRollbackReference, candidateSha256: digest };
        const feasible = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 0;
        return { integratedLufs: -14, integratedLufsExact: "-14.00",
          truePeakDbtp: -1.1, truePeakDbtpExact: "-1.10",
          loudnessRangeLu: feasible ? 4.5 : 3.5,
          loudnessRangeLuExact: feasible ? "4.50" : "3.50",
          candidateSha256: digest, audioFrameMd5Sha256: digest };
      },
    });
    const receipt = await validReceipt();
    receipt.phaseBudgetUsed = controller.phaseBudgetUsed;
    receipt.candidateTrace = controller.candidateTrace;
    receipt.failedProbes = controller.failedProbes;
    receipt.failedProbe = controller.failedProbe;
    receipt.outcome = controller.outcome;
    receipt.terminalReason = controller.terminalReason;
    receipt.selectedCandidateSha256 = controller.selectedCandidateSha256;
    expect(controller.failedProbe).toMatchObject({
      phase: "FINAL_VERIFICATION",
      failureCode: "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_DRIFT",
    });
    expect(controller.candidateTrace.at(-1)?.phase).toBe("SAFE_ROLLBACK");
    expect(() => parseReceipt(receipt)).not.toThrow();
  });

  it("rejects continued work on a seed after a non-improving TP rejection", async () => {
    const receipt = await validReceipt();
    const seed = receipt.candidateTrace[2];
    seed.truePeakDbtp = -0.8;
    seed.truePeakDbtpExact = "-0.80";
    seed.failedPredicates = ["TRUE_PEAK_DBTP_ABOVE_MAX"];
    seed.truePeakContained = false;
    seed.disposition = "LRA_FEASIBLE_TP_UNCONTAINED";
    const tpRejected = { ...seed, candidateOrdinal: 8,
      phase: "TRUE_PEAK_CONTAINMENT" as const, phaseOrdinal: 0,
      seedProbeOrdinal: 2, limiterCeilingDbtp: -2.92,
      candidateSha256: hex("8"), audioFrameMd5Sha256: hex("8"),
      disposition: "TP_NON_IMPROVING" as const };
    const tpAfterRejection = { ...tpRejected, candidateOrdinal: 9, phaseOrdinal: 1,
      limiterCeilingDbtp: -3.17, truePeakDbtp: -0.9, truePeakDbtpExact: "-0.90",
      candidateSha256: hex("9"), audioFrameMd5Sha256: hex("9"),
      disposition: "TP_CONTAINED" as const };
    const rollback = { ...tpAfterRejection, candidateOrdinal: 10,
      phase: "SAFE_ROLLBACK" as const, phaseOrdinal: 0, seedProbeOrdinal: null,
      macroDepthDb: 10.70625, integratedTargetLufs: -14,
      limiterCeilingDbtp: -2.67, targetStepLufs: 0,
      candidateSha256: hex("f"), audioFrameMd5Sha256: hex("f"),
      disposition: "SAFE_ROLLBACK" as const };
    receipt.candidateTrace = [...receipt.candidateTrace.slice(0, 8),
      tpRejected, tpAfterRejection, rollback];
    receipt.phaseBudgetUsed = { LRA_MAP: 8, TRUE_PEAK_CONTAINMENT: 2,
      LUFS_TRIM: 0, POST_TRIM_TRUE_PEAK: 0, FINAL_VERIFICATION: 0,
      SAFE_ROLLBACK: 1 };
    receipt.outcome = "FAIL";
    receipt.terminalReason = "FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED";
    receipt.selectedCandidateSha256 = rollback.candidateSha256;
    expect(() => parseReceipt(receipt))
      .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
  });

  it("accepts seed two only after seed one reaches a deterministic rejection", async () => {
    let ordinal = 0;
    const controller = await runStage12LraFeasibilityController({ thresholds,
      anchorLimiterCeilingDbtp: -2.67,
      safeRollbackReference,
      probe: async (plan: { phase: string; phaseOrdinal: number;
        sameArtifactReference?: Record<string, number | string> }) => {
        if (plan.phase === "FINAL_VERIFICATION") return { ...plan.sameArtifactReference! };
        ordinal += 1;
        const digest = ordinal.toString(16).padStart(64, "0");
        const firstSeed = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 0;
        const secondSeed = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 1;
        const firstRejected = plan.phase === "TRUE_PEAK_CONTAINMENT";
        const feasible = firstSeed || secondSeed || plan.phase !== "LRA_MAP";
        const truePeakDbtp = firstSeed || firstRejected ? -0.8 : -1.1;
        return { integratedLufs: -14, integratedLufsExact: "-14.00",
          truePeakDbtp, truePeakDbtpExact: truePeakDbtp.toFixed(2),
          loudnessRangeLu: feasible ? (firstSeed ? 6 : 5) : 3.5,
          loudnessRangeLuExact: feasible ? (firstSeed ? "6.00" : "5.00") : "3.50",
          candidateSha256: digest, audioFrameMd5Sha256: digest };
      },
    });
    const receipt = await validReceipt();
    receipt.phaseBudgetUsed = controller.phaseBudgetUsed;
    receipt.candidateTrace = controller.candidateTrace;
    receipt.outcome = controller.outcome;
    receipt.terminalReason = controller.terminalReason;
    receipt.selectedCandidateSha256 = controller.selectedCandidateSha256;
    expect(controller.candidateTrace.slice(8).map((candidate: { phase: string;
      seedProbeOrdinal: number | null }) => [candidate.phase, candidate.seedProbeOrdinal]))
      .toEqual([["TRUE_PEAK_CONTAINMENT", 0], ["FINAL_VERIFICATION", 1]]);
    expect(() => parseReceipt(receipt)).not.toThrow();
  });

  it("uses one global final slot on seed two, then rolls back when its artifact is unavailable",
    async () => {
      let ordinal = 0;
      const controller = await runStage12LraFeasibilityController({ thresholds,
        anchorLimiterCeilingDbtp: -2.67,
        safeRollbackReference,
        probe: async (plan: { phase: string; phaseOrdinal: number }) => {
          if (plan.phase === "FINAL_VERIFICATION") {
            throw Object.assign(new Error("cached artifact unavailable"), {
              code: "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE",
            });
          }
          ordinal += 1;
          const digest = ordinal.toString(16).padStart(64, "0");
          if (plan.phase === "SAFE_ROLLBACK") return {
            integratedLufs: safeRollbackReference.integratedLufs,
            integratedLufsExact: safeRollbackReference.integratedLufsExact,
            truePeakDbtp: safeRollbackReference.truePeakDbtp,
            truePeakDbtpExact: safeRollbackReference.truePeakDbtpExact,
            loudnessRangeLu: safeRollbackReference.loudnessRangeLu,
            loudnessRangeLuExact: safeRollbackReference.loudnessRangeLuExact,
            candidateSha256: digest,
            audioFrameMd5Sha256: safeRollbackReference.audioFrameMd5Sha256,
          };
          const firstSeed = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 0;
          const secondSeed = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 1;
          const firstRejected = plan.phase === "TRUE_PEAK_CONTAINMENT";
          const feasible = firstSeed || secondSeed || plan.phase !== "LRA_MAP";
          const truePeakDbtp = firstSeed || firstRejected ? -0.8 : -1.1;
          return { integratedLufs: -14, integratedLufsExact: "-14.00",
            truePeakDbtp, truePeakDbtpExact: truePeakDbtp.toFixed(2),
            loudnessRangeLu: feasible ? (firstSeed ? 6 : 5) : 3.5,
            loudnessRangeLuExact: feasible ? (firstSeed ? "6.00" : "5.00") : "3.50",
            candidateSha256: digest, audioFrameMd5Sha256: digest };
        },
      });
      const receipt = await validReceipt();
      receipt.phaseBudgetUsed = controller.phaseBudgetUsed;
      receipt.candidateTrace = controller.candidateTrace;
      receipt.failedProbes = controller.failedProbes;
      receipt.failedProbe = controller.failedProbe;
      receipt.outcome = controller.outcome;
      receipt.terminalReason = controller.terminalReason;
      receipt.errorCode = null;
      receipt.selectedCandidateSha256 = controller.selectedCandidateSha256;
      expect(controller.phaseBudgetUsed).toMatchObject({
        TRUE_PEAK_CONTAINMENT: 1, FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1,
      });
      expect(controller.failedProbe).toMatchObject({
        phase: "FINAL_VERIFICATION", seedProbeOrdinal: 1,
        failureCode: "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE",
      });
      expect(controller.candidateTrace.slice(8).map((candidate: { phase: string;
        seedProbeOrdinal: number | null }) => [candidate.phase, candidate.seedProbeOrdinal]))
        .toEqual([["TRUE_PEAK_CONTAINMENT", 0], ["SAFE_ROLLBACK", null]]);
      expect(() => parseReceipt(receipt)).not.toThrow();
    });

  it("rejects a recoverable final-integrity failure that omits mandatory rollback",
    async () => {
      let ordinal = 0;
      const controller = await runStage12LraFeasibilityController({ thresholds,
        anchorLimiterCeilingDbtp: -2.67, safeRollbackReference,
        probe: async (plan: { phase: string; phaseOrdinal: number }) => {
          if (plan.phase === "FINAL_VERIFICATION") {
            throw Object.assign(new Error("cached artifact unavailable"), {
              code: "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE",
            });
          }
          ordinal += 1;
          const digest = ordinal.toString(16).padStart(64, "0");
          if (plan.phase === "SAFE_ROLLBACK") return {
            integratedLufs: safeRollbackReference.integratedLufs,
            integratedLufsExact: safeRollbackReference.integratedLufsExact,
            truePeakDbtp: safeRollbackReference.truePeakDbtp,
            truePeakDbtpExact: safeRollbackReference.truePeakDbtpExact,
            loudnessRangeLu: safeRollbackReference.loudnessRangeLu,
            loudnessRangeLuExact: safeRollbackReference.loudnessRangeLuExact,
            candidateSha256: digest,
            audioFrameMd5Sha256: safeRollbackReference.audioFrameMd5Sha256,
          };
          const feasible = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 0;
          return { integratedLufs: -14, integratedLufsExact: "-14.00",
            truePeakDbtp: -1.1, truePeakDbtpExact: "-1.10",
            loudnessRangeLu: feasible ? 4.5 : 3.5,
            loudnessRangeLuExact: feasible ? "4.50" : "3.50",
            candidateSha256: digest, audioFrameMd5Sha256: digest };
        },
      });
      const receipt = await validReceipt();
      receipt.candidateTrace = controller.candidateTrace.slice(0, -1);
      receipt.phaseBudgetUsed = { ...controller.phaseBudgetUsed, SAFE_ROLLBACK: 0 };
      receipt.failedProbes = controller.failedProbes;
      receipt.failedProbe = controller.failedProbe;
      receipt.outcome = "FAIL";
      receipt.terminalReason = "MEASUREMENT_FAILED";
      receipt.errorCode = "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE";
      receipt.selectedCandidateSha256 = null;
      expect(() => parseReceipt(receipt))
        .toThrow("STAGE12_LRA_FEASIBILITY_RESULT_INVALID");
    });

  it("accounts for final failure followed by rollback failure without losing either attempt",
    async () => {
      let ordinal = 0;
      let caught: unknown;
      try {
        await runStage12LraFeasibilityController({ thresholds,
          anchorLimiterCeilingDbtp: -2.67,
          safeRollbackReference,
          probe: async (plan: { phase: string; phaseOrdinal: number }) => {
            ordinal += 1;
            const digest = ordinal.toString(16).padStart(64, "0");
            if (plan.phase === "FINAL_VERIFICATION") {
              throw Object.assign(new Error("cached artifact unavailable"), {
                code: "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE",
              });
            }
            if (plan.phase === "SAFE_ROLLBACK") return {
              ...safeRollbackReference, candidateSha256: digest,
              audioFrameMd5Sha256: hex("0"),
            };
            const feasible = plan.phase === "LRA_MAP" && plan.phaseOrdinal === 0;
            return { integratedLufs: -14, integratedLufsExact: "-14.00",
              truePeakDbtp: -1.1, truePeakDbtpExact: "-1.10",
              loudnessRangeLu: feasible ? 4.5 : 3.5,
              loudnessRangeLuExact: feasible ? "4.50" : "3.50",
              candidateSha256: digest, audioFrameMd5Sha256: digest };
          },
        });
      } catch (error) {
        caught = error;
      }
      const state = (caught as { feasibilityState: {
        phaseBudgetUsed: Record<string, number>; candidateTrace: unknown[];
        failedProbes: unknown[]; failedProbe: unknown;
      } }).feasibilityState;
      expect(state.failedProbes).toMatchObject([
        { phase: "FINAL_VERIFICATION",
          failureCode: "STAGE12_LRA_FEASIBILITY_FINAL_ARTIFACT_UNAVAILABLE" },
        { phase: "SAFE_ROLLBACK" },
      ]);
      expect(state.phaseBudgetUsed).toMatchObject({
        FINAL_VERIFICATION: 1, SAFE_ROLLBACK: 1,
      });
      const receipt = await validReceipt();
      receipt.phaseBudgetUsed = state.phaseBudgetUsed as typeof receipt.phaseBudgetUsed;
      receipt.candidateTrace = state.candidateTrace as typeof receipt.candidateTrace;
      receipt.failedProbes = state.failedProbes as typeof receipt.failedProbes;
      receipt.failedProbe = state.failedProbe as typeof receipt.failedProbe;
      receipt.outcome = "FAIL";
      receipt.terminalReason = "MEASUREMENT_FAILED";
      receipt.errorCode = "STAGE12_LRA_FEASIBILITY_MEASUREMENT_SAFE_ROLLBACK_DRIFT";
      receipt.selectedCandidateSha256 = null;
      expect(() => parseReceipt(receipt)).not.toThrow();
    });
});
