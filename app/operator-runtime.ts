import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import {
  channelIdentityContracts,
  channels,
  commandLog,
  creativeRouteCandidates,
  creativeTournamentSelections,
  creativeTournaments,
  episodes,
  humanDecisions,
  hpDecisions,
  operationEvents,
  operationRuns,
  ownerIdentity,
  pillars,
  predictedPerformances,
  productionPackages,
  scriptDrafts,
  stage10AudioProductions,
  stage10MediaJobs,
  stage11AudioPlans,
  stage12MediaJobs,
  stage12PreMasterQa,
  stageArtifacts,
  stageInstances,
  trackGRunContracts,
} from "../db/schema";
import { activationBlockers, approvedChannel, trackGVideoOneContract } from "./factory-contract";
import type { ChatGPTUser } from "./chatgpt-auth";
import { getFactoryEnv } from "./runtime-env";
import {
  isStage10RetryableErrorCode,
  trackGVideoOneStage07AVoiceModel,
  trackGVideoOneStage07BVisualGrammarModel,
  trackGVideoOneStage08ShotCueProgramModel,
  trackGVideoOneStage09VisualCompositionModel,
  trackGVideoOneState,
} from "./track-g-video-one";
import { buildTrackGVideoOneStage11AudioPlan } from "./stage11-audio";
import { voiceQualificationReadBack } from "./voice-qualification";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function getTrackGVideoOneWorkbench() {
  const db = getDb();
  const [contract] = await db.select().from(trackGRunContracts)
    .where(eq(trackGRunContracts.episodeId, trackGVideoOneContract.episodeId)).limit(1);
  if (!contract) return null;

  const [run] = await db.select().from(operationRuns)
    .where(eq(operationRuns.id, contract.operationRunId)).limit(1);
  const [productionPackage] = await db.select().from(productionPackages)
    .where(eq(productionPackages.episodeId, trackGVideoOneContract.episodeId)).limit(1);
  if (!run || !productionPackage) return null;

  const instances = await db.select().from(stageInstances)
    .where(eq(stageInstances.packageId, productionPackage.id));
  const artifactRows = await Promise.all(instances.map(async (instance) => {
    const [artifact] = await db.select().from(stageArtifacts)
      .where(eq(stageArtifacts.stageInstanceId, instance.id)).limit(1);
    return artifact ?? null;
  }));
  const artifactByStageInstance = new Map(artifactRows
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
    .map((artifact) => [artifact.stageInstanceId, artifact]));
  const stagePlan = parseJson<string[]>(contract.stagePlanJson, [...trackGVideoOneContract.stageCodes]);
  const stages = stagePlan.map((stageCode) => {
    const instance = instances.find((candidate) => candidate.stageCode === stageCode) ?? null;
    const artifact = instance ? artifactByStageInstance.get(instance.id) ?? null : null;
    const readyStep = `STAGE_${stageCode}_READY`;
    return {
      stageCode,
      controlState: instance?.controlState ?? (run.currentStep === readyStep ? "READY" : "NOT_STARTED"),
      standardVersion: instance?.standardVersion ?? null,
      artifact: artifact ? {
        id: artifact.id,
        artifactType: artifact.artifactType,
        canonicalHash: artifact.canonicalHash,
        immutabilityState: artifact.immutabilityState,
        eligibilityState: artifact.eligibilityState,
        r2Key: artifact.r2Key,
      } : null,
    };
  });

  const [scriptDraft] = await db.select().from(scriptDrafts)
    .where(eq(scriptDrafts.packageId, productionPackage.id)).limit(1);
  const decisions = await db.select().from(humanDecisions)
    .where(eq(humanDecisions.packageId, productionPackage.id));
  const stage06Instance = instances.find((instance) => instance.stageCode === "06") ?? null;
  const stage06Artifact = stage06Instance ? artifactByStageInstance.get(stage06Instance.id) ?? null : null;
  const stage06Decision = decisions.find((decision) => decision.artifactBeforeId === scriptDraft?.id
    || decision.artifactAfterId === stage06Artifact?.id) ?? null;
  const stage06 = scriptDraft ? {
    reviewState: stage06Instance?.controlState === "RUNNING" ? "AWAITING_HUMAN" : "SATISFIED",
    draftId: scriptDraft.id,
    draftSha256: scriptDraft.canonicalHash,
    title: scriptDraft.title,
    hook: scriptDraft.hook,
    sections: parseJson<Array<{
      beatId: string;
      title: string;
      narration: string;
      claimIds: string[];
    }>>(scriptDraft.sectionsJson, []),
    wordCount: scriptDraft.wordCount,
    estimatedDurationSec: scriptDraft.estimatedDurationSec,
    gateResults: [
      { gate: "M0_ADVICE_LINT_SECOND_PASS", state: scriptDraft.adviceLintState },
      { gate: "M1_SCRIPT_LINT", state: scriptDraft.scriptLintState },
      { gate: "M1_NUMBER_TRACE", state: scriptDraft.numberTraceState },
    ],
    evidenceR2Key: scriptDraft.r2Key,
    decision: stage06Decision ? {
      decisionType: stage06Decision.decisionType,
      rationale: stage06Decision.rationaleText,
      diffR2Key: stage06Decision.diffR2Key,
      createdAt: stage06Decision.createdAt,
    } : null,
  } : null;

  const stage07AInstance = instances.find((instance) => instance.stageCode === "07A") ?? null;
  const stage07AArtifact = stage07AInstance ? artifactByStageInstance.get(stage07AInstance.id) ?? null : null;
  const stage07ADecision = decisions.find((decision) => decision.artifactAfterId === stage07AArtifact?.id) ?? null;
  const stage07AModel = trackGVideoOneStage07AVoiceModel();
  const selectionCommand = await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE"))
    .orderBy(desc(commandLog.createdAt)).limit(1);
  const selectedCandidateId = selectionCommand[0]
    ? parseJson<{ selectedCandidateId?: string }>(selectionCommand[0].payloadJson, {}).selectedCandidateId ?? null
    : null;
  const stage04SelectionCommand = await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION"))
    .orderBy(desc(commandLog.createdAt)).limit(1);
  const selectedCreativeRouteId = stage04SelectionCommand[0]
    ? parseJson<{ candidateId?: string }>(stage04SelectionCommand[0].payloadJson, {}).candidateId
      ?? "creative_route_video_1_alert_is_the_trap_v1"
    : "creative_route_video_1_alert_is_the_trap_v1";
  const stage07A = stage07AInstance ? {
    reviewState: stage07AInstance.controlState === "RUNNING" ? "AWAITING_HUMAN" : "SATISFIED",
    tournamentId: stage07AModel.tournamentId,
    settingsHash: stage07AModel.settingsHash,
    segmentCount: stage07AModel.segments.length,
    candidates: stage07AModel.candidates.map((candidate) => ({
      candidateId: candidate.id,
      routeName: candidate.routeName,
      summary: candidate.summary,
      deliveryDirection: candidate.deliveryDirection,
      pauseProfile: candidate.pauseProfile,
      emphasis: [...candidate.emphasis],
      machineScore: candidate.machineScore,
      machineRecommended: candidate.id === stage07AModel.recommendedCandidateId,
      selected: candidate.id === selectedCandidateId,
    })),
    gateResults: stage07AModel.gateResults,
    decision: stage07ADecision ? {
      decisionType: stage07ADecision.decisionType,
      rationale: stage07ADecision.rationaleText,
      createdAt: stage07ADecision.createdAt,
    } : null,
  } : null;
  const stage07BInstance = instances.find((instance) => instance.stageCode === "07B") ?? null;
  const stage07BArtifact = stage07BInstance
    ? artifactByStageInstance.get(stage07BInstance.id) ?? null
    : null;
  const stage07BModel = trackGVideoOneStage07BVisualGrammarModel(
    selectedCreativeRouteId,
  );
  const stage07B = stage07AArtifact ? {
    controlState: stage07BInstance?.controlState ?? "READY",
    artifactSha256: stage07BArtifact?.canonicalHash ?? null,
    motionClasses: [...stage07BModel.motionClasses],
    assignments: stage07BModel.assignments,
    distribution: stage07BModel.distribution,
    gateResults: stage07BModel.gateResults,
  } : null;
  const stage08Instance = instances.find((instance) => instance.stageCode === "08") ?? null;
  const stage08Artifact = stage08Instance
    ? artifactByStageInstance.get(stage08Instance.id) ?? null
    : null;
  const stage08Model = trackGVideoOneStage08ShotCueProgramModel(selectedCreativeRouteId);
  const stage08 = stage07BArtifact ? {
    controlState: stage08Instance?.controlState ?? "READY",
    artifactSha256: stage08Artifact?.canonicalHash ?? null,
    frameRate: stage08Model.frameRate,
    targetFrames: stage08Model.targetFrames,
    targetDurationSec: stage08Model.targetDurationSec,
    maxShotDurationSec: stage08Model.maxShotDurationSec,
    assertionCount: stage08Model.assertionCount,
    shots: stage08Model.shots,
    gateResults: stage08Model.gateResults,
  } : null;
  const stage09Instance = instances.find((instance) => instance.stageCode === "09") ?? null;
  const stage09Artifact = stage09Instance
    ? artifactByStageInstance.get(stage09Instance.id) ?? null
    : null;
  const stage09Model = trackGVideoOneStage09VisualCompositionModel(selectedCreativeRouteId);
  const [stage09SelectionCommand] = await db.select().from(commandLog)
    .where(eq(commandLog.commandType, "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL"))
    .orderBy(desc(commandLog.createdAt)).limit(1);
  const stage09Selection = stage09SelectionCommand
    ? parseJson<{ selectedCandidateId?: string; revisedThumbnailText?: string }>(
      stage09SelectionCommand.payloadJson, {})
    : {};
  const stage09Decision = decisions.find((decision) => decision.artifactAfterId === stage09Artifact?.id)
    ?? null;
  const stage09 = stage08Artifact ? {
    reviewState: !stage09Instance ? "NOT_PREPARED"
      : stage09Instance.controlState === "RUNNING" ? "AWAITING_HUMAN" : "SATISFIED",
    controlState: stage09Instance?.controlState ?? "READY",
    artifactSha256: stage09Artifact?.canonicalHash ?? null,
    assetCount: stage09Model.assets.length,
    sourceCandidatesPerShot: stage09Model.sourceCandidatesPerShot,
    compositionsPerShot: stage09Model.compositionsPerShot,
    duplicateRate: stage09Model.duplicateRate,
    assets: stage09Model.assets,
    candidates: stage09Model.thumbnailCandidates.map((candidate) => ({
      candidateId: candidate.id,
      routeName: candidate.routeName,
      thumbnailText: candidate.id === stage09Selection.selectedCandidateId
        ? stage09Selection.revisedThumbnailText ?? candidate.thumbnailText
        : candidate.thumbnailText,
      composition: candidate.composition,
      palette: candidate.palette,
      machineScore: candidate.machineScore,
      machineRecommended: candidate.id === stage09Model.recommendedThumbnailId,
      selected: candidate.id === stage09Selection.selectedCandidateId,
    })),
    gateResults: stage09Model.gateResults,
    decision: stage09Decision ? {
      decisionType: stage09Decision.decisionType,
      rationale: stage09Decision.rationaleText,
      createdAt: stage09Decision.createdAt,
    } : null,
  } : null;
  const stage10Instance = instances.find((instance) => instance.stageCode === "10") ?? null;
  const stage10Artifact = stage10Instance
    ? artifactByStageInstance.get(stage10Instance.id) ?? null
    : null;
  const [stage10Production] = await db.select().from(stage10AudioProductions)
    .where(eq(stage10AudioProductions.packageId, productionPackage.id)).limit(1);
  const [stage10Job] = await db.select().from(stage10MediaJobs)
    .where(eq(stage10MediaJobs.packageId, productionPackage.id))
    .orderBy(desc(stage10MediaJobs.attemptOrdinal)).limit(1);
  const stage10 = stage10Instance && stage10Production ? {
    controlState: stage10Instance.controlState,
    artifactSha256: stage10Artifact?.canonicalHash ?? null,
    provider: stage10Production.provider,
    providerCallCount: stage10Production.providerCallCount,
    totalCharacters: stage10Production.totalCharacters,
    reservedUsd: stage10Production.reservedUsd,
    actualUsd: stage10Production.actualUsd,
    calibrationEvidenceSha256: stage10Production.calibrationEvidenceSha256,
    narrationSha256: stage10Production.narrationSha256,
  } : null;
  const stage11Instance = instances.find((instance) => instance.stageCode === "11") ?? null;
  const stage11Artifact = stage11Instance
    ? artifactByStageInstance.get(stage11Instance.id) ?? null
    : null;
  const [stage11Plan] = await db.select().from(stage11AudioPlans)
    .where(eq(stage11AudioPlans.packageId, productionPackage.id)).limit(1);
  const stage11Model = stage10Production
    ? buildTrackGVideoOneStage11AudioPlan(
      trackGVideoOneStage08ShotCueProgramModel(selectedCreativeRouteId).targetDurationSec,
      stage10Production.narrationSha256,
    )
    : null;
  const stage11 = stage11Instance && stage11Plan && stage11Model ? {
    controlState: stage11Instance.controlState,
    artifactSha256: stage11Artifact?.canonicalHash ?? null,
    mode: stage11Plan.mode,
    cueCount: stage11Model.cues.length,
    rightsEvidenceSha256: stage11Plan.rightsEvidenceSha256,
    providerCallCount: stage11Plan.providerCallCount,
    reservedUsd: stage11Plan.reservedUsd,
    actualUsd: stage11Plan.actualUsd,
    loudnessTarget: stage11Model.loudnessTarget,
    gateResults: stage11Model.gateResults,
  } : null;
  const stage12Instance = instances.find((instance) => instance.stageCode === "12") ?? null;
  const stage12Artifact = stage12Instance
    ? artifactByStageInstance.get(stage12Instance.id) ?? null
    : null;
  const [stage12Job] = await db.select().from(stage12MediaJobs)
    .where(eq(stage12MediaJobs.packageId, productionPackage.id)).limit(1);
  const [stage12Qa] = await db.select().from(stage12PreMasterQa)
    .where(eq(stage12PreMasterQa.packageId, productionPackage.id)).limit(1);
  const stage12 = stage12Qa ? {
    controlState: stage12Instance?.controlState ?? "READY",
    artifactSha256: stage12Artifact?.canonicalHash ?? null,
    preMasterSha256: stage12Qa.preMasterSha256,
    frameMd5Sha256: stage12Qa.frameMd5Sha256,
    measurements: parseJson<Record<string, number | boolean | string>>(
      stage12Qa.measurementsJson, {},
    ),
    renderAuthorized: Boolean(stage12Qa.renderAuthorized),
    providerCallCount: stage12Qa.providerCallCount,
    reservedUsd: stage12Qa.reservedUsd,
    actualUsd: stage12Qa.actualUsd,
  } : null;

  const [tournament] = await db.select().from(creativeTournaments)
    .where(eq(creativeTournaments.packageId, productionPackage.id)).limit(1);
  const candidates = tournament
    ? await db.select().from(creativeRouteCandidates)
      .where(eq(creativeRouteCandidates.tournamentId, tournament.id))
    : [];
  const [selection] = tournament
    ? await db.select().from(creativeTournamentSelections)
      .where(eq(creativeTournamentSelections.tournamentId, tournament.id)).limit(1)
    : [];
  const stage04Decision = selection
    ? decisions.find((decision) => decision.id === selection.humanDecisionId) ?? null
    : null;
  const stage04 = tournament ? {
    candidates: candidates.sort((left, right) => left.routeOrder - right.routeOrder).map((candidate) => {
      const route = parseJson<{ hook?: string }>(candidate.routeJson, {});
      const packaging = parseJson<{ primaryTitle?: string; thumbnailText?: string }>(candidate.packagingJson, {});
      return {
        candidateId: candidate.id,
        routeName: candidate.routeName,
        hook: route.hook ?? "",
        narrativeDevice: candidate.narrativeDevice,
        primaryTitle: packaging.primaryTitle ?? "",
        thumbnailText: packaging.thumbnailText ?? "",
        aggregateScore: candidate.aggregateScore,
        selected: candidate.id === selection?.candidateId,
      };
    }),
    decision: stage04Decision ? {
      decisionType: stage04Decision.decisionType,
      rationale: stage04Decision.rationaleText,
      createdAt: stage04Decision.createdAt,
    } : null,
  } : null;

  const [prediction] = await db.select().from(predictedPerformances)
    .where(eq(predictedPerformances.packageId, productionPackage.id)).limit(1);
  return {
    run,
    contract: {
      profile: contract.profile,
      assuranceMode: contract.assuranceMode,
      stopBeforeStage: contract.stopBeforeStage,
      releaseEligible: Boolean(contract.releaseEligible),
      providerDispatch: contract.providerDispatch ? "ON" : "OFF",
      autoPublish: contract.autoPublish ? "ON" : "OFF",
    },
    productionPackage: {
      id: productionPackage.id,
      status: productionPackage.status,
      spendCeilingUsd: productionPackage.spendCeilingUsd,
      requestCeiling: productionPackage.requestCeiling,
    },
    stages,
    stage04,
    stage05Prediction: prediction ? {
      modelVersion: prediction.modelVersion,
      ctrEstimate: prediction.ctrEstimate,
      canonicalHash: prediction.canonicalHash,
      sealedAt: prediction.sealedAt,
    } : null,
    stage06,
    stage07A,
    stage07B,
    stage08,
    stage09,
    stage10Job: stage10Job ? {
      attemptOrdinal: stage10Job.attemptOrdinal,
      retryOfJobId: stage10Job.retryOfJobId,
      state: stage10Job.state,
      receiptSha256: stage10Job.receiptSha256,
      workerImageDigest: stage10Job.workerImageDigest,
      errorCode: stage10Job.errorCode,
      updatedAt: stage10Job.updatedAt,
    } : null,
    stage10,
    stage11,
    stage12Job: stage12Job ? {
      state: stage12Job.state,
      receiptSha256: stage12Job.receiptSha256,
      workerImageDigest: stage12Job.workerImageDigest,
      errorCode: stage12Job.errorCode,
      updatedAt: stage12Job.updatedAt,
    } : null,
    stage12,
    humanDecisionCount: decisions.length,
    allowedActions: run.currentStep === "STAGE_06_READY" && stage06?.reviewState === "AWAITING_HUMAN"
      ? ["APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION"]
      : run.currentStep === "STAGE_07A_READY" && !stage07A
        ? ["PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT"]
        : run.currentStep === "STAGE_07A_READY" && stage07A?.reviewState === "AWAITING_HUMAN"
          ? ["SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE"]
          : run.currentStep === "STAGE_07B_READY"
            ? ["ADVANCE_TRACK_G_VIDEO_1_STAGE_07B"]
          : run.currentStep === "STAGE_08_READY"
            ? ["ADVANCE_TRACK_G_VIDEO_1_STAGE_08"]
          : run.currentStep === "STAGE_09_READY" && stage09?.reviewState === "NOT_PREPARED"
            ? ["PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW"]
          : run.currentStep === "STAGE_09_READY" && stage09?.reviewState === "AWAITING_HUMAN"
            ? ["SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL"]
          : run.currentStep === "STAGE_10_READY" && !stage10Job
            ? ["START_TRACK_G_VIDEO_1_STAGE_10"]
          : run.currentStep === "STAGE_10_READY" && stage10Job?.state === "FAILED"
            && stage10Job.attemptOrdinal === 1 && isStage10RetryableErrorCode(stage10Job.errorCode)
            ? ["START_TRACK_G_VIDEO_1_STAGE_10"]
          : run.currentStep === "STAGE_10_READY" && stage10Job?.state === "READY"
            ? ["FINALIZE_TRACK_G_VIDEO_1_STAGE_10"]
          : run.currentStep === "STAGE_11_READY"
            ? ["ADVANCE_TRACK_G_VIDEO_1_STAGE_11"]
          : run.currentStep === "STAGE_12_READY" && !stage12Job
            ? ["START_TRACK_G_VIDEO_1_STAGE_12"]
          : run.currentStep === "STAGE_12_READY" && stage12Job?.state === "READY"
            ? ["FINALIZE_TRACK_G_VIDEO_1_STAGE_12"]
          : [],
  };
}

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
  const trackGWorkbench = await getTrackGVideoOneWorkbench();
  const activeRunId = trackGWorkbench?.run.id ?? runs[0]?.id;
  const events = activeRunId
    ? await db.select().from(operationEvents)
      .where(eq(operationEvents.runId, activeRunId))
      .orderBy(operationEvents.ordinal)
    : [];
  const voiceFingerprint = await voiceQualificationReadBack();
  const trackGVideo1 = trackGWorkbench
    ? { status: trackGWorkbench.run.status, currentStep: trackGWorkbench.run.currentStep }
    : await trackGVideoOneState();
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
    trackGWorkbench,
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
