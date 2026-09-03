import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const trackGRunContracts = sqliteTable("track_g_run_contract", {
  id: text("id").primaryKey(),
  operationRunId: text("operation_run_id").notNull().references(() => operationRuns.id),
  episodeId: text("episode_id").notNull().references(() => episodes.id),
  profile: text("profile", { enum: ["REDUCED"] }).notNull(),
  assuranceMode: text("assurance_mode", { enum: ["WARNING_ONLY"] }).notNull(),
  executionNamespace: text("execution_namespace", { enum: ["production"] }).notNull(),
  stagePlanJson: text("stage_plan_json").notNull(),
  stopBeforeStage: text("stop_before_stage", { enum: ["15"] }).notNull(),
  preserveRejectedCandidates: integer("preserve_rejected_candidates").notNull(),
  releaseEligible: integer("release_eligible").notNull(),
  providerDispatch: integer("provider_dispatch").notNull(),
  autoPublish: integer("auto_publish").notNull(),
  bootstrapEvidenceR2Key: text("bootstrap_evidence_r2_key").notNull(),
  bootstrapEvidenceSha256: text("bootstrap_evidence_sha256").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("track_g_run_operation_unique").on(table.operationRunId),
  uniqueIndex("track_g_run_episode_unique").on(table.episodeId),
]);

export const contentBriefs = sqliteTable("content_brief", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().references(() => episodes.id),
  version: integer("version").notNull(),
  payloadJson: text("payload_json").notNull(),
  canonicalHash: text("canonical_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("content_brief_episode_version_unique").on(table.episodeId, table.version)]);

export const productionPackages = sqliteTable("production_package", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().references(() => episodes.id),
  channelId: text("channel_id").notNull().references(() => channels.id),
  namespace: text("namespace", { enum: ["production"] }).notNull(),
  briefHash: text("brief_hash").notNull(),
  identityContractId: text("identity_contract_id").notNull().references(() => channelIdentityContracts.id),
  requestCeiling: integer("request_ceiling").notNull(),
  spendCeilingUsd: real("spend_ceiling_usd").notNull(),
  autoDispatch: integer("auto_dispatch").notNull().default(0),
  autoPublish: integer("auto_publish").notNull().default(0),
  status: text("status", { enum: ["OPEN", "RUNNING", "HELD", "RELEASED", "PUBLISHED", "ABANDONED"] }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("production_package_episode_unique").on(table.episodeId)]);

export const stageInstances = sqliteTable("stage_instance", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  stageCode: text("stage_code").notNull(),
  controlState: text("control_state", {
    enum: ["NOT_STARTED", "RUNNING", "PRODUCED", "VERIFIED", "FROZEN", "REOPENED"],
  }).notNull(),
  standardVersion: integer("standard_version").notNull(),
  attemptOrdinal: integer("attempt_ordinal").notNull().default(1),
  startedAt: text("started_at"),
  frozenAt: text("frozen_at"),
}, (table) => [uniqueIndex("stage_instance_package_stage_attempt_unique")
  .on(table.packageId, table.stageCode, table.attemptOrdinal)]);

export const stageArtifacts = sqliteTable("stage_artifact", {
  id: text("id").primaryKey(),
  stageInstanceId: text("stage_instance_id").notNull().references(() => stageInstances.id),
  artifactType: text("artifact_type").notNull(),
  namespace: text("namespace", { enum: ["production"] }).notNull(),
  r2Key: text("r2_key").notNull(),
  canonicalHash: text("canonical_hash").notNull(),
  immutabilityState: text("immutability_state", { enum: ["SEALED"] }).notNull(),
  eligibilityState: text("eligibility_state", { enum: ["ELIGIBLE_FOR_STAGE"] }).notNull(),
  standardVersion: integer("standard_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("stage_artifact_stage_type_unique")
  .on(table.stageInstanceId, table.artifactType)]);

export const truthSources = sqliteTable("truth_source", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  tier: integer("tier").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  snapshotR2Key: text("snapshot_r2_key").notNull(),
  contentHash: text("content_hash").notNull(),
}, (table) => [uniqueIndex("truth_source_package_url_unique").on(table.packageId, table.url)]);

export const truthClaims = sqliteTable("truth_claim", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  claimType: text("claim_type", {
    enum: ["FACT", "ESTIMATE", "MECHANISM", "INTERPRETATION", "PREDICTION"],
  }).notNull(),
  text: text("text").notNull(),
  criticality: text("criticality", {
    enum: ["CRITICAL", "NORMAL", "SUPPORTING"],
  }).notNull(),
  numericJson: text("numeric_json"),
  asOfDate: text("as_of_date"),
  jurisdiction: text("jurisdiction"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const truthClaimSources = sqliteTable("truth_claim_source", {
  claimId: text("claim_id").notNull().references(() => truthClaims.id),
  sourceId: text("source_id").notNull().references(() => truthSources.id),
  role: text("role", { enum: ["PRIMARY", "SUPPORTING", "LOCATING"] }).notNull(),
}, (table) => [primaryKey({ columns: [table.claimId, table.sourceId] })]);

export const truthTerminology = sqliteTable("truth_terminology", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  term: text("term").notNull(),
  plainMeaning: text("plain_meaning").notNull(),
  institutionalRole: text("institutional_role").notNull(),
  ipa: text("ipa").notNull(),
  arpabet: text("arpabet").notNull(),
}, (table) => [uniqueIndex("truth_terminology_package_term_unique").on(table.packageId, table.term)]);

export const creativeTournaments = sqliteTable("creative_tournament", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  stageInstanceId: text("stage_instance_id").notNull().references(() => stageInstances.id),
  candidateSetR2Key: text("candidate_set_r2_key").notNull(),
  candidateSetHash: text("candidate_set_hash").notNull(),
  routeCount: integer("route_count").notNull(),
  criticCount: integer("critic_count").notNull(),
  generatorProvenance: text("generator_provenance").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("creative_tournament_package_stage_unique").on(table.packageId, table.stageInstanceId),
]);

export const creativeRouteCandidates = sqliteTable("creative_route_candidate", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().references(() => creativeTournaments.id),
  blindLabel: text("blind_label").notNull(),
  routeOrder: integer("route_order").notNull(),
  routeName: text("route_name").notNull(),
  hookType: text("hook_type").notNull(),
  narrativeDevice: text("narrative_device").notNull(),
  routeJson: text("route_json").notNull(),
  packagingJson: text("packaging_json").notNull(),
  eligibilityState: text("eligibility_state", { enum: ["ELIGIBLE"] }).notNull(),
  aggregateScore: real("aggregate_score").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("creative_route_tournament_blind_label_unique").on(table.tournamentId, table.blindLabel),
  uniqueIndex("creative_route_tournament_order_unique").on(table.tournamentId, table.routeOrder),
]);

export const creativeTournamentJudgments = sqliteTable("creative_tournament_judgment", {
  tournamentId: text("tournament_id").notNull().references(() => creativeTournaments.id),
  criticId: text("critic_id").notNull(),
  candidateId: text("candidate_id").notNull().references(() => creativeRouteCandidates.id),
  rubricVersion: text("rubric_version").notNull(),
  scoreJson: text("score_json").notNull(),
  totalScore: real("total_score").notNull(),
  blindInputHash: text("blind_input_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.tournamentId, table.criticId, table.candidateId] })]);

export const humanDecisions = sqliteTable("human_decision", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  decisionType: text("decision_type", { enum: ["D1", "D2", "D3", "D4", "D5"] }).notNull(),
  actorIdentity: text("actor_identity").notNull().references(() => ownerIdentity.identity),
  artifactBeforeId: text("artifact_before_id").notNull(),
  artifactAfterId: text("artifact_after_id").notNull(),
  diffR2Key: text("diff_r2_key").notNull(),
  rationaleText: text("rationale_text").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const creativeTournamentSelections = sqliteTable("creative_tournament_selection", {
  tournamentId: text("tournament_id").primaryKey().references(() => creativeTournaments.id),
  candidateId: text("candidate_id").notNull().references(() => creativeRouteCandidates.id),
  humanDecisionId: text("human_decision_id").notNull().references(() => humanDecisions.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("creative_tournament_selection_decision_unique").on(table.humanDecisionId)]);

export const predictedPerformances = sqliteTable("predicted_performance", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  modelVersion: text("model_version").notNull(),
  retentionCurveJson: text("retention_curve_json").notNull(),
  ctrEstimate: real("ctr_estimate").notNull(),
  beatRiskJson: text("beat_risk_json").notNull(),
  canonicalHash: text("canonical_hash").notNull(),
  sealedAt: text("sealed_at").notNull(),
}, (table) => [uniqueIndex("predicted_performance_package_unique").on(table.packageId)]);

export const scriptDrafts = sqliteTable("script_draft", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  stageInstanceId: text("stage_instance_id").notNull().references(() => stageInstances.id),
  title: text("title").notNull(),
  hook: text("hook").notNull(),
  sectionsJson: text("sections_json").notNull(),
  wordCount: integer("word_count").notNull(),
  estimatedDurationSec: integer("estimated_duration_sec").notNull(),
  numberTraceJson: text("number_trace_json").notNull(),
  adviceLintState: text("advice_lint_state", { enum: ["PASS"] }).notNull(),
  scriptLintState: text("script_lint_state", { enum: ["PASS"] }).notNull(),
  numberTraceState: text("number_trace_state", { enum: ["PASS"] }).notNull(),
  r2Key: text("r2_key").notNull(),
  canonicalHash: text("canonical_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("script_draft_package_unique").on(table.packageId),
  uniqueIndex("script_draft_stage_unique").on(table.stageInstanceId),
]);

export const spendCeilings = sqliteTable("spend_ceiling", {
  scope: text("scope", { enum: ["PORTFOLIO", "CHANNEL", "PACKAGE", "STAGE"] }).notNull(),
  scopeRef: text("scope_ref").notNull(),
  ceilingUsd: real("ceiling_usd").notNull(),
  windowStart: text("window_start"),
  windowEnd: text("window_end"),
}, (table) => [primaryKey({ columns: [table.scope, table.scopeRef] })]);

export const stage10MediaJobs = sqliteTable("stage10_media_job", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  operationRunId: text("operation_run_id").notNull().references(() => operationRuns.id),
  stageInstanceId: text("stage_instance_id").notNull(),
  attemptOrdinal: integer("attempt_ordinal").notNull().default(1),
  retryOfJobId: text("retry_of_job_id"),
  providerIdempotencyKey: text("provider_idempotency_key").notNull(),
  callbackTokenHash: text("callback_token_hash").notNull(),
  state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
  receiptR2Key: text("receipt_r2_key"),
  receiptSha256: text("receipt_sha256"),
  workerImageDigest: text("worker_image_digest"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage10_media_job_package_attempt_unique").on(table.packageId, table.attemptOrdinal),
  uniqueIndex("stage10_media_job_retry_of_unique").on(table.retryOfJobId),
  uniqueIndex("stage10_media_job_provider_key_unique").on(table.providerIdempotencyKey),
]);

export const stage10AudioProductions = sqliteTable("stage10_audio_production", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  stageInstanceId: text("stage_instance_id").notNull().references(() => stageInstances.id),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider", { enum: ["ELEVENLABS"] }).notNull(),
  providerCallCount: integer("provider_call_count").notNull(),
  totalCharacters: integer("total_characters").notNull(),
  reservedUsd: real("reserved_usd").notNull(),
  actualUsd: real("actual_usd").notNull(),
  calibrationEvidenceSha256: text("calibration_evidence_sha256").notNull(),
  workerImageDigest: text("worker_image_digest").notNull(),
  narrationR2Key: text("narration_r2_key").notNull(),
  narrationSha256: text("narration_sha256").notNull(),
  evidenceR2Key: text("evidence_r2_key").notNull(),
  evidenceSha256: text("evidence_sha256").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage10_audio_production_package_unique").on(table.packageId),
  uniqueIndex("stage10_audio_production_stage_unique").on(table.stageInstanceId),
  uniqueIndex("stage10_audio_production_idempotency_unique").on(table.idempotencyKey),
]);

export const stage11AudioPlans = sqliteTable("stage11_audio_plan", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  stageInstanceId: text("stage_instance_id").notNull().references(() => stageInstances.id),
  mode: text("mode", { enum: ["ambience_only"] }).notNull(),
  narrationSha256: text("narration_sha256").notNull(),
  cueProgramJson: text("cue_program_json").notNull(),
  rightsEvidenceSha256: text("rights_evidence_sha256").notNull(),
  loudnormPlanJson: text("loudnorm_plan_json").notNull(),
  duckingFilter: text("ducking_filter").notNull(),
  providerCallCount: integer("provider_call_count").notNull(),
  reservedUsd: real("reserved_usd").notNull(),
  actualUsd: real("actual_usd").notNull(),
  evidenceR2Key: text("evidence_r2_key").notNull(),
  evidenceSha256: text("evidence_sha256").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage11_audio_plan_package_unique").on(table.packageId),
  uniqueIndex("stage11_audio_plan_stage_unique").on(table.stageInstanceId),
]);

export const stage12MediaJobs = sqliteTable("stage12_media_job", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  operationRunId: text("operation_run_id").notNull().references(() => operationRuns.id),
  stageInstanceId: text("stage_instance_id").notNull(),
  attemptOrdinal: integer("attempt_ordinal").notNull().default(1),
  retryOfJobId: text("retry_of_job_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  callbackTokenHash: text("callback_token_hash").notNull(),
  state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
  receiptR2Key: text("receipt_r2_key"),
  receiptSha256: text("receipt_sha256"),
  workerImageDigest: text("worker_image_digest"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage12_media_job_package_attempt_unique").on(
    table.packageId, table.attemptOrdinal,
  ),
  uniqueIndex("stage12_media_job_retry_of_unique").on(table.retryOfJobId),
  uniqueIndex("stage12_media_job_key_unique").on(table.idempotencyKey),
]);

export const stage12QaDiagnosticJobs = sqliteTable("stage12_qa_diagnostic_job", {
  id: text("id").primaryKey(),
  stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
  idempotencyKey: text("idempotency_key").notNull(),
  callbackTokenHash: text("callback_token_hash").notNull(),
  state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
  receiptR2Key: text("receipt_r2_key"),
  receiptSha256: text("receipt_sha256"),
  workerImageDigest: text("worker_image_digest"),
  errorCode: text("error_code"),
  diagnosticOrdinal: integer("diagnostic_ordinal").notNull().default(1),
  retryOfDiagnosticJobId: text("retry_of_diagnostic_job_id"),
  retryReasonCode: text("retry_reason_code"),
  targetDurationSec: real("target_duration_sec"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage12_qa_diagnostic_job_source_ordinal_unique").on(
    table.stage12JobId, table.diagnosticOrdinal,
  ),
  uniqueIndex("stage12_qa_diagnostic_job_retry_of_unique").on(
    table.retryOfDiagnosticJobId,
  ),
  uniqueIndex("stage12_qa_diagnostic_job_key_unique").on(table.idempotencyKey),
]);

export const stage12QaEvidence = sqliteTable("stage12_qa_evidence", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => stage12MediaJobs.id),
  source: text("source", { enum: ["CALLBACK", "DIAGNOSTIC"] }).notNull(),
  outcome: text("outcome", { enum: ["PASS", "FAIL"] }).notNull(),
  preMasterR2Key: text("pre_master_r2_key").notNull(),
  preMasterSha256: text("pre_master_sha256").notNull(),
  receiptR2Key: text("receipt_r2_key").notNull(),
  receiptSha256: text("receipt_sha256").notNull(),
  workerImageDigest: text("worker_image_digest").notNull(),
  reportSha256: text("report_sha256").notNull(),
  failuresJson: text("failures_json").notNull(),
  measurementsJson: text("measurements_json").notNull(),
  renderAuthorized: integer("render_authorized").notNull(),
  providerCallCount: integer("provider_call_count").notNull(),
  providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull(),
  autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage12_qa_evidence_job_source_unique").on(table.jobId, table.source),
]);

export const stage12CorrectedPreMasterJobs = sqliteTable("stage12_corrected_pre_master_job", {
  id: text("id").primaryKey(),
  stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
  diagnosticJobId: text("diagnostic_job_id").notNull().references(() => stage12QaDiagnosticJobs.id),
  diagnosticEvidenceId: text("diagnostic_evidence_id").notNull().references(() => stage12QaEvidence.id),
  idempotencyKey: text("idempotency_key").notNull(),
  callbackTokenHash: text("callback_token_hash").notNull(),
  actorIdentity: text("actor_identity").notNull(),
  ownerApprovalText: text("owner_approval_text").notNull(),
  state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
  sourcePreMasterR2Key: text("source_pre_master_r2_key").notNull(),
  sourcePreMasterSha256: text("source_pre_master_sha256").notNull(),
  sourcePreMasterByteLength: integer("source_pre_master_byte_length").notNull(),
  correctedPreMasterR2Key: text("corrected_pre_master_r2_key"),
  correctedPreMasterSha256: text("corrected_pre_master_sha256"),
  correctedPreMasterByteLength: integer("corrected_pre_master_byte_length"),
  correctedFrameMd5Sha256: text("corrected_frame_md5_sha256"),
  receiptR2Key: text("receipt_r2_key"),
  receiptSha256: text("receipt_sha256"),
  workerImageDigest: text("worker_image_digest"),
  reportSha256: text("report_sha256"),
  outcome: text("outcome", { enum: ["PASS", "FAIL"] }),
  failuresJson: text("failures_json"),
  measurementsJson: text("measurements_json"),
  providerCallCount: integer("provider_call_count").notNull().default(0),
  providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull().default("OFF"),
  autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull().default("OFF"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage12_corrected_pre_master_job_diagnostic_unique").on(table.diagnosticJobId),
  uniqueIndex("stage12_corrected_pre_master_job_evidence_unique").on(table.diagnosticEvidenceId),
  uniqueIndex("stage12_corrected_pre_master_job_key_unique").on(table.idempotencyKey),
  uniqueIndex("stage12_corrected_pre_master_job_output_hash_unique").on(table.correctedPreMasterSha256),
]);

export const stage12AudioP0CorrectionJobs = sqliteTable("stage12_audio_p0_correction_job", {
  id: text("id").primaryKey(),
  predecessorCorrectedPreMasterJobId: text("predecessor_corrected_pre_master_job_id").notNull()
    .references(() => stage12CorrectedPreMasterJobs.id),
  stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
  correctionOrdinal: integer("correction_ordinal").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  callbackTokenHash: text("callback_token_hash").notNull(),
  actorIdentity: text("actor_identity").notNull(),
  ownerApprovalText: text("owner_approval_text").notNull(),
  state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
  sourcePreMasterR2Key: text("source_pre_master_r2_key").notNull(),
  sourcePreMasterSha256: text("source_pre_master_sha256").notNull(),
  sourcePreMasterByteLength: integer("source_pre_master_byte_length").notNull(),
  sourceReceiptSha256: text("source_receipt_sha256").notNull(),
  correctedPreMasterR2Key: text("corrected_pre_master_r2_key"),
  correctedPreMasterSha256: text("corrected_pre_master_sha256"),
  correctedPreMasterByteLength: integer("corrected_pre_master_byte_length"),
  correctedFrameMd5Sha256: text("corrected_frame_md5_sha256"),
  receiptR2Key: text("receipt_r2_key"),
  receiptSha256: text("receipt_sha256"),
  workerImageDigest: text("worker_image_digest"),
  reportSha256: text("report_sha256"),
  outcome: text("outcome", { enum: ["PASS", "FAIL"] }),
  failuresJson: text("failures_json"),
  measurementsJson: text("measurements_json"),
  providerCallCount: integer("provider_call_count").notNull().default(0),
  providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull().default("OFF"),
  autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull().default("OFF"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage12_audio_p0_correction_predecessor_unique")
    .on(table.predecessorCorrectedPreMasterJobId),
  uniqueIndex("stage12_audio_p0_correction_key_unique").on(table.idempotencyKey),
  uniqueIndex("stage12_audio_p0_correction_output_hash_unique").on(table.correctedPreMasterSha256),
]);

export const stage12AudioP0CorrectionRetryJobs = sqliteTable(
  "stage12_audio_p0_correction_retry_job",
  {
    id: text("id").primaryKey(),
    predecessorCorrectionJobId: text("predecessor_correction_job_id").notNull()
      .references(() => stage12AudioP0CorrectionJobs.id),
    stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
    correctionOrdinal: integer("correction_ordinal").notNull(),
    correctionStrategyVersion: integer("correction_strategy_version").notNull(),
    retryReasonCode: text("retry_reason_code").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    callbackTokenHash: text("callback_token_hash").notNull(),
    actorIdentity: text("actor_identity").notNull(),
    ownerApprovalText: text("owner_approval_text").notNull(),
    state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
    sourcePreMasterR2Key: text("source_pre_master_r2_key").notNull(),
    sourcePreMasterSha256: text("source_pre_master_sha256").notNull(),
    sourcePreMasterByteLength: integer("source_pre_master_byte_length").notNull(),
    sourceReceiptSha256: text("source_receipt_sha256").notNull(),
    correctedPreMasterR2Key: text("corrected_pre_master_r2_key"),
    correctedPreMasterSha256: text("corrected_pre_master_sha256"),
    correctedPreMasterByteLength: integer("corrected_pre_master_byte_length"),
    correctedFrameMd5Sha256: text("corrected_frame_md5_sha256"),
    receiptR2Key: text("receipt_r2_key"),
    receiptSha256: text("receipt_sha256"),
    workerImageDigest: text("worker_image_digest"),
    reportSha256: text("report_sha256"),
    outcome: text("outcome", { enum: ["PASS", "FAIL"] }),
    failuresJson: text("failures_json"),
    measurementsJson: text("measurements_json"),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull().default("OFF"),
    autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull().default("OFF"),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stage12_audio_p0_correction_retry_predecessor_unique")
      .on(table.predecessorCorrectionJobId),
    uniqueIndex("stage12_audio_p0_correction_retry_key_unique").on(table.idempotencyKey),
    uniqueIndex("stage12_audio_p0_correction_retry_output_hash_unique")
      .on(table.correctedPreMasterSha256),
  ],
);

export const stage12AudioP0CorrectionFailureEvidence = sqliteTable(
  "stage12_audio_p0_correction_failure_evidence",
  {
    id: text("id").primaryKey(),
    correctionJobId: text("correction_job_id").notNull()
      .references(() => stage12AudioP0CorrectionRetryJobs.id),
    stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
    correctionOrdinal: integer("correction_ordinal").notNull(),
    correctionStrategyVersion: integer("correction_strategy_version").notNull(),
    errorCode: text("error_code").notNull(),
    failureBoundary: text("failure_boundary", {
      enum: ["FINAL_POST_ENCODE_LOUDNESS_VERIFICATION"],
    }).notNull(),
    correctionPass: integer("correction_pass").notNull(),
    correctionPassLimit: integer("correction_pass_limit").notNull(),
    measurementsByPassJson: text("measurements_by_pass_json").notNull(),
    finalIntegratedLufs: real("final_integrated_lufs").notNull(),
    finalTruePeakDbtp: real("final_true_peak_dbtp").notNull(),
    finalLoudnessRangeLu: real("final_loudness_range_lu").notNull(),
    failedPredicatesJson: text("failed_predicates_json").notNull(),
    workerImageDigest: text("worker_image_digest").notNull(),
    sourcePreMasterR2Key: text("source_pre_master_r2_key").notNull(),
    sourcePreMasterSha256: text("source_pre_master_sha256").notNull(),
    sourcePreMasterByteLength: integer("source_pre_master_byte_length").notNull(),
    sourceReceiptSha256: text("source_receipt_sha256").notNull(),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull().default("OFF"),
    autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull().default("OFF"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stage12_audio_p0_correction_failure_job_unique").on(table.correctionJobId),
  ],
);

export const stage12EncodedLoudnessDiagnosticReplayJobs = sqliteTable(
  "stage12_encoded_loudness_diagnostic_replay_job",
  {
    id: text("id").primaryKey(),
    stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
    sourceCorrectionJobId: text("source_correction_job_id").notNull()
      .references(() => stage12AudioP0CorrectionJobs.id),
    historicalFailureJobId: text("historical_failure_job_id").notNull()
      .references(() => stage12AudioP0CorrectionRetryJobs.id),
    idempotencyKey: text("idempotency_key").notNull(),
    callbackTokenHash: text("callback_token_hash").notNull(),
    actorIdentity: text("actor_identity").notNull(),
    ownerApprovalText: text("owner_approval_text").notNull(),
    state: text("state", { enum: ["PENDING", "READY", "FAILED"] }).notNull(),
    evidenceSemantics: text("evidence_semantics", {
      enum: ["NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL"],
    }).notNull(),
    sourcePreMasterR2Key: text("source_pre_master_r2_key").notNull(),
    sourcePreMasterSha256: text("source_pre_master_sha256").notNull(),
    sourcePreMasterByteLength: integer("source_pre_master_byte_length").notNull(),
    sourceReceiptSha256: text("source_receipt_sha256").notNull(),
    correctionStrategyVersion: integer("correction_strategy_version").notNull(),
    correctionPassLimit: integer("correction_pass_limit").notNull(),
    expectedWorkerImageDigest: text("expected_worker_image_digest").notNull(),
    workerImageDigest: text("worker_image_digest"),
    algorithmFingerprint: text("algorithm_fingerprint").notNull(),
    thresholdSnapshotSha256: text("threshold_snapshot_sha256").notNull(),
    replayOutcome: text("replay_outcome", { enum: ["PASS", "FAIL"] }),
    terminalCorrectionPass: integer("terminal_correction_pass"),
    correctedOutputUploaded: integer("corrected_output_uploaded").notNull().default(0),
    historicalBackfill: integer("historical_backfill").notNull().default(0),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull().default("OFF"),
    calibrationExecuted: integer("calibration_executed").notNull().default(0),
    finalizeExecuted: integer("finalize_executed").notNull().default(0),
    releaseEligible: integer("release_eligible").notNull().default(0),
    autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull().default("OFF"),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stage12_encoded_loudness_diagnostic_replay_key_unique")
      .on(table.idempotencyKey),
    uniqueIndex("stage12_encoded_loudness_diagnostic_replay_failure_unique")
      .on(table.historicalFailureJobId),
  ],
);

export const stage12EncodedLoudnessDiagnosticReplayEvidence = sqliteTable(
  "stage12_encoded_loudness_diagnostic_replay_evidence",
  {
    id: text("id").primaryKey(),
    replayJobId: text("replay_job_id").notNull()
      .references(() => stage12EncodedLoudnessDiagnosticReplayJobs.id),
    stage12JobId: text("stage12_job_id").notNull().references(() => stage12MediaJobs.id),
    sourceCorrectionJobId: text("source_correction_job_id").notNull()
      .references(() => stage12AudioP0CorrectionJobs.id),
    historicalFailureJobId: text("historical_failure_job_id").notNull()
      .references(() => stage12AudioP0CorrectionRetryJobs.id),
    evidenceSemantics: text("evidence_semantics", {
      enum: ["NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL"],
    }).notNull(),
    sourceBaselineJson: text("source_baseline_json").notNull(),
    measurementsByPassJson: text("measurements_by_pass_json").notNull(),
    terminalCorrectionPass: integer("terminal_correction_pass").notNull(),
    finalIntegratedLufs: real("final_integrated_lufs").notNull(),
    finalIntegratedLufsExact: text("final_integrated_lufs_exact").notNull(),
    finalTruePeakDbtp: real("final_true_peak_dbtp").notNull(),
    finalTruePeakDbtpExact: text("final_true_peak_dbtp_exact").notNull(),
    finalLoudnessRangeLu: real("final_loudness_range_lu").notNull(),
    finalLoudnessRangeLuExact: text("final_loudness_range_lu_exact").notNull(),
    failedPredicatesJson: text("failed_predicates_json").notNull(),
    replayOutcome: text("replay_outcome", { enum: ["PASS", "FAIL"] }).notNull(),
    expectedWorkerImageDigest: text("expected_worker_image_digest").notNull(),
    workerImageDigest: text("worker_image_digest").notNull(),
    algorithmFingerprint: text("algorithm_fingerprint").notNull(),
    thresholdSnapshotSha256: text("threshold_snapshot_sha256").notNull(),
    ffmpegVersion: text("ffmpeg_version").notNull(),
    ffmpegBuildFingerprint: text("ffmpeg_build_fingerprint").notNull(),
    libopusEncoderFingerprint: text("libopus_encoder_fingerprint").notNull(),
    sourcePreMasterR2Key: text("source_pre_master_r2_key").notNull(),
    sourcePreMasterSha256: text("source_pre_master_sha256").notNull(),
    sourcePreMasterByteLength: integer("source_pre_master_byte_length").notNull(),
    sourceReceiptSha256: text("source_receipt_sha256").notNull(),
    correctedOutputUploaded: integer("corrected_output_uploaded").notNull().default(0),
    historicalBackfill: integer("historical_backfill").notNull().default(0),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    providerDispatch: text("provider_dispatch", { enum: ["OFF"] }).notNull().default("OFF"),
    calibrationExecuted: integer("calibration_executed").notNull().default(0),
    finalizeExecuted: integer("finalize_executed").notNull().default(0),
    releaseEligible: integer("release_eligible").notNull().default(0),
    autoPublish: text("auto_publish", { enum: ["OFF"] }).notNull().default("OFF"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stage12_encoded_loudness_diagnostic_replay_evidence_job_unique")
      .on(table.replayJobId),
  ],
);

export const stage12PreMasterQa = sqliteTable("stage12_pre_master_qa", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => productionPackages.id),
  stageInstanceId: text("stage_instance_id").notNull().references(() => stageInstances.id),
  jobId: text("job_id").notNull().references(() => stage12MediaJobs.id),
  preMasterR2Key: text("pre_master_r2_key").notNull(),
  preMasterSha256: text("pre_master_sha256").notNull(),
  frameMd5Sha256: text("frame_md5_sha256").notNull(),
  reportR2Key: text("report_r2_key").notNull(),
  reportSha256: text("report_sha256").notNull(),
  measurementsJson: text("measurements_json").notNull(),
  renderAuthorized: integer("render_authorized").notNull(),
  providerCallCount: integer("provider_call_count").notNull(),
  reservedUsd: real("reserved_usd").notNull(),
  actualUsd: real("actual_usd").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stage12_pre_master_qa_package_unique").on(table.packageId),
  uniqueIndex("stage12_pre_master_qa_stage_unique").on(table.stageInstanceId),
]);

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

export const oauthRefreshTokens = sqliteTable("oauth_refresh_token", {
  tokenHash: text("token_hash").primaryKey(),
  familyId: text("family_id").notNull(),
  clientId: text("client_id").notNull(),
  resource: text("resource").notNull(),
  scope: text("scope").notNull(),
  ownerIdentity: text("owner_identity").notNull(),
  expiresAt: integer("expires_at").notNull(),
  rotatedAt: integer("rotated_at"),
  revokedAt: integer("revoked_at"),
  replacedByHash: text("replaced_by_hash"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("oauth_refresh_token_family_idx").on(table.familyId)]);
