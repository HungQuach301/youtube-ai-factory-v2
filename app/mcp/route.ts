import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";
import { approvedChannel } from "../factory-contract";
import {
  getOperatorSnapshot,
  prepareApprovedChannel,
  requireOwner,
} from "../operator-runtime";
import {
  authenticateBearer,
  bearerChallenge,
  oauthScopes,
} from "../oauth-server";
import {
  advanceTrackGVideoOneStage,
  applyTrackGVideoOneStage06EditorialDecision,
  diagnoseTrackGVideoOneStage12Preflight,
  diagnoseTrackGVideoOneStage12Recovery,
  executeTrackGVideoOneStage00,
  finalizeTrackGVideoOneStage10,
  finalizeTrackGVideoOneStage12WithDerivedIdempotency,
  prepareTrackGVideoOneStage04Tournament,
  prepareTrackGVideoOneStage06ScriptReview,
  prepareTrackGVideoOneStage07AVoiceTournament,
  prepareTrackGVideoOneStage09VisualReview,
  recoverTrackGVideoOneStage12AttemptThree,
  selectTrackGVideoOneStage04Champion,
  selectTrackGVideoOneStage07ATone,
  selectTrackGVideoOneStage09Thumbnail,
  startTrackGVideoOneStage10,
  startTrackGVideoOneStage12WithDerivedIdempotency,
  startTrackGVideoOneQualification,
  trackGAdvanceStageCodes,
  trackGVideoOneIdempotencyKey,
  trackGVideoOneStage04PrepareIdempotencyKey,
  trackGVideoOneStage04SelectionIdempotencyKey,
  trackGVideoOneStage06EditorialIdempotencyKey,
  trackGVideoOneStage06PrepareIdempotencyKey,
  trackGVideoOneStage07APrepareIdempotencyKey,
  trackGVideoOneStage07ASelectionIdempotencyKey,
  trackGVideoOneStage09PrepareIdempotencyKey,
  trackGVideoOneStage09SelectionIdempotencyKey,
  trackGVideoOneStage10FinalizeIdempotencyKey,
  trackGVideoOneStage10StartIdempotencyKey,
  trackGVideoOneStageIdempotencyKey,
  trackGVideoOneStage00IdempotencyKey,
} from "../track-g-video-one";
import { registerQualifiedVoice } from "../voice-qualification";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Authorization",
    "Mcp-Session-Id",
    "Last-Event-ID",
    "MCP-Protocol-Version",
  ].join(", "),
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate",
};

const factoryStateSchema = {
  ownerAuthorized: z.boolean(),
  channelStatus: z.string(),
  contractState: z.string(),
  latestRunStatus: z.string(),
  pillar: z.string(),
  episodeCount: z.number().int().nonnegative(),
  activationBlockers: z.array(z.string()),
  voiceFingerprintState: z.enum(["QUALIFIED", "NOT_QUALIFIED"]),
  voiceBindingCount: z.number().int().nonnegative(),
  trackGVideo1Status: z.string(),
  trackGVideo1CurrentStep: z.string(),
  providerDispatch: z.literal("OFF"),
  autoPublish: z.literal("OFF"),
};

function publicFactoryState(snapshot: Awaited<ReturnType<typeof getOperatorSnapshot>>) {
  return {
    ownerAuthorized: true,
    channelStatus: snapshot.channel?.status ?? "NOT_PREPARED",
    contractState: snapshot.identityContract?.approvalState ?? "NOT_PERSISTED",
    latestRunStatus: snapshot.trackGWorkbench?.run.status ?? snapshot.runs[0]?.status ?? "NO_RUN",
    pillar: snapshot.pillar?.name ?? "NOT_PERSISTED",
    episodeCount: snapshot.episodes.length,
    activationBlockers: [...snapshot.activationBlockers],
    voiceFingerprintState: snapshot.voiceFingerprintState,
    voiceBindingCount: snapshot.voiceBindingCount,
    trackGVideo1Status: snapshot.trackGVideo1.status,
    trackGVideo1CurrentStep: snapshot.trackGVideo1.currentStep,
    providerDispatch: "OFF" as const,
    autoPublish: "OFF" as const,
  };
}

function createFactoryServer(user: ChatGPTUser, grantedScopes: Set<string>, request: Request) {
  const server = new McpServer(
    { name: "youtube-ai-factory-v2", version: "1.2.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read state first. Mutating commands require an explicit owner instruction. PREPARED and a qualified voice never mean ACTIVE: provider dispatch and auto-publish remain OFF until every later Production gate passes.",
    },
  );

  server.registerTool(
    "get_factory_state",
    {
      title: "Get YouTube AI Factory state",
      description:
        "Read the authenticated owner's persisted Production state, deliverable counts and activation blockers. Returns no personal identity data.",
      inputSchema: {},
      outputSchema: factoryStateSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.read"] }],
    },
    async () => {
      if (!grantedScopes.has("factory.read")) return authenticationToolError(request, "factory.read");
      const state = publicFactoryState(await getOperatorSnapshot(user));
      return {
        content: [{ type: "text", text: JSON.stringify(state) }],
        structuredContent: state,
      };
    },
  );

  server.registerTool(
    "diagnose_track_g_video_1_stage_12_preflight",
    {
      title: "Diagnose Track G Video #1 Stage 12 preflight",
      description:
        "Read and verify the Stage 12 predecessor evidence, worker signing configuration and existing durable job state without writing data, dispatching a worker, calling a provider or publishing.",
      inputSchema: {},
      outputSchema: {
        preflightState: z.enum(["PASS", "FAIL"]),
        errorCode: z.string().nullable(),
        currentStep: z.string(),
        jobStatus: z.string(),
        workerVerifyKeyBase64: z.string().min(1).nullable(),
        providerDispatch: z.literal("OFF"),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.read"] }],
    },
    async () => {
      if (!grantedScopes.has("factory.read")) return authenticationToolError(request, "factory.read");
      const output = await diagnoseTrackGVideoOneStage12Preflight();
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "diagnose_track_g_video_1_stage_12_recovery",
    {
      title: "Diagnose Track G Video #1 Stage 12 attempt 3 recovery",
      description:
        "Read the failed attempt 3 job and orphaned immutable pre-master candidates without mutation, rendering, provider calls or publishing.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false,
        idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.read"] }],
    },
    async () => {
      if (!grantedScopes.has("factory.read")) return authenticationToolError(request, "factory.read");
      const output = await diagnoseTrackGVideoOneStage12Recovery();
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "prepare_approved_channel",
    {
      title: "Prepare the approved YouTube channel",
      description:
        "Persist the owner-approved HP-01 AI-Era Money Defense contract, pillar and ten-episode queue in Production. This idempotent command does not call providers, spend money or publish content.",
      inputSchema: {
        objective: z
          .string()
          .min(12)
          .max(500)
          .describe("The owner's explicit objective for this Production preparation run."),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm the owner explicitly requested this persistent command."),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runStatus: z.string(),
        currentStep: z.string(),
        channelStatus: z.string(),
        contractState: z.string(),
        episodeCount: z.number().int().nonnegative(),
        activationBlockers: z.array(z.string()),
        providerDispatch: z.literal("OFF"),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const idempotencyKey = createHash("sha256")
        .update(`PREPARE_CHANNEL|HP-01|${objective.trim()}`)
        .digest("hex");
      const result = await prepareApprovedChannel(user, { objective, idempotencyKey });
      const state = publicFactoryState(await getOperatorSnapshot(user));
      const output = {
        accepted: true,
        replayed: result.replayed,
        runStatus: result.run?.status ?? "UNKNOWN",
        currentStep: result.run?.currentStep ?? "UNKNOWN",
        channelStatus: state.channelStatus,
        contractState: state.contractState,
        episodeCount: state.episodeCount,
        activationBlockers: state.activationBlockers,
        providerDispatch: "OFF" as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "register_qualified_voice",
    {
      title: "Register the owner-approved qualified voice",
      description:
        "Persist the exact owner-approved ElevenLabs voice fingerprint, deterministic acoustic embedding and eight qualification bindings to immutable R2 evidence plus Production D1. This command does not dispatch a provider, spend money, activate the channel or publish content.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("APPROVE VOICE"),
        audioBase64: z.string().min(8).max(2_000_000),
        audioSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        embeddingJson: z.string().min(2).max(100_000),
        embeddingSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        providerEvidenceJson: z.string().min(2).max(250_000),
        providerEvidenceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runStatus: z.string(),
        currentStep: z.string(),
        voiceFingerprintState: z.enum(["QUALIFIED", "NOT_QUALIFIED"]),
        voiceBindingCount: z.number().int().nonnegative(),
        activationBlockers: z.array(z.string()),
        providerDispatch: z.literal("OFF"),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText, audioBase64, audioSha256, embeddingJson,
      embeddingSha256, providerEvidenceJson, providerEvidenceSha256 }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const idempotencyKey = createHash("sha256").update([
        "REGISTER_QUALIFIED_VOICE",
        objective.trim(),
        ownerApprovalText,
        audioSha256,
        embeddingSha256,
        providerEvidenceSha256,
      ].join("\0")).digest("hex");
      const result = await registerQualifiedVoice(user, {
        objective,
        ownerApprovalText,
        audioBase64,
        audioSha256,
        embeddingJson,
        embeddingSha256,
        providerEvidenceJson,
        providerEvidenceSha256,
        idempotencyKey,
      });
      const state = publicFactoryState(await getOperatorSnapshot(user));
      const output = {
        accepted: true,
        replayed: result.replayed,
        runStatus: result.run?.status ?? "UNKNOWN",
        currentStep: result.run?.currentStep ?? "UNKNOWN",
        voiceFingerprintState: state.voiceFingerprintState,
        voiceBindingCount: state.voiceBindingCount,
        activationBlockers: state.activationBlockers,
        providerDispatch: "OFF" as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "start_track_g_video_1_qualification",
    {
      title: "Start bounded Track G Video #1 qualification",
      description:
        "Persist the first Track G episode as a REDUCED, WARNING_ONLY run with an immutable Stage 00-14 plan. The command stops before Stage 15, preserves rejected candidates, cannot authorize release or publish, and does not dispatch a provider.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("START VIDEO 1 QUALIFICATION"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.enum(["STAGE_00_READY", "STAGE_01_READY"]),
        episodeStatus: z.literal("IN_PRODUCTION"),
        profile: z.literal("REDUCED"),
        assuranceMode: z.literal("WARNING_ONLY"),
        stageCodes: z.array(z.string()),
        stopBeforeStage: z.literal("15"),
        releaseEligible: z.literal(false),
        bootstrapEvidenceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        providerDispatch: z.literal("OFF"),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await startTrackGVideoOneQualification(user, {
        objective,
        ownerApprovalText,
        idempotencyKey: trackGVideoOneIdempotencyKey(),
      });
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.run.id,
        runStatus: "RUNNING" as const,
        currentStep: result.run.currentStep as "STAGE_00_READY" | "STAGE_01_READY",
        episodeStatus: "IN_PRODUCTION" as const,
        profile: "REDUCED" as const,
        assuranceMode: "WARNING_ONLY" as const,
        stageCodes: result.stageCodes,
        stopBeforeStage: "15" as const,
        releaseEligible: false as const,
        bootstrapEvidenceSha256: result.contract.bootstrapEvidenceSha256,
        providerDispatch: "OFF" as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "execute_track_g_video_1_stage_00",
    {
      title: "Execute Track G Video #1 Stage 00",
      description:
        "Execute the deterministic, zero-provider Stage 00 package-open and brief-bind lifecycle for the active Track G Video #1 run. It seals Production R2 evidence, freezes Stage 00, advances only to STAGE_01_READY, reserves zero Stage 00 spend, and keeps dispatch, release and publishing disabled.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("START STAGE 00"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.literal("STAGE_01_READY"),
        packageId: z.string(),
        stageCode: z.literal("00"),
        stageState: z.literal("FROZEN"),
        artifactState: z.literal("SEALED"),
        artifactEligibility: z.literal("ELIGIBLE_FOR_STAGE"),
        briefSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        videoCeilingUsd: z.number(),
        trackGCeilingUsd: z.number(),
        stageReservedUsd: z.literal(0),
        stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await executeTrackGVideoOneStage00(user, {
        objective,
        ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage00IdempotencyKey(),
      });
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: "STAGE_01_READY" as const,
        packageId: result.productionPackage.id,
        stageCode: "00" as const,
        stageState: "FROZEN" as const,
        artifactState: "SEALED" as const,
        artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        briefSha256: result.brief.canonicalHash,
        videoCeilingUsd: result.productionPackage.spendCeilingUsd,
        trackGCeilingUsd: approvedChannel.controls.trackGCeilingUsd,
        stageReservedUsd: 0 as const,
        stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "prepare_track_g_video_1_stage_04_tournament",
    {
      title: "Prepare Track G Video #1 Stage 04 creative tournament",
      description:
        "Prepare the bounded REDUCED-profile Stage 04 tournament with two eligible creative routes and three blind deterministic qualification critics. It seals and preserves every candidate, passes route-diversity and packaging-contract gates, spends zero, and stops for the required HP-02 D1 owner champion decision without advancing the run.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("PREPARE STAGE 04 TOURNAMENT"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.literal("STAGE_04_READY"),
        packageId: z.string(),
        stageCode: z.literal("04"),
        stageState: z.literal("RUNNING"),
        tournamentState: z.literal("AWAITING_HUMAN"),
        candidates: z.array(z.object({
          candidateId: z.string(),
          rank: z.number().int().positive(),
          routeName: z.string(),
          hook: z.string(),
          narrativeDevice: z.string(),
          primaryTitle: z.string(),
          thumbnailText: z.string(),
          aggregateScore: z.number(),
          machineRecommended: z.boolean(),
        })),
        gateResults: z.array(z.object({
          gate: z.string(),
          state: z.literal("PASS"),
          evidence: z.string(),
        })),
        humanGate: z.literal("REQUIRED:HP-02_D1_CHAMPION_SELECTION"),
        stageReservedUsd: z.literal(0),
        stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await prepareTrackGVideoOneStage04Tournament(user, {
        objective,
        ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage04PrepareIdempotencyKey(),
      });
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: "STAGE_04_READY" as const,
        packageId: result.productionPackage.id,
        stageCode: "04" as const,
        stageState: "RUNNING" as const,
        tournamentState: "AWAITING_HUMAN" as const,
        candidates: result.tournamentModel.candidates.map((candidate) => ({
          candidateId: candidate.id,
          rank: candidate.routeOrder,
          routeName: candidate.routeName,
          hook: candidate.route.hook,
          narrativeDevice: candidate.narrativeDevice,
          primaryTitle: candidate.packaging.primaryTitle,
          thumbnailText: candidate.packaging.thumbnailText,
          aggregateScore: result.tournamentModel.aggregateScores[candidate.id],
          machineRecommended: candidate.id === result.tournamentModel.recommendedCandidateId,
        })),
        gateResults: result.tournamentModel.gateResults,
        humanGate: "REQUIRED:HP-02_D1_CHAMPION_SELECTION" as const,
        stageReservedUsd: 0 as const,
        stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "select_track_g_video_1_stage_04_champion",
    {
      title: "Select the Track G Video #1 Stage 04 champion",
      description:
        "Record the owner's substantive HP-02 D1 editorial decision for one eligible Stage 04 route, including a rationale of at least one sentence. It seals the final route and packaging artifact, preserves the rejected candidate, freezes Stage 04 and advances exactly to STAGE_05_READY with zero provider spend.",
      inputSchema: {
        candidateId: z.string().min(12).max(160),
        rationale: z.string().min(20).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("SELECT STAGE 04 CHAMPION"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.literal("STAGE_05_READY"),
        packageId: z.string(),
        stageCode: z.literal("04"),
        stageState: z.literal("FROZEN"),
        artifactType: z.literal("CREATIVE_ROUTE_TOURNAMENT_PACKAGING"),
        artifactState: z.literal("SEALED"),
        artifactEligibility: z.literal("ELIGIBLE_FOR_STAGE"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        selectedCandidateId: z.string(),
        selectedRouteName: z.string(),
        preservedCandidateCount: z.number().int().positive(),
        gateResults: z.array(z.object({
          gate: z.string(),
          state: z.literal("PASS"),
          evidence: z.string(),
        })),
        humanGate: z.literal("SATISFIED:HP-02_D1_CHAMPION_SELECTION"),
        stageReservedUsd: z.literal(0),
        stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ candidateId, rationale, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await selectTrackGVideoOneStage04Champion(user, {
        candidateId,
        rationale,
        ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage04SelectionIdempotencyKey(candidateId, rationale),
      });
      const selected = result.candidates.find((candidate) => candidate.id === result.selection.candidateId)!;
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: "STAGE_05_READY" as const,
        packageId: result.productionPackage.id,
        stageCode: "04" as const,
        stageState: "FROZEN" as const,
        artifactType: "CREATIVE_ROUTE_TOURNAMENT_PACKAGING" as const,
        artifactState: "SEALED" as const,
        artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        artifactSha256: result.stageArtifact.canonicalHash,
        selectedCandidateId: selected.id,
        selectedRouteName: selected.routeName,
        preservedCandidateCount: result.candidates.length,
        gateResults: result.gateResults,
        humanGate: "SATISFIED:HP-02_D1_CHAMPION_SELECTION" as const,
        stageReservedUsd: 0 as const,
        stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "prepare_track_g_video_1_stage_06_script_review",
    {
      title: "Prepare Track G Video #1 Stage 06 script review",
      description:
        "Create and persist the claim-bound Stage 06 script draft, run the second advice lint, script lint and number trace, then stop for the required HP-02 D2 or D4 owner editorial decision. The draft is immutable, costs zero and does not advance the Production run.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("PREPARE STAGE 06 SCRIPT REVIEW"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.literal("STAGE_06_READY"),
        packageId: z.string(),
        stageCode: z.literal("06"),
        stageState: z.literal("RUNNING"),
        reviewState: z.literal("AWAITING_HUMAN"),
        draftId: z.string(),
        draftSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        draftTitle: z.string(),
        draftHook: z.string(),
        sections: z.array(z.object({
          beatId: z.string(),
          title: z.string(),
          narration: z.string(),
          claimIds: z.array(z.string()),
        })),
        wordCount: z.number().int().positive(),
        estimatedDurationSec: z.number().int().positive(),
        gateResults: z.array(z.object({
          gate: z.string(),
          state: z.literal("PASS"),
          evidence: z.string(),
        })),
        humanGate: z.literal("REQUIRED:HP-02_D2_OR_D4_EDITORIAL_DECISION"),
        stageReservedUsd: z.literal(0),
        stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await prepareTrackGVideoOneStage06ScriptReview(user, {
        objective,
        ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage06PrepareIdempotencyKey(),
      });
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: "STAGE_06_READY" as const,
        packageId: result.productionPackage.id,
        stageCode: "06" as const,
        stageState: "RUNNING" as const,
        reviewState: "AWAITING_HUMAN" as const,
        draftId: result.scriptDraft.id,
        draftSha256: result.scriptDraft.canonicalHash,
        draftTitle: result.scriptModel.title,
        draftHook: result.scriptModel.hook,
        sections: result.scriptModel.sections.map((section) => ({
          beatId: section.beatId,
          title: section.title,
          narration: section.narration,
          claimIds: section.claimIds,
        })),
        wordCount: result.scriptModel.wordCount,
        estimatedDurationSec: result.scriptModel.estimatedDurationSec,
        gateResults: result.gateResults,
        humanGate: "REQUIRED:HP-02_D2_OR_D4_EDITORIAL_DECISION" as const,
        stageReservedUsd: 0 as const,
        stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "apply_track_g_video_1_stage_06_editorial_decision",
    {
      title: "Apply the Track G Video #1 Stage 06 editorial decision",
      description:
        "Record and apply one substantive owner-authored HP-02 D2 hook/title edit or D4 beat rewrite, rerun all Stage 06 gates, seal the final script and advance exactly to STAGE_07A_READY with zero provider spend.",
      inputSchema: {
        decisionType: z.enum(["D2", "D4"]),
        revisedTitle: z.string().max(140).optional(),
        revisedHook: z.string().max(400).optional(),
        beatId: z.string().max(160).optional(),
        revisedBeatNarration: z.string().max(2500).optional(),
        rationale: z.string().min(20).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("APPLY STAGE 06 EDITORIAL DECISION"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.literal("STAGE_07A_READY"),
        packageId: z.string(),
        stageCode: z.literal("06"),
        stageState: z.literal("FROZEN"),
        artifactType: z.literal("SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL"),
        artifactState: z.literal("SEALED"),
        artifactEligibility: z.literal("ELIGIBLE_FOR_STAGE"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        decisionType: z.enum(["D2", "D4"]),
        finalTitle: z.string(),
        finalHook: z.string(),
        gateResults: z.array(z.object({
          gate: z.string(),
          state: z.literal("PASS"),
          evidence: z.string(),
        })),
        humanGate: z.string(),
        stageReservedUsd: z.literal(0),
        stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ decisionType, revisedTitle, revisedHook, beatId, revisedBeatNarration,
      rationale, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const decisionInput = { decisionType, revisedTitle, revisedHook, beatId,
        revisedBeatNarration, rationale };
      const result = await applyTrackGVideoOneStage06EditorialDecision(user, {
        ...decisionInput,
        ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage06EditorialIdempotencyKey(decisionInput),
      });
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: "STAGE_07A_READY" as const,
        packageId: result.productionPackage.id,
        stageCode: "06" as const,
        stageState: "FROZEN" as const,
        artifactType: "SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL" as const,
        artifactState: "SEALED" as const,
        artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        artifactSha256: result.stageArtifact.canonicalHash,
        decisionType: result.decision.decisionType as "D2" | "D4",
        finalTitle: revisedTitle?.trim() || result.scriptModel.title,
        finalHook: revisedHook?.trim() || result.scriptModel.hook,
        gateResults: result.gateResults,
        humanGate: `SATISFIED:HP-02_${result.decision.decisionType}_EDITORIAL_DECISION`,
        stageReservedUsd: 0 as const,
        stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "prepare_track_g_video_1_stage_07a_voice_tournament",
    {
      title: "Prepare Track G Video #1 Stage 07A voice tournament",
      description:
        "Seal two REDUCED-profile tone routes for the already-qualified voice, verify six TTS segment boundaries and the immutable voice-settings hash, then stop for the required HP-02 D5 owner tone selection. No TTS provider call or spend occurs.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("PREPARE STAGE 07A VOICE TOURNAMENT"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_07A_READY"), stageCode: z.literal("07A"),
        stageState: z.literal("RUNNING"), tournamentState: z.literal("AWAITING_HUMAN"),
        candidates: z.array(z.object({ candidateId: z.string(), routeName: z.string(),
          summary: z.string(), deliveryDirection: z.string(), machineScore: z.number(),
          machineRecommended: z.boolean() })),
        segmentCount: z.number().int().positive(), settingsHash: z.string().regex(/^[0-9a-f]{64}$/u),
        gateResults: z.array(z.object({ gate: z.string(), state: z.literal("PASS"), evidence: z.string() })),
        humanGate: z.literal("REQUIRED:HP-02_D5_TONE_SELECTION"),
        stageReservedUsd: z.literal(0), stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false), autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await prepareTrackGVideoOneStage07AVoiceTournament(user, {
        objective, ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage07APrepareIdempotencyKey(),
      });
      const output = {
        accepted: true, replayed: result.replayed, runId: result.base.run.id,
        currentStep: "STAGE_07A_READY" as const, stageCode: "07A" as const,
        stageState: "RUNNING" as const, tournamentState: "AWAITING_HUMAN" as const,
        candidates: result.tournamentModel.candidates.map((candidate) => ({
          candidateId: candidate.id, routeName: candidate.routeName, summary: candidate.summary,
          deliveryDirection: candidate.deliveryDirection, machineScore: candidate.machineScore,
          machineRecommended: candidate.id === result.tournamentModel.recommendedCandidateId,
        })),
        segmentCount: result.tournamentModel.segments.length,
        settingsHash: result.tournamentModel.settingsHash,
        gateResults: result.tournamentModel.gateResults,
        humanGate: "REQUIRED:HP-02_D5_TONE_SELECTION" as const,
        stageReservedUsd: 0 as const, stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const, releaseEligible: false as const, autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "select_track_g_video_1_stage_07a_tone",
    {
      title: "Select Track G Video #1 Stage 07A tone",
      description:
        "Record the owner's HP-02 D5 tone selection and rationale, preserve the rejected route, seal voice design and TTS segmentation, freeze Stage 07A and advance exactly to STAGE_07B_READY with zero provider spend.",
      inputSchema: {
        candidateId: z.string().min(12).max(160), rationale: z.string().min(20).max(500),
        confirm: z.literal(true), ownerApprovalText: z.literal("SELECT STAGE 07A TONE"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_07B_READY"), stageCode: z.literal("07A"),
        stageState: z.literal("FROZEN"), artifactType: z.literal("VOICE_DESIGN_TTS_SEGMENTATION_SEAL"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u), selectedCandidateId: z.string(),
        selectedRouteName: z.string(), preservedCandidateCount: z.number().int().positive(),
        gateResults: z.array(z.object({ gate: z.string(), state: z.literal("PASS"), evidence: z.string() })),
        humanGate: z.literal("SATISFIED:HP-02_D5_TONE_SELECTION"),
        stageReservedUsd: z.literal(0), stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false), autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ candidateId, rationale, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await selectTrackGVideoOneStage07ATone(user, {
        candidateId, rationale, ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage07ASelectionIdempotencyKey(candidateId, rationale),
      });
      const selected = result.tournamentModel.candidates.find((value) => value.id === result.selectedCandidateId)!;
      const output = {
        accepted: true, replayed: result.replayed, runId: result.base.run.id,
        currentStep: "STAGE_07B_READY" as const, stageCode: "07A" as const,
        stageState: "FROZEN" as const, artifactType: "VOICE_DESIGN_TTS_SEGMENTATION_SEAL" as const,
        artifactSha256: result.stageArtifact.canonicalHash, selectedCandidateId: selected.id,
        selectedRouteName: selected.routeName, preservedCandidateCount: result.tournamentModel.candidates.length,
        gateResults: result.tournamentModel.gateResults,
        humanGate: "SATISFIED:HP-02_D5_TONE_SELECTION" as const,
        stageReservedUsd: 0 as const, stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const, releaseEligible: false as const, autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "prepare_track_g_video_1_stage_09_visual_review",
    {
      title: "Prepare Track G Video #1 Stage 09 visual review",
      description:
        "Prepare the bounded REDUCED Stage 09 visual-composition manifest and two thumbnail routes for owner HP-02 D3 review. It uses owner-controlled original vector recipes, dispatches no provider, spends nothing and leaves Stage 09 awaiting the owner.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("PREPARE STAGE 09 VISUAL REVIEW"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_09_READY"), stageCode: z.literal("09"),
        stageState: z.literal("RUNNING"), reviewState: z.literal("AWAITING_HUMAN"),
        assetCount: z.number().int().positive(), candidateCount: z.number().int().positive(),
        gateResults: z.array(z.object({ gate: z.string(), state: z.literal("PASS"), evidence: z.string() })),
        humanGate: z.literal("REQUIRED:HP-02_D3_THUMBNAIL_SELECTION"),
        stageReservedUsd: z.literal(0), stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false), autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await prepareTrackGVideoOneStage09VisualReview(user, {
        objective, ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage09PrepareIdempotencyKey(),
      });
      const output = {
        accepted: true, replayed: result.replayed, runId: result.base.run.id,
        currentStep: "STAGE_09_READY" as const, stageCode: "09" as const,
        stageState: "RUNNING" as const, reviewState: "AWAITING_HUMAN" as const,
        assetCount: result.tournamentModel.assets.length,
        candidateCount: result.tournamentModel.thumbnailCandidates.length,
        gateResults: result.tournamentModel.gateResults,
        humanGate: "REQUIRED:HP-02_D3_THUMBNAIL_SELECTION" as const,
        stageReservedUsd: 0 as const, stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const, releaseEligible: false as const, autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "select_track_g_video_1_stage_09_thumbnail",
    {
      title: "Select Track G Video #1 Stage 09 thumbnail",
      description:
        "Record the owner's HP-02 D3 thumbnail selection, optional text edit and rationale; preserve the rejected route, seal Stage 09 and advance exactly to STAGE_10_READY with zero provider spend.",
      inputSchema: {
        candidateId: z.string().min(12).max(160),
        revisedThumbnailText: z.string().min(6).max(48),
        rationale: z.string().min(20).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("SELECT STAGE 09 THUMBNAIL"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_10_READY"), stageCode: z.literal("09"),
        stageState: z.literal("FROZEN"),
        artifactType: z.literal("VISUAL_ACQUISITION_COMPOSITION_SEAL"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        selectedCandidateId: z.string(), revisedThumbnailText: z.string(),
        gateResults: z.array(z.object({ gate: z.string(), state: z.literal("PASS"), evidence: z.string() })),
        humanGate: z.literal("SATISFIED:HP-02_D3_THUMBNAIL_SELECTION"),
        stageReservedUsd: z.literal(0), stageActualUsd: z.literal(0),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false), autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ candidateId, revisedThumbnailText, rationale, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await selectTrackGVideoOneStage09Thumbnail(user, {
        candidateId, revisedThumbnailText, rationale, ownerApprovalText,
        idempotencyKey: await trackGVideoOneStage09SelectionIdempotencyKey(
          candidateId, revisedThumbnailText, rationale),
      });
      const output = {
        accepted: true, replayed: result.replayed, runId: result.base.run.id,
        currentStep: "STAGE_10_READY" as const, stageCode: "09" as const,
        stageState: "FROZEN" as const,
        artifactType: "VISUAL_ACQUISITION_COMPOSITION_SEAL" as const,
        artifactSha256: result.stageArtifact.canonicalHash,
        selectedCandidateId: result.selection.selectedCandidateId!,
        revisedThumbnailText: result.selection.revisedThumbnailText!,
        gateResults: result.gateResults,
        humanGate: "SATISFIED:HP-02_D3_THUMBNAIL_SELECTION" as const,
        stageReservedUsd: 0 as const, stageActualUsd: 0 as const,
        providerDispatch: "OFF" as const, releaseEligible: false as const, autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "start_track_g_video_1_stage_10",
    {
      title: "Start durable Track G Video #1 Stage 10",
      description:
        "Create one durable Stage 10 job and return quickly. A later explicit owner command may append one new attempt only after an eligible runtime failure; terminal quality, rights, policy and budget failures never retry. Each attempt is bounded to 12 calls and posts an immutable receipt. This command never freezes Stage 10.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("START STAGE 10"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        currentStep: z.literal("STAGE_10_READY"),
        jobStatus: z.enum(["PENDING", "READY", "FAILED"]),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const callbackUrl = new URL("/api/media-worker/stage10", request.url).toString();
      const result = await startTrackGVideoOneStage10(user, {
        objective,
        ownerApprovalText: "START STAGE 10",
        idempotencyKey: await trackGVideoOneStage10StartIdempotencyKey(),
        callbackUrl,
      });
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.bootstrap.run.id,
        currentStep: "STAGE_10_READY" as const,
        jobStatus: result.job.state,
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "finalize_track_g_video_1_stage_10",
    {
      title: "Finalize durable Track G Video #1 Stage 10",
      description:
        "Read the immutable Stage 10 worker receipt from Production object storage, verify media hashes and calibrated gates, then atomically seal Stage 10 and advance exactly to STAGE_11_READY. A PENDING or failed job leaves Production unfrozen.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("FINALIZE STAGE 10"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_11_READY"), stageCode: z.literal("10"),
        stageState: z.literal("FROZEN"), artifactState: z.literal("SEALED"),
        artifactEligibility: z.literal("ELIGIBLE_FOR_STAGE"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        narrationSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        gateResults: z.array(z.object({ gate: z.string(), state: z.literal("PASS"), evidence: z.string() })),
        stageReservedUsd: z.number().nonnegative(), stageActualUsd: z.number().nonnegative(),
        providerCallCount: z.number().int().nonnegative(),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await finalizeTrackGVideoOneStage10(user, {
        objective,
        ownerApprovalText: "FINALIZE STAGE 10",
        idempotencyKey: await trackGVideoOneStage10FinalizeIdempotencyKey(),
      });
      const output = {
        accepted: true, replayed: result.replayed, runId: result.base.run.id,
        currentStep: "STAGE_11_READY" as const, stageCode: "10" as const,
        stageState: "FROZEN" as const, artifactState: "SEALED" as const,
        artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        artifactSha256: result.stageArtifact.canonicalHash,
        narrationSha256: result.production.narrationSha256,
        gateResults: result.gateResults,
        stageReservedUsd: result.production.reservedUsd,
        stageActualUsd: result.production.actualUsd,
        providerCallCount: result.production.providerCallCount,
        providerDispatch: "OFF" as const, releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "start_track_g_video_1_stage_12",
    {
      title: "Start durable Track G Video #1 Stage 12",
      description:
        "Start one durable pre-master render and full-timeline deterministic QA attempt from sealed Stage 09-11 inputs. On the exact eligible attempt-3 callback failure, this stable command recovers by re-scanning the existing immutable pre-master without rendering attempt 4. This does not call a content provider, seal Stage 12, release, or publish.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("START STAGE 12"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_12_READY"), stageCode: z.literal("12"),
        jobStatus: z.enum(["PENDING", "READY"]),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false,
        idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const workerRoute = new URL("/api/media-worker/stage12", request.url).toString();
      const recovery = await diagnoseTrackGVideoOneStage12Recovery();
      const result = recovery.recoveryState === "PASS"
        ? await recoverTrackGVideoOneStage12AttemptThree(user, {
          objective, ownerApprovalText: "RECOVER STAGE 12 ATTEMPT 3",
          callbackUrl: workerRoute, objectAccessUrl: workerRoute,
        })
        : await startTrackGVideoOneStage12WithDerivedIdempotency(user, {
          objective, ownerApprovalText: "START STAGE 12",
          callbackUrl: workerRoute, objectAccessUrl: workerRoute,
        });
      const output = { accepted: true, replayed: result.replayed,
        runId: result.bootstrap.run.id, currentStep: "STAGE_12_READY" as const,
        stageCode: "12" as const, jobStatus: result.job.state as "PENDING" | "READY",
        providerDispatch: "OFF" as const, releaseEligible: false as const,
        autoPublish: "OFF" as const };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "finalize_track_g_video_1_stage_12",
    {
      title: "Finalize durable Track G Video #1 Stage 12",
      description:
        "Read and verify the immutable pre-master and deterministic QA receipt, require every M0/M1 gate to pass, seal Stage 12 and advance exactly to STAGE_13_READY. This does not call a provider, release, or publish.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("FINALIZE STAGE 12"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_13_READY"), stageCode: z.literal("12"),
        stageState: z.literal("FROZEN"), artifactState: z.literal("SEALED"),
        artifactEligibility: z.literal("ELIGIBLE_FOR_STAGE"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        preMasterSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        gateResults: z.array(z.object({ gate: z.string(), state: z.literal("PASS"), evidence: z.string() })),
        renderAuthorized: z.literal(true), providerCallCount: z.literal(0),
        providerDispatch: z.literal("OFF"), releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false,
        idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await finalizeTrackGVideoOneStage12WithDerivedIdempotency(user, {
        objective, ownerApprovalText: "FINALIZE STAGE 12",
      });
      const output = { accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: "STAGE_13_READY" as const,
        stageCode: "12" as const, stageState: "FROZEN" as const,
        artifactState: "SEALED" as const, artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        artifactSha256: result.stageArtifact.canonicalHash,
        preMasterSha256: result.stage12Qa.preMasterSha256,
        gateResults: result.gateResults, renderAuthorized: true as const,
        providerCallCount: 0 as const, providerDispatch: "OFF" as const,
        releaseEligible: false as const, autoPublish: "OFF" as const };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "recover_track_g_video_1_stage_12_attempt_3",
    {
      title: "Recover Track G Video #1 Stage 12 attempt 3",
      description:
        "Re-scan the one immutable pre-master already produced by failed attempt 3, without rendering or creating attempt 4. The existing job becomes READY only if every deterministic QA gate passes. This never calls a provider, releases or publishes.",
      inputSchema: {
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("RECOVER STAGE 12 ATTEMPT 3"),
      },
      outputSchema: {
        accepted: z.boolean(), replayed: z.boolean(), runId: z.string(),
        currentStep: z.literal("STAGE_12_READY"), stageCode: z.literal("12"),
        attemptOrdinal: z.literal(3), jobStatus: z.enum(["PENDING", "READY"]),
        renderExecuted: z.literal(false), providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false), autoPublish: z.literal("OFF"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false,
        idempotentHint: true, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ objective }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const workerRoute = new URL("/api/media-worker/stage12", request.url).toString();
      const result = await recoverTrackGVideoOneStage12AttemptThree(user, {
        objective, ownerApprovalText: "RECOVER STAGE 12 ATTEMPT 3",
        callbackUrl: workerRoute, objectAccessUrl: workerRoute,
      });
      const output = { accepted: true, replayed: result.replayed,
        runId: result.bootstrap.run.id, currentStep: "STAGE_12_READY" as const,
        stageCode: "12" as const, attemptOrdinal: 3 as const,
        jobStatus: result.job.state as "PENDING" | "READY", renderExecuted: false as const,
        providerDispatch: "OFF" as const, releaseEligible: false as const,
        autoPublish: "OFF" as const };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "advance_track_g_video_1_stage",
    {
      title: "Advance Track G Video #1 through a qualified stage",
      description:
        "Run one sequential Stage 01-14 executor through a stable, owner-authorized contract. The runner is idempotent and fail-closed: it verifies the frozen predecessor, immutable Production evidence, stage gates and zero-or-bounded spend before advancing exactly one stage. Stage 15 release remains a separate P10 action. An unimplemented stage executor is rejected without mutation.",
      inputSchema: {
        stageCode: z.enum(trackGAdvanceStageCodes),
        objective: z.string().min(12).max(500),
        confirm: z.literal(true),
        ownerApprovalText: z.literal("ADVANCE TRACK G VIDEO 1"),
      },
      outputSchema: {
        accepted: z.boolean(),
        replayed: z.boolean(),
        runId: z.string(),
        runStatus: z.literal("RUNNING"),
        currentStep: z.string(),
        packageId: z.string(),
        stageCode: z.enum(trackGAdvanceStageCodes),
        stageState: z.literal("FROZEN"),
        artifactType: z.string(),
        artifactState: z.literal("SEALED"),
        artifactEligibility: z.literal("ELIGIBLE_FOR_STAGE"),
        artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        gateResults: z.array(z.object({
          gate: z.string(),
          state: z.literal("PASS"),
          evidence: z.string(),
        })),
        stageReservedUsd: z.number().nonnegative(),
        stageActualUsd: z.number().nonnegative(),
        humanGate: z.string(),
        providerDispatch: z.literal("OFF"),
        releaseEligible: z.literal(false),
        autoPublish: z.literal("OFF"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["factory.prepare"] }],
    },
    async ({ stageCode, objective, ownerApprovalText }) => {
      if (!grantedScopes.has("factory.prepare")) return authenticationToolError(request, "factory.prepare");
      const result = await advanceTrackGVideoOneStage(user, {
        stageCode,
        objective,
        ownerApprovalText,
        idempotencyKey: await trackGVideoOneStageIdempotencyKey(stageCode),
      });
      const stage10Production = stageCode === "10" && "production" in result
        ? result.production as { reservedUsd: number; actualUsd: number }
        : null;
      const stageSpend = stage10Production
        ? { reservedUsd: stage10Production.reservedUsd, actualUsd: stage10Production.actualUsd }
        : { reservedUsd: 0, actualUsd: 0 };
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: result.base.run.currentStep,
        packageId: result.productionPackage.id,
        stageCode,
        stageState: "FROZEN" as const,
        artifactType: result.stageArtifact.artifactType,
        artifactState: "SEALED" as const,
        artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        artifactSha256: result.stageArtifact.canonicalHash,
        gateResults: result.gateResults,
        stageReservedUsd: stageSpend.reservedUsd,
        stageActualUsd: stageSpend.actualUsd,
        humanGate: "NOT_REQUIRED",
        providerDispatch: "OFF" as const,
        releaseEligible: false as const,
        autoPublish: "OFF" as const,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  return server;
}

function authenticationToolError(request: Request, scope: string) {
  const challenge = bearerChallenge(request, "insufficient_scope", `Permission ${scope} is required`);
  return {
    content: [{ type: "text" as const, text: `Authentication required: ${scope}.` }],
    _meta: { "mcp/www_authenticate": [challenge] },
    isError: true,
  };
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "UNEXPECTED_MCP_ERROR";
  const status = message.includes("AUTHORIZATION") || message.includes("ALLOWLIST") ? 403 : 500;
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status, headers: corsHeaders },
  );
}

async function legacyDiscoveryFallback(request: Request): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const payload = await request.clone().json().catch(() => null) as {
    id?: unknown;
    method?: unknown;
  } | null;
  if (payload?.method !== "server/discover" || !("id" in payload)) return null;
  return Response.json(
    {
      jsonrpc: "2.0",
      id: payload.id,
      error: { code: -32601, message: "Method not found" },
    },
    { status: 200, headers: corsHeaders },
  );
}

type JsonRpcToolCall = {
  method?: unknown;
  params?: { name?: unknown; [key: string]: unknown };
  [key: string]: unknown;
};

function normalizeNamespacedToolCallItem(payload: JsonRpcToolCall): JsonRpcToolCall {
  const prefix = "youtube_ai_factory_v2.";
  if (payload.method !== "tools/call" || typeof payload.params?.name !== "string"
    || !payload.params.name.startsWith(prefix)) return payload;
  return {
    ...payload,
    params: { ...payload.params, name: payload.params.name.slice(prefix.length) },
  };
}

async function normalizeNamespacedToolCall(request: Request): Promise<unknown | undefined> {
  if (request.method !== "POST") return undefined;
  const payload = await request.clone().json().catch(() => null) as
    JsonRpcToolCall | JsonRpcToolCall[] | null;
  if (!payload) return undefined;
  if (Array.isArray(payload)) {
    const normalized = payload.map(normalizeNamespacedToolCallItem);
    return normalized.some((item, index) => item !== payload[index]) ? normalized : undefined;
  }
  const normalized = normalizeNamespacedToolCallItem(payload);
  return normalized === payload ? undefined : normalized;
}

async function handleMcp(request: Request): Promise<Response> {
  try {
    const chatGPTUser = await getChatGPTUser();
    const bearerIdentity = chatGPTUser ? null : await authenticateBearer(request);
    const user = chatGPTUser ?? bearerIdentity?.user ?? null;
    if (!user) {
      const headers = new Headers(corsHeaders);
      headers.set("WWW-Authenticate", bearerChallenge(request));
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "CHATGPT_SIGN_IN_REQUIRED" },
          id: null,
        },
        { status: 401, headers },
      );
    }
    requireOwner(user);
    const discoveryFallback = await legacyDiscoveryFallback(request);
    if (discoveryFallback) return discoveryFallback;
    const normalizedBody = await normalizeNamespacedToolCall(request);
    const grantedScopes = chatGPTUser ? new Set(oauthScopes) : bearerIdentity?.scopes ?? new Set<string>();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createFactoryServer(user, grantedScopes, request);
    await server.connect(transport);
    const response = await addToolSecuritySchemes(await transport.handleRequest(
      request,
      normalizedBody === undefined ? undefined : { parsedBody: normalizedBody },
    ));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function addToolSecuritySchemes(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null) as {
    result?: { tools?: Array<{ name?: string; securitySchemes?: Array<{ type: string; scopes: string[] }> }> };
  } | null;
  if (!payload?.result?.tools) return response;
  for (const tool of payload.result.tools) {
    if (tool.name === "get_factory_state") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.read"] }];
    }
    if (tool.name === "diagnose_track_g_video_1_stage_12_preflight") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.read"] }];
    }
    if (tool.name === "diagnose_track_g_video_1_stage_12_recovery") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.read"] }];
    }
    if (tool.name === "recover_track_g_video_1_stage_12_attempt_3") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "prepare_approved_channel") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "register_qualified_voice") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "start_track_g_video_1_qualification") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "execute_track_g_video_1_stage_00") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "advance_track_g_video_1_stage") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "prepare_track_g_video_1_stage_04_tournament") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "select_track_g_video_1_stage_04_champion") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "prepare_track_g_video_1_stage_06_script_review") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "apply_track_g_video_1_stage_06_editorial_decision") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "prepare_track_g_video_1_stage_07a_voice_tournament") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "select_track_g_video_1_stage_07a_tone") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "prepare_track_g_video_1_stage_09_visual_review") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
    if (tool.name === "select_track_g_video_1_stage_09_thumbnail") {
      tool.securitySchemes = [{ type: "oauth2", scopes: ["factory.prepare"] }];
    }
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request: Request) {
  return handleMcp(request);
}

export async function POST(request: Request) {
  return handleMcp(request);
}

export async function DELETE(request: Request) {
  return handleMcp(request);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
