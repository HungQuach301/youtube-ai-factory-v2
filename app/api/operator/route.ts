import { getChatGPTUser } from "../../chatgpt-auth";
import { getOperatorSnapshot, prepareApprovedChannel } from "../../operator-runtime";
import {
  applyTrackGVideoOneStage06EditorialDecision,
  trackGVideoOneStage06EditorialIdempotencyKey,
} from "../../track-g-video-one";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "UNEXPECTED_OPERATOR_ERROR";
  const status = message.includes("AUTHORIZATION") || message.includes("ALLOWLIST") ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "CHATGPT_SIGN_IN_REQUIRED" }, { status: 401 });
    return Response.json(await getOperatorSnapshot(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "CHATGPT_SIGN_IN_REQUIRED" }, { status: 401 });
    const body = await request.json() as {
      commandType?: string;
      objective?: string;
      idempotencyKey?: string;
      confirm?: boolean;
      decisionType?: "D2" | "D4";
      revisedTitle?: string;
      revisedHook?: string;
      beatId?: string;
      revisedBeatNarration?: string;
      rationale?: string;
    };
    if (body.commandType === "PREPARE_CHANNEL") {
      const result = await prepareApprovedChannel(user, {
        objective: body.objective ?? "",
        idempotencyKey: body.idempotencyKey ?? "",
      });
      return Response.json(result, { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION") {
      if (body.confirm !== true || !body.decisionType) {
        return Response.json({ error: "STAGE_06_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const decisionInput = {
        decisionType: body.decisionType,
        revisedTitle: body.revisedTitle,
        revisedHook: body.revisedHook,
        beatId: body.beatId,
        revisedBeatNarration: body.revisedBeatNarration,
        rationale: body.rationale ?? "",
      };
      const result = await applyTrackGVideoOneStage06EditorialDecision(user, {
        ...decisionInput,
        ownerApprovalText: "APPLY STAGE 06 EDITORIAL DECISION",
        idempotencyKey: await trackGVideoOneStage06EditorialIdempotencyKey(decisionInput),
      });
      return Response.json({
        accepted: true,
        replayed: result.replayed,
        runId: result.base.run.id,
        currentStep: result.base.run.currentStep,
        stageCode: "06",
        stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash,
        decisionType: result.decision.decisionType,
        providerDispatch: "OFF",
        releaseEligible: false,
        autoPublish: "OFF",
      }, { status: result.replayed ? 200 : 201 });
    }
    return Response.json({ error: "COMMAND_NOT_AVAILABLE_ON_OPERATOR_SURFACE" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
