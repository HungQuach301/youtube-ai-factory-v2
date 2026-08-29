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
  productionPackages,
  spendCeilings,
  stageArtifacts,
  stageInstances,
  trackGRunContracts,
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
const STAGE_00_CODE = "00";
const STAGE_00_STANDARD_VERSION = 1;
const STAGE_00_PACKAGE_ID = "package_track_g_video_1_v1";
const STAGE_00_BRIEF_ID = "brief_track_g_video_1_v1";
const STAGE_00_INSTANCE_ID = "stage_track_g_video_1_00_attempt_1";
const STAGE_00_ARTIFACT_ID = "artifact_track_g_video_1_stage_00_brief_v1";
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
    || !["STAGE_00_READY", "STAGE_01_READY"].includes(run.currentStep)
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
    || base.run.currentStep !== "STAGE_01_READY"
    || ceiling("PORTFOLIO", "track-g") !== approvedChannel.controls.trackGCeilingUsd
    || ceiling("CHANNEL", approvedChannel.id) !== approvedChannel.controls.trackGCeilingUsd
    || ceiling("PACKAGE", productionPackage.id) !== approvedChannel.controls.videoCeilingUsd
    || ceiling("STAGE", stage.id) !== 0
    || !await verifyImmutableEvidence(artifact.r2Key, artifact.canonicalHash)) {
    throw new Error("TRACK_G_STAGE_00_READ_BACK_FAILED");
  }
  return { base, productionPackage, brief, stage, artifact };
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
