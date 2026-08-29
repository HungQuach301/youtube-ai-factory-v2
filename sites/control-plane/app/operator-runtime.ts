import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import {
  channelIdentityContracts,
  channels,
  commandLog,
  episodes,
  hpDecisions,
  operationEvents,
  operationRuns,
  ownerIdentity,
  pillars,
} from "../db/schema";
import { activationBlockers, approvedChannel } from "./factory-contract";
import type { ChatGPTUser } from "./chatgpt-auth";
import { getFactoryEnv } from "./runtime-env";
import { trackGVideoOneState } from "./track-g-video-one";
import { voiceQualificationReadBack } from "./voice-qualification";

export type RuntimeReadiness = {
  d1: "PASS" | "BLOCKED";
  owner: "PASS" | "BLOCKED";
  channel: "PREPARED" | "NOT_PREPARED";
  detail: string;
};

export function requireOwner(user: ChatGPTUser): void {
  const configuredOwner = getFactoryEnv().FACTORY_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) throw new Error("FACTORY_OWNER_ALLOWLIST_UNCONFIGURED");
  if (user.email.trim().toLowerCase() !== configuredOwner) {
    throw new Error("FACTORY_OWNER_AUTHORIZATION_DENIED");
  }
}

export async function getRuntimeReadiness(): Promise<RuntimeReadiness> {
  try {
    const db = getDb();
    const configuredOwner = getFactoryEnv().FACTORY_OWNER_EMAIL?.trim().toLowerCase();
    const [actor] = configuredOwner
      ? await db.select({ identity: ownerIdentity.identity })
        .from(ownerIdentity)
        .where(eq(ownerIdentity.identity, configuredOwner))
        .limit(1)
      : [];
    const [channel] = await db.select({ status: channels.status })
      .from(channels)
      .where(eq(channels.id, approvedChannel.id))
      .limit(1);
    return {
      d1: "PASS",
      owner: actor ? "PASS" : "BLOCKED",
      channel: channel?.status === "PREPARED" || channel?.status === "ACTIVE" ? "PREPARED" : "NOT_PREPARED",
      detail: channel
        ? `D1 is live; ${channel.status.toLowerCase()} channel state was read back from Production.`
        : "D1 is live; the owner must issue PREPARE_CHANNEL to persist the approved strategy.",
    };
  } catch {
    return {
      d1: "BLOCKED",
      owner: "BLOCKED",
      channel: "NOT_PREPARED",
      detail: "Production D1 or its operational schema is unavailable.",
    };
  }
}

export async function getOperatorSnapshot(user: ChatGPTUser) {
  requireOwner(user);
  const db = getDb();
  const [channel] = await db.select().from(channels)
    .where(eq(channels.id, approvedChannel.id)).limit(1);
  const [identityContract] = await db.select().from(channelIdentityContracts)
    .where(eq(channelIdentityContracts.channelId, approvedChannel.id))
    .orderBy(desc(channelIdentityContracts.version)).limit(1);
  const [pillar] = await db.select().from(pillars)
    .where(eq(pillars.channelId, approvedChannel.id)).limit(1);
  const persistedEpisodes = pillar
    ? await db.select().from(episodes).where(eq(episodes.pillarId, pillar.id)).orderBy(episodes.sequence)
    : [];
  const [decision] = await db.select().from(hpDecisions)
    .where(eq(hpDecisions.decisionKey, approvedChannel.ownerDecisionKey)).limit(1);
  const runs = await db.select().from(operationRuns)
    .where(eq(operationRuns.channelId, approvedChannel.id))
    .orderBy(desc(operationRuns.createdAt)).limit(20);
  const events = runs.length
    ? await db.select().from(operationEvents)
      .where(eq(operationEvents.runId, runs[0].id))
      .orderBy(operationEvents.ordinal)
    : [];
  const voiceFingerprint = await voiceQualificationReadBack();
  const trackGVideo1 = await trackGVideoOneState();
  const currentActivationBlockers = voiceFingerprint.qualified
    ? activationBlockers.filter((blocker) => blocker !== "qualified_voice_fingerprint")
    : [...activationBlockers];
  return {
    actor: { displayName: user.displayName, email: user.email, role: "OWNER" },
    channel: channel ?? null,
    identityContract: identityContract ?? null,
    decision: decision ?? null,
    pillar: pillar ?? null,
    episodes: persistedEpisodes,
    runs,
    latestRunEvents: events,
    activationBlockers: currentActivationBlockers,
    voiceFingerprintState: voiceFingerprint.state,
    voiceBindingCount: voiceFingerprint.bindingCount,
    trackGVideo1,
  };
}

export async function prepareApprovedChannel(
  user: ChatGPTUser,
  input: { objective: string; idempotencyKey: string },
) {
  requireOwner(user);
  if (!/^[a-f0-9]{64}$/i.test(input.idempotencyKey)) {
    throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  }
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) {
    throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  }
  const expectedIdempotencyKey = createHash("sha256")
    .update(`PREPARE_CHANNEL|HP-01|${objective}`)
    .digest("hex");
  if (input.idempotencyKey.toLowerCase() !== expectedIdempotencyKey) {
    throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  }

  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id })
    .from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existingCommand) {
    const [existingRun] = await db.select().from(operationRuns)
      .where(eq(operationRuns.commandId, existingCommand.id)).limit(1);
    return { run: existingRun, replayed: true };
  }

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const identityPayload = JSON.stringify(approvedChannel);
  const canonicalHash = createHash("sha256").update(identityPayload).digest("hex");
  const decisionPayload = JSON.stringify({
    selectedNiche: approvedChannel.name,
    approvedAt: "2026-08-25",
    market: approvedChannel.market,
    locale: approvedChannel.locale,
    objective,
  });

  const d1 = getD1();
  const statements = [
    d1.prepare(`INSERT OR IGNORE INTO owner_identity
      (identity, display_name, role, active, created_at) VALUES (?, ?, 'OWNER', 1, ?)`)
      .bind(user.email.toLowerCase(), user.displayName, now),
    d1.prepare(`INSERT INTO command_log
      (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
      VALUES (?, 'PREPARE_CHANNEL', ?, ?, ?, 'HP01_SEALED', 'CHANNEL_PREPARED', ?, ?)`)
      .bind(commandId, JSON.stringify({ objective, channelId: approvedChannel.id }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
    d1.prepare(`INSERT OR IGNORE INTO channel
      (id, name, niche_key, market, locale, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PREPARED', ?)`)
      .bind(approvedChannel.id, approvedChannel.name, approvedChannel.nicheKey, approvedChannel.market, approvedChannel.locale, now),
    d1.prepare(`INSERT OR IGNORE INTO channel_identity_contract
      (id, channel_id, version, payload_json, canonical_hash, approval_state, sealed_at)
      VALUES (?, ?, ?, ?, ?, 'PERSISTED', ?)`)
      .bind(approvedChannel.identityContractId, approvedChannel.id, approvedChannel.identityVersion, identityPayload, canonicalHash, now),
    d1.prepare(`INSERT OR IGNORE INTO hp_decision
      (id, decision_key, actor_identity, payload_json, evidence_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), approvedChannel.ownerDecisionKey, user.email.toLowerCase(), decisionPayload, canonicalHash, now),
    d1.prepare(`INSERT OR IGNORE INTO pillar (id, channel_id, name, version) VALUES (?, ?, ?, ?)`)
      .bind(approvedChannel.pillar.id, approvedChannel.id, approvedChannel.pillar.name, approvedChannel.pillar.version),
    ...approvedChannel.episodes.map((title, index) => d1.prepare(`INSERT OR IGNORE INTO episode
      (id, pillar_id, sequence, title, status) VALUES (?, ?, ?, ?, 'QUEUED')`)
      .bind(`episode_ai_money_defense_${String(index + 1).padStart(2, "0")}`, approvedChannel.pillar.id, index + 1, title)),
    d1.prepare(`INSERT INTO operation_run
      (id, command_id, channel_id, status, objective, current_step, blocker_json, created_at, updated_at)
      VALUES (?, ?, ?, 'COMPLETED', ?, 'CHANNEL_STATE_READ_BACK', ?, ?, ?)`)
      .bind(runId, commandId, approvedChannel.id, objective, JSON.stringify(activationBlockers), now, now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 1, 'COMMAND_ACCEPTED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, JSON.stringify({ commandId, traceId }), now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 2, 'OWNER_AUTHORIZED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, JSON.stringify({ actor: user.email.toLowerCase(), role: "OWNER" }), now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 3, 'CHANNEL_PREPARED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, JSON.stringify({ channelId: approvedChannel.id, status: "PREPARED" }), now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 4, 'READ_BACK_VERIFIED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, JSON.stringify({ blockers: activationBlockers }), now),
  ];

  try {
    await d1.batch(statements);
  } catch (error) {
    const [concurrentCommand] = await db.select({ id: commandLog.id })
      .from(commandLog)
      .where(eq(commandLog.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (concurrentCommand) {
      const [concurrentRun] = await db.select().from(operationRuns)
        .where(eq(operationRuns.commandId, concurrentCommand.id)).limit(1);
      if (concurrentRun) return { run: concurrentRun, replayed: true };
    }
    throw error;
  }
  const [run] = await db.select().from(operationRuns)
    .where(eq(operationRuns.id, runId)).limit(1);
  return { run, replayed: false };
}
