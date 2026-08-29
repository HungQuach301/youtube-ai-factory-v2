import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import {
  channelIdentityContracts,
  channels,
  commandLog,
  contentBriefs,
  episodes,
  operationRuns,
  operationEvents,
  productionPackages,
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
import { approvedChannel, trackGVideoOneContract } from "./factory-contract";
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
  throw new Error(`TRACK_G_STAGE_${stageCode}_EXECUTOR_NOT_IMPLEMENTED`);
}
