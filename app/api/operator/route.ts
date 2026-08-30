import { getChatGPTUser } from "../../chatgpt-auth";
import { getOperatorSnapshot, prepareApprovedChannel } from "../../operator-runtime";
import {
  advanceTrackGVideoOneStage,
  applyTrackGVideoOneStage06EditorialDecision,
  prepareTrackGVideoOneStage07AVoiceTournament,
  selectTrackGVideoOneStage07ATone,
  trackGVideoOneStage06EditorialIdempotencyKey,
  trackGVideoOneStage07APrepareIdempotencyKey,
  trackGVideoOneStage07ASelectionIdempotencyKey,
  trackGVideoOneStageIdempotencyKey,
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
      candidateId?: string;
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
    if (body.commandType === "PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_07A_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await prepareTrackGVideoOneStage07AVoiceTournament(user, {
        objective: body.objective ?? "Prepare two qualified Stage 07A voice tone routes for owner D5 review.",
        ownerApprovalText: "PREPARE STAGE 07A VOICE TOURNAMENT",
        idempotencyKey: await trackGVideoOneStage07APrepareIdempotencyKey(),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "07A", stageState: "RUNNING", reviewState: "AWAITING_HUMAN",
        candidateCount: result.tournamentModel.candidates.length,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE") {
      if (body.confirm !== true || !body.candidateId) {
        return Response.json({ error: "STAGE_07A_OWNER_SELECTION_REQUIRED" }, { status: 400 });
      }
      const rationale = body.rationale ?? "";
      const result = await selectTrackGVideoOneStage07ATone(user, {
        candidateId: body.candidateId, rationale,
        ownerApprovalText: "SELECT STAGE 07A TONE",
        idempotencyKey: await trackGVideoOneStage07ASelectionIdempotencyKey(body.candidateId, rationale),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "07A", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash, decisionType: "D5",
        selectedCandidateId: result.selectedCandidateId,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "ADVANCE_TRACK_G_VIDEO_1_STAGE_07B") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_07B_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await advanceTrackGVideoOneStage(user, {
        stageCode: "07B",
        objective: body.objective
          ?? "Compile the sealed Stage 07B visual grammar and deterministic beat routing.",
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
        idempotencyKey: await trackGVideoOneStageIdempotencyKey("07B"),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "07B", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash,
        gateResults: result.gateResults,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    return Response.json({ error: "COMMAND_NOT_AVAILABLE_ON_OPERATOR_SURFACE" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
