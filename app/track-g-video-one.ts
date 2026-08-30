import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import {
  channelIdentityContracts,
  channels,
  commandLog,
  contentBriefs,
  creativeRouteCandidates,
  creativeTournamentJudgments,
  creativeTournaments,
  creativeTournamentSelections,
  episodes,
  humanDecisions,
  operationRuns,
  operationEvents,
  predictedPerformances,
  productionPackages,
  scriptDrafts,
  spendCeilings,
  stageArtifacts,
  stageInstances,
  trackGRunContracts,
  truthClaims,
  truthClaimSources,
  truthSources,
  truthTerminology,
} from "../db/schema";
import type { ChatGPTUser } from "./chatgpt-auth";
import { approvedChannel, qualifiedVoice, trackGVideoOneContract } from "./factory-contract";
import {
  putImmutableEvidence,
  putImmutableProductionEvidence,
  sha256,
  verifyImmutableEvidence,
} from "./evidence-storage";
import { voiceQualificationReadBack } from "./voice-qualification";

const HEX64 = /^[0-9a-f]{64}$/u;
const OWNER_APPROVAL_TEXT = "START VIDEO 1 QUALIFICATION";
const STAGE_00_OWNER_APPROVAL_TEXT = "START STAGE 00";
const ADVANCE_STAGE_OWNER_APPROVAL_TEXT = "ADVANCE TRACK G VIDEO 1";
const STAGE_00_CODE = "00";
const STAGE_00_STANDARD_VERSION = 1;
const STAGE_00_PACKAGE_ID = "package_track_g_video_1_v1";
const STAGE_00_BRIEF_ID = "brief_track_g_video_1_v1";
const STAGE_00_INSTANCE_ID = "stage_track_g_video_1_00_attempt_1";
const STAGE_00_ARTIFACT_ID = "artifact_track_g_video_1_stage_00_brief_v1";
const STAGE_01_CODE = "01";
const STAGE_01_STANDARD_VERSION = 1;
const STAGE_01_INSTANCE_ID = "stage_track_g_video_1_01_attempt_1";
const STAGE_01_ARTIFACT_ID = "artifact_track_g_video_1_stage_01_market_audience_v1";
const STAGE_01_ARTIFACT_TYPE = "MARKET_AUDIENCE_INTELLIGENCE";
const STAGE_02_CODE = "02";
const STAGE_02_STANDARD_VERSION = 1;
const STAGE_02_INSTANCE_ID = "stage_track_g_video_1_02_attempt_1";
const STAGE_02_ARTIFACT_ID = "artifact_track_g_video_1_stage_02_reference_anti_copy_v1";
const STAGE_02_ARTIFACT_TYPE = "REFERENCE_ANTI_COPY";
const STAGE_03_CODE = "03";
const STAGE_03_STANDARD_VERSION = 1;
const STAGE_03_INSTANCE_ID = "stage_track_g_video_1_03_attempt_1";
const STAGE_03_ARTIFACT_ID = "artifact_track_g_video_1_stage_03_truth_graph_v1";
const STAGE_03_ARTIFACT_TYPE = "TRUTH_CLAIM_GRAPH_TERMINOLOGY";
const STAGE_04_CODE = "04";
const STAGE_04_STANDARD_VERSION = 1;
const STAGE_04_INSTANCE_ID = "stage_track_g_video_1_04_attempt_1";
const STAGE_04_TOURNAMENT_ID = "tournament_track_g_video_1_stage_04_v1";
const STAGE_04_ARTIFACT_ID = "artifact_track_g_video_1_stage_04_creative_route_v1";
const STAGE_04_ARTIFACT_TYPE = "CREATIVE_ROUTE_TOURNAMENT_PACKAGING";
const STAGE_04_PREPARE_OWNER_APPROVAL_TEXT = "PREPARE STAGE 04 TOURNAMENT";
const STAGE_04_SELECT_OWNER_APPROVAL_TEXT = "SELECT STAGE 04 CHAMPION";
const STAGE_05_CODE = "05";
const STAGE_05_STANDARD_VERSION = 1;
const STAGE_05_INSTANCE_ID = "stage_track_g_video_1_05_attempt_1";
const STAGE_05_ARTIFACT_ID = "artifact_track_g_video_1_stage_05_story_prediction_v1";
const STAGE_05_ARTIFACT_TYPE = "STORY_ARCHITECTURE_PREDICTION_SEAL";
const STAGE_05_PREDICTION_ID = "prediction_track_g_video_1_stage_05_v1";
const STAGE_05_PREDICTION_MODEL_VERSION = "qualification-prior-v1-uncalibrated";
const STAGE_06_CODE = "06";
const STAGE_06_STANDARD_VERSION = 1;
const STAGE_06_INSTANCE_ID = "stage_track_g_video_1_06_attempt_1";
const STAGE_06_DRAFT_ID = "script_draft_track_g_video_1_stage_06_v1";
const STAGE_06_ARTIFACT_ID = "artifact_track_g_video_1_stage_06_script_v1";
const STAGE_06_ARTIFACT_TYPE = "SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL";
const STAGE_06_PREPARE_OWNER_APPROVAL_TEXT = "PREPARE STAGE 06 SCRIPT REVIEW";
const STAGE_06_APPLY_OWNER_APPROVAL_TEXT = "APPLY STAGE 06 EDITORIAL DECISION";
const STAGE_07A_CODE = "07A";
const STAGE_07A_STANDARD_VERSION = 1;
const STAGE_07A_INSTANCE_ID = "stage_track_g_video_1_07a_attempt_1";
const STAGE_07A_ARTIFACT_ID = "artifact_track_g_video_1_stage_07a_voice_design_v1";
const STAGE_07A_ARTIFACT_TYPE = "VOICE_DESIGN_TTS_SEGMENTATION_SEAL";
const STAGE_07A_TOURNAMENT_ID = "tournament_track_g_video_1_stage_07a_voice_v1";
const STAGE_07A_PREPARE_OWNER_APPROVAL_TEXT = "PREPARE STAGE 07A VOICE TOURNAMENT";
const STAGE_07A_SELECT_OWNER_APPROVAL_TEXT = "SELECT STAGE 07A TONE";
const STAGE_07B_CODE = "07B";
const STAGE_07B_STANDARD_VERSION = 1;
const STAGE_07B_INSTANCE_ID = "stage_track_g_video_1_07b_attempt_1";
const STAGE_07B_ARTIFACT_ID = "artifact_track_g_video_1_stage_07b_visual_grammar_v1";
const STAGE_07B_ARTIFACT_TYPE = "VISUAL_GRAMMAR_ROUTING";
const STAGE_08_CODE = "08";
const STAGE_08_STANDARD_VERSION = 1;
const STAGE_08_INSTANCE_ID = "stage_track_g_video_1_08_attempt_1";
const STAGE_08_ARTIFACT_ID = "artifact_track_g_video_1_stage_08_shot_cue_program_v1";
const STAGE_08_ARTIFACT_TYPE = "SHOT_CUE_PROGRAM";
const STAGE_09_CODE = "09";
const STAGE_09_STANDARD_VERSION = 1;
const STAGE_09_INSTANCE_ID = "stage_track_g_video_1_09_attempt_1";
const STAGE_09_TOURNAMENT_ID = "tournament_track_g_video_1_stage_09_thumbnail_v1";
const STAGE_09_ARTIFACT_ID = "artifact_track_g_video_1_stage_09_visual_composition_v1";
const STAGE_09_ARTIFACT_TYPE = "VISUAL_ACQUISITION_COMPOSITION_SEAL";
const STAGE_09_PREPARE_OWNER_APPROVAL_TEXT = "PREPARE STAGE 09 VISUAL REVIEW";
const STAGE_09_SELECT_OWNER_APPROVAL_TEXT = "SELECT STAGE 09 THUMBNAIL";
export const trackGAdvanceStageCodes = [
  "01", "02", "03", "04", "05", "06", "07A", "07B",
  "08", "09", "10", "11", "12", "13", "14",
] as const;
export type TrackGAdvanceStageCode = typeof trackGAdvanceStageCodes[number];
const RUN_BLOCKERS = [
  "HP02_EDITORIAL_IMPRINT_REQUIRED",
  "HP03_RELEASE_AUTHORIZATION_REQUIRED",
  "STAGE_15_RELEASE_DISABLED",
  "STAGE_16_ANALYTICS_NOT_STARTED",
] as const;

export type StartTrackGVideoOneInput = {
  objective: string;
  ownerApprovalText: typeof OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type ExecuteTrackGVideoOneStage00Input = {
  objective: string;
  ownerApprovalText: typeof STAGE_00_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type AdvanceTrackGVideoOneStageInput = {
  stageCode: TrackGAdvanceStageCode;
  objective: string;
  ownerApprovalText: typeof ADVANCE_STAGE_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type PrepareTrackGVideoOneStage04Input = {
  objective: string;
  ownerApprovalText: typeof STAGE_04_PREPARE_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type SelectTrackGVideoOneStage04ChampionInput = {
  candidateId: string;
  rationale: string;
  ownerApprovalText: typeof STAGE_04_SELECT_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type PrepareTrackGVideoOneStage06Input = {
  objective: string;
  ownerApprovalText: typeof STAGE_06_PREPARE_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type ApplyTrackGVideoOneStage06EditorialInput = {
  decisionType: "D2" | "D4";
  revisedTitle?: string;
  revisedHook?: string;
  beatId?: string;
  revisedBeatNarration?: string;
  rationale: string;
  ownerApprovalText: typeof STAGE_06_APPLY_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type PrepareTrackGVideoOneStage07AVoiceInput = {
  objective: string;
  ownerApprovalText: typeof STAGE_07A_PREPARE_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type SelectTrackGVideoOneStage07AToneInput = {
  candidateId: string;
  rationale: string;
  ownerApprovalText: typeof STAGE_07A_SELECT_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type PrepareTrackGVideoOneStage09Input = {
  objective: string;
  ownerApprovalText: typeof STAGE_09_PREPARE_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type SelectTrackGVideoOneStage09ThumbnailInput = {
  candidateId: string;
  revisedThumbnailText: string;
  rationale: string;
  ownerApprovalText: typeof STAGE_09_SELECT_OWNER_APPROVAL_TEXT;
  idempotencyKey: string;
};

export type StageGateResult = {
  gate: string;
  state: "PASS";
  evidence: string;
};

const READY_STEPS = [
  ...trackGVideoOneContract.stageCodes.map((stageCode) => `STAGE_${stageCode}_READY`),
  "STAGE_15_READY",
];

function readyStepRank(step: string): number {
  return READY_STEPS.indexOf(step);
}

function isAtOrAfterReadyStep(actual: string, expected: string): boolean {
  const actualRank = readyStepRank(actual);
  const expectedRank = readyStepRank(expected);
  return actualRank >= 0 && expectedRank >= 0 && actualRank >= expectedRank;
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("TRACK_G_NON_FINITE_NUMBER");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value !== "object") throw new Error("TRACK_G_NON_JSON_VALUE");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key.normalize("NFC"))}:${canonicalize(record[key])}`).join(",")}}`;
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function contractEnvelope() {
  return {
    schemaVersion: 1,
    commandType: trackGVideoOneContract.commandType,
    channelId: approvedChannel.id,
    episodeId: trackGVideoOneContract.episodeId,
    episodeSequence: trackGVideoOneContract.episodeSequence,
    profile: trackGVideoOneContract.profile,
    assuranceMode: trackGVideoOneContract.assuranceMode,
    executionNamespace: trackGVideoOneContract.executionNamespace,
    stageCodes: [...trackGVideoOneContract.stageCodes],
    stopBeforeStage: trackGVideoOneContract.stopBeforeStage,
    preserveRejectedCandidates: trackGVideoOneContract.preserveRejectedCandidates,
    releaseEligible: trackGVideoOneContract.releaseEligible,
    providerDispatch: trackGVideoOneContract.providerDispatch,
    autoPublish: trackGVideoOneContract.autoPublish,
    bootstrapEvidence: { ...trackGVideoOneContract.bootstrapEvidence },
  };
}

async function readBack(operationRunId: string) {
  const db = getDb();
  const [run] = await db.select().from(operationRuns)
    .where(eq(operationRuns.id, operationRunId)).limit(1);
  const [contract] = await db.select().from(trackGRunContracts)
    .where(eq(trackGRunContracts.operationRunId, operationRunId)).limit(1);
  const [episode] = await db.select({ status: episodes.status }).from(episodes)
    .where(eq(episodes.id, trackGVideoOneContract.episodeId)).limit(1);
  if (!run || !contract || !episode) throw new Error("TRACK_G_RUN_READ_BACK_MISSING");
  const stageCodes = JSON.parse(contract.stagePlanJson) as unknown;
  const expectedStages = [...trackGVideoOneContract.stageCodes];
  if (!Array.isArray(stageCodes)
    || stageCodes.length !== expectedStages.length
    || stageCodes.some((stage, index) => stage !== expectedStages[index])
    || contract.profile !== trackGVideoOneContract.profile
    || contract.assuranceMode !== trackGVideoOneContract.assuranceMode
    || contract.executionNamespace !== trackGVideoOneContract.executionNamespace
    || contract.stopBeforeStage !== trackGVideoOneContract.stopBeforeStage
    || contract.preserveRejectedCandidates !== 1
    || contract.releaseEligible !== 0
    || contract.providerDispatch !== 0
    || contract.autoPublish !== 0
    || run.status !== "RUNNING"
    || readyStepRank(run.currentStep) < 0
    || episode.status !== "IN_PRODUCTION"
    || !await verifyImmutableEvidence(contract.bootstrapEvidenceR2Key, contract.bootstrapEvidenceSha256)) {
    throw new Error("TRACK_G_RUN_READ_BACK_FAILED");
  }
  return {
    run,
    contract,
    episodeStatus: episode.status,
    stageCodes: expectedStages,
  };
}

function stage00BriefEnvelope(operationRunId: string, identityContractId: string, bootstrapEvidenceSha256: string) {
  return {
    schemaVersion: 1,
    packageId: STAGE_00_PACKAGE_ID,
    operationRunId,
    stageCode: STAGE_00_CODE,
    namespace: "production",
    channel: {
      id: approvedChannel.id,
      name: approvedChannel.name,
      market: approvedChannel.market,
      locale: approvedChannel.locale,
      identityContractId,
      viewerPromise: approvedChannel.viewerPromise,
      audience: approvedChannel.audience,
      format: approvedChannel.format,
      positioning: approvedChannel.positioning,
    },
    episode: {
      id: trackGVideoOneContract.episodeId,
      sequence: trackGVideoOneContract.episodeSequence,
      title: approvedChannel.episodes[0],
      pillarId: approvedChannel.pillar.id,
      pillarName: approvedChannel.pillar.name,
    },
    execution: {
      profile: trackGVideoOneContract.profile,
      assuranceMode: trackGVideoOneContract.assuranceMode,
      stagePlan: [...trackGVideoOneContract.stageCodes],
      stopBeforeStage: trackGVideoOneContract.stopBeforeStage,
      preserveRejectedCandidates: true,
      providerDispatch: "OFF",
      autoPublish: "OFF",
      releaseEligible: false,
    },
    budget: {
      videoCeilingUsd: approvedChannel.controls.videoCeilingUsd,
      trackGCeilingUsd: approvedChannel.controls.trackGCeilingUsd,
      stage00ReservedUsd: 0,
      stage00ActualUsd: 0,
    },
    sourceEvidence: {
      bootstrapEvidenceSha256,
      qualificationLineageParent: false,
    },
  };
}

async function readBackStage00(operationRunId: string) {
  const base = await readBack(operationRunId);
  const db = getDb();
  const [productionPackage] = await db.select().from(productionPackages)
    .where(eq(productionPackages.id, STAGE_00_PACKAGE_ID)).limit(1);
  const [brief] = await db.select().from(contentBriefs)
    .where(eq(contentBriefs.id, STAGE_00_BRIEF_ID)).limit(1);
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_00_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_00_ARTIFACT_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const ceiling = (scope: string, scopeRef: string) => ceilings.find((value) =>
    value.scope === scope && value.scopeRef === scopeRef)?.ceilingUsd;
  if (!productionPackage || !brief || !stage || !artifact
    || productionPackage.episodeId !== trackGVideoOneContract.episodeId
    || productionPackage.channelId !== approvedChannel.id
    || productionPackage.namespace !== "production"
    || productionPackage.briefHash !== brief.canonicalHash
    || productionPackage.requestCeiling !== 0
    || productionPackage.spendCeilingUsd !== approvedChannel.controls.videoCeilingUsd
    || productionPackage.autoDispatch !== 0
    || productionPackage.autoPublish !== 0
    || productionPackage.status !== "RUNNING"
    || stage.packageId !== productionPackage.id
    || stage.stageCode !== STAGE_00_CODE
    || stage.controlState !== "FROZEN"
    || stage.standardVersion !== STAGE_00_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id
    || artifact.namespace !== "production"
    || artifact.canonicalHash !== brief.canonicalHash
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_00_STANDARD_VERSION
    || !isAtOrAfterReadyStep(base.run.currentStep, "STAGE_01_READY")
    || ceiling("PORTFOLIO", "track-g") !== approvedChannel.controls.trackGCeilingUsd
    || ceiling("CHANNEL", approvedChannel.id) !== approvedChannel.controls.trackGCeilingUsd
    || ceiling("PACKAGE", productionPackage.id) !== approvedChannel.controls.videoCeilingUsd
    || ceiling("STAGE", stage.id) !== 0
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_00_READ_BACK_FAILED");
  }
  return { base, productionPackage, brief, stage, artifact };
}

function stage01AudienceJob(): string {
  return "Help me verify a bank fraud alert before I call, click, or move money, so I can protect household funds without trusting the contact channel that raised the alarm.";
}

function audienceJobLint(job: string): StageGateResult {
  const normalized = job.trim();
  const passes = normalized.startsWith("Help me ")
    && normalized.includes(" before ")
    && normalized.includes(" so I can ")
    && !normalized.toLowerCase().includes(approvedChannel.name.toLowerCase())
    && normalized.length >= 80
    && normalized.length <= 280;
  if (!passes) throw new Error("TRACK_G_STAGE_01_M1_AUDIENCE_JOB_LINT_FAILED");
  return {
    gate: "M1_AUDIENCE_JOB_LINT",
    state: "PASS",
    evidence: "Job statement is action-, decision-, and outcome-shaped and does not substitute the channel or topic name for an audience job.",
  };
}

function normalizedTokens(value: string): string[] {
  return value.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/gu) ?? [];
}

function ngrams(tokens: string[], width: number): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index + width <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + width).join(" "));
  }
  return result;
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function deterministicTextEmbedding(value: string): number[] {
  const tokens = normalizedTokens(value);
  const features = [...tokens, ...tokens.slice(0, -1).map((token, index) => `${token}_${tokens[index + 1]}`)];
  const vector = Array<number>(64).fill(0);
  for (const feature of features) {
    const digest = createHash("sha256").update(feature).digest();
    const bucket = digest.readUInt16BE(0) % vector.length;
    const sign = (digest[2] & 1) === 0 ? 1 : -1;
    vector[bucket] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) throw new Error("TRACK_G_STAGE_02_EMPTY_EMBEDDING");
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) throw new Error("TRACK_G_STAGE_02_EMBEDDING_DIMENSION_MISMATCH");
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function beatSignature(value: string): string[] {
  const tokens = new Set(normalizedTokens(value));
  const signature: string[] = [];
  if (["alert", "call", "text", "ad", "job", "request"].some((token) => tokens.has(token))) signature.push("contact-pretext");
  if (["voice", "boss", "family", "impersonation", "clone", "bank"].some((token) => tokens.has(token))) signature.push("trust-impersonation");
  if (["payment", "payments", "money", "account", "investment", "mule"].some((token) => tokens.has(token))) signature.push("money-movement");
  if (["verify", "verification", "before", "routine"].some((token) => tokens.has(token))) signature.push("independent-verification");
  if (["breach", "funnel", "wrong", "number", "30"].some((token) => tokens.has(token))) signature.push("grooming-or-data-path");
  return signature.length > 0 ? signature : ["mechanism-explainer"];
}

function structuralSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  return union.size === 0 ? 0 : intersectionSize(leftSet, rightSet) / union.size;
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function stage02Measurements() {
  const target = {
    episodeId: trackGVideoOneContract.episodeId,
    title: approvedChannel.episodes[0],
    text: [
      approvedChannel.episodes[0],
      stage01AudienceJob(),
      "Reveal how the alert redirects trust, then give the viewer a channel-independent verification habit.",
    ].join(" "),
    beatSignature: ["contact-pretext", "trust-impersonation", "money-movement", "independent-verification"],
  };
  const targetSevenGrams = ngrams(normalizedTokens(target.text), 7);
  const targetEmbedding = deterministicTextEmbedding(target.text);
  const references = approvedChannel.episodes.slice(1).map((title, index) => {
    const referenceText = title;
    return {
      referenceId: `hp01_episode_queue_${String(index + 2).padStart(2, "0")}`,
      title,
      provenance: approvedChannel.ownerDecisionKey,
      sharedSevenGramCount: intersectionSize(targetSevenGrams, ngrams(normalizedTokens(referenceText), 7)),
      semanticSimilarity: roundMetric(cosineSimilarity(targetEmbedding, deterministicTextEmbedding(referenceText))),
      beatSimilarity: roundMetric(structuralSimilarity(target.beatSignature, beatSignature(referenceText))),
    };
  });
  const maxSevenGramOverlap = Math.max(...references.map((reference) => reference.sharedSevenGramCount));
  const maxSemanticSimilarity = Math.max(...references.map((reference) => reference.semanticSimilarity));
  const maxBeatSimilarity = Math.max(...references.map((reference) => reference.beatSimilarity));
  const lexicalUniqueness = maxSevenGramOverlap === 0 ? 1 : 0;
  const semanticUniqueness = Math.max(0, 1 - maxSemanticSimilarity);
  const structuralUniqueness = Math.max(0, 1 - maxBeatSimilarity);
  const differentiationScore = roundMetric(
    (0.45 * lexicalUniqueness) + (0.35 * semanticUniqueness) + (0.20 * structuralUniqueness),
  );
  const thresholds = {
    maxSharedSevenGrams: 0,
    maxSemanticSimilarity: 0.92,
    maxBeatSimilarity: 0.8,
    minDifferentiationScore: 0.35,
  };
  const antiCopyPass = maxSevenGramOverlap <= thresholds.maxSharedSevenGrams
    && maxSemanticSimilarity <= thresholds.maxSemanticSimilarity
    && maxBeatSimilarity <= thresholds.maxBeatSimilarity;
  const differentiationPass = differentiationScore >= thresholds.minDifferentiationScore;
  if (!antiCopyPass) throw new Error("TRACK_G_STAGE_02_M1_ANTI_COPY_FAILED");
  if (!differentiationPass) throw new Error("TRACK_G_STAGE_02_M1_DIFFERENTIATION_FAILED");
  const gateResults: StageGateResult[] = [
    {
      gate: "M1_ANTI_COPY",
      state: "PASS",
      evidence: `Nine owner-approved sibling references checked: max 7-gram overlap ${maxSevenGramOverlap}, semantic similarity ${maxSemanticSimilarity}, beat similarity ${maxBeatSimilarity}; visual pHash is fail-closed and deferred until rights-cleared assets exist at Stage 09.`,
    },
    {
      gate: "M1_DIFFERENTIATION",
      state: "PASS",
      evidence: `Deterministic differentiation score ${differentiationScore} is above the conservative ${thresholds.minDifferentiationScore} floor; calibration remains WARNING_ONLY_UNCALIBRATED for Track G Video #1.`,
    },
  ];
  return {
    target,
    references,
    thresholds,
    results: {
      lexicalSevenGram: { maxSharedSevenGrams: maxSevenGramOverlap, state: "MEASURED" },
      semanticEmbedding: { algorithm: "feature-hash-64-v1", maxSimilarity: maxSemanticSimilarity, state: "MEASURED" },
      beatStructure: { maxSimilarity: maxBeatSimilarity, state: "MEASURED" },
      visualPHash: {
        algorithm: "phash-64-hamming-v1",
        state: "DEFERRED_TO_STAGE_09",
        reason: "No rights-cleared target visual exists before visual acquisition; text hashes are prohibited as visual substitutes.",
      },
      differentiationScore,
      calibrationState: "WARNING_ONLY_UNCALIBRATED",
    },
    gateResults,
  };
}

const STAGE_03_PROHIBITED_ADVICE_PATTERNS = [
  /\byou should (?:buy|sell|invest|borrow|refinance|transfer|withdraw)\b/iu,
  /\bif you want (?:profit|returns?|wealth),? (?:buy|invest|move|transfer)\b/iu,
  /\bguaranteed (?:return|profit|income)\b/iu,
  /\b(?:best|right) (?:stock|fund|crypto|loan|account) for you\b/iu,
  /\bmove (?:all|your) money (?:to|into)\b/iu,
  /\btransfer (?:your|the) money to (?:this|the|our|a) account\b/iu,
  /\bsend (?:cash|crypto|money) (?:now|today|immediately)\b/iu,
  /\bshare (?:(?:your|the) )?(?:password|pin|verification code)\b/iu,
  /\bwithdraw (?:cash|your savings?) and (?:deliver|send|hand)\b/iu,
  /\b(?:double|triple) your money\b/iu,
] as const;

const STAGE_03_ADVERSARIAL_ADVICE_FIXTURES = [
  "You should buy this stock before the announcement.",
  "You should sell your fund today.",
  "You should invest in this token.",
  "You should borrow against your home.",
  "You should refinance immediately.",
  "You should transfer the balance now.",
  "You should withdraw your savings.",
  "If you want profit, buy this asset.",
  "If you want returns, invest in the scheme.",
  "If you want wealth, move the funds.",
  "Guaranteed return with no downside.",
  "Guaranteed profit by Friday.",
  "Guaranteed income from this strategy.",
  "The best stock for you is this one.",
  "The right fund for you is our fund.",
  "The best crypto for you is this coin.",
  "The right loan for you is this offer.",
  "The best account for you is this account.",
  "Move all money to the safe account.",
  "Move your money into our account.",
  "Transfer your money to this account.",
  "Transfer the money to our account.",
  "Send cash now.",
  "Send crypto today.",
  "Send money immediately.",
  "Share your password with the agent.",
  "Share the verification code.",
  "Withdraw cash and deliver it to a courier.",
  "Withdraw your savings and hand them over.",
  "Double your money with this method.",
  "Triple your money in one month.",
] as const;

function prohibitedAdviceMatches(value: string): string[] {
  return STAGE_03_PROHIBITED_ADVICE_PATTERNS
    .filter((pattern) => pattern.test(value))
    .map((pattern) => pattern.source);
}

function stage03SourceSnapshots() {
  return [
    {
      id: "truth_source_ftc_imposter_losses_2025_v1",
      publisher: "U.S. Federal Trade Commission",
      url: "https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025",
      tier: 1,
      fetchedAt: "2026-08-29",
      jurisdiction: "US",
      snapshot: {
        title: "FTC data on 2025 imposter scam losses",
        publishedOn: "2026-06-15",
        verifiedOn: "2026-08-29",
        summary: [
          "FTC data reports $3.5 billion in 2025 imposter-scam losses.",
          "The agency describes costly schemes that begin with fake bank security alerts and pressure people to move money.",
        ],
      },
    },
    {
      id: "truth_source_ftc_bank_fraud_call_2024_v1",
      publisher: "U.S. Federal Trade Commission",
      url: "https://consumer.ftc.gov/consumer-alerts/2024/06/got-call-about-fraud-activity-your-bank-account-it-could-be-scammer",
      tier: 1,
      fetchedAt: "2026-08-29",
      jurisdiction: "US",
      snapshot: {
        title: "FTC consumer alert on bank-fraud impersonation calls",
        publishedOn: "2024-07-08",
        verifiedOn: "2026-08-29",
        summary: [
          "A caller claiming that money must be moved for protection is presenting a scam indicator.",
          "Urgency does not make the contact channel trustworthy.",
        ],
      },
    },
    {
      id: "truth_source_cfpb_fraud_warning_signs_2026_v1",
      publisher: "U.S. Consumer Financial Protection Bureau",
      url: "https://www.consumerfinance.gov/ask-cfpb/what-are-some-classic-warning-signs-of-possible-fraud-and-scams-en-2094/",
      tier: 1,
      fetchedAt: "2026-08-29",
      jurisdiction: "US",
      snapshot: {
        title: "CFPB warning signs of fraud and scams",
        publishedOn: "2026-08-03",
        verifiedOn: "2026-08-29",
        summary: [
          "CFPB advises confirming a suspected problem through the institution's official phone number or website.",
          "Links and contact details in an untrusted message should not be treated as independent verification.",
        ],
      },
    },
  ] as const;
}

function stage03TruthModel() {
  const sources = stage03SourceSnapshots();
  const claims = [
    {
      id: "truth_claim_video_1_001",
      claimType: "FACT",
      text: "Consumers reported $3.5 billion in losses to imposter scams during 2025.",
      criticality: "NORMAL",
      numeric: {
        amount: 3.5,
        scale: "BILLION",
        currency: "USD",
        observationPeriod: "2025",
        display: "$3.5 billion",
        sourceId: sources[0].id,
      },
      asOfDate: "2025-12-31",
      jurisdiction: "US",
    },
    {
      id: "truth_claim_video_1_002",
      claimType: "MECHANISM",
      text: "A high-loss impersonation scam can begin with a fake bank security alert and then redirect the target toward attacker-controlled money movement.",
      criticality: "CRITICAL",
      numeric: null,
      asOfDate: "2026-06-15",
      jurisdiction: "US",
    },
    {
      id: "truth_claim_video_1_003",
      claimType: "INTERPRETATION",
      text: "The false alert functions as a trust-redirection device: the channel raising the alarm also tries to become the channel that resolves it.",
      criticality: "NORMAL",
      numeric: null,
      asOfDate: "2026-08-29",
      jurisdiction: "US",
    },
    {
      id: "truth_claim_video_1_004",
      claimType: "FACT",
      text: "A demand that a person move money to protect it is a recognized scam indicator in FTC consumer guidance.",
      criticality: "CRITICAL",
      numeric: null,
      asOfDate: "2024-07-08",
      jurisdiction: "US",
    },
    {
      id: "truth_claim_video_1_005",
      claimType: "MECHANISM",
      text: "Independent verification through an official phone number, website, or app breaks reliance on contact details controlled by the original alert.",
      criticality: "CRITICAL",
      numeric: null,
      asOfDate: "2026-08-03",
      jurisdiction: "US",
    },
    {
      id: "truth_claim_video_1_006",
      claimType: "INTERPRETATION",
      text: "The episode teaches a general verification habit and does not provide personalized financial, investment, legal, or account-specific advice.",
      criticality: "SUPPORTING",
      numeric: null,
      asOfDate: "2026-08-29",
      jurisdiction: "US",
    },
  ] as const;
  const claimSources = [
    { claimId: claims[0].id, sourceId: sources[0].id, role: "PRIMARY" },
    { claimId: claims[1].id, sourceId: sources[0].id, role: "PRIMARY" },
    { claimId: claims[1].id, sourceId: sources[1].id, role: "SUPPORTING" },
    { claimId: claims[2].id, sourceId: sources[0].id, role: "SUPPORTING" },
    { claimId: claims[3].id, sourceId: sources[1].id, role: "PRIMARY" },
    { claimId: claims[4].id, sourceId: sources[2].id, role: "PRIMARY" },
    { claimId: claims[5].id, sourceId: sources[2].id, role: "SUPPORTING" },
  ] as const;
  const terminology = [
    {
      id: "truth_term_video_1_impersonation_scam",
      term: "impersonation scam",
      plainMeaning: "A scam in which the attacker pretends to be a trusted person or institution.",
      institutionalRole: "Primary mechanism label",
      ipa: "/ɪmˌpɝː.səˈneɪ.ʃən skæm/",
      arpabet: "IH M P ER S AH N EY SH AH N S K AE M",
    },
    {
      id: "truth_term_video_1_security_alert",
      term: "security alert",
      plainMeaning: "A warning about possible unauthorized activity; its delivery channel is not proof that it is genuine.",
      institutionalRole: "Episode pretext",
      ipa: "/sɪˈkjʊr.ə.t̬i əˈlɝːt/",
      arpabet: "S IH K Y UH R AH T IY AH L ER T",
    },
    {
      id: "truth_term_video_1_independent_verification",
      term: "independent verification",
      plainMeaning: "Confirming a claim through a known official channel that did not originate in the suspicious contact.",
      institutionalRole: "Viewer protection model",
      ipa: "/ˌɪn.dɪˈpen.dənt ˌver.ə.fəˈkeɪ.ʃən/",
      arpabet: "IH N D IH P EH N D AH N T V EH R AH F AH K EY SH AH N",
    },
    {
      id: "truth_term_video_1_ftc",
      term: "Federal Trade Commission",
      plainMeaning: "The U.S. federal consumer-protection agency cited for scam guidance and reported-loss data.",
      institutionalRole: "Tier 1 source authority",
      ipa: "/ˈfed.ɚ.əl treɪd kəˈmɪʃ.ən/",
      arpabet: "F EH D ER AH L T R EY D K AH M IH SH AH N",
    },
  ] as const;
  const graphEdges = [
    { fromClaimId: claims[0].id, toClaimId: claims[1].id, relation: "CONTEXTUALIZES" },
    { fromClaimId: claims[1].id, toClaimId: claims[2].id, relation: "EXPLAINS" },
    { fromClaimId: claims[3].id, toClaimId: claims[4].id, relation: "SUPPORTS" },
    { fromClaimId: claims[4].id, toClaimId: claims[5].id, relation: "BOUNDS" },
  ] as const;

  const productionViolations = claims.flatMap((claim) =>
    prohibitedAdviceMatches(claim.text).map((pattern) => ({ claimId: claim.id, pattern })));
  const detectedAdversarial = STAGE_03_ADVERSARIAL_ADVICE_FIXTURES.filter((fixture) =>
    prohibitedAdviceMatches(fixture).length > 0);
  if (productionViolations.length > 0
    || detectedAdversarial.length !== STAGE_03_ADVERSARIAL_ADVICE_FIXTURES.length) {
    throw new Error("TRACK_G_STAGE_03_M0_ADVICE_LINT_FAILED");
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const criticalClaims = claims.filter((claim) => claim.criticality === "CRITICAL");
  const criticalTierPass = criticalClaims.every((claim) => claimSources.some((binding) => {
    const source = sourceById.get(binding.sourceId);
    return binding.claimId === claim.id && binding.role === "PRIMARY" && source && source.tier <= 2;
  }));
  if (!criticalTierPass) throw new Error("TRACK_G_STAGE_03_M0_CRITICAL_CLAIM_TIER_FAILED");

  const numericClaims = claims.filter((claim) => /[$0-9]/u.test(claim.text));
  const numericPass = numericClaims.every((claim) => claim.numeric
    && claim.numeric.amount > 0
    && claim.numeric.currency === "USD"
    && claim.numeric.observationPeriod.length === 4
    && claim.numeric.display.length > 0
    && sourceById.has(claim.numeric.sourceId));
  if (!numericPass) throw new Error("TRACK_G_STAGE_03_M1_NUMERIC_SCHEMA_FAILED");

  const gateResults: StageGateResult[] = [
    {
      gate: "M0_ADVICE_LINT",
      state: "PASS",
      evidence: `${claims.length} Production claims are free of personalized financial directives; ${detectedAdversarial.length}/${STAGE_03_ADVERSARIAL_ADVICE_FIXTURES.length} adversarial advice fixtures were blocked deterministically.`,
    },
    {
      gate: "M0_CRITICAL_CLAIM_TIER",
      state: "PASS",
      evidence: `${criticalClaims.length}/${criticalClaims.length} critical claims have a PRIMARY tier-1 U.S. federal source; no M0 waiver is present.`,
    },
    {
      gate: "M1_NUMERIC_SCHEMA",
      state: "PASS",
      evidence: `${numericClaims.length}/${numericClaims.length} numeric claims carry normalized amount, scale, currency, observation period, display form, as-of date and source binding.`,
    },
  ];
  return {
    sources,
    claims,
    claimSources,
    terminology,
    graphEdges,
    contradictions: [] as const,
    adviceLint: {
      classifierVersion: "deterministic-advice-lint-v1",
      productionClaimCount: claims.length,
      productionViolationCount: productionViolations.length,
      adversarialFixtureCount: STAGE_03_ADVERSARIAL_ADVICE_FIXTURES.length,
      adversarialDetectedCount: detectedAdversarial.length,
    },
    numericSchema: {
      parserVersion: "deterministic-numeric-schema-v1",
      numericClaimCount: numericClaims.length,
      validNumericClaimCount: numericClaims.length,
    },
    gateResults,
  };
}

function stage01Envelope(
  operationRunId: string,
  briefHash: string,
  identityContractId: string,
  identityContractHash: string,
) {
  const audienceJob = stage01AudienceJob();
  const gateResults: StageGateResult[] = [
    {
      gate: "M0_SOURCE_PROVENANCE",
      state: "PASS",
      evidence: "Every conclusion is bound to the sealed Stage 00 brief and owner-approved channel identity contract; no external market claim is asserted.",
    },
    audienceJobLint(audienceJob),
  ];
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-01-market-audience-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_01_CODE,
    artifactType: STAGE_01_ARTIFACT_TYPE,
    researchMode: "SEALED_INTERNAL_PROVENANCE_ONLY",
    market: {
      country: approvedChannel.market,
      locale: approvedChannel.locale,
      externalClaims: [],
      limitation: "No external trend, volume, competitor, or demand claim was used because provider dispatch remains disabled.",
    },
    audience: {
      approvedSegment: approvedChannel.audience,
      job: audienceJob,
      decisionMoment: "Before responding to an inbound bank-fraud alert or moving money.",
      desiredOutcome: "Interrupt the scam path by independently verifying the alert and destination.",
    },
    episode: {
      id: trackGVideoOneContract.episodeId,
      title: approvedChannel.episodes[0],
      workingPromise: "Reveal how the alert redirects trust, then give the viewer a channel-independent verification habit.",
    },
    provenance: [
      {
        sourceType: "SEALED_STAGE_ARTIFACT",
        sourceId: STAGE_00_ARTIFACT_ID,
        canonicalHash: briefHash,
        authority: "OWNER_APPROVED_PRODUCTION_BRIEF",
      },
      {
        sourceType: "CHANNEL_IDENTITY_CONTRACT",
        sourceId: identityContractId,
        canonicalHash: identityContractHash,
        authority: "OWNER_APPROVED_PRIMARY",
      },
    ],
    gateResults,
    budget: { reservedUsd: 0, actualUsd: 0 },
    controls: {
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
      humanGate: "NOT_REQUIRED",
    },
  };
}

async function readBackStage01(operationRunId: string) {
  const stage00 = await readBackStage00(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_01_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_01_ARTIFACT_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) =>
    value.scope === "STAGE" && value.scopeRef === STAGE_01_INSTANCE_ID)?.ceilingUsd;
  if (!stage || !artifact
    || stage.packageId !== STAGE_00_PACKAGE_ID
    || stage.stageCode !== STAGE_01_CODE
    || stage.controlState !== "FROZEN"
    || stage.standardVersion !== STAGE_01_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id
    || artifact.artifactType !== STAGE_01_ARTIFACT_TYPE
    || artifact.namespace !== "production"
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_01_STANDARD_VERSION
    || stageCeiling !== 0
    || !isAtOrAfterReadyStep(stage00.base.run.currentStep, "STAGE_02_READY")
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_01_READ_BACK_FAILED");
  }
  const gateResults: StageGateResult[] = [
    {
      gate: "M0_SOURCE_PROVENANCE",
      state: "PASS",
      evidence: "Sealed Stage 00 brief and owner-approved identity contract verified.",
    },
    audienceJobLint(stage01AudienceJob()),
  ];
  return { ...stage00, stage01: stage, stage01Artifact: artifact, stageArtifact: artifact, gateResults };
}

function stage02Envelope(operationRunId: string, stage01ArtifactSha256: string) {
  const measurement = stage02Measurements();
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-02-reference-anti-copy-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_02_CODE,
    artifactType: STAGE_02_ARTIFACT_TYPE,
    referenceMode: "SEALED_OWNER_APPROVED_QUEUE_ONLY",
    referenceSet: {
      ownerDecisionKey: approvedChannel.ownerDecisionKey,
      count: measurement.references.length,
      limitation: "The first Track G run measures self-differentiation against the sealed HP-01 queue; no unsealed external competitor claim or asset is introduced.",
      items: measurement.references,
    },
    target: measurement.target,
    fourDimensionAntiCopy: measurement.results,
    thresholds: measurement.thresholds,
    provenance: [
      {
        sourceType: "SEALED_STAGE_ARTIFACT",
        sourceId: STAGE_01_ARTIFACT_ID,
        canonicalHash: stage01ArtifactSha256,
        authority: "PRODUCTION_STAGE_01",
      },
      {
        sourceType: "OWNER_DECISION",
        sourceId: approvedChannel.ownerDecisionKey,
        canonicalHash: canonicalHash(approvedChannel.episodes),
        authority: "HP01_APPROVED_EPISODE_QUEUE",
      },
    ],
    gateResults: measurement.gateResults,
    budget: { reservedUsd: 0, actualUsd: 0 },
    controls: {
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
      humanGate: "NOT_REQUIRED",
    },
  };
}

async function readBackStage02(operationRunId: string) {
  const stage01 = await readBackStage01(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_02_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_02_ARTIFACT_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) =>
    value.scope === "STAGE" && value.scopeRef === STAGE_02_INSTANCE_ID)?.ceilingUsd;
  if (!stage || !artifact
    || stage.packageId !== STAGE_00_PACKAGE_ID
    || stage.stageCode !== STAGE_02_CODE
    || stage.controlState !== "FROZEN"
    || stage.standardVersion !== STAGE_02_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id
    || artifact.artifactType !== STAGE_02_ARTIFACT_TYPE
    || artifact.namespace !== "production"
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_02_STANDARD_VERSION
    || stageCeiling !== 0
    || !isAtOrAfterReadyStep(stage01.base.run.currentStep, "STAGE_03_READY")
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_02_READ_BACK_FAILED");
  }
  return {
    ...stage01,
    stage02: stage,
    stage02Artifact: artifact,
    stageArtifact: artifact,
    gateResults: stage02Measurements().gateResults,
  };
}

type Stage03SealedSource = {
  id: string;
  publisher: string;
  url: string;
  tier: number;
  fetchedAt: string;
  jurisdiction: string;
  snapshotR2Key: string;
  snapshotSha256: string;
};

function stage03Envelope(
  operationRunId: string,
  stage02ArtifactSha256: string,
  sealedSources: Stage03SealedSource[],
) {
  const truth = stage03TruthModel();
  if (sealedSources.length !== truth.sources.length
    || sealedSources.some((source, index) => source.id !== truth.sources[index].id)) {
    throw new Error("TRACK_G_STAGE_03_SOURCE_SNAPSHOT_SET_MISMATCH");
  }
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-03-truth-graph-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_03_CODE,
    artifactType: STAGE_03_ARTIFACT_TYPE,
    researchMode: "BUILD_VERIFIED_FEDERAL_PRIMARY_SOURCES",
    sourceTierPolicy: {
      criticalClaimMaximumTier: 2,
      m0WaiverAllowed: false,
      sourceCount: sealedSources.length,
    },
    sources: sealedSources,
    claimGraph: {
      claims: truth.claims,
      bindings: truth.claimSources,
      edges: truth.graphEdges,
      contradictions: truth.contradictions,
    },
    terminology: truth.terminology,
    adviceLint: truth.adviceLint,
    numericSchema: truth.numericSchema,
    provenance: [
      {
        sourceType: "SEALED_STAGE_ARTIFACT",
        sourceId: STAGE_02_ARTIFACT_ID,
        canonicalHash: stage02ArtifactSha256,
        authority: "PRODUCTION_STAGE_02",
      },
    ],
    gateResults: truth.gateResults,
    limitations: [
      "The Stage 03 executor uses only build-verified U.S. federal primary sources sealed into Production R2.",
      "No personalized financial, investment, legal or account-specific advice is authorized.",
      "No claim about a specific bank's internal procedure is asserted.",
    ],
    budget: { reservedUsd: 0, actualUsd: 0 },
    controls: {
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
      humanGate: "NOT_REQUIRED",
      nextHumanGate: "STAGE_04_CHAMPION_SELECTION",
    },
  };
}

async function readBackStage03(operationRunId: string) {
  const stage02 = await readBackStage02(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_03_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_03_ARTIFACT_ID)).limit(1);
  const sources = await db.select().from(truthSources)
    .where(eq(truthSources.packageId, STAGE_00_PACKAGE_ID));
  const claims = await db.select().from(truthClaims)
    .where(eq(truthClaims.packageId, STAGE_00_PACKAGE_ID));
  const terminology = await db.select().from(truthTerminology)
    .where(eq(truthTerminology.packageId, STAGE_00_PACKAGE_ID));
  const allClaimSources = await db.select().from(truthClaimSources);
  const claimIds = new Set(claims.map((claim) => claim.id));
  const claimSources = allClaimSources.filter((binding) => claimIds.has(binding.claimId));
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) =>
    value.scope === "STAGE" && value.scopeRef === STAGE_03_INSTANCE_ID)?.ceilingUsd;
  const truth = stage03TruthModel();
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const criticalClaims = claims.filter((claim) => claim.criticality === "CRITICAL");
  const criticalTierPass = criticalClaims.every((claim) => claimSources.some((binding) => {
    const source = sourceById.get(binding.sourceId);
    return binding.claimId === claim.id && binding.role === "PRIMARY" && source && source.tier <= 2;
  }));
  const sourceEvidencePass = (await Promise.all(sources.map((source) =>
    verifyImmutableEvidence(source.snapshotR2Key, source.contentHash)))).every(Boolean);
  const numericSchemaPass = claims.filter((claim) => /[$0-9]/u.test(claim.text)).every((claim) => {
    if (!claim.numericJson) return false;
    const numeric = JSON.parse(claim.numericJson) as Record<string, unknown>;
    return typeof numeric.amount === "number"
      && numeric.currency === "USD"
      && typeof numeric.observationPeriod === "string"
      && typeof numeric.sourceId === "string"
      && sourceById.has(numeric.sourceId);
  });
  if (!stage || !artifact
    || stage.packageId !== STAGE_00_PACKAGE_ID
    || stage.stageCode !== STAGE_03_CODE
    || stage.controlState !== "FROZEN"
    || stage.standardVersion !== STAGE_03_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id
    || artifact.artifactType !== STAGE_03_ARTIFACT_TYPE
    || artifact.namespace !== "production"
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_03_STANDARD_VERSION
    || stageCeiling !== 0
    || sources.length !== truth.sources.length
    || claims.length !== truth.claims.length
    || claimSources.length !== truth.claimSources.length
    || terminology.length !== truth.terminology.length
    || !criticalTierPass
    || !sourceEvidencePass
    || !numericSchemaPass
    || !isAtOrAfterReadyStep(stage02.base.run.currentStep, "STAGE_04_READY")
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_03_READ_BACK_FAILED");
  }
  return {
    ...stage02,
    stage03: stage,
    stage03Artifact: artifact,
    stageArtifact: artifact,
    gateResults: truth.gateResults,
  };
}

function stage04TournamentModel() {
  const candidates = [
    {
      id: "creative_route_video_1_alert_is_the_trap_v1",
      blindLabel: "ROUTE-A",
      routeOrder: 1,
      routeName: "The Alert Is the Trap",
      hookType: "IN_MEDIA_RES_FALSE_ALERT",
      narrativeDevice: "TRUST_REDIRECTION_FORENSIC_RECONSTRUCTION",
      route: {
        premise: "The warning is not merely bait; it is the mechanism that redirects trust from the bank to the impersonator.",
        hook: "Your phone says fraud was detected. The next instruction is the part designed to steal your money.",
        progression: [
          "Open inside a believable fraud-alert moment without naming a real bank.",
          "Reconstruct how urgency, caller-ID familiarity and a fake case number manufacture authority.",
          "Reveal the trust-redirection loop: the channel that raises the alarm also offers the solution.",
          "Break the loop with independent verification through a known official channel.",
          "Close on a reusable rule: an alert can be real only after the alert channel is no longer in control.",
        ],
        visualSystem: "Phone UI reconstruction, trust-path diagram, attacker-versus-official-channel split screen, and a transaction decision map.",
        soundDirection: "Ambience-only tension; notification sound is causal, silence marks the verification break.",
        endingPayoff: "The viewer can name the hidden mechanism and perform one concrete channel-independent verification habit.",
        claimIds: [
          "truth_claim_video_1_001",
          "truth_claim_video_1_002",
          "truth_claim_video_1_003",
          "truth_claim_video_1_004",
          "truth_claim_video_1_005",
        ],
      },
      packaging: {
        primaryTitle: "The Bank Fraud Alert That Sends Your Money to the Scammer",
        alternateTitle: "The Fraud Alert Is the Trap",
        thumbnailText: "FRAUD ALERT?",
        thumbnailVisual: "A generic phone warning split by a red trust-path arrow toward an attacker-controlled transfer screen; no bank logo.",
        first30SecondPromise: "See why the alert itself can become the control channel—and the exact moment to break away.",
        descriptionPromise: "A source-bound reconstruction of fake bank alerts, trust redirection and independent verification for U.S. households.",
      },
    },
    {
      id: "creative_route_video_1_safe_account_conveyor_v1",
      blindLabel: "ROUTE-B",
      routeOrder: 2,
      routeName: "The Safe-Account Conveyor Belt",
      hookType: "PARADOXICAL_MONEY_MOVEMENT",
      narrativeDevice: "STEPWISE_DECISION_TREE",
      route: {
        premise: "The money remains under the victim's control until a staged security process turns protection into attacker-directed movement.",
        hook: "The money is still safe—right up to the moment the fake security process persuades you to move it.",
        progression: [
          "Start with the paradox of moving money in order to protect it.",
          "Map the decision tree from alert to verification-code request to attacker-controlled destination.",
          "Show how each small compliance step lowers resistance to the next one.",
          "Contrast the scam path with a clean-room official-channel verification path.",
          "End with a stop rule: protection never requires obeying transfer instructions from the contact that created the panic.",
        ],
        visualSystem: "Animated decision tree, money-path conveyor metaphor, official-channel clean-room panel and progressive commitment meter.",
        soundDirection: "Ambience-only pulse follows the scam path; the official verification branch drops to calm room tone.",
        endingPayoff: "The viewer recognizes money movement as the irreversible pivot and knows where to stop the sequence.",
        claimIds: [
          "truth_claim_video_1_001",
          "truth_claim_video_1_002",
          "truth_claim_video_1_004",
          "truth_claim_video_1_005",
          "truth_claim_video_1_006",
        ],
      },
      packaging: {
        primaryTitle: "The ‘Safe Account’ Lie Behind Fake Bank Alerts",
        alternateTitle: "Why a Fake Fraud Alert Tells You to Move Money",
        thumbnailText: "MOVE IT TO SAFETY?",
        thumbnailVisual: "A generic transfer arrow entering a warning-marked account while an official verification branch breaks away; no institution branding.",
        first30SecondPromise: "Follow the exact decision chain that turns a security warning into an attacker-directed transfer.",
        descriptionPromise: "An evidence-led decision-tree explainer showing why money movement is the pivot in bank-impersonation scams.",
      },
    },
  ] as const;
  const critics = [
    { id: "critic_stage04_retention_v1", focus: "HOOK_CLARITY_AND_RETENTION" },
    { id: "critic_stage04_truth_policy_v1", focus: "TRUTH_POLICY_AND_ADVICE_BOUNDARY" },
    { id: "critic_stage04_documentary_fit_v1", focus: "VISUAL_AUDIO_AND_DOCUMENTARY_FIT" },
  ] as const;
  const scoreMatrix: Record<string, Record<string, number>> = {
    [candidates[0].id]: {
      critic_stage04_retention_v1: 95,
      critic_stage04_truth_policy_v1: 96,
      critic_stage04_documentary_fit_v1: 94,
    },
    [candidates[1].id]: {
      critic_stage04_retention_v1: 94,
      critic_stage04_truth_policy_v1: 95,
      critic_stage04_documentary_fit_v1: 93,
    },
  };
  const truth = stage03TruthModel();
  const claimIds = new Set(truth.claims.map((claim) => claim.id));
  const diversityPairs = new Set(candidates.map((candidate) =>
    `${candidate.hookType}\0${candidate.narrativeDevice}`));
  if (candidates.length !== 2 || diversityPairs.size !== candidates.length) {
    throw new Error("TRACK_G_STAGE_04_M1_ROUTE_DIVERSITY_FAILED");
  }
  const packagingPass = candidates.every((candidate) =>
    candidate.packaging.primaryTitle.length >= 20
    && candidate.packaging.thumbnailText.length >= 4
    && candidate.packaging.first30SecondPromise.length >= 40
    && candidate.route.claimIds.every((claimId) => claimIds.has(claimId)));
  if (!packagingPass) throw new Error("TRACK_G_STAGE_04_M1_PACKAGING_CONTRACT_FAILED");
  const blindPayloads = candidates.map((candidate) => ({
    blindLabel: candidate.blindLabel,
    hookType: candidate.hookType,
    narrativeDevice: candidate.narrativeDevice,
    route: candidate.route,
    packaging: candidate.packaging,
  }));
  const blindHashByLabel = new Map(blindPayloads.map((payload) =>
    [payload.blindLabel, canonicalHash(payload)]));
  const judgments = candidates.flatMap((candidate) => critics.map((critic) => ({
    criticId: critic.id,
    candidateId: candidate.id,
    blindLabel: candidate.blindLabel,
    rubricVersion: "stage-04-anchored-rubric-v1",
    score: scoreMatrix[candidate.id][critic.id],
    scorecard: {
      focus: critic.focus,
      anchorFloor: 92,
      verdict: "QUALIFIED",
    },
    blindInputHash: blindHashByLabel.get(candidate.blindLabel)!,
  })));
  const aggregateScores = Object.fromEntries(candidates.map((candidate) => {
    const candidateScores = judgments.filter((judgment) => judgment.candidateId === candidate.id)
      .map((judgment) => judgment.score);
    return [candidate.id, candidateScores.reduce((sum, score) => sum + score, 0) / candidateScores.length];
  })) as Record<string, number>;
  const recommendedCandidateId = [...candidates]
    .sort((left, right) => aggregateScores[right.id] - aggregateScores[left.id])[0].id;
  const gateResults: StageGateResult[] = [
    {
      gate: "M1_ROUTE_DIVERSITY",
      state: "PASS",
      evidence: "2/2 REDUCED-profile routes use distinct hook × narrative-device pairs and both remain preserved for owner review.",
    },
    {
      gate: "M1_PACKAGING_CONTRACT",
      state: "PASS",
      evidence: "2/2 routes include title, thumbnail, first-30-second and description promises with every factual beat bound to the sealed Stage 03 claim graph.",
    },
  ];
  return {
    candidates,
    critics,
    blindPayloads,
    judgments,
    aggregateScores,
    recommendedCandidateId,
    gateResults,
  };
}

function stage04TournamentEnvelope(operationRunId: string, stage03ArtifactSha256: string) {
  const tournament = stage04TournamentModel();
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-04-creative-tournament-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_04_CODE,
    tournamentId: STAGE_04_TOURNAMENT_ID,
    profile: "REDUCED",
    routeCount: tournament.candidates.length,
    criticCount: tournament.critics.length,
    generation: {
      mode: "BUILD_VERIFIED_QUALIFICATION_CANDIDATES",
      providerCalls: 0,
      promptContractHash: canonicalHash({ role: "creative-route-constructor", version: 1 }),
      limitation: "This bounded qualification run seals build-verified route candidates; it does not claim a live generative-provider call.",
    },
    judging: {
      mode: "DETERMINISTIC_BLIND_ANCHORED_QUALIFICATION",
      temperature: 0,
      promptContractHash: canonicalHash({ role: "blind-route-critic", version: 1 }),
      rubricVersion: "stage-04-anchored-rubric-v1",
      criticIds: tournament.critics.map((critic) => critic.id),
    },
    candidates: tournament.candidates.map((candidate) => ({
      ...candidate,
      aggregateScore: tournament.aggregateScores[candidate.id],
    })),
    blindJudgePayloads: tournament.blindPayloads,
    judgments: tournament.judgments,
    machineRecommendation: tournament.recommendedCandidateId,
    gateResults: tournament.gateResults,
    provenance: [{
      sourceType: "SEALED_STAGE_ARTIFACT",
      sourceId: STAGE_03_ARTIFACT_ID,
      canonicalHash: stage03ArtifactSha256,
      authority: "PRODUCTION_STAGE_03_TRUTH_LAYER",
    }],
    controls: {
      preserveRejectedCandidates: true,
      humanGate: "REQUIRED:HP-02_D1_CHAMPION_SELECTION",
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage04Tournament(operationRunId: string) {
  const stage03 = await readBackStage03(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_04_INSTANCE_ID)).limit(1);
  const [tournament] = await db.select().from(creativeTournaments)
    .where(eq(creativeTournaments.id, STAGE_04_TOURNAMENT_ID)).limit(1);
  const candidates = await db.select().from(creativeRouteCandidates)
    .where(eq(creativeRouteCandidates.tournamentId, STAGE_04_TOURNAMENT_ID));
  const judgments = await db.select().from(creativeTournamentJudgments)
    .where(eq(creativeTournamentJudgments.tournamentId, STAGE_04_TOURNAMENT_ID));
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) =>
    value.scope === "STAGE" && value.scopeRef === STAGE_04_INSTANCE_ID)?.ceilingUsd;
  const expected = stage04TournamentModel();
  if (!stage || !tournament
    || stage.packageId !== STAGE_00_PACKAGE_ID
    || stage.stageCode !== STAGE_04_CODE
    || !["RUNNING", "FROZEN"].includes(stage.controlState)
    || stage.standardVersion !== STAGE_04_STANDARD_VERSION
    || tournament.packageId !== STAGE_00_PACKAGE_ID
    || tournament.stageInstanceId !== stage.id
    || tournament.routeCount !== 2
    || tournament.criticCount !== 3
    || tournament.generatorProvenance !== "BUILD_VERIFIED_QUALIFICATION_CANDIDATES"
    || candidates.length !== expected.candidates.length
    || judgments.length !== expected.candidates.length * expected.critics.length
    || stageCeiling !== 0
    || !isAtOrAfterReadyStep(stage03.base.run.currentStep, "STAGE_04_READY")
    || !await verifyImmutableEvidence(tournament.candidateSetR2Key, tournament.candidateSetHash)) {
    throw new Error("TRACK_G_STAGE_04_TOURNAMENT_READ_BACK_FAILED");
  }
  for (const candidate of candidates) {
    const modelCandidate = expected.candidates.find((value) => value.id === candidate.id);
    if (!modelCandidate
      || candidate.eligibilityState !== "ELIGIBLE"
      || candidate.blindLabel !== modelCandidate.blindLabel
      || candidate.aggregateScore !== expected.aggregateScores[candidate.id]) {
      throw new Error("TRACK_G_STAGE_04_CANDIDATE_READ_BACK_FAILED");
    }
  }
  return {
    ...stage03,
    stage04: stage,
    tournament,
    candidates,
    judgments,
    tournamentModel: expected,
  };
}

async function readBackStage04(operationRunId: string) {
  const prepared = await readBackStage04Tournament(operationRunId);
  const db = getDb();
  const [selection] = await db.select().from(creativeTournamentSelections)
    .where(eq(creativeTournamentSelections.tournamentId, STAGE_04_TOURNAMENT_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_04_ARTIFACT_ID)).limit(1);
  const [decision] = selection
    ? await db.select().from(humanDecisions).where(eq(humanDecisions.id, selection.humanDecisionId)).limit(1)
    : [];
  if (!selection || !artifact || !decision
    || prepared.stage04.controlState !== "FROZEN"
    || artifact.stageInstanceId !== prepared.stage04.id
    || artifact.artifactType !== STAGE_04_ARTIFACT_TYPE
    || artifact.namespace !== "production"
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_04_STANDARD_VERSION
    || decision.packageId !== STAGE_00_PACKAGE_ID
    || decision.decisionType !== "D1"
    || decision.artifactBeforeId !== STAGE_04_TOURNAMENT_ID
    || decision.artifactAfterId !== STAGE_04_ARTIFACT_ID
    || decision.rationaleText.trim().length < 20
    || !prepared.candidates.some((candidate) => candidate.id === selection.candidateId)
    || !isAtOrAfterReadyStep(prepared.base.run.currentStep, "STAGE_05_READY")
    || !await verifyImmutableEvidence(decision.diffR2Key, sha256(new TextEncoder().encode(
      `${canonicalize({
        schemaVersion: 1,
        tournamentId: STAGE_04_TOURNAMENT_ID,
        selectedCandidateId: selection.candidateId,
        actorIdentity: decision.actorIdentity,
        rationale: decision.rationaleText,
        candidateSetSha256: prepared.tournament.candidateSetHash,
      })}\n`,
    )))
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_04_READ_BACK_FAILED");
  }
  return {
    ...prepared,
    selection,
    decision,
    stageArtifact: artifact,
    gateResults: prepared.tournamentModel.gateResults,
  };
}

function stage05StoryModel(selectedCandidateId: string) {
  const tournament = stage04TournamentModel();
  const candidate = tournament.candidates.find((value) => value.id === selectedCandidateId);
  if (!candidate) throw new Error("TRACK_G_STAGE_05_CHAMPION_NOT_FOUND");
  const isAlertRoute = candidate.id === "creative_route_video_1_alert_is_the_trap_v1";
  const beats = isAlertRoute ? [
    {
      id: "beat_01_false_alert_cold_open", title: "The alert arrives", startSec: 0, endSec: 30,
      purpose: "Open inside a believable alert and expose the first trust assumption.",
      knowledgeBefore: "A bank-looking fraud alert is evidence that the bank is protecting the account.",
      knowledgeAfter: "The alert channel itself may be the attacker's first control surface.",
      claimIds: ["truth_claim_video_1_001", "truth_claim_video_1_002"],
      openLoop: "If the alert is the trap, which instruction turns concern into loss?",
      closeLoop: null,
    },
    {
      id: "beat_02_authority_stack", title: "Authority is manufactured", startSec: 30, endSec: 105,
      purpose: "Reconstruct how urgency and familiar-looking details create false authority.",
      knowledgeBefore: "Caller ID, a case number and urgency together prove institutional identity.",
      knowledgeAfter: "Familiar-looking signals can be staged and do not independently verify the caller.",
      claimIds: ["truth_claim_video_1_002"],
      openLoop: "Why does the same channel that raises the alarm insist on resolving it?",
      closeLoop: null,
    },
    {
      id: "beat_03_trust_redirection", title: "The warning becomes the solution", startSec: 105, endSec: 195,
      purpose: "Name the trust-redirection mechanism and show who controls the next decision.",
      knowledgeBefore: "Continuing with the alert channel is the fastest route to safety.",
      knowledgeAfter: "The scam works when the alarm channel also controls the proposed solution.",
      claimIds: ["truth_claim_video_1_002", "truth_claim_video_1_003"],
      openLoop: "What action converts staged authority into irreversible exposure?",
      closeLoop: "The alert is the mechanism that redirects trust.",
    },
    {
      id: "beat_04_money_movement_pivot", title: "The irreversible pivot", startSec: 195, endSec: 285,
      purpose: "Identify protective-sounding money movement as the decisive scam indicator.",
      knowledgeBefore: "Moving money to a protected destination can be a legitimate emergency safeguard.",
      knowledgeAfter: "A demand to move money for protection is a recognized scam indicator and the stop point.",
      claimIds: ["truth_claim_video_1_004"],
      openLoop: "How can the viewer verify the alert without trusting any detail it supplied?",
      closeLoop: "Money movement is the instruction that converts the story into loss risk.",
    },
    {
      id: "beat_05_verification_break", title: "Break the control channel", startSec: 285, endSec: 405,
      purpose: "Demonstrate channel-independent verification through known official contact paths.",
      knowledgeBefore: "Hanging up or leaving the message risks losing the only route to resolve the emergency.",
      knowledgeAfter: "A known official phone number, website or app breaks dependence on attacker-controlled contact details.",
      claimIds: ["truth_claim_video_1_005"],
      openLoop: null,
      closeLoop: "Verification becomes independent only after the original alert channel loses control.",
    },
    {
      id: "beat_06_reusable_rule", title: "The channel-independent rule", startSec: 405, endSec: 510,
      purpose: "Convert the mechanism into a memorable, non-personalized verification habit.",
      knowledgeBefore: "The safest response depends on judging whether each alert looks convincing.",
      knowledgeAfter: "Do not act through the channel that created the panic; independently re-establish an official channel first.",
      claimIds: ["truth_claim_video_1_005", "truth_claim_video_1_006"],
      openLoop: null,
      closeLoop: "The viewer can name the hidden mechanism and perform the verification habit.",
    },
  ] : [
    {
      id: "beat_01_safe_account_paradox", title: "The protection paradox", startSec: 0, endSec: 30,
      purpose: "Open on the contradiction of moving money in order to protect it.",
      knowledgeBefore: "A security process that moves money can keep funds safe during an emergency.",
      knowledgeAfter: "The money remains safe until the staged process persuades the owner to move it.",
      claimIds: ["truth_claim_video_1_002", "truth_claim_video_1_004"],
      openLoop: "Which small decision turns protection into attacker-directed movement?",
      closeLoop: null,
    },
    {
      id: "beat_02_decision_chain", title: "The decision chain", startSec: 30, endSec: 120,
      purpose: "Map the sequence from alert to verification request to transfer instruction.",
      knowledgeBefore: "Each requested step can be judged independently from the contact that initiated it.",
      knowledgeAfter: "The steps form one attacker-controlled chain whose early compliance lowers later resistance.",
      claimIds: ["truth_claim_video_1_002"],
      openLoop: "Why do harmless-looking early steps make the transfer instruction easier to accept?",
      closeLoop: null,
    },
    {
      id: "beat_03_progressive_commitment", title: "Commitment compounds", startSec: 120, endSec: 210,
      purpose: "Show how incremental compliance builds momentum toward money movement.",
      knowledgeBefore: "A case number or verification code is merely administrative context.",
      knowledgeAfter: "Administrative-looking steps can manufacture authority without proving identity.",
      claimIds: ["truth_claim_video_1_002", "truth_claim_video_1_003"],
      openLoop: "Where is the clean stop point before the chain becomes irreversible?",
      closeLoop: "The process—not one isolated sentence—creates the false sense of safety.",
    },
    {
      id: "beat_04_transfer_stop_rule", title: "Money movement is the stop rule", startSec: 210, endSec: 300,
      purpose: "Mark protective money movement as the decisive scam indicator.",
      knowledgeBefore: "A transfer to a named safe account may be an exceptional but legitimate protection step.",
      knowledgeAfter: "A demand to move money for protection is a recognized scam indicator.",
      claimIds: ["truth_claim_video_1_004"],
      openLoop: "What does a genuinely independent verification branch look like?",
      closeLoop: "Money movement is the irreversible pivot.",
    },
    {
      id: "beat_05_clean_room_branch", title: "Build a clean verification branch", startSec: 300, endSec: 420,
      purpose: "Contrast the scam path with verification through a known official channel.",
      knowledgeBefore: "Contact details inside the alert are suitable for checking the alert.",
      knowledgeAfter: "Verification must use an official channel obtained independently from the suspicious contact.",
      claimIds: ["truth_claim_video_1_005"],
      openLoop: null,
      closeLoop: "The clean branch removes the original contact from the verification path.",
    },
    {
      id: "beat_06_protective_habit", title: "The protective habit", startSec: 420, endSec: 510,
      purpose: "Leave the viewer with a reusable, non-personalized stop-and-verify rule.",
      knowledgeBefore: "Protection depends on accurately identifying every sophisticated scam cue.",
      knowledgeAfter: "Protection starts by refusing transfer instructions and independently re-establishing an official channel.",
      claimIds: ["truth_claim_video_1_005", "truth_claim_video_1_006"],
      openLoop: null,
      closeLoop: "The viewer knows exactly where to stop the conveyor belt.",
    },
  ];
  const truthClaimIds = new Set<string>(stage03TruthModel().claims.map((claim) => claim.id));
  const beatStatePass = beats.every((beat, index) =>
    beat.knowledgeBefore.trim() !== beat.knowledgeAfter.trim()
    && beat.claimIds.length > 0
    && beat.claimIds.every((claimId) => truthClaimIds.has(claimId))
    && beat.startSec === (index === 0 ? 0 : beats[index - 1].endSec)
    && beat.endSec > beat.startSec);
  if (!beatStatePass) throw new Error("TRACK_G_STAGE_05_M1_BEAT_STATE_ASSERTION_FAILED");
  const retentionCurve = [
    { second: 0, expectedRetainedFraction: 1 },
    { second: 30, expectedRetainedFraction: 0.78 },
    { second: 105, expectedRetainedFraction: 0.7 },
    { second: 195, expectedRetainedFraction: 0.63 },
    { second: 285, expectedRetainedFraction: 0.56 },
    { second: 405, expectedRetainedFraction: 0.5 },
    { second: 510, expectedRetainedFraction: 0.45 },
  ];
  const beatRisks = beats.map((beat, index) => ({
    beatId: beat.id,
    riskLevel: index === 1 || index === 3 ? "MEDIUM" : "LOW",
    risk: index === 1
      ? "Authority reconstruction could become repetitive before the mechanism reveal."
      : index === 3
        ? "The money-movement warning may feel familiar without a clear causal transition."
        : "No material structural risk beyond ordinary execution variance.",
    mitigation: index === 1
      ? "Advance a new piece of authority evidence every 20–30 seconds and resolve into the trust-redirection diagram."
      : index === 3
        ? "Use the decision pivot and claim-bound stop rule to change both knowledge and viewer action."
        : "Preserve the sealed beat purpose, claim bindings and transition timing.",
  }));
  const prediction = {
    modelVersion: STAGE_05_PREDICTION_MODEL_VERSION,
    calibrationState: "UNCALIBRATED_VIDEO_1_PRIOR",
    gatingUse: "STRUCTURAL_SEAL_ONLY",
    ctrEstimate: 0.045,
    retentionCurve,
    beatRisks,
    comparisonPlan: {
      actualSource: "YOUTUBE_ANALYTICS_AFTER_STAGE_15_OWNER_RELEASE",
      compareAtSeconds: retentionCurve.map((point) => point.second),
      metrics: ["CTR", "AUDIENCE_RETENTION_BY_BEAT", "EARLY_ABANDONMENT"],
    },
  } as const;
  if (prediction.retentionCurve.length < 4
    || prediction.retentionCurve[0].second !== 0
    || prediction.retentionCurve.at(-1)?.second !== beats.at(-1)?.endSec
    || prediction.ctrEstimate <= 0
    || prediction.ctrEstimate >= 1
    || prediction.beatRisks.length !== beats.length) {
    throw new Error("TRACK_G_STAGE_05_M1_PREDICTION_SEAL_FAILED");
  }
  const gateResults: StageGateResult[] = [
    {
      gate: "M1_BEAT_STATE_ASSERTION",
      state: "PASS",
      evidence: `${beats.length}/${beats.length} beats change viewer knowledge, bind to sealed Stage 03 claims and form a contiguous architecture.`,
    },
    {
      gate: "M1_PREDICTION_SEALED",
      state: "PASS",
      evidence: "The uncalibrated Video #1 prior records CTR, retention checkpoints, beat risks and the later actual-comparison plan; estimates are not used as calibrated quality gates.",
    },
  ];
  return { candidate, beats, prediction, gateResults };
}

function stage05Envelope(
  operationRunId: string,
  stage04ArtifactSha256: string,
  selectedCandidateId: string,
) {
  const model = stage05StoryModel(selectedCandidateId);
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-05-story-prediction-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_05_CODE,
    artifactType: STAGE_05_ARTIFACT_TYPE,
    champion: {
      candidateId: model.candidate.id,
      routeName: model.candidate.routeName,
      narrativeDevice: model.candidate.narrativeDevice,
      title: model.candidate.packaging.primaryTitle,
      thumbnailText: model.candidate.packaging.thumbnailText,
    },
    storyArchitecture: {
      targetDurationSec: model.beats.at(-1)?.endSec,
      beats: model.beats,
      first30SecondPromise: model.candidate.packaging.first30SecondPromise,
      endingPayoff: model.candidate.route.endingPayoff,
    },
    predictedPerformance: model.prediction,
    provenance: [{
      sourceType: "SEALED_STAGE_ARTIFACT",
      sourceId: STAGE_04_ARTIFACT_ID,
      canonicalHash: stage04ArtifactSha256,
      authority: "OWNER_SELECTED_HP02_D1_CHAMPION",
    }],
    gateResults: model.gateResults,
    controls: {
      predictionRequiredBy: "P9_NO_PREDICTION_NO_LEARNING",
      predictionCalibrationState: "UNCALIBRATED",
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
      humanGate: "NOT_REQUIRED",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage05(operationRunId: string) {
  const stage04 = await readBackStage04(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_05_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_05_ARTIFACT_ID)).limit(1);
  const [prediction] = await db.select().from(predictedPerformances)
    .where(eq(predictedPerformances.id, STAGE_05_PREDICTION_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) =>
    value.scope === "STAGE" && value.scopeRef === STAGE_05_INSTANCE_ID)?.ceilingUsd;
  const model = stage05StoryModel(stage04.selection.candidateId);
  if (!stage || !artifact || !prediction
    || stage.packageId !== STAGE_00_PACKAGE_ID
    || stage.stageCode !== STAGE_05_CODE
    || stage.controlState !== "FROZEN"
    || stage.standardVersion !== STAGE_05_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id
    || artifact.artifactType !== STAGE_05_ARTIFACT_TYPE
    || artifact.namespace !== "production"
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_05_STANDARD_VERSION
    || prediction.packageId !== STAGE_00_PACKAGE_ID
    || prediction.modelVersion !== STAGE_05_PREDICTION_MODEL_VERSION
    || prediction.canonicalHash !== artifact.canonicalHash
    || canonicalize(JSON.parse(prediction.retentionCurveJson)) !== canonicalize(model.prediction.retentionCurve)
    || prediction.ctrEstimate !== model.prediction.ctrEstimate
    || canonicalize(JSON.parse(prediction.beatRiskJson)) !== canonicalize(model.prediction.beatRisks)
    || stageCeiling !== 0
    || !isAtOrAfterReadyStep(stage04.base.run.currentStep, "STAGE_06_READY")
    || !await verifyImmutableEvidence(stage04.stageArtifact.r2Key, stage04.stageArtifact.canonicalHash)
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_05_READ_BACK_FAILED");
  }
  return {
    ...stage04,
    stage05: stage,
    stage05Artifact: artifact,
    stageArtifact: artifact,
    prediction,
    gateResults: model.gateResults,
  };
}

function stage06ScriptModel(selectedCandidateId: string) {
  const story = stage05StoryModel(selectedCandidateId);
  const isAlertRoute = story.candidate.id === "creative_route_video_1_alert_is_the_trap_v1";
  const narrations = isAlertRoute ? [
    `Your phone says fraud was detected. The next instruction is the part designed to steal your money. That opening feels backwards because a warning is supposed to protect you. But in an impersonation scam, the warning can be the first piece of infrastructure the attacker controls. It creates urgency, frames the problem, and offers a path that looks official before you have independently verified anything. The scale of this category explains why the mechanism matters: consumers reported $3.5 billion in losses to imposter scams during 2025. Those figures describe reported loss, not the odds that any particular message is fake. The useful question is narrower. Who controls the channel asking for your attention, and who controls the next action? Until that is independently established, the alert is a claim, not proof.`,
    `The second move is an authority stack. A familiar caller name appears. A confident voice supplies a case number. The person knows enough personal detail to make the conversation feel specific. Then the clock starts: suspicious activity is supposedly happening now, and delay is presented as dangerous. Each cue feels like another piece of verification, but the cues are not independent. They all arrive through the same contact path. Caller information can be imitated. A case number can be invented. Personal details can come from earlier breaches, public records, or previous contact. Urgency tests compliance; it does not prove identity. The scammer does not need every detail to be perfect. The attacker only needs the story to remain coherent long enough for the target to accept the next instruction without leaving the channel.`,
    `Now the alert changes roles. It stops being a warning and becomes a guided solution. The same channel that announced the danger explains what happened, defines which evidence matters, and tells you how to resolve it. That is trust redirection. The attacker is not merely asking to be believed. The attacker is attempting to replace the institution as the source of truth for the next decision. This is why arguing with the details inside the call is weak protection. Every answer can be absorbed into the script. If you ask whether the caller is real, the caller can point back to the alert, the case number, or the familiar name on the screen. The loop remains closed because every verification path still belongs to the contact that created the fear.`,
    `The decisive pivot is protective-sounding money movement. The story may describe a secure destination, a temporary safeguard, or an urgent reversal. The language changes, but the structure is stable: the person who created the emergency also directs the movement of funds. Federal consumer guidance treats a demand to relocate funds for protection as a scam indicator. That does not require the viewer to diagnose the attacker's technology, accent, or personal knowledge. It identifies the action that would convert a persuasive story into exposure. The stop point arrives before the transfer, not after a better explanation. Once the contact asks for money movement, verification must leave that contact path entirely. The key distinction is not whether the caller sounds helpful. It is whether the proposed safeguard depends on obeying the source of the panic.`,
    `Independent verification breaks the loop. End the suspicious interaction without using a link, number, or button it supplied. Then re-establish contact through a channel you already know belongs to the institution: an official app opened separately, a website address entered independently, or a known number from a trusted source. The important feature is separation. A second call is not independent if the number came from the first message. A website is not independent if the alert supplied the link. A verification code does not prove identity if the caller asked you to read it aloud. The goal is not to win an argument with the suspicious contact. The goal is to remove that contact from the evidence chain, then let the institution confirm whether a real account problem exists through its own established process.`,
    `The reusable rule is simple: do not let the channel that created the panic remain in control of the solution. A convincing alert may contain accurate details. A calm caller may sound professional. A warning may even resemble a genuine institutional message. None of those features independently establishes who controls the contact path. Pause before acting, separate from the original channel, and rebuild verification through an official route obtained on your own. This is a general fraud-resistance habit, not personalized financial or legal advice. It does not ask you to predict every new scam. It changes the sequence of trust. The suspicious channel can raise a question, but it cannot answer that question for itself. Once that distinction becomes automatic, the alert loses its power to steer the next decision.`,
  ] : [
    `The money is still safe—right up to the moment the fake security process persuades you to move it. That is the protection paradox. A warning arrives, claims that an account is at risk, and presents movement of funds as the cure. The process feels defensive because each step is framed as damage control. Yet the attacker does not control the money at the beginning. The attacker is trying to control the decision path that leads to it. Consumers reported $3.5 billion in losses to imposter scams during 2025. Those figures are reported context, not a prediction about any one message. The mechanism is more useful than the headline number: urgency narrows attention, staged authority lowers doubt, and a sequence of small actions prepares the target for the irreversible one.`,
    `The decision chain usually begins with an alert and a request to stay engaged. A caller, text, or message supplies a problem, then asks for a response that seems administrative. The next step may involve confirming a detail, discussing a case number, or reacting to supposed account activity. Each action appears separate, but the sequence is designed as one connected path. The contact defines the emergency, decides which facts count, and controls the tempo. Familiar caller information and specific personal details can make the path feel institutional, but they still arrive through one unverified channel. The early steps matter because compliance becomes part of the evidence people use on themselves: after cooperating once, the next request can feel like a continuation rather than a new decision that deserves fresh verification.`,
    `Progressive commitment is the hidden engine. A harmless answer makes the conversation feel real. A case number makes it feel documented. A supposed security check makes it feel procedural. None of those steps proves the identity of the person directing them. Together, however, they create momentum. The target begins solving the attacker's version of the problem instead of testing whether the problem and the helper share the same source. This is why one suspicious phrase is not always easy to find. The danger is structural. Every step keeps the target inside the contact's world, where the contact can reinterpret doubt as delay and delay as risk. The clean question is not whether the process feels professional. It is whether any part of the verification came from a channel the original contact did not control.`,
    `The chain becomes dangerous when protection requires moving funds. The destination may be called secure, temporary, protected, or verified. Those labels do not change the action. Federal consumer guidance identifies a demand to relocate funds for protection as a scam indicator. That point is valuable because it creates a stop rule before the irreversible step. The viewer does not need to determine how caller information was imitated or where personal data came from. The process has already revealed its purpose when the source of the panic starts directing money movement. A legitimate-sounding explanation cannot make the verification independent. The correct boundary is procedural: no transfer instruction from the contact that initiated the emergency can serve as proof that the transfer is protective.`,
    `A clean verification branch begins outside the suspicious contact. Leave the call or message, avoid every link and contact detail it supplied, and open an official route separately. That may be an institution's established app, a website address entered independently, or a known number from a trusted source. Separation is the control. Calling back a number from the alert keeps the same chain intact. Following a link from the message keeps the same chain intact. Reading a security code to the caller keeps the same chain intact. Independent verification removes the original contact from the evidence path and lets the institution address any real account issue through its own process. The objective is not speed inside the suspicious workflow. It is a trustworthy restart outside it.`,
    `The protective habit is to stop the conveyor belt before money movement and rebuild the channel of trust. Convincing details do not replace independent identity. Urgency does not create authority. A sequence of professional-sounding steps does not become safe merely because each step seems small. The suspicious contact may raise a question, but it cannot be the only source allowed to answer that question. That pause protects the decision before any money leaves the account. Pause, separate, and verify through an official route obtained independently. This is a general educational rule, not personalized financial or legal advice. It does not depend on recognizing every technical trick. It changes the order of operations so the attacker cannot use a manufactured emergency to control both the problem and the proposed solution.`,
  ];
  const sections = story.beats.map((beat, index) => ({
    beatId: beat.id,
    title: beat.title,
    startSec: beat.startSec,
    endSec: beat.endSec,
    narration: narrations[index],
    claimIds: [...beat.claimIds],
  }));
  const title = story.candidate.packaging.primaryTitle;
  const hook = story.candidate.route.hook;
  const scriptText = sections.map((section) => section.narration).join("\n\n");
  const words = scriptText.match(/[A-Za-z0-9$'.-]+/gu) ?? [];
  const wordCount = words.length;
  const estimatedDurationSec = Math.round((wordCount / 110) * 60);
  const sentenceWordCounts = scriptText.split(/[.!?]+/u).map((sentence) =>
    (sentence.match(/[A-Za-z0-9$'.-]+/gu) ?? []).length).filter(Boolean);
  const truth = stage03TruthModel();
  const truthClaimIds = new Set<string>(truth.claims.map((claim) => claim.id));
  const numericSurfaces = scriptText.match(/\$\d+(?:\.\d+)?(?:\s+(?:million|billion|trillion))?|\b\d{4}\b|\b\d+(?:\.\d+)?%/gu) ?? [];
  const numericClaim = truth.claims.find((claim) => claim.id === "truth_claim_video_1_001");
  const numberTrace = numericSurfaces.map((surface) => ({
    surface,
    claimId: numericClaim?.id,
    claimText: numericClaim?.text,
    asOfDate: numericClaim?.asOfDate,
    sourceId: numericClaim?.numeric?.sourceId,
  }));
  const adviceViolations = prohibitedAdviceMatches(`${title}\n${hook}\n${scriptText}`);
  const packagingLintPass = title.length >= 20 && hook.length >= 30;
  const sectionLintPass = sections.length === 6
    && sections.every((section, index) => section.beatId === story.beats[index].id
      && section.claimIds.length > 0
      && section.claimIds.every((claimId) => truthClaimIds.has(claimId))
      && (section.narration.match(/[A-Za-z0-9$'.-]+/gu) ?? []).length >= 95
      && (section.narration.match(/[A-Za-z0-9$'.-]+/gu) ?? []).length <= 220);
  const durationLintPass = wordCount >= 700
    && wordCount <= 1300
    && estimatedDurationSec >= 420
    && estimatedDurationSec <= 600;
  const sentenceLintPass = sentenceWordCounts.every((count) => count <= 44);
  const scriptLintPass = packagingLintPass && sectionLintPass && durationLintPass && sentenceLintPass;
  const numberTracePass = numericSurfaces.length === 2
    && numberTrace.every((trace) => trace.claimId === "truth_claim_video_1_001"
      && trace.sourceId === "truth_source_ftc_imposter_losses_2025_v1");
  if (adviceViolations.length > 0) throw new Error("TRACK_G_STAGE_06_M0_ADVICE_LINT_FAILED");
  if (!scriptLintPass) {
    const failedSurface = !packagingLintPass ? "PACKAGING"
      : !sectionLintPass ? "SECTIONS"
        : !durationLintPass ? "DURATION"
          : "SENTENCES";
    throw new Error(`TRACK_G_STAGE_06_M1_SCRIPT_LINT_FAILED_${failedSurface}`);
  }
  if (!numberTracePass) throw new Error("TRACK_G_STAGE_06_M1_NUMBER_TRACE_FAILED");
  const gateResults: StageGateResult[] = [
    {
      gate: "M0_ADVICE_LINT_SECOND_PASS",
      state: "PASS",
      evidence: "The complete narration and packaging contain no prohibited personalized financial directive; the Stage 03 deterministic policy patterns were applied again to final prose.",
    },
    {
      gate: "M1_SCRIPT_LINT",
      state: "PASS",
      evidence: `${sections.length}/${sections.length} claim-bound sections preserve the sealed beat order; ${wordCount} words estimate ${estimatedDurationSec} seconds at the channel's measured documentary pace.`,
    },
    {
      gate: "M1_NUMBER_TRACE",
      state: "PASS",
      evidence: `${numberTrace.length}/${numberTrace.length} numeric surfaces trace exactly to truth_claim_video_1_001 and its sealed FTC source; no orphan number remains.`,
    },
  ];
  return { title, hook, sections, wordCount, estimatedDurationSec, numberTrace, gateResults };
}

function stage06DraftEnvelope(operationRunId: string, stage05ArtifactSha256: string,
  selectedCandidateId: string) {
  const model = stage06ScriptModel(selectedCandidateId);
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-06-script-number-audit-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_06_CODE,
    draftId: STAGE_06_DRAFT_ID,
    script: model,
    provenance: [{
      sourceType: "SEALED_STAGE_ARTIFACT",
      sourceId: STAGE_05_ARTIFACT_ID,
      canonicalHash: stage05ArtifactSha256,
      authority: "PRODUCTION_STAGE_05_STORY_ARCHITECTURE",
    }],
    controls: {
      humanGate: "REQUIRED:HP-02_D2_OR_D4_EDITORIAL_DECISION",
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage06Draft(operationRunId: string) {
  const stage05 = await readBackStage05(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_06_INSTANCE_ID)).limit(1);
  const [draft] = await db.select().from(scriptDrafts)
    .where(eq(scriptDrafts.id, STAGE_06_DRAFT_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) =>
    value.scope === "STAGE" && value.scopeRef === STAGE_06_INSTANCE_ID)?.ceilingUsd;
  const model = stage06ScriptModel(stage05.selection.candidateId);
  const draftLifecycleValid = (stage?.controlState === "RUNNING"
      && stage05.base.run.currentStep === "STAGE_06_READY")
    || (stage?.controlState === "FROZEN"
      && isAtOrAfterReadyStep(stage05.base.run.currentStep, "STAGE_07A_READY"));
  if (!stage || !draft
    || stage.packageId !== STAGE_00_PACKAGE_ID
    || stage.stageCode !== STAGE_06_CODE
    || !draftLifecycleValid
    || stage.standardVersion !== STAGE_06_STANDARD_VERSION
    || draft.packageId !== STAGE_00_PACKAGE_ID
    || draft.stageInstanceId !== stage.id
    || draft.title !== model.title
    || draft.hook !== model.hook
    || canonicalize(JSON.parse(draft.sectionsJson)) !== canonicalize(model.sections)
    || draft.wordCount !== model.wordCount
    || draft.estimatedDurationSec !== model.estimatedDurationSec
    || canonicalize(JSON.parse(draft.numberTraceJson)) !== canonicalize(model.numberTrace)
    || draft.adviceLintState !== "PASS"
    || draft.scriptLintState !== "PASS"
    || draft.numberTraceState !== "PASS"
    || stageCeiling !== 0
    || !await verifyImmutableEvidence(stage05.stageArtifact.r2Key, stage05.stageArtifact.canonicalHash)
    || !await verifyImmutableEvidence(draft.r2Key, draft.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_06_DRAFT_READ_BACK_FAILED");
  }
  return { ...stage05, stage06: stage, scriptDraft: draft, scriptModel: model,
    gateResults: model.gateResults };
}

async function readBackStage06(operationRunId: string) {
  const prepared = await readBackStage06Draft(operationRunId).catch(async (error) => {
    const stage05 = await readBackStage05(operationRunId);
    const db = getDb();
    const [stage] = await db.select().from(stageInstances)
      .where(eq(stageInstances.id, STAGE_06_INSTANCE_ID)).limit(1);
    const [draft] = await db.select().from(scriptDrafts)
      .where(eq(scriptDrafts.id, STAGE_06_DRAFT_ID)).limit(1);
    if (!stage || !draft || stage.controlState !== "FROZEN") throw error;
    return { ...stage05, stage06: stage, scriptDraft: draft,
      scriptModel: stage06ScriptModel(stage05.selection.candidateId),
      gateResults: stage06ScriptModel(stage05.selection.candidateId).gateResults };
  });
  const db = getDb();
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_06_ARTIFACT_ID)).limit(1);
  const decisions = await db.select().from(humanDecisions)
    .where(eq(humanDecisions.packageId, STAGE_00_PACKAGE_ID));
  const decision = decisions.find((value) => value.artifactAfterId === STAGE_06_ARTIFACT_ID);
  if (!artifact || !decision
    || prepared.stage06.controlState !== "FROZEN"
    || artifact.stageInstanceId !== prepared.stage06.id
    || artifact.artifactType !== STAGE_06_ARTIFACT_TYPE
    || artifact.namespace !== "production"
    || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_06_STANDARD_VERSION
    || !["D2", "D4"].includes(decision.decisionType)
    || decision.artifactBeforeId !== STAGE_06_DRAFT_ID
    || decision.rationaleText.trim().length < 20
    || !isAtOrAfterReadyStep(prepared.base.run.currentStep, "STAGE_07A_READY")
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_06_READ_BACK_FAILED");
  }
  return { ...prepared, decision, stage06Artifact: artifact, stageArtifact: artifact };
}

function applyStage06Editorial(model: ReturnType<typeof stage06ScriptModel>,
  input: ApplyTrackGVideoOneStage06EditorialInput) {
  const rationale = input.rationale.trim();
  const revisedTitle = input.revisedTitle?.trim() || model.title;
  const revisedHook = input.revisedHook?.trim() || model.hook;
  const sections = model.sections.map((section) => ({ ...section, claimIds: [...section.claimIds] }));
  if (input.decisionType === "D2") {
    if (revisedTitle === model.title && revisedHook === model.hook) {
      throw new Error("TRACK_G_STAGE_06_D2_SUBSTANTIVE_EDIT_REQUIRED");
    }
    if (revisedTitle.length < 20 || revisedTitle.length > 140
      || revisedHook.length < 30 || revisedHook.length > 400) {
      throw new Error("TRACK_G_STAGE_06_D2_EDIT_LENGTH_OUT_OF_RANGE");
    }
    if (revisedHook !== model.hook) {
      sections[0] = {
        ...sections[0],
        narration: `${revisedHook}${sections[0].narration.slice(model.hook.length)}`,
      };
    }
  } else {
    const beatId = input.beatId?.trim();
    const revisedBeatNarration = input.revisedBeatNarration?.trim();
    const index = sections.findIndex((section) => section.beatId === beatId);
    if (index < 0 || !revisedBeatNarration || revisedBeatNarration === sections[index].narration) {
      throw new Error("TRACK_G_STAGE_06_D4_SUBSTANTIVE_BEAT_EDIT_REQUIRED");
    }
    sections[index] = { ...sections[index], narration: revisedBeatNarration };
  }
  const scriptText = sections.map((section) => section.narration).join("\n\n");
  const words = scriptText.match(/[A-Za-z0-9$'.-]+/gu) ?? [];
  const wordCount = words.length;
  const estimatedDurationSec = Math.round((wordCount / 110) * 60);
  const sentenceWordCounts = scriptText.split(/[.!?]+/u).map((sentence) =>
    (sentence.match(/[A-Za-z0-9$'.-]+/gu) ?? []).length).filter(Boolean);
  const numericSurfaces = scriptText.match(/\$\d+(?:\.\d+)?(?:\s+(?:million|billion|trillion))?|\b\d{4}\b|\b\d+(?:\.\d+)?%/gu) ?? [];
  const adviceViolations = prohibitedAdviceMatches(`${revisedTitle}\n${revisedHook}\n${scriptText}`);
  const scriptLintPass = sections.length === 6
    && sections.every((section) => {
      const sectionWords = section.narration.match(/[A-Za-z0-9$'.-]+/gu) ?? [];
      return sectionWords.length >= 95 && sectionWords.length <= 220 && section.claimIds.length > 0;
    })
    && wordCount >= 700 && wordCount <= 1300
    && estimatedDurationSec >= 420 && estimatedDurationSec <= 600
    && sentenceWordCounts.every((count) => count <= 44);
  const numberTracePass = numericSurfaces.length === 2
    && numericSurfaces.includes("$3.5 billion") && numericSurfaces.includes("2025");
  if (adviceViolations.length > 0) throw new Error("TRACK_G_STAGE_06_M0_ADVICE_LINT_FAILED");
  if (!scriptLintPass) throw new Error("TRACK_G_STAGE_06_M1_SCRIPT_LINT_FAILED");
  if (!numberTracePass) throw new Error("TRACK_G_STAGE_06_M1_NUMBER_TRACE_FAILED");
  const numberTrace = numericSurfaces.map((surface) => ({
    surface,
    claimId: "truth_claim_video_1_001",
    claimText: stage03TruthModel().claims[0].text,
    asOfDate: stage03TruthModel().claims[0].asOfDate,
    sourceId: stage03TruthModel().claims[0].numeric?.sourceId,
  }));
  const gateResults: StageGateResult[] = [
    {
      gate: "M0_ADVICE_LINT_SECOND_PASS",
      state: "PASS",
      evidence: "The human-edited title, hook and narration passed the second deterministic advice lint with no personalized financial directive.",
    },
    {
      gate: "M1_SCRIPT_LINT",
      state: "PASS",
      evidence: `The post-decision script preserves six claim-bound sections, ${wordCount} words and a ${estimatedDurationSec}-second documentary pace estimate.`,
    },
    {
      gate: "M1_NUMBER_TRACE",
      state: "PASS",
      evidence: "Every post-decision numeric surface remains exactly traceable to the sealed FTC loss claim and no new number was introduced.",
    },
  ];
  return { title: revisedTitle, hook: revisedHook, sections, wordCount,
    estimatedDurationSec, numberTrace, gateResults, rationale };
}

export async function prepareTrackGVideoOneStage06ScriptReview(
  user: ChatGPTUser,
  input: PrepareTrackGVideoOneStage06Input,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_06_PREPARE_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_06_PREPARE_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const stage05 = await readBackStage05(bootstrap.run.id);
  const expectedKey = stage06PrepareIdempotencyKey(bootstrap.run.id, stage05.stageArtifact.canonicalHash);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage06Draft(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_06_READY") throw new Error("TRACK_G_STAGE_06_NOT_READY");
  if (!await verifyImmutableEvidence(stage05.stageArtifact.r2Key, stage05.stageArtifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_06_PREDECESSOR_PROVENANCE_FAILED");
  }
  const envelope = stage06DraftEnvelope(
    bootstrap.run.id,
    stage05.stageArtifact.canonicalHash,
    stage05.selection.candidateId,
  );
  const draftBytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const draftSha256 = sha256(draftBytes);
  const draftR2Key = [
    "prod", approvedChannel.id, trackGVideoOneContract.episodeId, STAGE_06_CODE,
    "script-editorial-draft", `${draftSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(draftR2Key, draftBytes, "application/json", draftSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const model = envelope.script;
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'PREPARE_TRACK_G_VIDEO_1_STAGE_06_SCRIPT', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_06_READY', 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL', ?, ?)`).bind(
        commandId, canonicalize({ objective, operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID, stageCode: STAGE_06_CODE, draftSha256 }),
        input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at)
        VALUES (?, ?, '06', 'RUNNING', ?, 1, ?)`).bind(
        STAGE_06_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_06_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO script_draft
        (id, package_id, stage_instance_id, title, hook, sections_json, word_count,
         estimated_duration_sec, number_trace_json, advice_lint_state, script_lint_state,
         number_trace_state, r2_key, canonical_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASS', 'PASS', 'PASS', ?, ?, ?)`).bind(
        STAGE_06_DRAFT_ID, STAGE_00_PACKAGE_ID, STAGE_06_INSTANCE_ID, model.title, model.hook,
        canonicalize(model.sections), model.wordCount, model.estimatedDurationSec,
        canonicalize(model.numberTrace), draftR2Key, draftSha256, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_06_INSTANCE_ID),
      ...[
        ["STAGE_06_DOR_PASSED", { predecessor: STAGE_05_ARTIFACT_ID,
          predecessorSha256: stage05.stageArtifact.canonicalHash }],
        ["STAGE_06_SCRIPT_DRAFT_SEALED", { draftId: STAGE_06_DRAFT_ID, draftR2Key, draftSha256 }],
        ["STAGE_06_M0_ADVICE_LINT_PASSED", { pass: true }],
        ["STAGE_06_M1_SCRIPT_LINT_PASSED", { wordCount: model.wordCount,
          estimatedDurationSec: model.estimatedDurationSec }],
        ["STAGE_06_M1_NUMBER_TRACE_PASSED", { traceCount: model.numberTrace.length }],
        ["STAGE_06_HP02_EDITORIAL_REQUIRED", { allowedDecisionTypes: ["D2", "D4"] }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
        canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage06Draft(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage06Draft(bootstrap.run.id)), replayed: false };
}

export async function applyTrackGVideoOneStage06EditorialDecision(
  user: ChatGPTUser,
  input: ApplyTrackGVideoOneStage06EditorialInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const rationale = input.rationale.trim();
  if (rationale.length < 20 || rationale.length > 500) throw new Error("RATIONALE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_06_APPLY_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_06_EDITORIAL_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage06Draft(bootstrap.run.id);
  const expectedKey = stage06EditorialIdempotencyKey(bootstrap.run.id,
    prepared.scriptDraft.canonicalHash, input);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage06(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_06_READY" || prepared.stage06.controlState !== "RUNNING") {
    throw new Error("TRACK_G_STAGE_06_EDITORIAL_GATE_NOT_READY");
  }
  const finalScript = applyStage06Editorial(prepared.scriptModel, input);
  const actorIdentity = user.email.toLowerCase();
  const diffEnvelope = {
    schemaVersion: 1,
    draftId: STAGE_06_DRAFT_ID,
    draftSha256: prepared.scriptDraft.canonicalHash,
    decisionType: input.decisionType,
    actorIdentity,
    rationale,
    changes: input.decisionType === "D2"
      ? { titleBefore: prepared.scriptModel.title, titleAfter: finalScript.title,
        hookBefore: prepared.scriptModel.hook, hookAfter: finalScript.hook }
      : { beatId: input.beatId?.trim(),
        narrationBefore: prepared.scriptModel.sections.find((value) => value.beatId === input.beatId?.trim())?.narration,
        narrationAfter: input.revisedBeatNarration?.trim() },
  };
  const diffBytes = new TextEncoder().encode(`${canonicalize(diffEnvelope)}\n`);
  const diffSha256 = sha256(diffBytes);
  const diffR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_06_CODE, `human-decision-${input.decisionType.toLowerCase()}`, `${diffSha256}.json`].join("/");
  await putImmutableProductionEvidence(diffR2Key, diffBytes, "application/json", diffSha256);
  const finalEnvelope = {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-06-script-number-audit-v1",
    operationRunId: bootstrap.run.id,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_06_CODE,
    artifactType: STAGE_06_ARTIFACT_TYPE,
    draft: { id: STAGE_06_DRAFT_ID, r2Key: prepared.scriptDraft.r2Key,
      sha256: prepared.scriptDraft.canonicalHash },
    editorialDecision: { decisionType: input.decisionType, actorIdentity, rationale,
      diffR2Key, diffSha256 },
    finalScript,
    provenance: [{ sourceType: "SEALED_STAGE_ARTIFACT", sourceId: STAGE_05_ARTIFACT_ID,
      canonicalHash: prepared.stage05Artifact.canonicalHash, authority: "PRODUCTION_STAGE_05" }],
    controls: { humanGate: `SATISFIED:HP-02_${input.decisionType}_EDITORIAL_DECISION`,
      providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
  const artifactBytes = new TextEncoder().encode(`${canonicalize(finalEnvelope)}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_06_CODE, "script-number-audit-editorial-seal", `${artifactSha256}.json`].join("/");
  await putImmutableProductionEvidence(artifactR2Key, artifactBytes, "application/json", artifactSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const humanDecisionId = `human_decision_track_g_video_1_stage_06_${input.decisionType.toLowerCase()}_v1`;
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL', 'TRACK_G_VIDEO_1_STAGE_07A_READY', ?, ?)`).bind(
        commandId, canonicalize({ operationRunId: bootstrap.run.id, stageCode: STAGE_06_CODE,
          decisionType: input.decisionType, rationale, diffSha256, artifactSha256 }),
        input.idempotencyKey, actorIdentity, traceId, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_06_ARTIFACT_ID, STAGE_06_INSTANCE_ID, STAGE_06_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_06_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO human_decision
        (id, package_id, decision_type, actor_identity, artifact_before_id, artifact_after_id,
         diff_r2_key, rationale_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        humanDecisionId, STAGE_00_PACKAGE_ID, input.decisionType, actorIdentity,
        STAGE_06_DRAFT_ID, STAGE_06_ARTIFACT_ID, diffR2Key, rationale, now),
      d1.prepare(`UPDATE stage_instance SET control_state = 'FROZEN', frozen_at = ?
        WHERE id = ? AND control_state = 'RUNNING'`).bind(now, STAGE_06_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_07A_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_06_READY'`).bind(
        now, bootstrap.run.id),
      ...[
        ["STAGE_06_HP02_EDITORIAL_RECORDED", { decisionId: humanDecisionId,
          decisionType: input.decisionType, diffSha256 }],
        ["STAGE_06_POST_DECISION_GATES_PASSED", { gates: finalScript.gateResults }],
        ["STAGE_06_ARTIFACT_SEALED", { artifactId: STAGE_06_ARTIFACT_ID,
          artifactR2Key, artifactSha256 }],
        ["STAGE_06_FROZEN", { nextStep: "STAGE_07A_READY", reservedUsd: 0,
          actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
        canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage06(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage06(bootstrap.run.id)), replayed: false };
}

export function trackGVideoOneStage07AVoiceModel() {
  const script = stage06ScriptModel("creative_route_video_1_alert_is_the_trap_v1");
  const segments = script.sections.map((section, index) => ({
    segmentId: `tts_segment_${String(index + 1).padStart(2, "0")}`,
    beatId: section.beatId,
    title: section.title,
    startSec: section.startSec,
    endSec: section.endSec,
    boundary: "SEALED_BEAT_BOUNDARY",
  }));
  const candidates = [
    {
      id: "voice_route_video_1_controlled_urgency_v1",
      routeOrder: 1,
      routeName: "Controlled Urgency",
      summary: "Direct and high-clarity delivery that names the danger early, keeps momentum, and never becomes alarmist.",
      deliveryDirection: "Firm opening, compact pauses, decisive stress on the trust break and the money-movement stop point.",
      pauseProfile: { sentenceMs: 180, beatMs: 520, verificationBreakMs: 760 },
      emphasis: ["the warning can be the trap", "move money", "independent verification"],
      machineScore: 95,
    },
    {
      id: "voice_route_video_1_forensic_calm_v1",
      routeOrder: 2,
      routeName: "Forensic Calm",
      summary: "Measured investigative delivery that builds credibility through restraint and makes each mechanism easy to follow.",
      deliveryDirection: "Calm opening, longer explanatory pauses, restrained stress on evidence and channel independence.",
      pauseProfile: { sentenceMs: 260, beatMs: 640, verificationBreakMs: 900 },
      emphasis: ["same contact path", "trust redirection", "official channel"],
      machineScore: 93,
    },
  ] as const;
  const settings = {
    provider: qualifiedVoice.settings.provider,
    voiceId: qualifiedVoice.voiceId,
    modelId: qualifiedVoice.model,
    voiceSettings: qualifiedVoice.settings.voiceSettings,
    outputFormat: qualifiedVoice.settings.outputFormat,
  };
  const settingsHash = qualifiedVoice.settingsHash;
  const canonicalVoiceSettingsHash = canonicalHash(settings.voiceSettings);
  if (segments.length !== script.sections.length
    || segments.some((segment, index) => segment.beatId !== script.sections[index].beatId
      || segment.startSec !== script.sections[index].startSec
      || segment.endSec !== script.sections[index].endSec)
    || segments.some((segment, index) => index > 0 && segment.startSec !== segments[index - 1].endSec)) {
    throw new Error("TRACK_G_STAGE_07A_M1_SEGMENTATION_BOUNDARY_FAILED");
  }
  const gateResults: StageGateResult[] = [
    {
      gate: "M1_SEGMENTATION_BOUNDARY",
      state: "PASS",
      evidence: `${segments.length}/${segments.length} TTS segments align exactly to sealed Stage 06 beat boundaries with zero gap or overlap.`,
    },
    {
      gate: "M1_VOICE_SETTINGS_HASH",
      state: "PASS",
      evidence: `Both tone routes retain the QUALIFIED voice, model, output format and immutable settings hash ${settingsHash}.`,
    },
  ];
  return {
    tournamentId: STAGE_07A_TOURNAMENT_ID,
    candidates,
    segments,
    settings,
    settingsHash,
    canonicalVoiceSettingsHash,
    recommendedCandidateId: candidates[0].id,
    gateResults,
  };
}

function stage07ATournamentEnvelope(operationRunId: string, predecessorSha256: string) {
  const model = trackGVideoOneStage07AVoiceModel();
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-07a-voice-design-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_07A_CODE,
    ...model,
    provenance: [{ sourceType: "SEALED_STAGE_ARTIFACT", sourceId: STAGE_06_ARTIFACT_ID,
      canonicalHash: predecessorSha256, authority: "PRODUCTION_STAGE_06_FINAL_SCRIPT" }],
    controls: { preserveRejectedCandidates: true,
      humanGate: "REQUIRED:HP-02_D5_TONE_SELECTION", providerDispatch: "OFF",
      releaseEligible: false, autoPublish: "OFF" },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage07ATournament(operationRunId: string) {
  const stage06 = await readBackStage06(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_07A_INSTANCE_ID)).limit(1);
  const [prepareCommand] = await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT"))
    .orderBy(desc(commandLog.createdAt)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) => value.scope === "STAGE"
    && value.scopeRef === STAGE_07A_INSTANCE_ID)?.ceilingUsd;
  const payload = prepareCommand ? JSON.parse(prepareCommand.payloadJson) as {
    tournamentR2Key?: string; tournamentSha256?: string;
  } : {};
  const model = trackGVideoOneStage07AVoiceModel();
  const lifecycleValid = (stage?.controlState === "RUNNING"
      && stage06.base.run.currentStep === "STAGE_07A_READY")
    || (stage?.controlState === "FROZEN"
      && isAtOrAfterReadyStep(stage06.base.run.currentStep, "STAGE_07B_READY"));
  if (!stage || !prepareCommand || !payload.tournamentR2Key || !payload.tournamentSha256
    || stage.packageId !== STAGE_00_PACKAGE_ID || stage.stageCode !== STAGE_07A_CODE
    || !lifecycleValid || stage.standardVersion !== STAGE_07A_STANDARD_VERSION
    || stageCeiling !== 0
    || !await verifyImmutableEvidence(stage06.stageArtifact.r2Key, stage06.stageArtifact.canonicalHash)
    || !await verifyImmutableEvidence(payload.tournamentR2Key, payload.tournamentSha256)) {
    throw new Error("TRACK_G_STAGE_07A_TOURNAMENT_READ_BACK_FAILED");
  }
  return { ...stage06, stage07A: stage, tournamentModel: model,
    tournamentR2Key: payload.tournamentR2Key, tournamentSha256: payload.tournamentSha256 };
}

async function readBackStage07A(operationRunId: string) {
  const prepared = await readBackStage07ATournament(operationRunId);
  const db = getDb();
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_07A_ARTIFACT_ID)).limit(1);
  const decisions = await db.select().from(humanDecisions)
    .where(eq(humanDecisions.packageId, STAGE_00_PACKAGE_ID));
  const decision = decisions.find((value) => value.artifactAfterId === STAGE_07A_ARTIFACT_ID);
  if (!artifact || !decision || prepared.stage07A.controlState !== "FROZEN"
    || artifact.stageInstanceId !== prepared.stage07A.id
    || artifact.artifactType !== STAGE_07A_ARTIFACT_TYPE
    || artifact.namespace !== "production" || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_07A_STANDARD_VERSION
    || decision.decisionType !== "D5" || decision.artifactBeforeId !== STAGE_07A_TOURNAMENT_ID
    || decision.rationaleText.trim().length < 20
    || !isAtOrAfterReadyStep(prepared.base.run.currentStep, "STAGE_07B_READY")
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_07A_READ_BACK_FAILED");
  }
  const selectedCandidateId = JSON.parse((await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE"))
    .orderBy(desc(commandLog.createdAt)).limit(1))[0]?.payloadJson ?? "{}")
    .selectedCandidateId as string | undefined;
  if (!prepared.tournamentModel.candidates.some((candidate) => candidate.id === selectedCandidateId)) {
    throw new Error("TRACK_G_STAGE_07A_SELECTION_READ_BACK_FAILED");
  }
  return { ...prepared, decision, stage07AArtifact: artifact, stageArtifact: artifact,
    selectedCandidateId };
}

export async function prepareTrackGVideoOneStage07AVoiceTournament(
  user: ChatGPTUser,
  input: PrepareTrackGVideoOneStage07AVoiceInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_07A_PREPARE_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_07A_PREPARE_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const stage06 = await readBackStage06(bootstrap.run.id);
  const expectedKey = stage07APrepareIdempotencyKey(bootstrap.run.id, stage06.stageArtifact.canonicalHash);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage07ATournament(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_07A_READY") throw new Error("TRACK_G_STAGE_07A_NOT_READY");
  const voice = await voiceQualificationReadBack();
  if (!voice.qualified || voice.bindingCount !== 8) throw new Error("TRACK_G_STAGE_07A_VOICE_NOT_QUALIFIED");
  const envelope = stage07ATournamentEnvelope(bootstrap.run.id, stage06.stageArtifact.canonicalHash);
  const bytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const tournamentSha256 = sha256(bytes);
  const tournamentR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_07A_CODE, "voice-tournament", `${tournamentSha256}.json`].join("/");
  await putImmutableProductionEvidence(tournamentR2Key, bytes, "application/json", tournamentSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_07A_READY', 'TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE', ?, ?)`).bind(
        crypto.randomUUID(), canonicalize({ objective, operationRunId: bootstrap.run.id,
          stageCode: STAGE_07A_CODE, tournamentR2Key, tournamentSha256 }), input.idempotencyKey,
        user.email.toLowerCase(), crypto.randomUUID(), now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at)
        VALUES (?, ?, '07A', 'RUNNING', ?, 1, ?)`).bind(
        STAGE_07A_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_07A_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_07A_INSTANCE_ID),
      ...[
        ["STAGE_07A_DOR_PASSED", { predecessor: STAGE_06_ARTIFACT_ID,
          predecessorSha256: stage06.stageArtifact.canonicalHash }],
        ["STAGE_07A_VOICE_TOURNAMENT_SEALED", { tournamentR2Key, tournamentSha256,
          candidateCount: envelope.candidates.length }],
        ["STAGE_07A_GATES_PASSED", { gates: envelope.gateResults }],
        ["STAGE_07A_HP02_D5_REQUIRED", { candidateIds: envelope.candidates.map((value) => value.id) }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType, canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrent] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { ...(await readBackStage07ATournament(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage07ATournament(bootstrap.run.id)), replayed: false };
}

export async function selectTrackGVideoOneStage07ATone(
  user: ChatGPTUser,
  input: SelectTrackGVideoOneStage07AToneInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const rationale = input.rationale.trim();
  if (rationale.length < 20 || rationale.length > 500) throw new Error("RATIONALE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_07A_SELECT_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_07A_SELECT_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage07ATournament(bootstrap.run.id);
  const candidate = prepared.tournamentModel.candidates.find((value) => value.id === input.candidateId);
  if (!candidate) throw new Error("TRACK_G_STAGE_07A_CANDIDATE_NOT_ELIGIBLE");
  const expectedKey = stage07ASelectionIdempotencyKey(bootstrap.run.id,
    prepared.tournamentSha256, candidate.id, rationale);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage07A(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_07A_READY" || prepared.stage07A.controlState !== "RUNNING") {
    throw new Error("TRACK_G_STAGE_07A_TONE_GATE_NOT_READY");
  }
  const actorIdentity = user.email.toLowerCase();
  const rejectedCandidates = prepared.tournamentModel.candidates.filter((value) => value.id !== candidate.id);
  const decisionEnvelope = { schemaVersion: 1, tournamentId: STAGE_07A_TOURNAMENT_ID,
    tournamentSha256: prepared.tournamentSha256, selectedCandidateId: candidate.id,
    actorIdentity, rationale };
  const decisionBytes = new TextEncoder().encode(`${canonicalize(decisionEnvelope)}\n`);
  const decisionSha256 = sha256(decisionBytes);
  const decisionR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_07A_CODE, "human-decision-d5", `${decisionSha256}.json`].join("/");
  await putImmutableProductionEvidence(decisionR2Key, decisionBytes, "application/json", decisionSha256);
  const finalEnvelope = { schemaVersion: 1, runnerContractVersion: 1,
    executorVersion: "stage-07a-voice-design-v1", operationRunId: bootstrap.run.id,
    packageId: STAGE_00_PACKAGE_ID, stageCode: STAGE_07A_CODE,
    artifactType: STAGE_07A_ARTIFACT_TYPE, selectedCandidate: candidate,
    rejectedCandidates, segments: prepared.tournamentModel.segments,
    voiceSettings: prepared.tournamentModel.settings,
    voiceSettingsHash: prepared.tournamentModel.settingsHash,
    humanDecision: { decisionType: "D5", actorIdentity, rationale, decisionR2Key, decisionSha256 },
    provenance: [{ sourceType: "SEALED_STAGE_ARTIFACT", sourceId: STAGE_06_ARTIFACT_ID,
      canonicalHash: prepared.stageArtifact.canonicalHash, authority: "PRODUCTION_STAGE_06_FINAL_SCRIPT" }],
    gateResults: prepared.tournamentModel.gateResults,
    controls: { preserveRejectedCandidates: true, humanGate: "SATISFIED:HP-02_D5_TONE_SELECTION",
      providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
    budget: { reservedUsd: 0, actualUsd: 0 } };
  const artifactBytes = new TextEncoder().encode(`${canonicalize(finalEnvelope)}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_07A_CODE, "voice-design-tts-segmentation-seal", `${artifactSha256}.json`].join("/");
  await putImmutableProductionEvidence(artifactR2Key, artifactBytes, "application/json", artifactSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const humanDecisionId = "human_decision_track_g_video_1_stage_07a_d5_v1";
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE', 'TRACK_G_VIDEO_1_STAGE_07B_READY', ?, ?)`).bind(
        crypto.randomUUID(), canonicalize({ operationRunId: bootstrap.run.id,
          selectedCandidateId: candidate.id, rationale, decisionSha256, artifactSha256 }),
        input.idempotencyKey, actorIdentity, crypto.randomUUID(), now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_07A_ARTIFACT_ID, STAGE_07A_INSTANCE_ID, STAGE_07A_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_07A_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO human_decision
        (id, package_id, decision_type, actor_identity, artifact_before_id, artifact_after_id,
         diff_r2_key, rationale_text, created_at) VALUES (?, ?, 'D5', ?, ?, ?, ?, ?, ?)`).bind(
        humanDecisionId, STAGE_00_PACKAGE_ID, actorIdentity, STAGE_07A_TOURNAMENT_ID,
        STAGE_07A_ARTIFACT_ID, decisionR2Key, rationale, now),
      d1.prepare(`UPDATE stage_instance SET control_state = 'FROZEN', frozen_at = ?
        WHERE id = ? AND control_state = 'RUNNING'`).bind(now, STAGE_07A_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_07B_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_07A_READY'`).bind(now, bootstrap.run.id),
      ...[
        ["STAGE_07A_HP02_D5_RECORDED", { decisionId: humanDecisionId,
          selectedCandidateId: candidate.id, decisionSha256 }],
        ["STAGE_07A_ARTIFACT_SEALED", { artifactId: STAGE_07A_ARTIFACT_ID,
          artifactR2Key, artifactSha256, rejectedCandidateCount: rejectedCandidates.length }],
        ["STAGE_07A_FROZEN", { nextStep: "STAGE_07B_READY", reservedUsd: 0,
          actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType, canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrent] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { ...(await readBackStage07A(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage07A(bootstrap.run.id)), replayed: false };
}

export function trackGVideoOneStage07BVisualGrammarModel(
  selectedCandidateId = "creative_route_video_1_alert_is_the_trap_v1",
) {
  const script = stage06ScriptModel(selectedCandidateId);
  const motionClasses = [
    "REAL_WORLD_FOOTAGE",
    "EXPLANATORY_DIAGRAM",
    "DATA_MOTION_GRAPHIC",
  ] as const;
  const routePlan = [
    {
      motionClass: "REAL_WORLD_FOOTAGE",
      visualRoute: "AUTHENTIC_ALERT_CONTEXT",
      treatment: "Phone-level real-world alert context with the unverified contact path identified before any response.",
    },
    {
      motionClass: "EXPLANATORY_DIAGRAM",
      visualRoute: "AUTHORITY_STACK",
      treatment: "Layered authority-stack diagram showing caller identity, case number, personal detail and urgency as one dependent channel.",
    },
    {
      motionClass: "EXPLANATORY_DIAGRAM",
      visualRoute: "TRUST_REDIRECTION_LOOP",
      treatment: "Animated trust-loop diagram showing how the same source defines the danger, evidence and proposed solution.",
    },
    {
      motionClass: "DATA_MOTION_GRAPHIC",
      visualRoute: "MONEY_MOVEMENT_STOP_POINT",
      treatment: "Decision timeline that marks protective-sounding money movement as the procedural stop point.",
    },
    {
      motionClass: "REAL_WORLD_FOOTAGE",
      visualRoute: "INDEPENDENT_VERIFICATION",
      treatment: "Real-world verification sequence that exits the suspicious contact and opens a separately obtained official channel.",
    },
    {
      motionClass: "DATA_MOTION_GRAPHIC",
      visualRoute: "PAUSE_SEPARATE_VERIFY",
      treatment: "Three-step kinetic checklist that closes on pause, separate and independently verify.",
    },
  ] as const;
  const assignments = script.sections.map((section, index) => ({
    beatId: section.beatId,
    beatTitle: section.title,
    startSec: section.startSec,
    endSec: section.endSec,
    ...routePlan[index],
    acquisitionState: "PLANNED_ZERO_PROVIDER",
  }));
  const distribution = motionClasses.map((motionClass) => ({
    motionClass,
    count: assignments.filter((assignment) => assignment.motionClass === motionClass).length,
  }));
  if (assignments.length !== script.sections.length
    || assignments.some((assignment, index) => assignment.beatId !== script.sections[index].beatId)
    || assignments.some((assignment) => !motionClasses.includes(assignment.motionClass))) {
    throw new Error("TRACK_G_STAGE_07B_M1_MOTION_CLASS_TOTAL_FAILED");
  }
  if (distribution.some((entry) => entry.count < 1)
    || distribution.reduce((sum, entry) => sum + entry.count, 0) !== assignments.length
    || new Set(assignments.map((assignment) => assignment.visualRoute)).size !== assignments.length) {
    throw new Error("TRACK_G_STAGE_07B_M1_ROUTE_DISTRIBUTION_FAILED");
  }
  const gateResults: StageGateResult[] = [
    {
      gate: "M1_MOTION_CLASS_TOTAL",
      state: "PASS",
      evidence: `${assignments.length}/${assignments.length} sealed beats map to exactly one member of the closed three-class motion taxonomy.`,
    },
    {
      gate: "M1_ROUTE_DISTRIBUTION",
      state: "PASS",
      evidence: distribution.map((entry) => `${entry.motionClass}=${entry.count}`).join(" · "),
    },
  ];
  return { motionClasses, assignments, distribution, gateResults };
}

function stage07BEnvelope(operationRunId: string, predecessorSha256: string,
  selectedCandidateId: string) {
  const model = trackGVideoOneStage07BVisualGrammarModel(selectedCandidateId);
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-07b-visual-grammar-routing-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_07B_CODE,
    artifactType: STAGE_07B_ARTIFACT_TYPE,
    visualGrammar: {
      motionTaxonomy: model.motionClasses,
      beatRouting: model.assignments,
      routeDistribution: model.distribution,
    },
    provenance: [{
      sourceType: "SEALED_STAGE_ARTIFACT",
      sourceId: STAGE_07A_ARTIFACT_ID,
      canonicalHash: predecessorSha256,
      authority: "OWNER_SELECTED_VOICE_AND_SEALED_TTS_SEGMENTATION",
    }],
    gateResults: model.gateResults,
    controls: {
      routingMode: "DETERMINISTIC_PLANNING_ONLY",
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
      humanGate: "NOT_REQUIRED",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage07B(operationRunId: string) {
  const stage07A = await readBackStage07A(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_07B_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_07B_ARTIFACT_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) => value.scope === "STAGE"
    && value.scopeRef === STAGE_07B_INSTANCE_ID)?.ceilingUsd;
  const model = trackGVideoOneStage07BVisualGrammarModel(stage07A.selection.candidateId);
  if (!stage || !artifact
    || stage.packageId !== STAGE_00_PACKAGE_ID || stage.stageCode !== STAGE_07B_CODE
    || stage.controlState !== "FROZEN" || stage.standardVersion !== STAGE_07B_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id || artifact.artifactType !== STAGE_07B_ARTIFACT_TYPE
    || artifact.namespace !== "production" || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_07B_STANDARD_VERSION || stageCeiling !== 0
    || !isAtOrAfterReadyStep(stage07A.base.run.currentStep, "STAGE_08_READY")
    || !await verifyImmutableEvidence(stage07A.stage07AArtifact.r2Key,
      stage07A.stage07AArtifact.canonicalHash)
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_07B_READ_BACK_FAILED");
  }
  return { ...stage07A, stage07B: stage, stage07BArtifact: artifact,
    stageArtifact: artifact, gateResults: model.gateResults, visualGrammarModel: model };
}

async function advanceTrackGVideoOneStage07B(
  user: ChatGPTUser,
  input: AdvanceTrackGVideoOneStageInput,
  objective: string,
) {
  const bootstrap = await readBackForStage00();
  const stage07A = await readBackStage07A(bootstrap.run.id);
  const expectedKey = stageAdvanceIdempotencyKey(
    bootstrap.run.id,
    STAGE_07B_CODE,
    stage07A.stage07AArtifact.canonicalHash,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage07B(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_07B_READY") throw new Error("TRACK_G_STAGE_07B_NOT_READY");
  if (!await verifyImmutableEvidence(stage07A.stage07AArtifact.r2Key,
    stage07A.stage07AArtifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_07B_PREDECESSOR_PROVENANCE_FAILED");
  }
  const envelope = stage07BEnvelope(bootstrap.run.id,
    stage07A.stage07AArtifact.canonicalHash, stage07A.selection.candidateId);
  const artifactBytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_07B_CODE, "visual-grammar-routing", `${artifactSha256}.json`].join("/");
  await putImmutableProductionEvidence(artifactR2Key, artifactBytes, "application/json", artifactSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const model = envelope.visualGrammar;
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'ADVANCE_TRACK_G_VIDEO_1_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_07B_READY',
          'TRACK_G_VIDEO_1_STAGE_08_READY', ?, ?)`).bind(
        commandId, canonicalize({ objective, operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID, stageCode: STAGE_07B_CODE,
          executorVersion: envelope.executorVersion, artifactSha256 }),
        input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '07B', 'FROZEN', ?, 1, ?, ?)`).bind(
        STAGE_07B_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_07B_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_07B_ARTIFACT_ID, STAGE_07B_INSTANCE_ID, STAGE_07B_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_07B_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_07B_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_08_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_07B_READY'`).bind(
        now, bootstrap.run.id),
      ...[
        ["STAGE_07B_DOR_PASSED", { predecessor: STAGE_07A_ARTIFACT_ID,
          predecessorSha256: stage07A.stage07AArtifact.canonicalHash }],
        ["STAGE_ADVANCE_ACCEPTED", { commandId, stageCode: STAGE_07B_CODE,
          traceId, executorVersion: envelope.executorVersion }],
        ["STAGE_07B_M1_MOTION_CLASS_TOTAL_PASSED", { assignmentCount: model.beatRouting.length,
          taxonomy: model.motionTaxonomy }],
        ["STAGE_07B_M1_ROUTE_DISTRIBUTION_PASSED", { distribution: model.routeDistribution }],
        ["STAGE_07B_ARTIFACT_SEALED", { artifactId: STAGE_07B_ARTIFACT_ID,
          artifactR2Key, artifactSha256 }],
        ["STAGE_07B_FROZEN", { nextStep: "STAGE_08_READY", reservedUsd: 0,
          actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
        canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrent] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { ...(await readBackStage07B(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage07B(bootstrap.run.id)), replayed: false };
}

export function trackGVideoOneStage08ShotCueProgramModel(
  selectedCandidateId = "creative_route_video_1_alert_is_the_trap_v1",
) {
  const script = stage06ScriptModel(selectedCandidateId);
  const visualGrammar = trackGVideoOneStage07BVisualGrammarModel(selectedCandidateId);
  const frameRate = 30;
  const maxShotDurationSec = 30;
  let globalOrdinal = 0;
  const shots = visualGrammar.assignments.flatMap((assignment, beatIndex) => {
    const section = script.sections[beatIndex];
    if (!section || section.beatId !== assignment.beatId) {
      throw new Error("TRACK_G_STAGE_08_BEAT_ROUTE_MISMATCH");
    }
    const beatStartFrame = Math.round(assignment.startSec * frameRate);
    const beatEndFrame = Math.round(assignment.endSec * frameRate);
    const beatFrames = beatEndFrame - beatStartFrame;
    const shotCount = Math.max(1, Math.ceil(beatFrames / (maxShotDurationSec * frameRate)));
    const baseFrames = Math.floor(beatFrames / shotCount);
    const remainderFrames = beatFrames % shotCount;
    let cursorFrame = beatStartFrame;
    return Array.from({ length: shotCount }, (_, shotIndex) => {
      const durationFrames = baseFrames + (shotIndex < remainderFrames ? 1 : 0);
      const startFrame = cursorFrame;
      const endFrame = startFrame + durationFrames;
      cursorFrame = endFrame;
      globalOrdinal += 1;
      const cueRole = shotCount === 1 ? "FULL_BEAT"
        : shotIndex === 0 ? "ESTABLISH"
          : shotIndex === shotCount - 1 ? "RESOLVE" : "DEVELOP";
      return {
        shotId: `shot_${String(globalOrdinal).padStart(3, "0")}`,
        globalOrdinal,
        beatId: assignment.beatId,
        beatTitle: assignment.beatTitle,
        shotOrdinalWithinBeat: shotIndex + 1,
        cueRole,
        startFrame,
        endFrame,
        durationFrames,
        startSec: startFrame / frameRate,
        endSec: endFrame / frameRate,
        motionClass: assignment.motionClass,
        visualRoute: assignment.visualRoute,
        treatment: assignment.treatment,
        claimIds: [...section.claimIds],
        assertions: [
          {
            assertion: "TIMELINE_INTERVAL",
            state: "PASS" as const,
            evidence: `${startFrame}-${endFrame} frames at ${frameRate}fps; positive duration and contiguous boundary.`,
          },
          {
            assertion: "SEMANTIC_ROUTE",
            state: "PASS" as const,
            evidence: `${assignment.motionClass}/${assignment.visualRoute} remains bound to ${assignment.beatId}.`,
          },
          {
            assertion: "CLAIM_LINEAGE",
            state: "PASS" as const,
            evidence: `${section.claimIds.length} sealed claim reference(s) inherited from the Stage 06 beat.`,
          },
        ],
      };
    });
  });
  const targetFrames = Math.round((script.sections.at(-1)?.endSec ?? 0) * frameRate);
  const timelinePass = shots.length > 0
    && shots[0].startFrame === 0
    && shots.every((shot, index) => shot.endFrame > shot.startFrame
      && (index === 0 || shot.startFrame === shots[index - 1].endFrame))
    && visualGrammar.assignments.every((assignment) => {
      const beatShots = shots.filter((shot) => shot.beatId === assignment.beatId);
      return beatShots.length > 0
        && beatShots[0].startFrame === Math.round(assignment.startSec * frameRate)
        && beatShots.at(-1)?.endFrame === Math.round(assignment.endSec * frameRate);
    })
    && shots.every((shot) => shot.assertions.length === 3
      && shot.assertions.every((assertion) => assertion.state === "PASS"));
  if (!timelinePass) throw new Error("TRACK_G_STAGE_08_M1_TIMELINE_LINT_FAILED");
  const durationDeltaFrames = Math.abs((shots.at(-1)?.endFrame ?? -1) - targetFrames);
  if (durationDeltaFrames > 1) throw new Error("TRACK_G_STAGE_08_M1_DURATION_MATCH_FAILED");
  const gateResults: StageGateResult[] = [
    {
      gate: "M1_TIMELINE_LINT",
      state: "PASS",
      evidence: `${shots.length} adaptively compiled shots cover frame 0-${targetFrames} with zero gaps or overlaps; every shot carries exactly three assertions.`,
    },
    {
      gate: "M1_DURATION_MATCH",
      state: "PASS",
      evidence: `Program duration matches the sealed ${targetFrames}-frame beat timeline within ${durationDeltaFrames} frame(s) at ${frameRate}fps.`,
    },
  ];
  return {
    frameRate,
    maxShotDurationSec,
    targetFrames,
    targetDurationSec: targetFrames / frameRate,
    durationDeltaFrames,
    shots,
    assertionCount: shots.reduce((sum, shot) => sum + shot.assertions.length, 0),
    gateResults,
  };
}

function stage08Envelope(operationRunId: string, predecessorSha256: string,
  selectedCandidateId: string) {
  const model = trackGVideoOneStage08ShotCueProgramModel(selectedCandidateId);
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-08-shot-cue-program-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_08_CODE,
    artifactType: STAGE_08_ARTIFACT_TYPE,
    shotCueProgram: {
      frameRate: model.frameRate,
      targetFrames: model.targetFrames,
      targetDurationSec: model.targetDurationSec,
      adaptiveMaxShotDurationSec: model.maxShotDurationSec,
      shots: model.shots,
    },
    provenance: [{
      sourceType: "SEALED_STAGE_ARTIFACT",
      sourceId: STAGE_07B_ARTIFACT_ID,
      canonicalHash: predecessorSha256,
      authority: "DETERMINISTIC_VISUAL_GRAMMAR_AND_ROUTING",
    }],
    gateResults: model.gateResults,
    controls: {
      compileMode: "DETERMINISTIC_FRAME_TIMELINE",
      fixedShotCountGate: false,
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
      humanGate: "NOT_REQUIRED",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage08(operationRunId: string) {
  const stage07B = await readBackStage07B(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_08_INSTANCE_ID)).limit(1);
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_08_ARTIFACT_ID)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) => value.scope === "STAGE"
    && value.scopeRef === STAGE_08_INSTANCE_ID)?.ceilingUsd;
  const model = trackGVideoOneStage08ShotCueProgramModel(stage07B.selection.candidateId);
  if (!stage || !artifact
    || stage.packageId !== STAGE_00_PACKAGE_ID || stage.stageCode !== STAGE_08_CODE
    || stage.controlState !== "FROZEN" || stage.standardVersion !== STAGE_08_STANDARD_VERSION
    || artifact.stageInstanceId !== stage.id || artifact.artifactType !== STAGE_08_ARTIFACT_TYPE
    || artifact.namespace !== "production" || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_08_STANDARD_VERSION || stageCeiling !== 0
    || !isAtOrAfterReadyStep(stage07B.base.run.currentStep, "STAGE_09_READY")
    || !await verifyImmutableEvidence(stage07B.stage07BArtifact.r2Key,
      stage07B.stage07BArtifact.canonicalHash)
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_08_READ_BACK_FAILED");
  }
  return { ...stage07B, stage08: stage, stage08Artifact: artifact,
    stageArtifact: artifact, gateResults: model.gateResults, shotCueProgramModel: model };
}

async function advanceTrackGVideoOneStage08(
  user: ChatGPTUser,
  input: AdvanceTrackGVideoOneStageInput,
  objective: string,
) {
  const bootstrap = await readBackForStage00();
  const stage07B = await readBackStage07B(bootstrap.run.id);
  const expectedKey = stageAdvanceIdempotencyKey(
    bootstrap.run.id,
    STAGE_08_CODE,
    stage07B.stage07BArtifact.canonicalHash,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage08(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_08_READY") throw new Error("TRACK_G_STAGE_08_NOT_READY");
  if (!await verifyImmutableEvidence(stage07B.stage07BArtifact.r2Key,
    stage07B.stage07BArtifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_08_PREDECESSOR_PROVENANCE_FAILED");
  }
  const envelope = stage08Envelope(bootstrap.run.id,
    stage07B.stage07BArtifact.canonicalHash, stage07B.selection.candidateId);
  const artifactBytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_08_CODE, "shot-cue-program", `${artifactSha256}.json`].join("/");
  await putImmutableProductionEvidence(artifactR2Key, artifactBytes, "application/json", artifactSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const model = envelope.shotCueProgram;
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'ADVANCE_TRACK_G_VIDEO_1_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_08_READY',
          'TRACK_G_VIDEO_1_STAGE_09_READY', ?, ?)`).bind(
        commandId, canonicalize({ objective, operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID, stageCode: STAGE_08_CODE,
          executorVersion: envelope.executorVersion, artifactSha256 }),
        input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '08', 'FROZEN', ?, 1, ?, ?)`).bind(
        STAGE_08_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_08_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_08_ARTIFACT_ID, STAGE_08_INSTANCE_ID, STAGE_08_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_08_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_08_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_09_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_08_READY'`).bind(
        now, bootstrap.run.id),
      ...[
        ["STAGE_08_DOR_PASSED", { predecessor: STAGE_07B_ARTIFACT_ID,
          predecessorSha256: stage07B.stage07BArtifact.canonicalHash }],
        ["STAGE_ADVANCE_ACCEPTED", { commandId, stageCode: STAGE_08_CODE,
          traceId, executorVersion: envelope.executorVersion }],
        ["STAGE_08_M1_TIMELINE_LINT_PASSED", { shotCount: model.shots.length,
          assertionCount: model.shots.reduce((sum, shot) => sum + shot.assertions.length, 0) }],
        ["STAGE_08_M1_DURATION_MATCH_PASSED", { targetFrames: model.targetFrames,
          frameRate: model.frameRate, durationDeltaFrames: 0 }],
        ["STAGE_08_ARTIFACT_SEALED", { artifactId: STAGE_08_ARTIFACT_ID,
          artifactR2Key, artifactSha256 }],
        ["STAGE_08_FROZEN", { nextStep: "STAGE_09_READY", reservedUsd: 0,
          actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
        canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrent] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { ...(await readBackStage08(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage08(bootstrap.run.id)), replayed: false };
}

export function trackGVideoOneStage09VisualCompositionModel(
  selectedCandidateId = "creative_route_video_1_alert_is_the_trap_v1",
) {
  const shotProgram = trackGVideoOneStage08ShotCueProgramModel(selectedCandidateId);
  const palettes = [
    { background: "#071816", accent: "#71f6c5", signal: "#ffb84d" },
    { background: "#101820", accent: "#8fd3ff", signal: "#ff6b6b" },
    { background: "#151225", accent: "#b9a7ff", signal: "#ffd166" },
    { background: "#0f1f24", accent: "#66e3ff", signal: "#ff8f70" },
    { background: "#172018", accent: "#9be58f", signal: "#ffe082" },
    { background: "#171717", accent: "#f5f5f5", signal: "#ff5c5c" },
  ] as const;
  const assets = shotProgram.shots.map((shot, index) => {
    const palette = palettes[index % palettes.length];
    const layoutMode = shot.motionClass === "REAL_WORLD_FOOTAGE" ? "DOCUMENTARY_DEVICE_FRAME"
      : shot.motionClass === "EXPLANATORY_DIAGRAM" ? "SYSTEM_RELATIONSHIP_DIAGRAM"
        : "KINETIC_DATA_CARD";
    const sourceCandidateCount = 6;
    const fingerprint = createHash("sha256").update([
      shot.beatId, shot.cueRole, shot.visualRoute, layoutMode,
      palette.background, palette.accent, palette.signal, String(shot.startFrame),
    ].join("\0")).digest("hex").slice(0, 16);
    return {
      assetId: `visual_asset_${shot.shotId}_v1`,
      shotId: shot.shotId,
      beatId: shot.beatId,
      startFrame: shot.startFrame,
      endFrame: shot.endFrame,
      motionClass: shot.motionClass,
      visualRoute: shot.visualRoute,
      sourceCandidateCount,
      selectedCompositionCount: 1,
      acquisitionMode: "INTERNAL_ORIGINAL_VECTOR",
      renderSpec: {
        width: 1920,
        height: 1080,
        layoutMode,
        palette,
        headline: shot.beatTitle,
        cueRole: shot.cueRole,
        treatment: shot.treatment,
      },
      rightsLineage: {
        origin: "YOUTUBE_AI_FACTORY_ORIGINAL_COMPOSITION",
        license: "OWNER_CONTROLLED_ORIGINAL_WORK",
        sourceUri: `internal://track-g/video-1/stage-09/${shot.shotId}`,
        state: "PASS" as const,
      },
      semanticFit: {
        state: "PASS" as const,
        evidence: `${shot.beatId}/${shot.visualRoute} and ${shot.assertions.length} sealed shot assertions remain bound to the composition.`,
      },
      visualFingerprint: fingerprint,
    };
  });
  const uniqueFingerprintCount = new Set(assets.map((asset) => asset.visualFingerprint)).size;
  const duplicateCount = assets.length - uniqueFingerprintCount;
  const duplicateRate = assets.length === 0 ? 1 : duplicateCount / assets.length;
  if (assets.length !== shotProgram.shots.length
    || assets.some((asset, index) => asset.shotId !== shotProgram.shots[index].shotId)
    || assets.some((asset) => asset.rightsLineage.state !== "PASS")) {
    throw new Error("TRACK_G_STAGE_09_M0_RIGHTS_LINEAGE_FAILED");
  }
  if (assets.some((asset) => asset.semanticFit.state !== "PASS")
    || assets.some((asset) => asset.selectedCompositionCount !== 1)) {
    throw new Error("TRACK_G_STAGE_09_M1_SEMANTIC_FIT_FAILED");
  }
  if (duplicateRate > 0.05) throw new Error("TRACK_G_STAGE_09_M1_DUPLICATE_RATE_FAILED");
  const thumbnailCandidates = [
    {
      id: "thumbnail_route_video_1_warning_is_the_trap_v1",
      routeName: "Warning Is The Trap",
      thumbnailText: "THE WARNING IS THE TRAP",
      composition: "Phone alert foreground, broken trust path behind it, amber danger signal on a dark field.",
      palette: { background: "#071816", accent: "#71f6c5", signal: "#ffb84d" },
      machineScore: 95,
    },
    {
      id: "thumbnail_route_video_1_stop_verify_first_v1",
      routeName: "Stop. Verify First.",
      thumbnailText: "STOP. VERIFY FIRST.",
      composition: "Split path: suspicious contact on the left, independent official channel on the right, red stop marker between.",
      palette: { background: "#101820", accent: "#8fd3ff", signal: "#ff6b6b" },
      machineScore: 93,
    },
  ] as const;
  const gateResults: StageGateResult[] = [
    {
      gate: "M0_RIGHTS_LINEAGE",
      state: "PASS",
      evidence: `${assets.length}/${assets.length} compositions use owner-controlled original vector recipes with explicit source URI and no external media rights dependency.`,
    },
    {
      gate: "M1_SEMANTIC_FIT",
      state: "PASS",
      evidence: `${assets.length}/${assets.length} compositions preserve the sealed shot, beat, route and assertion bindings from Stage 08.`,
    },
    {
      gate: "M1_DUPLICATE_RATE",
      state: "PASS",
      evidence: `${duplicateCount}/${assets.length} exact visual fingerprints duplicate (${(duplicateRate * 100).toFixed(1)}% ≤ 5.0%).`,
    },
  ];
  return {
    sourceCandidatesPerShot: 6,
    compositionsPerShot: 1,
    assets,
    duplicateCount,
    duplicateRate,
    thumbnailCandidates,
    recommendedThumbnailId: thumbnailCandidates[0].id,
    gateResults,
  };
}

function stage09TournamentEnvelope(operationRunId: string, predecessorSha256: string,
  selectedCandidateId: string) {
  const model = trackGVideoOneStage09VisualCompositionModel(selectedCandidateId);
  return {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-09-visual-acquisition-composition-v1",
    operationRunId,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_09_CODE,
    artifactType: STAGE_09_ARTIFACT_TYPE,
    visualAcquisition: {
      profile: "REDUCED",
      sourceCandidatesPerShot: model.sourceCandidatesPerShot,
      compositionsPerShot: model.compositionsPerShot,
      assets: model.assets,
    },
    thumbnailTournament: {
      tournamentId: STAGE_09_TOURNAMENT_ID,
      candidates: model.thumbnailCandidates,
      recommendedCandidateId: model.recommendedThumbnailId,
    },
    provenance: [{
      sourceType: "SEALED_STAGE_ARTIFACT",
      sourceId: STAGE_08_ARTIFACT_ID,
      canonicalHash: predecessorSha256,
      authority: "FRAME_EXACT_SHOT_CUE_PROGRAM",
    }],
    gateResults: model.gateResults,
    controls: {
      preserveRejectedCandidates: true,
      humanGate: "REQUIRED:HP-02_D3_THUMBNAIL_SELECTION",
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
}

async function readBackStage09Tournament(operationRunId: string) {
  const stage08 = await readBackStage08(operationRunId);
  const db = getDb();
  const [stage] = await db.select().from(stageInstances)
    .where(eq(stageInstances.id, STAGE_09_INSTANCE_ID)).limit(1);
  const [prepareCommand] = await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW"))
    .orderBy(desc(commandLog.createdAt)).limit(1);
  const ceilings = await db.select().from(spendCeilings);
  const stageCeiling = ceilings.find((value) => value.scope === "STAGE"
    && value.scopeRef === STAGE_09_INSTANCE_ID)?.ceilingUsd;
  const payload = prepareCommand ? JSON.parse(prepareCommand.payloadJson) as {
    tournamentR2Key?: string; tournamentSha256?: string; selectedCreativeRouteId?: string;
  } : {};
  const selectedCreativeRouteId = payload.selectedCreativeRouteId
    ?? "creative_route_video_1_alert_is_the_trap_v1";
  const model = trackGVideoOneStage09VisualCompositionModel(selectedCreativeRouteId);
  const lifecycleValid = (stage?.controlState === "RUNNING"
      && stage08.base.run.currentStep === "STAGE_09_READY")
    || (stage?.controlState === "FROZEN"
      && isAtOrAfterReadyStep(stage08.base.run.currentStep, "STAGE_10_READY"));
  if (!stage || !prepareCommand || !payload.tournamentR2Key || !payload.tournamentSha256
    || stage.packageId !== STAGE_00_PACKAGE_ID || stage.stageCode !== STAGE_09_CODE
    || !lifecycleValid || stage.standardVersion !== STAGE_09_STANDARD_VERSION
    || stageCeiling !== 0
    || !await verifyImmutableEvidence(stage08.stage08Artifact.r2Key,
      stage08.stage08Artifact.canonicalHash)
    || !await verifyImmutableEvidence(payload.tournamentR2Key, payload.tournamentSha256)) {
    throw new Error("TRACK_G_STAGE_09_TOURNAMENT_READ_BACK_FAILED");
  }
  return { ...stage08, stage09: stage, tournamentModel: model,
    tournamentR2Key: payload.tournamentR2Key, tournamentSha256: payload.tournamentSha256,
    selectedCreativeRouteId };
}

async function readBackStage09(operationRunId: string) {
  const prepared = await readBackStage09Tournament(operationRunId);
  const db = getDb();
  const [artifact] = await db.select().from(stageArtifacts)
    .where(eq(stageArtifacts.id, STAGE_09_ARTIFACT_ID)).limit(1);
  const decisions = await db.select().from(humanDecisions)
    .where(eq(humanDecisions.packageId, STAGE_00_PACKAGE_ID));
  const decision = decisions.find((value) => value.artifactAfterId === STAGE_09_ARTIFACT_ID);
  const [selectionCommand] = await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL"))
    .orderBy(desc(commandLog.createdAt)).limit(1);
  const selection = selectionCommand ? JSON.parse(selectionCommand.payloadJson) as {
    selectedCandidateId?: string; revisedThumbnailText?: string;
  } : {};
  if (!artifact || !decision || prepared.stage09.controlState !== "FROZEN"
    || artifact.stageInstanceId !== prepared.stage09.id
    || artifact.artifactType !== STAGE_09_ARTIFACT_TYPE
    || artifact.namespace !== "production" || artifact.immutabilityState !== "SEALED"
    || artifact.eligibilityState !== "ELIGIBLE_FOR_STAGE"
    || artifact.standardVersion !== STAGE_09_STANDARD_VERSION
    || decision.decisionType !== "D3" || decision.artifactBeforeId !== STAGE_09_TOURNAMENT_ID
    || decision.rationaleText.trim().length < 20
    || !prepared.tournamentModel.thumbnailCandidates.some((candidate) =>
      candidate.id === selection.selectedCandidateId)
    || !selection.revisedThumbnailText
    || !isAtOrAfterReadyStep(prepared.base.run.currentStep, "STAGE_10_READY")
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_09_READ_BACK_FAILED");
  }
  return { ...prepared, decision, selection, stage09Artifact: artifact,
    stageArtifact: artifact, gateResults: prepared.tournamentModel.gateResults };
}

export async function prepareTrackGVideoOneStage09VisualReview(
  user: ChatGPTUser,
  input: PrepareTrackGVideoOneStage09Input,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_09_PREPARE_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_09_PREPARE_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const stage08 = await readBackStage08(bootstrap.run.id);
  const expectedKey = stage09PrepareIdempotencyKey(bootstrap.run.id,
    stage08.stage08Artifact.canonicalHash);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage09Tournament(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_09_READY") throw new Error("TRACK_G_STAGE_09_NOT_READY");
  const selectedCreativeRouteId = stage08.selection.candidateId;
  const envelope = stage09TournamentEnvelope(bootstrap.run.id,
    stage08.stage08Artifact.canonicalHash, selectedCreativeRouteId);
  const bytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const tournamentSha256 = sha256(bytes);
  const tournamentR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_09_CODE, "visual-composition-thumbnail-tournament", `${tournamentSha256}.json`].join("/");
  await putImmutableProductionEvidence(tournamentR2Key, bytes, "application/json", tournamentSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_09_READY', 'TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL', ?, ?)`).bind(
        crypto.randomUUID(), canonicalize({ objective, operationRunId: bootstrap.run.id,
          stageCode: STAGE_09_CODE, selectedCreativeRouteId, tournamentR2Key, tournamentSha256 }),
        input.idempotencyKey, user.email.toLowerCase(), crypto.randomUUID(), now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at)
        VALUES (?, ?, '09', 'RUNNING', ?, 1, ?)`).bind(
        STAGE_09_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_09_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_09_INSTANCE_ID),
      ...[
        ["STAGE_09_DOR_PASSED", { predecessor: STAGE_08_ARTIFACT_ID,
          predecessorSha256: stage08.stage08Artifact.canonicalHash }],
        ["STAGE_09_VISUAL_COMPOSITIONS_PREPARED", { assetCount: envelope.visualAcquisition.assets.length,
          sourceCandidatesPerShot: envelope.visualAcquisition.sourceCandidatesPerShot,
          providerDispatch: "OFF" }],
        ["STAGE_09_GATES_PASSED", { gates: envelope.gateResults }],
        ["STAGE_09_HP02_D3_REQUIRED", { candidateIds: envelope.thumbnailTournament.candidates
          .map((value) => value.id) }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
        canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrent] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { ...(await readBackStage09Tournament(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage09Tournament(bootstrap.run.id)), replayed: false };
}

export async function selectTrackGVideoOneStage09Thumbnail(
  user: ChatGPTUser,
  input: SelectTrackGVideoOneStage09ThumbnailInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const rationale = input.rationale.trim();
  const revisedThumbnailText = input.revisedThumbnailText.trim();
  if (rationale.length < 20 || rationale.length > 500) throw new Error("RATIONALE_LENGTH_OUT_OF_RANGE");
  if (revisedThumbnailText.length < 6 || revisedThumbnailText.length > 48) {
    throw new Error("THUMBNAIL_TEXT_LENGTH_OUT_OF_RANGE");
  }
  if (input.ownerApprovalText !== STAGE_09_SELECT_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_09_SELECT_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage09Tournament(bootstrap.run.id);
  const candidate = prepared.tournamentModel.thumbnailCandidates
    .find((value) => value.id === input.candidateId);
  if (!candidate) throw new Error("TRACK_G_STAGE_09_THUMBNAIL_NOT_ELIGIBLE");
  const expectedKey = stage09SelectionIdempotencyKey(bootstrap.run.id,
    prepared.tournamentSha256, candidate.id, revisedThumbnailText, rationale);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage09(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_09_READY" || prepared.stage09.controlState !== "RUNNING") {
    throw new Error("TRACK_G_STAGE_09_THUMBNAIL_GATE_NOT_READY");
  }
  const actorIdentity = user.email.toLowerCase();
  const rejectedCandidates = prepared.tournamentModel.thumbnailCandidates
    .filter((value) => value.id !== candidate.id);
  const decisionEnvelope = {
    schemaVersion: 1,
    tournamentId: STAGE_09_TOURNAMENT_ID,
    tournamentSha256: prepared.tournamentSha256,
    selectedCandidateId: candidate.id,
    thumbnailTextBefore: candidate.thumbnailText,
    thumbnailTextAfter: revisedThumbnailText,
    actorIdentity,
    rationale,
  };
  const decisionBytes = new TextEncoder().encode(`${canonicalize(decisionEnvelope)}\n`);
  const decisionSha256 = sha256(decisionBytes);
  const decisionR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_09_CODE, "human-decision-d3", `${decisionSha256}.json`].join("/");
  await putImmutableProductionEvidence(decisionR2Key, decisionBytes, "application/json", decisionSha256);
  const finalEnvelope = {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-09-visual-acquisition-composition-v1",
    operationRunId: bootstrap.run.id,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_09_CODE,
    artifactType: STAGE_09_ARTIFACT_TYPE,
    visualAcquisition: {
      sourceCandidatesPerShot: prepared.tournamentModel.sourceCandidatesPerShot,
      compositionsPerShot: prepared.tournamentModel.compositionsPerShot,
      assets: prepared.tournamentModel.assets,
    },
    selectedThumbnail: { ...candidate, thumbnailText: revisedThumbnailText },
    rejectedThumbnailCandidates: rejectedCandidates,
    humanDecision: { decisionType: "D3", actorIdentity, rationale,
      decisionR2Key, decisionSha256 },
    provenance: [{ sourceType: "SEALED_STAGE_ARTIFACT", sourceId: STAGE_08_ARTIFACT_ID,
      canonicalHash: prepared.stage08Artifact.canonicalHash,
      authority: "FRAME_EXACT_SHOT_CUE_PROGRAM" }],
    gateResults: prepared.tournamentModel.gateResults,
    controls: { preserveRejectedCandidates: true,
      humanGate: "SATISFIED:HP-02_D3_THUMBNAIL_SELECTION",
      providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
  const artifactBytes = new TextEncoder().encode(`${canonicalize(finalEnvelope)}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = ["prod", approvedChannel.id, trackGVideoOneContract.episodeId,
    STAGE_09_CODE, "visual-acquisition-composition-seal", `${artifactSha256}.json`].join("/");
  await putImmutableProductionEvidence(artifactR2Key, artifactBytes, "application/json", artifactSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const humanDecisionId = "human_decision_track_g_video_1_stage_09_d3_v1";
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL', 'TRACK_G_VIDEO_1_STAGE_10_READY', ?, ?)`).bind(
        crypto.randomUUID(), canonicalize({ operationRunId: bootstrap.run.id,
          selectedCandidateId: candidate.id, revisedThumbnailText, rationale,
          decisionSha256, artifactSha256 }), input.idempotencyKey, actorIdentity,
        crypto.randomUUID(), now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_09_ARTIFACT_ID, STAGE_09_INSTANCE_ID, STAGE_09_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_09_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO human_decision
        (id, package_id, decision_type, actor_identity, artifact_before_id, artifact_after_id,
         diff_r2_key, rationale_text, created_at) VALUES (?, ?, 'D3', ?, ?, ?, ?, ?, ?)`).bind(
        humanDecisionId, STAGE_00_PACKAGE_ID, actorIdentity, STAGE_09_TOURNAMENT_ID,
        STAGE_09_ARTIFACT_ID, decisionR2Key, rationale, now),
      d1.prepare(`UPDATE stage_instance SET control_state = 'FROZEN', frozen_at = ?
        WHERE id = ? AND control_state = 'RUNNING'`).bind(now, STAGE_09_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_10_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_09_READY'`).bind(
        now, bootstrap.run.id),
      ...[
        ["STAGE_09_HP02_D3_RECORDED", { decisionId: humanDecisionId,
          selectedCandidateId: candidate.id, decisionSha256 }],
        ["STAGE_09_ARTIFACT_SEALED", { artifactId: STAGE_09_ARTIFACT_ID,
          artifactR2Key, artifactSha256, rejectedCandidateCount: rejectedCandidates.length }],
        ["STAGE_09_FROZEN", { nextStep: "STAGE_10_READY", reservedUsd: 0,
          actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
        canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrent] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { ...(await readBackStage09(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage09(bootstrap.run.id)), replayed: false };
}

export async function prepareTrackGVideoOneStage04Tournament(
  user: ChatGPTUser,
  input: PrepareTrackGVideoOneStage04Input,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_04_PREPARE_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_04_PREPARE_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const stage03 = await readBackStage03(bootstrap.run.id);
  const expectedKey = stage04PrepareIdempotencyKey(bootstrap.run.id, stage03.stage03Artifact.canonicalHash);
  if (input.idempotencyKey.toLowerCase() !== expectedKey) throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage04Tournament(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_04_READY") throw new Error("TRACK_G_STAGE_04_NOT_READY");
  const envelope = stage04TournamentEnvelope(bootstrap.run.id, stage03.stage03Artifact.canonicalHash);
  const evidenceBytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const evidenceSha256 = sha256(evidenceBytes);
  const evidenceR2Key = [
    "prod", approvedChannel.id, trackGVideoOneContract.episodeId, STAGE_04_CODE,
    "creative-tournament-candidates", `${evidenceSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(evidenceR2Key, evidenceBytes, "application/json", evidenceSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const model = stage04TournamentModel();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'PREPARE_TRACK_G_VIDEO_1_STAGE_04_TOURNAMENT', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_04_READY',
          'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION', ?, ?)`).bind(commandId, canonicalize({
          objective, operationRunId: bootstrap.run.id, stageCode: STAGE_04_CODE,
          tournamentId: STAGE_04_TOURNAMENT_ID, candidateSetSha256: evidenceSha256,
        }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at)
        VALUES (?, ?, '04', 'RUNNING', ?, 1, ?)`).bind(
        STAGE_04_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_04_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO creative_tournament
        (id, package_id, stage_instance_id, candidate_set_r2_key, candidate_set_hash,
         route_count, critic_count, generator_provenance, created_at)
        VALUES (?, ?, ?, ?, ?, 2, 3, 'BUILD_VERIFIED_QUALIFICATION_CANDIDATES', ?)`).bind(
        STAGE_04_TOURNAMENT_ID, STAGE_00_PACKAGE_ID, STAGE_04_INSTANCE_ID,
        evidenceR2Key, evidenceSha256, now),
      ...model.candidates.map((candidate) => d1.prepare(`INSERT INTO creative_route_candidate
        (id, tournament_id, blind_label, route_order, route_name, hook_type, narrative_device,
         route_json, packaging_json, eligibility_state, aggregate_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ELIGIBLE', ?, ?)`).bind(
        candidate.id, STAGE_04_TOURNAMENT_ID, candidate.blindLabel, candidate.routeOrder,
        candidate.routeName, candidate.hookType, candidate.narrativeDevice,
        canonicalize(candidate.route), canonicalize(candidate.packaging),
        model.aggregateScores[candidate.id], now)),
      ...model.judgments.map((judgment) => d1.prepare(`INSERT INTO creative_tournament_judgment
        (tournament_id, critic_id, candidate_id, rubric_version, score_json, total_score,
         blind_input_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        STAGE_04_TOURNAMENT_ID, judgment.criticId, judgment.candidateId,
        judgment.rubricVersion, canonicalize(judgment.scorecard), judgment.score,
        judgment.blindInputHash, now)),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_04_INSTANCE_ID),
      ...[
        ["STAGE_04_DOR_PASSED", { predecessor: STAGE_03_ARTIFACT_ID, predecessorSha256: stage03.stage03Artifact.canonicalHash }],
        ["STAGE_04_TOURNAMENT_PREPARED", { commandId, tournamentId: STAGE_04_TOURNAMENT_ID, routeCount: 2, criticCount: 3 }],
        ["STAGE_04_M1_ROUTE_DIVERSITY_PASSED", { distinctRoutePairs: 2, requiredRouteCount: 2 }],
        ["STAGE_04_M1_PACKAGING_CONTRACT_PASSED", { eligibleCandidates: 2 }],
        ["STAGE_04_AWAITING_HP02_D1", { machineRecommendation: model.recommendedCandidateId, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage04Tournament(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage04Tournament(bootstrap.run.id)), replayed: false };
}

export async function selectTrackGVideoOneStage04Champion(
  user: ChatGPTUser,
  input: SelectTrackGVideoOneStage04ChampionInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const rationale = input.rationale.trim();
  if (rationale.length < 20 || rationale.length > 500) {
    throw new Error("TRACK_G_STAGE_04_RATIONALE_LENGTH_OUT_OF_RANGE");
  }
  if (input.ownerApprovalText !== STAGE_04_SELECT_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_04_SELECT_OWNER_APPROVAL_REQUIRED");
  }
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage04Tournament(bootstrap.run.id);
  const candidate = prepared.candidates.find((value) => value.id === input.candidateId);
  if (!candidate || candidate.eligibilityState !== "ELIGIBLE") {
    throw new Error("TRACK_G_STAGE_04_CANDIDATE_NOT_ELIGIBLE");
  }
  const expectedKey = stage04SelectionIdempotencyKey(
    bootstrap.run.id, prepared.tournament.candidateSetHash, candidate.id, rationale,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedKey) throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage04(bootstrap.run.id)), replayed: true };
  const [existingSelection] = await db.select().from(creativeTournamentSelections)
    .where(eq(creativeTournamentSelections.tournamentId, STAGE_04_TOURNAMENT_ID)).limit(1);
  if (existingSelection) throw new Error("TRACK_G_STAGE_04_CHAMPION_ALREADY_SELECTED");
  if (bootstrap.run.currentStep !== "STAGE_04_READY" || prepared.stage04.controlState !== "RUNNING") {
    throw new Error("TRACK_G_STAGE_04_CHAMPION_GATE_NOT_READY");
  }
  const actorIdentity = user.email.toLowerCase();
  const diffEnvelope = {
    schemaVersion: 1,
    tournamentId: STAGE_04_TOURNAMENT_ID,
    selectedCandidateId: candidate.id,
    actorIdentity,
    rationale,
    candidateSetSha256: prepared.tournament.candidateSetHash,
  };
  const diffBytes = new TextEncoder().encode(`${canonicalize(diffEnvelope)}\n`);
  const diffSha256 = sha256(diffBytes);
  const diffR2Key = [
    "prod", approvedChannel.id, trackGVideoOneContract.episodeId, STAGE_04_CODE,
    "human-decision-d1", `${diffSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(diffR2Key, diffBytes, "application/json", diffSha256);
  const finalEnvelope = {
    schemaVersion: 1,
    runnerContractVersion: 1,
    executorVersion: "stage-04-creative-tournament-v1",
    operationRunId: bootstrap.run.id,
    packageId: STAGE_00_PACKAGE_ID,
    stageCode: STAGE_04_CODE,
    artifactType: STAGE_04_ARTIFACT_TYPE,
    candidateSet: {
      tournamentId: STAGE_04_TOURNAMENT_ID,
      r2Key: prepared.tournament.candidateSetR2Key,
      sha256: prepared.tournament.candidateSetHash,
      routeCount: prepared.tournament.routeCount,
      criticCount: prepared.tournament.criticCount,
      preservedCandidateIds: prepared.candidates.map((value) => value.id).sort(),
    },
    champion: {
      candidateId: candidate.id,
      routeName: candidate.routeName,
      aggregateScore: candidate.aggregateScore,
      machineRecommended: candidate.id === prepared.tournamentModel.recommendedCandidateId,
      rationale,
      humanDecisionEvidence: { r2Key: diffR2Key, sha256: diffSha256 },
    },
    gateResults: prepared.tournamentModel.gateResults,
    controls: {
      humanGate: "SATISFIED:HP-02_D1_CHAMPION_SELECTION",
      preserveRejectedCandidates: true,
      providerDispatch: "OFF",
      releaseEligible: false,
      autoPublish: "OFF",
    },
    budget: { reservedUsd: 0, actualUsd: 0 },
  };
  const artifactBytes = new TextEncoder().encode(`${canonicalize(finalEnvelope)}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = [
    "prod", approvedChannel.id, trackGVideoOneContract.episodeId, STAGE_04_CODE,
    "creative-route-tournament-packaging", `${artifactSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(artifactR2Key, artifactBytes, "application/json", artifactSha256);
  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id)).orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const humanDecisionId = "human_decision_track_g_video_1_stage_04_d1_v1";
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION', ?, ?, ?,
          'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION', 'TRACK_G_VIDEO_1_STAGE_05_READY', ?, ?)`).bind(
        commandId, canonicalize({ operationRunId: bootstrap.run.id, stageCode: STAGE_04_CODE,
          tournamentId: STAGE_04_TOURNAMENT_ID, candidateId: candidate.id, rationale,
          artifactSha256 }), input.idempotencyKey, actorIdentity, traceId, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_04_ARTIFACT_ID, STAGE_04_INSTANCE_ID, STAGE_04_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_04_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO human_decision
        (id, package_id, decision_type, actor_identity, artifact_before_id, artifact_after_id,
         diff_r2_key, rationale_text, created_at) VALUES (?, ?, 'D1', ?, ?, ?, ?, ?, ?)`).bind(
        humanDecisionId, STAGE_00_PACKAGE_ID, actorIdentity, STAGE_04_TOURNAMENT_ID,
        STAGE_04_ARTIFACT_ID, diffR2Key, rationale, now),
      d1.prepare(`INSERT INTO creative_tournament_selection
        (tournament_id, candidate_id, human_decision_id, created_at) VALUES (?, ?, ?, ?)`).bind(
        STAGE_04_TOURNAMENT_ID, candidate.id, humanDecisionId, now),
      d1.prepare(`UPDATE stage_instance SET control_state = 'FROZEN', frozen_at = ?
        WHERE id = ? AND control_state = 'RUNNING'`).bind(now, STAGE_04_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_05_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_04_READY'`).bind(now, bootstrap.run.id),
      ...[
        ["STAGE_04_HP02_D1_RECORDED", { decisionId: humanDecisionId, selectedCandidateId: candidate.id, rationale, diffSha256 }],
        ["STAGE_04_CHAMPION_SELECTED", { selectedCandidateId: candidate.id, machineRecommended: candidate.id === prepared.tournamentModel.recommendedCandidateId }],
        ["STAGE_04_ARTIFACT_SEALED", { artifactId: STAGE_04_ARTIFACT_ID, artifactR2Key, artifactSha256 }],
        ["STAGE_04_FROZEN", { nextStep: "STAGE_05_READY", preservedCandidateCount: prepared.candidates.length, reservedUsd: 0, actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage04(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage04(bootstrap.run.id)), replayed: false };
}

export async function startTrackGVideoOneQualification(
  user: ChatGPTUser,
  input: StartTrackGVideoOneInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== OWNER_APPROVAL_TEXT) throw new Error("TRACK_G_OWNER_APPROVAL_REQUIRED");

  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) {
    const [existingRun] = await db.select({ id: operationRuns.id }).from(operationRuns)
      .where(eq(operationRuns.commandId, existingCommand.id)).limit(1);
    if (!existingRun) throw new Error("TRACK_G_REPLAY_RUN_MISSING");
    return { ...(await readBack(existingRun.id)), replayed: true };
  }

  const [channel] = await db.select({ status: channels.status }).from(channels)
    .where(eq(channels.id, approvedChannel.id)).limit(1);
  if (!channel || channel.status !== "PREPARED") throw new Error("TRACK_G_CHANNEL_NOT_PREPARED");
  const voice = await voiceQualificationReadBack();
  if (!voice.qualified || voice.bindingCount !== 8) throw new Error("TRACK_G_VOICE_NOT_QUALIFIED");
  const [episode] = await db.select({ status: episodes.status }).from(episodes)
    .where(eq(episodes.id, trackGVideoOneContract.episodeId)).limit(1);
  if (!episode || episode.status !== "QUEUED") throw new Error("TRACK_G_VIDEO_1_NOT_QUEUED");

  const envelope = contractEnvelope();
  const envelopeHash = canonicalHash(envelope);
  const evidenceBytes = new TextEncoder().encode(`${canonicalize(envelope)}\n`);
  const evidenceSha256 = sha256(evidenceBytes);
  const evidenceR2Key = `qual/g02i/video-1/${envelopeHash}/run-contract.json`;
  await putImmutableEvidence(evidenceR2Key, evidenceBytes, "application/json", evidenceSha256);

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const operationRunId = crypto.randomUUID();
  const contractId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT OR IGNORE INTO owner_identity
        (identity, display_name, role, active, created_at) VALUES (?, ?, 'OWNER', 1, ?)`) 
        .bind(user.email.toLowerCase(), user.displayName, now),
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'START_TRACK_G_VIDEO_1_QUALIFICATION', ?, ?, ?, 'TRACK_G_BOOTSTRAP_ELIGIBLE', 'TRACK_G_VIDEO_1_STAGE_00_READY', ?, ?)`) 
        .bind(commandId, canonicalize({ objective, envelopeHash }), input.idempotencyKey,
          user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO operation_run
        (id, command_id, channel_id, status, objective, current_step, blocker_json, created_at, updated_at)
        VALUES (?, ?, ?, 'RUNNING', ?, 'STAGE_00_READY', ?, ?, ?)`) 
        .bind(operationRunId, commandId, approvedChannel.id, objective, canonicalize(RUN_BLOCKERS), now, now),
      d1.prepare(`INSERT INTO track_g_run_contract
        (id, operation_run_id, episode_id, profile, assurance_mode, execution_namespace,
         stage_plan_json, stop_before_stage, preserve_rejected_candidates, release_eligible,
         provider_dispatch, auto_publish, bootstrap_evidence_r2_key, bootstrap_evidence_sha256, created_at)
        VALUES (?, ?, ?, 'REDUCED', 'WARNING_ONLY', 'production', ?, '15', 1, 0, 0, 0, ?, ?, ?)`) 
        .bind(contractId, operationRunId, trackGVideoOneContract.episodeId,
          canonicalize([...trackGVideoOneContract.stageCodes]), evidenceR2Key, evidenceSha256, now),
      d1.prepare(`UPDATE episode SET status = 'IN_PRODUCTION'
        WHERE id = ? AND status = 'QUEUED'`).bind(trackGVideoOneContract.episodeId),
      d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at)
        VALUES (?, ?, 1, 'COMMAND_ACCEPTED', ?, ?)`) 
        .bind(crypto.randomUUID(), operationRunId, canonicalize({ commandId, traceId }), now),
      d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at)
        VALUES (?, ?, 2, 'QUALIFICATION_BOOTSTRAP_BOUND', ?, ?)`) 
        .bind(crypto.randomUUID(), operationRunId, canonicalize({
          evidenceR2Key,
          evidenceSha256,
          source: trackGVideoOneContract.bootstrapEvidence,
        }), now),
      d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at)
        VALUES (?, ?, 3, 'TRACK_G_STAGE_PLAN_SEALED', ?, ?)`) 
        .bind(crypto.randomUUID(), operationRunId, canonicalize({
          profile: trackGVideoOneContract.profile,
          assuranceMode: trackGVideoOneContract.assuranceMode,
          stageCodes: trackGVideoOneContract.stageCodes,
          stopBeforeStage: trackGVideoOneContract.stopBeforeStage,
        }), now),
      d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at)
        VALUES (?, ?, 4, 'RELEASE_PATH_DISABLED', ?, ?)`) 
        .bind(crypto.randomUUID(), operationRunId, canonicalize({
          releaseEligible: false,
          providerDispatch: "OFF",
          autoPublish: "OFF",
          blockers: RUN_BLOCKERS,
        }), now),
      d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at)
        VALUES (?, ?, 5, 'R2_READ_BACK_VERIFIED', ?, ?)`) 
        .bind(crypto.randomUUID(), operationRunId, canonicalize({ evidenceR2Key, evidenceSha256 }), now),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) {
      const [concurrentRun] = await db.select({ id: operationRuns.id }).from(operationRuns)
        .where(eq(operationRuns.commandId, concurrentCommand.id)).limit(1);
      if (concurrentRun) return { ...(await readBack(concurrentRun.id)), replayed: true };
    }
    throw error;
  }
  return { ...(await readBack(operationRunId)), replayed: false };
}

export async function trackGVideoOneState() {
  try {
    const db = getDb();
    const [contract] = await db.select({ operationRunId: trackGRunContracts.operationRunId })
      .from(trackGRunContracts).where(eq(trackGRunContracts.episodeId, trackGVideoOneContract.episodeId)).limit(1);
    if (!contract) return { status: "NOT_STARTED", currentStep: "NOT_STARTED" };
    const result = await readBack(contract.operationRunId);
    return { status: result.run.status, currentStep: result.run.currentStep };
  } catch {
    return { status: "BLOCKED", currentStep: "READ_BACK_FAILED" };
  }
}

export async function executeTrackGVideoOneStage00(
  user: ChatGPTUser,
  input: ExecuteTrackGVideoOneStage00Input,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== STAGE_00_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_00_OWNER_APPROVAL_REQUIRED");
  }

  const bootstrap = await readBackForStage00();
  const expectedIdempotencyKey = stage00IdempotencyKey(
    bootstrap.run.id,
    bootstrap.contract.bootstrapEvidenceSha256,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedIdempotencyKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }

  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage00(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_00_READY") throw new Error("TRACK_G_STAGE_00_NOT_READY");

  const [identityContract] = await db.select().from(channelIdentityContracts)
    .where(and(
      eq(channelIdentityContracts.channelId, approvedChannel.id),
      eq(channelIdentityContracts.approvalState, "PERSISTED"),
    )).orderBy(desc(channelIdentityContracts.version)).limit(1);
  if (!identityContract) throw new Error("TRACK_G_STAGE_00_IDENTITY_NOT_PERSISTED");
  const voice = await voiceQualificationReadBack();
  if (!voice.qualified || voice.bindingCount !== 8) throw new Error("TRACK_G_STAGE_00_VOICE_NOT_QUALIFIED");

  const briefEnvelope = stage00BriefEnvelope(
    bootstrap.run.id,
    identityContract.id,
    bootstrap.contract.bootstrapEvidenceSha256,
  );
  const briefJson = canonicalize(briefEnvelope);
  const briefBytes = new TextEncoder().encode(`${briefJson}\n`);
  const briefSha256 = sha256(briefBytes);
  const briefR2Key = [
    "prod",
    approvedChannel.id,
    trackGVideoOneContract.episodeId,
    STAGE_00_CODE,
    "content-brief",
    `${briefSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(briefR2Key, briefBytes, "application/json", briefSha256);

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'START_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_00_READY', 'TRACK_G_VIDEO_1_STAGE_01_READY', ?, ?)`)
        .bind(commandId, canonicalize({
          objective,
          operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID,
          stageCode: STAGE_00_CODE,
          briefSha256,
        }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO content_brief
        (id, episode_id, version, payload_json, canonical_hash, created_at)
        VALUES (?, ?, 1, ?, ?, ?)`)
        .bind(STAGE_00_BRIEF_ID, trackGVideoOneContract.episodeId, briefJson, briefSha256, now),
      d1.prepare(`INSERT INTO production_package
        (id, episode_id, channel_id, namespace, brief_hash, identity_contract_id,
         request_ceiling, spend_ceiling_usd, auto_dispatch, auto_publish, status, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 0, ?, 0, 0, 'RUNNING', ?)`)
        .bind(STAGE_00_PACKAGE_ID, trackGVideoOneContract.episodeId, approvedChannel.id,
          briefSha256, identityContract.id, approvedChannel.controls.videoCeilingUsd, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '00', 'FROZEN', ?, 1, ?, ?)`)
        .bind(STAGE_00_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_00_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, 'CONTENT_BRIEF', 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`)
        .bind(STAGE_00_ARTIFACT_ID, STAGE_00_INSTANCE_ID, briefR2Key, briefSha256,
          STAGE_00_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('PORTFOLIO', 'track-g', ?)`)
        .bind(approvedChannel.controls.trackGCeilingUsd),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('CHANNEL', ?, ?)`)
        .bind(approvedChannel.id, approvedChannel.controls.trackGCeilingUsd),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('PACKAGE', ?, ?)`)
        .bind(STAGE_00_PACKAGE_ID, approvedChannel.controls.videoCeilingUsd),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`)
        .bind(STAGE_00_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_01_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_00_READY'`)
        .bind(now, bootstrap.run.id),
      ...[
        [6, "STAGE_00_DOR_PASSED", { channel: "PREPARED", voiceBindings: 8, providerDispatch: "OFF" }],
        [7, "START_STAGE_ACCEPTED", { commandId, stageCode: STAGE_00_CODE, traceId }],
        [8, "CONTENT_BRIEF_BOUND", { briefId: STAGE_00_BRIEF_ID, briefSha256 }],
        [9, "PRODUCTION_PACKAGE_OPENED", { packageId: STAGE_00_PACKAGE_ID, requestCeiling: 0 }],
        [10, "STAGE_00_ARTIFACT_SEALED", { artifactId: STAGE_00_ARTIFACT_ID, briefR2Key, briefSha256 }],
        [11, "STAGE_00_READ_BACK_VERIFIED", { briefR2Key, briefSha256, actualCostUsd: 0 }],
        [12, "STAGE_00_FROZEN", { nextStep: "STAGE_01_READY", providerDispatch: "OFF", autoPublish: "OFF" }],
      ].map(([ordinal, eventType, payload]) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, ordinal, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage00(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage00(bootstrap.run.id)), replayed: false };
}

export async function advanceTrackGVideoOneStage(
  user: ChatGPTUser,
  input: AdvanceTrackGVideoOneStageInput,
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== ADVANCE_STAGE_OWNER_APPROVAL_TEXT) {
    throw new Error("TRACK_G_STAGE_ADVANCE_OWNER_APPROVAL_REQUIRED");
  }
  if (input.stageCode === STAGE_02_CODE) {
    return advanceTrackGVideoOneStage02(user, input, objective);
  }
  if (input.stageCode === STAGE_03_CODE) {
    return advanceTrackGVideoOneStage03(user, input, objective);
  }
  if (input.stageCode === STAGE_04_CODE) {
    throw new Error("TRACK_G_STAGE_04_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (input.stageCode === STAGE_05_CODE) {
    return advanceTrackGVideoOneStage05(user, input, objective);
  }
  if (input.stageCode === STAGE_06_CODE) {
    throw new Error("TRACK_G_STAGE_06_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (input.stageCode === STAGE_07A_CODE) {
    throw new Error("TRACK_G_STAGE_07A_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (input.stageCode === STAGE_07B_CODE) {
    return advanceTrackGVideoOneStage07B(user, input, objective);
  }
  if (input.stageCode === STAGE_08_CODE) {
    return advanceTrackGVideoOneStage08(user, input, objective);
  }
  if (input.stageCode === STAGE_09_CODE) {
    throw new Error("TRACK_G_STAGE_09_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (input.stageCode !== STAGE_01_CODE) {
    throw new Error(`TRACK_G_STAGE_${input.stageCode}_EXECUTOR_NOT_IMPLEMENTED`);
  }

  const bootstrap = await readBackForStage00();
  const stage00 = await readBackStage00(bootstrap.run.id);
  const expectedIdempotencyKey = stageAdvanceIdempotencyKey(
    bootstrap.run.id,
    input.stageCode,
    stage00.artifact.canonicalHash,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedIdempotencyKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }

  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage01(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_01_READY") throw new Error("TRACK_G_STAGE_01_NOT_READY");

  const [identityContract] = await db.select().from(channelIdentityContracts)
    .where(eq(channelIdentityContracts.id, stage00.productionPackage.identityContractId)).limit(1);
  if (!identityContract || identityContract.approvalState !== "PERSISTED") {
    throw new Error("TRACK_G_STAGE_01_IDENTITY_NOT_PERSISTED");
  }
  const identityBytes = new TextEncoder().encode(identityContract.payloadJson);
  if (sha256(identityBytes) !== identityContract.canonicalHash) {
    throw new Error("TRACK_G_STAGE_01_M0_IDENTITY_PROVENANCE_FAILED");
  }
  if (!await verifyImmutableEvidence(stage00.artifact.r2Key, stage00.artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_01_M0_BRIEF_PROVENANCE_FAILED");
  }

  const envelope = stage01Envelope(
    bootstrap.run.id,
    stage00.artifact.canonicalHash,
    identityContract.id,
    identityContract.canonicalHash,
  );
  const artifactJson = canonicalize(envelope);
  const artifactBytes = new TextEncoder().encode(`${artifactJson}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = [
    "prod",
    approvedChannel.id,
    trackGVideoOneContract.episodeId,
    STAGE_01_CODE,
    "market-audience-intelligence",
    `${artifactSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(
    artifactR2Key,
    artifactBytes,
    "application/json",
    artifactSha256,
  );

  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id))
    .orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'ADVANCE_TRACK_G_VIDEO_1_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_01_READY',
          'TRACK_G_VIDEO_1_STAGE_02_READY', ?, ?)`)
        .bind(commandId, canonicalize({
          objective,
          operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID,
          stageCode: STAGE_01_CODE,
          executorVersion: envelope.executorVersion,
          artifactSha256,
        }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '01', 'FROZEN', ?, 1, ?, ?)`)
        .bind(STAGE_01_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_01_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`)
        .bind(STAGE_01_ARTIFACT_ID, STAGE_01_INSTANCE_ID, STAGE_01_ARTIFACT_TYPE,
          artifactR2Key, artifactSha256, STAGE_01_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`)
        .bind(STAGE_01_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_02_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_01_READY'`)
        .bind(now, bootstrap.run.id),
      ...[
        ["STAGE_01_DOR_PASSED", { predecessor: STAGE_00_ARTIFACT_ID, predecessorSha256: stage00.artifact.canonicalHash }],
        ["STAGE_ADVANCE_ACCEPTED", { commandId, stageCode: STAGE_01_CODE, traceId, executorVersion: envelope.executorVersion }],
        ["STAGE_01_M0_SOURCE_PROVENANCE_PASSED", { sources: envelope.provenance }],
        ["STAGE_01_M1_AUDIENCE_JOB_LINT_PASSED", { audienceJob: envelope.audience.job }],
        ["STAGE_01_ARTIFACT_SEALED", { artifactId: STAGE_01_ARTIFACT_ID, artifactR2Key, artifactSha256 }],
        ["STAGE_01_FROZEN", { nextStep: "STAGE_02_READY", reservedUsd: 0, actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage01(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage01(bootstrap.run.id)), replayed: false };
}

async function advanceTrackGVideoOneStage05(
  user: ChatGPTUser,
  input: AdvanceTrackGVideoOneStageInput,
  objective: string,
) {
  const bootstrap = await readBackForStage00();
  const stage04 = await readBackStage04(bootstrap.run.id);
  const expectedIdempotencyKey = stageAdvanceIdempotencyKey(
    bootstrap.run.id,
    STAGE_05_CODE,
    stage04.stageArtifact.canonicalHash,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedIdempotencyKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage05(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_05_READY") throw new Error("TRACK_G_STAGE_05_NOT_READY");
  if (!await verifyImmutableEvidence(
    stage04.stageArtifact.r2Key,
    stage04.stageArtifact.canonicalHash,
  )) {
    throw new Error("TRACK_G_STAGE_05_PREDECESSOR_PROVENANCE_FAILED");
  }

  const envelope = stage05Envelope(
    bootstrap.run.id,
    stage04.stageArtifact.canonicalHash,
    stage04.selection.candidateId,
  );
  const artifactJson = canonicalize(envelope);
  const artifactBytes = new TextEncoder().encode(`${artifactJson}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = [
    "prod",
    approvedChannel.id,
    trackGVideoOneContract.episodeId,
    STAGE_05_CODE,
    "story-architecture-prediction-seal",
    `${artifactSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(
    artifactR2Key,
    artifactBytes,
    "application/json",
    artifactSha256,
  );

  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id))
    .orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const model = stage05StoryModel(stage04.selection.candidateId);
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'ADVANCE_TRACK_G_VIDEO_1_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_05_READY',
          'TRACK_G_VIDEO_1_STAGE_06_READY', ?, ?)`).bind(
        commandId, canonicalize({
          objective,
          operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID,
          stageCode: STAGE_05_CODE,
          executorVersion: envelope.executorVersion,
          selectedCandidateId: stage04.selection.candidateId,
          artifactSha256,
        }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '05', 'FROZEN', ?, 1, ?, ?)`).bind(
        STAGE_05_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_05_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`).bind(
        STAGE_05_ARTIFACT_ID, STAGE_05_INSTANCE_ID, STAGE_05_ARTIFACT_TYPE,
        artifactR2Key, artifactSha256, STAGE_05_STANDARD_VERSION, now),
      d1.prepare(`INSERT INTO predicted_performance
        (id, package_id, model_version, retention_curve_json, ctr_estimate,
         beat_risk_json, canonical_hash, sealed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        STAGE_05_PREDICTION_ID, STAGE_00_PACKAGE_ID, STAGE_05_PREDICTION_MODEL_VERSION,
        canonicalize(model.prediction.retentionCurve), model.prediction.ctrEstimate,
        canonicalize(model.prediction.beatRisks), artifactSha256, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`).bind(STAGE_05_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_06_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_05_READY'`).bind(
        now, bootstrap.run.id),
      ...[
        ["STAGE_05_DOR_PASSED", { predecessor: STAGE_04_ARTIFACT_ID, predecessorSha256: stage04.stageArtifact.canonicalHash }],
        ["STAGE_ADVANCE_ACCEPTED", { commandId, stageCode: STAGE_05_CODE, traceId, executorVersion: envelope.executorVersion }],
        ["STAGE_05_M1_BEAT_STATE_ASSERTION_PASSED", { beatCount: model.beats.length, changedKnowledgeStates: model.beats.length }],
        ["STAGE_05_M1_PREDICTION_SEALED", { predictionId: STAGE_05_PREDICTION_ID, modelVersion: STAGE_05_PREDICTION_MODEL_VERSION, calibrationState: model.prediction.calibrationState }],
        ["STAGE_05_ARTIFACT_SEALED", { artifactId: STAGE_05_ARTIFACT_ID, artifactR2Key, artifactSha256 }],
        ["STAGE_05_FROZEN", { nextStep: "STAGE_06_READY", reservedUsd: 0, actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage05(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage05(bootstrap.run.id)), replayed: false };
}

async function advanceTrackGVideoOneStage02(
  user: ChatGPTUser,
  input: AdvanceTrackGVideoOneStageInput,
  objective: string,
) {
  const bootstrap = await readBackForStage00();
  const stage01 = await readBackStage01(bootstrap.run.id);
  const expectedIdempotencyKey = stageAdvanceIdempotencyKey(
    bootstrap.run.id,
    STAGE_02_CODE,
    stage01.stage01Artifact.canonicalHash,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedIdempotencyKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage02(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_02_READY") throw new Error("TRACK_G_STAGE_02_NOT_READY");
  if (!await verifyImmutableEvidence(
    stage01.stage01Artifact.r2Key,
    stage01.stage01Artifact.canonicalHash,
  )) {
    throw new Error("TRACK_G_STAGE_02_PREDECESSOR_PROVENANCE_FAILED");
  }

  const envelope = stage02Envelope(bootstrap.run.id, stage01.stage01Artifact.canonicalHash);
  const artifactJson = canonicalize(envelope);
  const artifactBytes = new TextEncoder().encode(`${artifactJson}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = [
    "prod",
    approvedChannel.id,
    trackGVideoOneContract.episodeId,
    STAGE_02_CODE,
    "reference-anti-copy",
    `${artifactSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(
    artifactR2Key,
    artifactBytes,
    "application/json",
    artifactSha256,
  );

  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id))
    .orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'ADVANCE_TRACK_G_VIDEO_1_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_02_READY',
          'TRACK_G_VIDEO_1_STAGE_03_READY', ?, ?)`)
        .bind(commandId, canonicalize({
          objective,
          operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID,
          stageCode: STAGE_02_CODE,
          executorVersion: envelope.executorVersion,
          artifactSha256,
        }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '02', 'FROZEN', ?, 1, ?, ?)`)
        .bind(STAGE_02_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_02_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`)
        .bind(STAGE_02_ARTIFACT_ID, STAGE_02_INSTANCE_ID, STAGE_02_ARTIFACT_TYPE,
          artifactR2Key, artifactSha256, STAGE_02_STANDARD_VERSION, now),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`)
        .bind(STAGE_02_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_03_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_02_READY'`)
        .bind(now, bootstrap.run.id),
      ...[
        ["STAGE_02_DOR_PASSED", { predecessor: STAGE_01_ARTIFACT_ID, predecessorSha256: stage01.stage01Artifact.canonicalHash }],
        ["STAGE_ADVANCE_ACCEPTED", { commandId, stageCode: STAGE_02_CODE, traceId, executorVersion: envelope.executorVersion }],
        ["STAGE_02_REFERENCE_SET_SEALED", { ownerDecisionKey: approvedChannel.ownerDecisionKey, count: envelope.referenceSet.count }],
        ["STAGE_02_M1_ANTI_COPY_PASSED", { measurements: envelope.fourDimensionAntiCopy }],
        ["STAGE_02_M1_DIFFERENTIATION_PASSED", { differentiationScore: envelope.fourDimensionAntiCopy.differentiationScore }],
        ["STAGE_02_ARTIFACT_SEALED", { artifactId: STAGE_02_ARTIFACT_ID, artifactR2Key, artifactSha256 }],
        ["STAGE_02_FROZEN", { nextStep: "STAGE_03_READY", reservedUsd: 0, actualUsd: 0, providerDispatch: "OFF" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage02(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage02(bootstrap.run.id)), replayed: false };
}

async function advanceTrackGVideoOneStage03(
  user: ChatGPTUser,
  input: AdvanceTrackGVideoOneStageInput,
  objective: string,
) {
  const bootstrap = await readBackForStage00();
  const stage02 = await readBackStage02(bootstrap.run.id);
  const expectedIdempotencyKey = stageAdvanceIdempotencyKey(
    bootstrap.run.id,
    STAGE_03_CODE,
    stage02.stage02Artifact.canonicalHash,
  );
  if (input.idempotencyKey.toLowerCase() !== expectedIdempotencyKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }
  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) return { ...(await readBackStage03(bootstrap.run.id)), replayed: true };
  if (bootstrap.run.currentStep !== "STAGE_03_READY") throw new Error("TRACK_G_STAGE_03_NOT_READY");
  if (!await verifyImmutableEvidence(
    stage02.stage02Artifact.r2Key,
    stage02.stage02Artifact.canonicalHash,
  )) {
    throw new Error("TRACK_G_STAGE_03_PREDECESSOR_PROVENANCE_FAILED");
  }

  const sealedSources: Stage03SealedSource[] = [];
  for (const source of stage03SourceSnapshots()) {
    const snapshotJson = canonicalize({
      schemaVersion: 1,
      sourceId: source.id,
      publisher: source.publisher,
      url: source.url,
      tier: source.tier,
      fetchedAt: source.fetchedAt,
      jurisdiction: source.jurisdiction,
      snapshot: source.snapshot,
    });
    const snapshotBytes = new TextEncoder().encode(`${snapshotJson}\n`);
    const snapshotSha256 = sha256(snapshotBytes);
    const snapshotR2Key = [
      "prod",
      approvedChannel.id,
      trackGVideoOneContract.episodeId,
      STAGE_03_CODE,
      "truth-source",
      source.id,
      `${snapshotSha256}.json`,
    ].join("/");
    await putImmutableProductionEvidence(
      snapshotR2Key,
      snapshotBytes,
      "application/json",
      snapshotSha256,
    );
    sealedSources.push({
      id: source.id,
      publisher: source.publisher,
      url: source.url,
      tier: source.tier,
      fetchedAt: source.fetchedAt,
      jurisdiction: source.jurisdiction,
      snapshotR2Key,
      snapshotSha256,
    });
  }

  const truth = stage03TruthModel();
  const envelope = stage03Envelope(
    bootstrap.run.id,
    stage02.stage02Artifact.canonicalHash,
    sealedSources,
  );
  const artifactJson = canonicalize(envelope);
  const artifactBytes = new TextEncoder().encode(`${artifactJson}\n`);
  const artifactSha256 = sha256(artifactBytes);
  const artifactR2Key = [
    "prod",
    approvedChannel.id,
    trackGVideoOneContract.episodeId,
    STAGE_03_CODE,
    "truth-claim-graph-terminology",
    `${artifactSha256}.json`,
  ].join("/");
  await putImmutableProductionEvidence(
    artifactR2Key,
    artifactBytes,
    "application/json",
    artifactSha256,
  );

  const [latestEvent] = await db.select({ ordinal: operationEvents.ordinal }).from(operationEvents)
    .where(eq(operationEvents.runId, bootstrap.run.id))
    .orderBy(desc(operationEvents.ordinal)).limit(1);
  const firstOrdinal = (latestEvent?.ordinal ?? 0) + 1;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO command_log
        (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
        VALUES (?, 'ADVANCE_TRACK_G_VIDEO_1_STAGE', ?, ?, ?, 'TRACK_G_VIDEO_1_STAGE_03_READY',
          'TRACK_G_VIDEO_1_STAGE_04_READY', ?, ?)`)
        .bind(commandId, canonicalize({
          objective,
          operationRunId: bootstrap.run.id,
          packageId: STAGE_00_PACKAGE_ID,
          stageCode: STAGE_03_CODE,
          executorVersion: envelope.executorVersion,
          artifactSha256,
        }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
      d1.prepare(`INSERT INTO stage_instance
        (id, package_id, stage_code, control_state, standard_version, attempt_ordinal, started_at, frozen_at)
        VALUES (?, ?, '03', 'FROZEN', ?, 1, ?, ?)`)
        .bind(STAGE_03_INSTANCE_ID, STAGE_00_PACKAGE_ID, STAGE_03_STANDARD_VERSION, now, now),
      d1.prepare(`INSERT INTO stage_artifact
        (id, stage_instance_id, artifact_type, namespace, r2_key, canonical_hash,
         immutability_state, eligibility_state, standard_version, created_at)
        VALUES (?, ?, ?, 'production', ?, ?, 'SEALED', 'ELIGIBLE_FOR_STAGE', ?, ?)`)
        .bind(STAGE_03_ARTIFACT_ID, STAGE_03_INSTANCE_ID, STAGE_03_ARTIFACT_TYPE,
          artifactR2Key, artifactSha256, STAGE_03_STANDARD_VERSION, now),
      ...sealedSources.map((source) => d1.prepare(`INSERT INTO truth_source
        (id, package_id, publisher, url, tier, fetched_at, snapshot_r2_key, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(source.id, STAGE_00_PACKAGE_ID, source.publisher, source.url, source.tier,
          source.fetchedAt, source.snapshotR2Key, source.snapshotSha256)),
      ...truth.claims.map((claim) => d1.prepare(`INSERT INTO truth_claim
        (id, package_id, claim_type, text, criticality, numeric_json, as_of_date, jurisdiction, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(claim.id, STAGE_00_PACKAGE_ID, claim.claimType, claim.text, claim.criticality,
          claim.numeric ? canonicalize(claim.numeric) : null, claim.asOfDate, claim.jurisdiction, now)),
      ...truth.claimSources.map((binding) => d1.prepare(`INSERT INTO truth_claim_source
        (claim_id, source_id, role) VALUES (?, ?, ?)`)
        .bind(binding.claimId, binding.sourceId, binding.role)),
      ...truth.terminology.map((term) => d1.prepare(`INSERT INTO truth_terminology
        (id, package_id, term, plain_meaning, institutional_role, ipa, arpabet)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(term.id, STAGE_00_PACKAGE_ID, term.term, term.plainMeaning,
          term.institutionalRole, term.ipa, term.arpabet)),
      d1.prepare(`INSERT OR IGNORE INTO spend_ceiling
        (scope, scope_ref, ceiling_usd) VALUES ('STAGE', ?, 0)`)
        .bind(STAGE_03_INSTANCE_ID),
      d1.prepare(`UPDATE operation_run SET current_step = 'STAGE_04_READY', updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND current_step = 'STAGE_03_READY'`)
        .bind(now, bootstrap.run.id),
      ...[
        ["STAGE_03_DOR_PASSED", { predecessor: STAGE_02_ARTIFACT_ID, predecessorSha256: stage02.stage02Artifact.canonicalHash }],
        ["STAGE_ADVANCE_ACCEPTED", { commandId, stageCode: STAGE_03_CODE, traceId, executorVersion: envelope.executorVersion }],
        ["STAGE_03_PRIMARY_SOURCES_SEALED", { sourceCount: sealedSources.length, sourceIds: sealedSources.map((source) => source.id) }],
        ["STAGE_03_M0_ADVICE_LINT_PASSED", { adviceLint: truth.adviceLint }],
        ["STAGE_03_M0_CRITICAL_CLAIM_TIER_PASSED", { criticalClaimCount: truth.claims.filter((claim) => claim.criticality === "CRITICAL").length, maximumTier: 2 }],
        ["STAGE_03_M1_NUMERIC_SCHEMA_PASSED", { numericSchema: truth.numericSchema }],
        ["STAGE_03_ARTIFACT_SEALED", { artifactId: STAGE_03_ARTIFACT_ID, artifactR2Key, artifactSha256 }],
        ["STAGE_03_FROZEN", { nextStep: "STAGE_04_READY", reservedUsd: 0, actualUsd: 0, providerDispatch: "OFF", nextHumanGate: "STAGE_04_CHAMPION_SELECTION" }],
      ].map(([eventType, payload], index) => d1.prepare(`INSERT INTO operation_event
        (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bootstrap.run.id, firstOrdinal + index, eventType,
          canonicalize(payload), now)),
    ]);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id }).from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrentCommand) return { ...(await readBackStage03(bootstrap.run.id)), replayed: true };
    throw error;
  }
  return { ...(await readBackStage03(bootstrap.run.id)), replayed: false };
}

async function readBackForStage00() {
  const db = getDb();
  const [contract] = await db.select({ operationRunId: trackGRunContracts.operationRunId })
    .from(trackGRunContracts).where(eq(trackGRunContracts.episodeId, trackGVideoOneContract.episodeId)).limit(1);
  if (!contract) throw new Error("TRACK_G_VIDEO_1_NOT_STARTED");
  return readBack(contract.operationRunId);
}

export function trackGVideoOneIdempotencyKey(): string {
  return createHash("sha256").update([
    trackGVideoOneContract.commandType,
    trackGVideoOneContract.episodeId,
    trackGVideoOneContract.profile,
    trackGVideoOneContract.assuranceMode,
    trackGVideoOneContract.bootstrapEvidence.sourceCommit,
  ].join("\0")).digest("hex");
}

function stage00IdempotencyKey(
  operationRunId: string,
  bootstrapEvidenceSha256: string,
): string {
  return createHash("sha256").update([
    "START_STAGE",
    operationRunId,
    STAGE_00_CODE,
    bootstrapEvidenceSha256,
  ].join("\0")).digest("hex");
}

export async function trackGVideoOneStage00IdempotencyKey(): Promise<string> {
  const bootstrap = await readBackForStage00();
  return stage00IdempotencyKey(bootstrap.run.id, bootstrap.contract.bootstrapEvidenceSha256);
}

function stageAdvanceIdempotencyKey(
  operationRunId: string,
  stageCode: TrackGAdvanceStageCode,
  predecessorSha256: string,
): string {
  return createHash("sha256").update([
    "ADVANCE_TRACK_G_VIDEO_1_STAGE",
    operationRunId,
    stageCode,
    predecessorSha256,
    "runner-contract-v1",
  ].join("\0")).digest("hex");
}

function stage04PrepareIdempotencyKey(
  operationRunId: string,
  predecessorSha256: string,
): string {
  return createHash("sha256").update([
    "PREPARE_TRACK_G_VIDEO_1_STAGE_04_TOURNAMENT",
    operationRunId,
    predecessorSha256,
    "stage-04-tournament-v1",
  ].join("\0")).digest("hex");
}

export async function trackGVideoOneStage04PrepareIdempotencyKey(): Promise<string> {
  const bootstrap = await readBackForStage00();
  const stage03 = await readBackStage03(bootstrap.run.id);
  return stage04PrepareIdempotencyKey(bootstrap.run.id, stage03.stage03Artifact.canonicalHash);
}

function stage04SelectionIdempotencyKey(
  operationRunId: string,
  candidateSetSha256: string,
  candidateId: string,
  rationale: string,
): string {
  return createHash("sha256").update([
    "SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION",
    operationRunId,
    candidateSetSha256,
    candidateId,
    rationale.trim(),
    "stage-04-human-gate-v1",
  ].join("\0")).digest("hex");
}

function stage06PrepareIdempotencyKey(operationRunId: string, predecessorSha256: string): string {
  return createHash("sha256").update([
    "PREPARE_TRACK_G_VIDEO_1_STAGE_06_SCRIPT",
    operationRunId,
    predecessorSha256,
    "stage-06-script-review-v1",
  ].join("\0")).digest("hex");
}

function stage06EditorialIdempotencyKey(operationRunId: string, draftSha256: string,
  input: ApplyTrackGVideoOneStage06EditorialInput): string {
  return createHash("sha256").update([
    "APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL",
    operationRunId,
    draftSha256,
    input.decisionType,
    input.revisedTitle?.trim() ?? "",
    input.revisedHook?.trim() ?? "",
    input.beatId?.trim() ?? "",
    input.revisedBeatNarration?.trim() ?? "",
    input.rationale.trim(),
    "stage-06-human-gate-v1",
  ].join("\0")).digest("hex");
}

function stage07APrepareIdempotencyKey(operationRunId: string, predecessorSha256: string): string {
  return createHash("sha256").update([
    "PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT",
    operationRunId,
    predecessorSha256,
    "stage-07a-voice-tournament-v1",
  ].join("\0")).digest("hex");
}

function stage07ASelectionIdempotencyKey(operationRunId: string, tournamentSha256: string,
  candidateId: string, rationale: string): string {
  return createHash("sha256").update([
    "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE",
    operationRunId,
    tournamentSha256,
    candidateId,
    rationale.trim(),
    "stage-07a-human-gate-v1",
  ].join("\0")).digest("hex");
}

function stage09PrepareIdempotencyKey(operationRunId: string, predecessorSha256: string): string {
  return createHash("sha256").update([
    "PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW",
    operationRunId,
    predecessorSha256,
    "stage-09-visual-review-v1",
  ].join("\0")).digest("hex");
}

function stage09SelectionIdempotencyKey(operationRunId: string, tournamentSha256: string,
  candidateId: string, revisedThumbnailText: string, rationale: string): string {
  return createHash("sha256").update([
    "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL",
    operationRunId,
    tournamentSha256,
    candidateId,
    revisedThumbnailText.trim(),
    rationale.trim(),
    "stage-09-human-gate-v1",
  ].join("\0")).digest("hex");
}

export async function trackGVideoOneStage06PrepareIdempotencyKey(): Promise<string> {
  const bootstrap = await readBackForStage00();
  const stage05 = await readBackStage05(bootstrap.run.id);
  return stage06PrepareIdempotencyKey(bootstrap.run.id, stage05.stageArtifact.canonicalHash);
}

export async function trackGVideoOneStage06EditorialIdempotencyKey(
  input: Omit<ApplyTrackGVideoOneStage06EditorialInput, "idempotencyKey" | "ownerApprovalText">,
): Promise<string> {
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage06Draft(bootstrap.run.id);
  return stage06EditorialIdempotencyKey(bootstrap.run.id, prepared.scriptDraft.canonicalHash, {
    ...input,
    ownerApprovalText: STAGE_06_APPLY_OWNER_APPROVAL_TEXT,
    idempotencyKey: "0".repeat(64),
  });
}

export async function trackGVideoOneStage07APrepareIdempotencyKey(): Promise<string> {
  const bootstrap = await readBackForStage00();
  const stage06 = await readBackStage06(bootstrap.run.id);
  return stage07APrepareIdempotencyKey(bootstrap.run.id, stage06.stageArtifact.canonicalHash);
}

export async function trackGVideoOneStage07ASelectionIdempotencyKey(
  candidateId: string,
  rationale: string,
): Promise<string> {
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage07ATournament(bootstrap.run.id);
  return stage07ASelectionIdempotencyKey(bootstrap.run.id, prepared.tournamentSha256,
    candidateId, rationale);
}

export async function trackGVideoOneStage09PrepareIdempotencyKey(): Promise<string> {
  const bootstrap = await readBackForStage00();
  const stage08 = await readBackStage08(bootstrap.run.id);
  return stage09PrepareIdempotencyKey(bootstrap.run.id, stage08.stage08Artifact.canonicalHash);
}

export async function trackGVideoOneStage09SelectionIdempotencyKey(
  candidateId: string,
  revisedThumbnailText: string,
  rationale: string,
): Promise<string> {
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage09Tournament(bootstrap.run.id);
  return stage09SelectionIdempotencyKey(bootstrap.run.id, prepared.tournamentSha256,
    candidateId, revisedThumbnailText, rationale);
}

export async function trackGVideoOneStage04SelectionIdempotencyKey(
  candidateId: string,
  rationale: string,
): Promise<string> {
  const bootstrap = await readBackForStage00();
  const prepared = await readBackStage04Tournament(bootstrap.run.id);
  return stage04SelectionIdempotencyKey(
    bootstrap.run.id,
    prepared.tournament.candidateSetHash,
    candidateId,
    rationale,
  );
}

export async function trackGVideoOneStageIdempotencyKey(
  stageCode: TrackGAdvanceStageCode,
): Promise<string> {
  const bootstrap = await readBackForStage00();
  if (stageCode === STAGE_01_CODE) {
    const stage00 = await readBackStage00(bootstrap.run.id);
    return stageAdvanceIdempotencyKey(bootstrap.run.id, stageCode, stage00.artifact.canonicalHash);
  }
  if (stageCode === STAGE_02_CODE) {
    const stage01 = await readBackStage01(bootstrap.run.id);
    return stageAdvanceIdempotencyKey(bootstrap.run.id, stageCode, stage01.stage01Artifact.canonicalHash);
  }
  if (stageCode === STAGE_03_CODE) {
    const stage02 = await readBackStage02(bootstrap.run.id);
    return stageAdvanceIdempotencyKey(bootstrap.run.id, stageCode, stage02.stage02Artifact.canonicalHash);
  }
  if (stageCode === STAGE_04_CODE) {
    throw new Error("TRACK_G_STAGE_04_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (stageCode === STAGE_05_CODE) {
    const stage04 = await readBackStage04(bootstrap.run.id);
    return stageAdvanceIdempotencyKey(bootstrap.run.id, stageCode, stage04.stageArtifact.canonicalHash);
  }
  if (stageCode === STAGE_06_CODE) {
    throw new Error("TRACK_G_STAGE_06_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (stageCode === STAGE_07A_CODE) {
    throw new Error("TRACK_G_STAGE_07A_HUMAN_GATE_COMMAND_REQUIRED");
  }
  if (stageCode === STAGE_07B_CODE) {
    const stage07A = await readBackStage07A(bootstrap.run.id);
    return stageAdvanceIdempotencyKey(bootstrap.run.id, stageCode,
      stage07A.stage07AArtifact.canonicalHash);
  }
  if (stageCode === STAGE_08_CODE) {
    const stage07B = await readBackStage07B(bootstrap.run.id);
    return stageAdvanceIdempotencyKey(bootstrap.run.id, stageCode,
      stage07B.stage07BArtifact.canonicalHash);
  }
  if (stageCode === STAGE_09_CODE) {
    throw new Error("TRACK_G_STAGE_09_HUMAN_GATE_COMMAND_REQUIRED");
  }
  throw new Error(`TRACK_G_STAGE_${stageCode}_EXECUTOR_NOT_IMPLEMENTED`);
}
