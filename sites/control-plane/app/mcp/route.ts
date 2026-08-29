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
  executeTrackGVideoOneStage00,
  startTrackGVideoOneQualification,
  trackGAdvanceStageCodes,
  trackGVideoOneIdempotencyKey,
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
    latestRunStatus: snapshot.runs[0]?.status ?? "NO_RUN",
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
    { name: "youtube-ai-factory-v2", version: "1.0.0" },
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
      const output = {
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        runStatus: "RUNNING" as const,
        currentStep: result.base.run.currentStep,
        packageId: result.productionPackage.id,
        stageCode,
        stageState: "FROZEN" as const,
        artifactType: result.stage01Artifact.artifactType,
        artifactState: "SEALED" as const,
        artifactEligibility: "ELIGIBLE_FOR_STAGE" as const,
        artifactSha256: result.stage01Artifact.canonicalHash,
        gateResults: result.gateResults,
        stageReservedUsd: 0,
        stageActualUsd: 0,
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
    const grantedScopes = chatGPTUser ? new Set(oauthScopes) : bearerIdentity?.scopes ?? new Set<string>();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createFactoryServer(user, grantedScopes, request);
    await server.connect(transport);
    const response = await addToolSecuritySchemes(await transport.handleRequest(request));
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
