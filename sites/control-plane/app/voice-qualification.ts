import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import {
  channels,
  commandLog,
  operationRuns,
  voiceFingerprintBindings,
  voiceFingerprintEvidence,
} from "../db/schema";
import type { ChatGPTUser } from "./chatgpt-auth";
import { audioArchetypes, approvedChannel, qualifiedVoice } from "./factory-contract";
import { putImmutableEvidence, sha256, verifyImmutableEvidence } from "./evidence-storage";

const HEX64 = /^[0-9a-f]{64}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SOURCE_CHANNEL_IDS = new Set([approvedChannel.id, "ai-era-money-defense"]);
const EVIDENCE_ID = "voice_fingerprint_ai_era_money_defense_v1";

export type RegisterQualifiedVoiceInput = {
  objective: string;
  ownerApprovalText: "APPROVE VOICE";
  audioBase64: string;
  audioSha256: string;
  embeddingJson: string;
  embeddingSha256: string;
  providerEvidenceJson: string;
  providerEvidenceSha256: string;
};

type ProviderEvidence = {
  schemaVersion: number;
  state: string;
  namespace: string;
  channelId: string;
  voiceId: string;
  model: string;
  outputFormat: string;
  voiceSettings: Record<string, unknown>;
  settingsHash: string;
  capabilityId: string;
  capabilityVersion: string;
  actualCostUsd: number;
  maxCostUsd: number;
  fingerprint: { durationSec: number; sha256: string };
  generated: Array<{ archetype: string; requestId: string }>;
  productionEligible: boolean;
};

type VoiceEmbedding = {
  schemaVersion: number;
  algorithm: string;
  sourceAudioSha256: string;
  sampleRateHz: number;
  frameSize: number;
  hopSize: number;
  dimensions: number;
  vector: number[];
};

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("VOICE_EVIDENCE_NON_FINITE_NUMBER");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value !== "object") throw new Error("VOICE_EVIDENCE_NON_JSON_VALUE");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key.normalize("NFC"))}:${canonicalize(record[key])}`).join(",")}}`;
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function parseJson<T>(value: string, code: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(code);
  }
}

function decodeBase64(value: string): Uint8Array {
  if (!BASE64.test(value)) throw new Error("VOICE_AUDIO_BASE64_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    throw new Error("VOICE_AUDIO_BASE64_INVALID");
  }
  return bytes;
}

function flacDurationSec(bytes: Uint8Array): number {
  if (bytes.length < 42 || Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "fLaC") {
    throw new Error("VOICE_AUDIO_MUST_BE_FLAC");
  }
  const blockType = bytes[4]! & 0x7f;
  const blockLength = (bytes[5]! << 16) | (bytes[6]! << 8) | bytes[7]!;
  if (blockType !== 0 || blockLength !== 34) throw new Error("VOICE_FLAC_STREAMINFO_MISSING");
  let packed = 0n;
  for (let index = 18; index < 26; index += 1) packed = (packed << 8n) | BigInt(bytes[index]!);
  const sampleRate = Number((packed >> 44n) & 0xfffffn);
  const totalSamples = Number(packed & 0xfffffffffn);
  if (sampleRate <= 0 || totalSamples <= 0) throw new Error("VOICE_FLAC_STREAMINFO_INVALID");
  return totalSamples / sampleRate;
}

function assertProviderEvidence(evidence: ProviderEvidence): void {
  const generatedArchetypes = evidence.generated?.map((item) => item.archetype) ?? [];
  const requestIds = evidence.generated?.map((item) => item.requestId) ?? [];
  if (evidence.schemaVersion !== 1
    || evidence.state !== "PROVIDER_GENERATED_PENDING_PERCEPTUAL_QA"
    || evidence.namespace !== "qualification"
    || !SOURCE_CHANNEL_IDS.has(evidence.channelId)
    || evidence.voiceId !== qualifiedVoice.voiceId
    || evidence.model !== qualifiedVoice.model
    || evidence.outputFormat !== qualifiedVoice.settings.outputFormat
    || canonicalHash(evidence.voiceSettings) !== canonicalHash(qualifiedVoice.settings.voiceSettings)
    || evidence.settingsHash !== qualifiedVoice.settingsHash
    || evidence.capabilityId !== qualifiedVoice.capabilityId
    || evidence.capabilityVersion !== qualifiedVoice.capabilityVersion
    || evidence.productionEligible !== false
    || evidence.fingerprint?.durationSec !== 30
    || !HEX64.test(evidence.fingerprint?.sha256 ?? "")
    || !Number.isFinite(evidence.actualCostUsd)
    || !Number.isFinite(evidence.maxCostUsd)
    || evidence.actualCostUsd < 0
    || evidence.actualCostUsd > evidence.maxCostUsd
    || evidence.maxCostUsd > 1.5
    || generatedArchetypes.length !== audioArchetypes.length
    || audioArchetypes.some((archetype) => !generatedArchetypes.includes(archetype))
    || new Set(generatedArchetypes).size !== audioArchetypes.length
    || requestIds.some((id) => typeof id !== "string" || id.length < 8)
    || new Set(requestIds).size !== audioArchetypes.length) {
    throw new Error("VOICE_PROVIDER_EVIDENCE_INVALID");
  }
}

function assertEmbedding(embedding: VoiceEmbedding, audioSha256: string): void {
  if (embedding.schemaVersion !== 1
    || embedding.algorithm !== "log-goertzel-voiceprint-v1"
    || embedding.sourceAudioSha256 !== audioSha256
    || embedding.sampleRateHz !== 16_000
    || embedding.frameSize !== 400
    || embedding.hopSize !== 160
    || embedding.dimensions !== 64
    || !Array.isArray(embedding.vector)
    || embedding.vector.length !== 64
    || embedding.vector.some((value) => !Number.isFinite(value))) {
    throw new Error("VOICE_EMBEDDING_INVALID");
  }
  const magnitude = Math.sqrt(embedding.vector.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(magnitude - 1) > 0.0001) throw new Error("VOICE_EMBEDDING_NOT_NORMALIZED");
}

function evidencePrefix(): string {
  return qualifiedVoice.fingerprintR2Key.slice(0, qualifiedVoice.fingerprintR2Key.lastIndexOf("/"));
}

export async function voiceQualificationReadBack(): Promise<{
  qualified: boolean;
  state: "QUALIFIED" | "NOT_QUALIFIED";
  bindingCount: number;
}> {
  try {
    const db = getDb();
    const [evidence] = await db.select().from(voiceFingerprintEvidence)
      .where(eq(voiceFingerprintEvidence.channelId, approvedChannel.id)).limit(1);
    if (!evidence || evidence.qualificationState !== "QUALIFIED") {
      return { qualified: false, state: "NOT_QUALIFIED", bindingCount: 0 };
    }
    const bindings = await db.select().from(voiceFingerprintBindings)
      .where(eq(voiceFingerprintBindings.evidenceId, evidence.id));
    const archetypes = new Set(bindings.map((binding) => binding.archetype));
    const validBindings = bindings.length === audioArchetypes.length
      && audioArchetypes.every((archetype) => archetypes.has(archetype))
      && new Set(bindings.map((binding) => binding.qualificationRunId)).size === audioArchetypes.length;
    if (!validBindings) return { qualified: false, state: "NOT_QUALIFIED", bindingCount: bindings.length };
    const objects = [
      [evidence.audioR2Key, evidence.audioSha256],
      [evidence.embeddingR2Key, evidence.embeddingSha256],
      [evidence.evidenceR2Key, evidence.evidenceSha256],
      ...bindings.map((binding) => [binding.evidenceR2Key, binding.evidenceSha256]),
    ] as const;
    const verified = await Promise.all(objects.map(([key, hash]) => verifyImmutableEvidence(key, hash)));
    return {
      qualified: verified.every(Boolean),
      state: verified.every(Boolean) ? "QUALIFIED" : "NOT_QUALIFIED",
      bindingCount: bindings.length,
    };
  } catch {
    return { qualified: false, state: "NOT_QUALIFIED", bindingCount: 0 };
  }
}

export async function registerQualifiedVoice(
  user: ChatGPTUser,
  input: RegisterQualifiedVoiceInput & { idempotencyKey: string },
) {
  if (!HEX64.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_MUST_BE_64_HEX");
  const objective = input.objective.trim();
  if (objective.length < 12 || objective.length > 500) throw new Error("OBJECTIVE_LENGTH_OUT_OF_RANGE");
  if (input.ownerApprovalText !== "APPROVE VOICE") throw new Error("VOICE_OWNER_APPROVAL_REQUIRED");
  if (!HEX64.test(input.audioSha256) || !HEX64.test(input.embeddingSha256)
    || !HEX64.test(input.providerEvidenceSha256)) throw new Error("VOICE_EVIDENCE_HASH_INVALID");

  const db = getDb();
  const [existingCommand] = await db.select({ id: commandLog.id }).from(commandLog)
    .where(eq(commandLog.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existingCommand) {
    const [existingRun] = await db.select().from(operationRuns)
      .where(eq(operationRuns.commandId, existingCommand.id)).orderBy(desc(operationRuns.createdAt)).limit(1);
    return { run: existingRun, replayed: true, readBack: await voiceQualificationReadBack() };
  }
  const [channel] = await db.select({ status: channels.status }).from(channels)
    .where(eq(channels.id, approvedChannel.id)).limit(1);
  if (!channel || channel.status !== "PREPARED") throw new Error("VOICE_CHANNEL_MUST_BE_PREPARED");

  const audioBytes = decodeBase64(input.audioBase64);
  if (sha256(audioBytes) !== input.audioSha256) throw new Error("VOICE_AUDIO_HASH_MISMATCH");
  if (flacDurationSec(audioBytes) !== qualifiedVoice.fingerprintDurationSec) {
    throw new Error("VOICE_FINGERPRINT_DURATION_INVALID");
  }
  const embeddingBytes = new TextEncoder().encode(input.embeddingJson);
  const providerEvidenceBytes = new TextEncoder().encode(input.providerEvidenceJson);
  if (sha256(embeddingBytes) !== input.embeddingSha256) throw new Error("VOICE_EMBEDDING_HASH_MISMATCH");
  if (sha256(providerEvidenceBytes) !== input.providerEvidenceSha256) {
    throw new Error("VOICE_PROVIDER_EVIDENCE_HASH_MISMATCH");
  }
  const embedding = parseJson<VoiceEmbedding>(input.embeddingJson, "VOICE_EMBEDDING_JSON_INVALID");
  const providerEvidence = parseJson<ProviderEvidence>(input.providerEvidenceJson, "VOICE_PROVIDER_EVIDENCE_JSON_INVALID");
  assertEmbedding(embedding, input.audioSha256);
  assertProviderEvidence(providerEvidence);

  const now = new Date().toISOString();
  const prefix = evidencePrefix();
  const embeddingKey = `${prefix}/voice-fingerprint.embedding.json`;
  const providerEvidenceKey = `${prefix}/provider-qualification-evidence.json`;
  const bindings = audioArchetypes.map((archetype) => {
    const generated = providerEvidence.generated.find((sample) => sample.archetype === archetype)!;
    const payload = {
      schemaVersion: 1,
      namespace: "qualification",
      channelId: approvedChannel.id,
      sourceChannelAlias: providerEvidence.channelId,
      archetype,
      qualificationRunId: generated.requestId,
      qualificationState: "QUALIFIED",
      qualifiedAt: now,
      ownerApprovalText: input.ownerApprovalText,
      providerSettingsHash: qualifiedVoice.settingsHash,
    };
    const bytes = new TextEncoder().encode(`${canonicalize(payload)}\n`);
    return {
      ...payload,
      evidenceR2Key: `${prefix}/bindings/${archetype}.json`,
      evidenceSha256: sha256(bytes),
      bytes,
    };
  });
  await putImmutableEvidence(qualifiedVoice.fingerprintR2Key, audioBytes, "audio/flac", input.audioSha256);
  await putImmutableEvidence(embeddingKey, embeddingBytes, "application/json", input.embeddingSha256);
  await putImmutableEvidence(providerEvidenceKey, providerEvidenceBytes, "application/json", input.providerEvidenceSha256);
  await Promise.all(bindings.map((binding) => putImmutableEvidence(
    binding.evidenceR2Key,
    binding.bytes,
    "application/json",
    binding.evidenceSha256,
  )));

  const fingerprintEnvelope = {
    namespace: "qualification",
    channelId: approvedChannel.id,
    voiceId: qualifiedVoice.voiceId,
    model: qualifiedVoice.model,
    settingsHash: qualifiedVoice.settingsHash,
    capabilityId: qualifiedVoice.capabilityId,
    capabilityVersion: qualifiedVoice.capabilityVersion,
    audioR2Key: qualifiedVoice.fingerprintR2Key,
    audioSha256: input.audioSha256,
    audioDurationSec: qualifiedVoice.fingerprintDurationSec,
    embeddingR2Key: embeddingKey,
    embeddingSha256: input.embeddingSha256,
    evidenceR2Key: providerEvidenceKey,
    evidenceSha256: input.providerEvidenceSha256,
    bindings: bindings.map((binding) => ({
      archetype: binding.archetype,
      qualificationRunId: binding.qualificationRunId,
      qualificationState: binding.qualificationState,
      qualifiedAt: binding.qualifiedAt,
      evidenceR2Key: binding.evidenceR2Key,
      evidenceSha256: binding.evidenceSha256,
    })),
  };
  const fingerprintHash = canonicalHash(fingerprintEnvelope);
  const identityPayload = {
    ...approvedChannel,
    identityContractId: "identity_ai_era_money_defense_v2",
    identityVersion: 2,
    voice: {
      voiceId: qualifiedVoice.voiceId,
      model: qualifiedVoice.model,
      settings: qualifiedVoice.settings,
      settingsHash: qualifiedVoice.settingsHash,
      pronunciationLexiconRef: qualifiedVoice.pronunciationLexiconRef,
      fingerprintR2Key: qualifiedVoice.fingerprintR2Key,
      fingerprintDurationSec: qualifiedVoice.fingerprintDurationSec,
      fingerprintHash,
      qualificationState: "QUALIFIED",
    },
  };
  const identityPayloadJson = canonicalize(identityPayload);
  const identityCanonicalHash = canonicalHash(identityPayload);
  const commandId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const decisionKey = "G-02D:VOICE-FINGERPRINT:APPROVE:2026-08-28";
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO owner_identity
      (identity, display_name, role, active, created_at) VALUES (?, ?, 'OWNER', 1, ?)`)
      .bind(user.email.toLowerCase(), user.displayName, now),
    d1.prepare(`INSERT INTO command_log
      (id, command_type, payload_json, idempotency_key, actor_identity, prev_state, next_state, trace_id, created_at)
      VALUES (?, 'REGISTER_QUALIFIED_VOICE', ?, ?, ?, 'VOICE_PENDING_PERCEPTUAL_QA', 'VOICE_QUALIFIED', ?, ?)`)
      .bind(commandId, canonicalize({ objective, channelId: approvedChannel.id, fingerprintHash }), input.idempotencyKey, user.email.toLowerCase(), traceId, now),
    d1.prepare(`INSERT OR IGNORE INTO channel_identity_contract
      (id, channel_id, version, payload_json, canonical_hash, approval_state, sealed_at)
      VALUES ('identity_ai_era_money_defense_v2', ?, 2, ?, ?, 'PERSISTED', ?)`)
      .bind(approvedChannel.id, identityPayloadJson, identityCanonicalHash, now),
    d1.prepare(`INSERT OR IGNORE INTO hp_decision
      (id, decision_key, actor_identity, payload_json, evidence_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), decisionKey, user.email.toLowerCase(), canonicalize({
        ownerApprovalText: input.ownerApprovalText,
        voiceId: qualifiedVoice.voiceId,
        settingsHash: qualifiedVoice.settingsHash,
        fingerprintHash,
      }), fingerprintHash, now),
    d1.prepare(`INSERT INTO voice_fingerprint_evidence
      (id, channel_id, voice_id, model, settings_hash, capability_id, capability_version,
       audio_r2_key, audio_sha256, audio_duration_sec, embedding_r2_key, embedding_sha256,
       evidence_r2_key, evidence_sha256, fingerprint_hash, qualification_state,
       owner_actor_identity, owner_approval_text, owner_approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 30, ?, ?, ?, ?, ?, 'QUALIFIED', ?, ?, ?, ?)`)
      .bind(EVIDENCE_ID, approvedChannel.id, qualifiedVoice.voiceId, qualifiedVoice.model,
        qualifiedVoice.settingsHash, qualifiedVoice.capabilityId, qualifiedVoice.capabilityVersion,
        qualifiedVoice.fingerprintR2Key, input.audioSha256, embeddingKey, input.embeddingSha256,
        providerEvidenceKey, input.providerEvidenceSha256, fingerprintHash,
        user.email.toLowerCase(), input.ownerApprovalText, now, now),
    ...bindings.map((binding) => d1.prepare(`INSERT INTO voice_fingerprint_binding
      (evidence_id, archetype, qualification_run_id, qualified_at, evidence_r2_key, evidence_sha256)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(EVIDENCE_ID, binding.archetype, binding.qualificationRunId, now,
        binding.evidenceR2Key, binding.evidenceSha256)),
    d1.prepare(`INSERT INTO operation_run
      (id, command_id, channel_id, status, objective, current_step, blocker_json, created_at, updated_at)
      VALUES (?, ?, ?, 'COMPLETED', ?, 'VOICE_EVIDENCE_READ_BACK_VERIFIED', ?, ?, ?)`)
      .bind(runId, commandId, approvedChannel.id, objective,
        JSON.stringify(["critic_qualification_and_real_calibration_evidence"]), now, now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 1, 'COMMAND_ACCEPTED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, canonicalize({ commandId, traceId }), now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 2, 'OWNER_APPROVED_VOICE', ?, ?)`)
      .bind(crypto.randomUUID(), runId, canonicalize({ actor: user.email.toLowerCase(), approval: input.ownerApprovalText }), now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 3, 'VOICE_EVIDENCE_PERSISTED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, canonicalize({ fingerprintHash, bindingCount: bindings.length }), now),
    d1.prepare(`INSERT INTO operation_event
      (id, run_id, ordinal, event_type, payload_json, created_at) VALUES (?, ?, 4, 'R2_READ_BACK_VERIFIED', ?, ?)`)
      .bind(crypto.randomUUID(), runId, canonicalize({ audioSha256: input.audioSha256, embeddingSha256: input.embeddingSha256 }), now),
  ]);
  const [run] = await db.select().from(operationRuns).where(eq(operationRuns.id, runId)).limit(1);
  const readBack = await voiceQualificationReadBack();
  if (!readBack.qualified) throw new Error("VOICE_QUALIFICATION_READ_BACK_FAILED");
  return { run, replayed: false, readBack };
}
