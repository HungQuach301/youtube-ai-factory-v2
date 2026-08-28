import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const ownerIdentity = sqliteTable("owner_identity", {
  identity: text("identity").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["OWNER", "OPERATOR"] }).notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const channels = sqliteTable("channel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nicheKey: text("niche_key").notNull(),
  market: text("market").notNull(),
  locale: text("locale").notNull(),
  status: text("status", {
    enum: ["PREPARED", "ACTIVE", "PAUSED", "FROZEN", "KILLED"],
  }).notNull().default("PREPARED"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("channel_niche_key_unique").on(table.nicheKey)]);

export const channelIdentityContracts = sqliteTable("channel_identity_contract", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  version: integer("version").notNull(),
  payloadJson: text("payload_json").notNull(),
  canonicalHash: text("canonical_hash").notNull(),
  approvalState: text("approval_state", {
    enum: ["APPROVED_SOURCE", "PERSISTED", "ACTIVE"],
  }).notNull().default("APPROVED_SOURCE"),
  sealedAt: text("sealed_at"),
});

export const pillars = sqliteTable("pillar", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  name: text("name").notNull(),
  version: integer("version").notNull(),
});

export const episodes = sqliteTable("episode", {
  id: text("id").primaryKey(),
  pillarId: text("pillar_id").notNull().references(() => pillars.id),
  sequence: integer("sequence").notNull(),
  title: text("title").notNull(),
  status: text("status", {
    enum: ["QUEUED", "IN_PRODUCTION", "PUBLISHED", "ABANDONED"],
  }).notNull().default("QUEUED"),
});

export const hpDecisions = sqliteTable("hp_decision", {
  id: text("id").primaryKey(),
  decisionKey: text("decision_key").notNull(),
  actorIdentity: text("actor_identity").notNull().references(() => ownerIdentity.identity),
  payloadJson: text("payload_json").notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("hp_decision_key_unique").on(table.decisionKey)]);

export const commandLog = sqliteTable("command_log", {
  id: text("id").primaryKey(),
  commandType: text("command_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  actorIdentity: text("actor_identity").notNull().references(() => ownerIdentity.identity),
  prevState: text("prev_state"),
  nextState: text("next_state"),
  traceId: text("trace_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("command_idempotency_key_unique").on(table.idempotencyKey)]);

export const operationRuns = sqliteTable("operation_run", {
  id: text("id").primaryKey(),
  commandId: text("command_id").notNull().references(() => commandLog.id),
  channelId: text("channel_id").references(() => channels.id),
  status: text("status", {
    enum: ["ACCEPTED", "RUNNING", "COMPLETED", "BLOCKED", "FAILED", "CANCELLED"],
  }).notNull(),
  objective: text("objective").notNull(),
  currentStep: text("current_step").notNull(),
  blockerJson: text("blocker_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const operationEvents = sqliteTable("operation_event", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => operationRuns.id),
  ordinal: integer("ordinal").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("operation_event_run_ordinal_unique").on(table.runId, table.ordinal)]);

export const voiceFingerprintEvidence = sqliteTable("voice_fingerprint_evidence", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  voiceId: text("voice_id").notNull(),
  model: text("model").notNull(),
  settingsHash: text("settings_hash").notNull(),
  capabilityId: text("capability_id").notNull(),
  capabilityVersion: text("capability_version").notNull(),
  audioR2Key: text("audio_r2_key").notNull(),
  audioSha256: text("audio_sha256").notNull(),
  audioDurationSec: integer("audio_duration_sec").notNull(),
  embeddingR2Key: text("embedding_r2_key").notNull(),
  embeddingSha256: text("embedding_sha256").notNull(),
  evidenceR2Key: text("evidence_r2_key").notNull(),
  evidenceSha256: text("evidence_sha256").notNull(),
  fingerprintHash: text("fingerprint_hash").notNull(),
  qualificationState: text("qualification_state", { enum: ["QUALIFIED"] }).notNull(),
  ownerActorIdentity: text("owner_actor_identity").notNull().references(() => ownerIdentity.identity),
  ownerApprovalText: text("owner_approval_text").notNull(),
  ownerApprovedAt: text("owner_approved_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("voice_fingerprint_channel_unique").on(table.channelId)]);

export const voiceFingerprintBindings = sqliteTable("voice_fingerprint_binding", {
  evidenceId: text("evidence_id").notNull().references(() => voiceFingerprintEvidence.id),
  archetype: text("archetype").notNull(),
  qualificationRunId: text("qualification_run_id").notNull(),
  qualifiedAt: text("qualified_at").notNull(),
  evidenceR2Key: text("evidence_r2_key").notNull(),
  evidenceSha256: text("evidence_sha256").notNull(),
}, (table) => [
  primaryKey({ columns: [table.evidenceId, table.archetype] }),
  uniqueIndex("voice_fingerprint_run_unique").on(table.qualificationRunId),
]);

export const oauthAuthorizationRequests = sqliteTable("oauth_authorization_request", {
  nonceHash: text("nonce_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  state: text("state").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource").notNull(),
  scope: text("scope").notNull(),
  ownerIdentity: text("owner_identity").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const oauthAuthorizationCodes = sqliteTable("oauth_authorization_code", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource").notNull(),
  scope: text("scope").notNull(),
  ownerIdentity: text("owner_identity").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const oauthAccessTokens = sqliteTable("oauth_access_token", {
  tokenHash: text("token_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  resource: text("resource").notNull(),
  scope: text("scope").notNull(),
  ownerIdentity: text("owner_identity").notNull(),
  expiresAt: integer("expires_at").notNull(),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
});
