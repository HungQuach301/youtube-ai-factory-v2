import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";
import {
  getOperatorSnapshot,
  prepareApprovedChannel,
  requireOwner,
} from "../operator-runtime";

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
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
};

const factoryStateSchema = {
  ownerAuthorized: z.boolean(),
  channelStatus: z.string(),
  contractState: z.string(),
  latestRunStatus: z.string(),
  pillar: z.string(),
  episodeCount: z.number().int().nonnegative(),
  activationBlockers: z.array(z.string()),
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
    providerDispatch: "OFF" as const,
    autoPublish: "OFF" as const,
  };
}

function createFactoryServer(user: ChatGPTUser) {
  const server = new McpServer(
    { name: "youtube-ai-factory-v2", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read state first. Call prepare_approved_channel only after an explicit owner instruction. PREPARED never means ACTIVE: provider dispatch and auto-publish remain OFF until later production gates pass.",
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
    },
    async () => {
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
    },
    async ({ objective }) => {
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

  return server;
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
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "CHATGPT_SIGN_IN_REQUIRED" },
          id: null,
        },
        { status: 401, headers: corsHeaders },
      );
    }
    requireOwner(user);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createFactoryServer(user);
    await server.connect(transport);
    const response = await transport.handleRequest(request);
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
