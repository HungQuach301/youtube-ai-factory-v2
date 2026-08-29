import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import {
  channels,
  commandLog,
  episodes,
  operationRuns,
  trackGRunContracts,
} from "../db/schema";
import type { ChatGPTUser } from "./chatgpt-auth";
import { approvedChannel, trackGVideoOneContract } from "./factory-contract";
import { putImmutableEvidence, sha256, verifyImmutableEvidence } from "./evidence-storage";
import { voiceQualificationReadBack } from "./voice-qualification";

const HEX64 = /^[0-9a-f]{64}$/u;
const OWNER_APPROVAL_TEXT = "START VIDEO 1 QUALIFICATION";
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
    || run.currentStep !== "STAGE_00_READY"
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

export function trackGVideoOneIdempotencyKey(): string {
  return createHash("sha256").update([
    trackGVideoOneContract.commandType,
    trackGVideoOneContract.episodeId,
    trackGVideoOneContract.profile,
    trackGVideoOneContract.assuranceMode,
    trackGVideoOneContract.bootstrapEvidence.sourceCommit,
  ].join("\0")).digest("hex");
}
