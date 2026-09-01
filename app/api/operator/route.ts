import { getChatGPTUser } from "../../chatgpt-auth";
import { getOperatorSnapshot, prepareApprovedChannel } from "../../operator-runtime";
import {
  advanceTrackGVideoOneStage,
  applyTrackGVideoOneStage06EditorialDecision,
  finalizeTrackGVideoOneStage10,
  finalizeTrackGVideoOneStage12WithDerivedIdempotency,
  prepareTrackGVideoOneStage09VisualReview,
  prepareTrackGVideoOneStage07AVoiceTournament,
  selectTrackGVideoOneStage09Thumbnail,
  selectTrackGVideoOneStage07ATone,
  startTrackGVideoOneStage10,
  startTrackGVideoOneStage12WithDerivedIdempotency,
  trackGVideoOneStage06EditorialIdempotencyKey,
  trackGVideoOneStage07APrepareIdempotencyKey,
  trackGVideoOneStage07ASelectionIdempotencyKey,
  trackGVideoOneStage09PrepareIdempotencyKey,
  trackGVideoOneStage09SelectionIdempotencyKey,
  trackGVideoOneStage10FinalizeIdempotencyKey,
  trackGVideoOneStage10StartIdempotencyKey,
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
      revisedThumbnailText?: string;
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
    if (body.commandType === "ADVANCE_TRACK_G_VIDEO_1_STAGE_08") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_08_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await advanceTrackGVideoOneStage(user, {
        stageCode: "08",
        objective: body.objective
          ?? "Compile the sealed Stage 08 ShotCueProgram with frame-exact timeline assertions.",
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
        idempotencyKey: await trackGVideoOneStageIdempotencyKey("08"),
      });
      if (!("shotCueProgramModel" in result)) {
        throw new Error("TRACK_G_STAGE_08_EXECUTOR_RECEIPT_INVALID");
      }
      const shotCueProgramModel = result.shotCueProgramModel as {
        shots: unknown[]; assertionCount: number;
      };
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "08", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash,
        gateResults: result.gateResults,
        shotCount: shotCueProgramModel.shots.length,
        assertionCount: shotCueProgramModel.assertionCount,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_09_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await prepareTrackGVideoOneStage09VisualReview(user, {
        objective: body.objective
          ?? "Prepare bounded Stage 09 visual compositions and thumbnail routes for owner D3 review.",
        ownerApprovalText: "PREPARE STAGE 09 VISUAL REVIEW",
        idempotencyKey: await trackGVideoOneStage09PrepareIdempotencyKey(),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "09", stageState: "RUNNING", reviewState: "AWAITING_HUMAN",
        assetCount: result.tournamentModel.assets.length,
        candidateCount: result.tournamentModel.thumbnailCandidates.length,
        gateResults: result.tournamentModel.gateResults,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL") {
      if (body.confirm !== true || !body.candidateId || !body.revisedThumbnailText) {
        return Response.json({ error: "STAGE_09_OWNER_SELECTION_REQUIRED" }, { status: 400 });
      }
      const rationale = body.rationale ?? "";
      const result = await selectTrackGVideoOneStage09Thumbnail(user, {
        candidateId: body.candidateId,
        revisedThumbnailText: body.revisedThumbnailText,
        rationale,
        ownerApprovalText: "SELECT STAGE 09 THUMBNAIL",
        idempotencyKey: await trackGVideoOneStage09SelectionIdempotencyKey(
          body.candidateId, body.revisedThumbnailText, rationale),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "09", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash, decisionType: "D3",
        selectedCandidateId: result.selection.selectedCandidateId,
        revisedThumbnailText: result.selection.revisedThumbnailText,
        gateResults: result.gateResults,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "START_TRACK_G_VIDEO_1_STAGE_10") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_10_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await startTrackGVideoOneStage10(user, {
        objective: body.objective
          ?? "Start the bounded calibrated Stage 10 narration job and persist its durable receipt.",
        ownerApprovalText: "START STAGE 10",
        idempotencyKey: await trackGVideoOneStage10StartIdempotencyKey(),
        callbackUrl: new URL("/api/media-worker/stage10", request.url).toString(),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.bootstrap.run.id, currentStep: result.bootstrap.run.currentStep,
        stageCode: "10", jobStatus: result.job.state,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "FINALIZE_TRACK_G_VIDEO_1_STAGE_10") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_10_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await finalizeTrackGVideoOneStage10(user, {
        objective: body.objective
          ?? "Verify the durable Stage 10 receipt, seal eligible narration, and advance to Stage 11.",
        ownerApprovalText: "FINALIZE STAGE 10",
        idempotencyKey: await trackGVideoOneStage10FinalizeIdempotencyKey(),
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "10", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash,
        narrationSha256: result.production.narrationSha256,
        gateResults: result.gateResults,
        stageReservedUsd: result.production.reservedUsd,
        stageActualUsd: result.production.actualUsd,
        providerCallCount: result.production.providerCallCount,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "ADVANCE_TRACK_G_VIDEO_1_STAGE_11") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_11_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await advanceTrackGVideoOneStage(user, {
        stageCode: "11",
        objective: body.objective
          ?? "Seal the ambience-only Stage 11 sound-design and loudness plan for Stage 12 rendering.",
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
        idempotencyKey: await trackGVideoOneStageIdempotencyKey("11"),
      });
      if (!("audioPlanModel" in result)) {
        throw new Error("TRACK_G_STAGE_11_EXECUTOR_RECEIPT_INVALID");
      }
      const audioPlanModel = result.audioPlanModel as {
        mode: "ambience_only"; cues: unknown[]; rightsEvidenceSha256: string;
        providerCallCount: 0;
      };
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "11", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash,
        gateResults: result.gateResults,
        mode: audioPlanModel.mode, cueCount: audioPlanModel.cues.length,
        rightsEvidenceSha256: audioPlanModel.rightsEvidenceSha256,
        providerCallCount: audioPlanModel.providerCallCount,
        stageReservedUsd: 0, stageActualUsd: 0,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    if (body.commandType === "START_TRACK_G_VIDEO_1_STAGE_12") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_12_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const workerRoute = new URL("/api/media-worker/stage12", request.url).toString();
      const result = await startTrackGVideoOneStage12WithDerivedIdempotency(user, {
        objective: body.objective
          ?? "Start the durable Stage 12 pre-master render and full-timeline deterministic QA job.",
        ownerApprovalText: "START STAGE 12",
        callbackUrl: workerRoute,
        objectAccessUrl: workerRoute,
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.bootstrap.run.id, currentStep: result.bootstrap.run.currentStep,
        stageCode: "12", jobStatus: result.job.state,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 202 });
    }
    if (body.commandType === "FINALIZE_TRACK_G_VIDEO_1_STAGE_12") {
      if (body.confirm !== true) {
        return Response.json({ error: "STAGE_12_OWNER_CONFIRMATION_REQUIRED" }, { status: 400 });
      }
      const result = await finalizeTrackGVideoOneStage12WithDerivedIdempotency(user, {
        objective: body.objective
          ?? "Verify the immutable Stage 12 pre-master and deterministic QA receipt, seal it and advance to Stage 13.",
        ownerApprovalText: "FINALIZE STAGE 12",
      });
      return Response.json({ accepted: true, replayed: result.replayed,
        runId: result.base.run.id, currentStep: result.base.run.currentStep,
        stageCode: "12", stageState: "FROZEN",
        artifactSha256: result.stageArtifact.canonicalHash,
        preMasterSha256: result.stage12Qa.preMasterSha256,
        gateResults: result.gateResults,
        renderAuthorized: true, providerCallCount: 0,
        stageReservedUsd: 0, stageActualUsd: 0,
        providerDispatch: "OFF", releaseEligible: false, autoPublish: "OFF" },
      { status: result.replayed ? 200 : 201 });
    }
    return Response.json({ error: "COMMAND_NOT_AVAILABLE_ON_OPERATOR_SURFACE" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
