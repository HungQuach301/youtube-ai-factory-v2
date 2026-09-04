import { createHash, createPrivateKey, sign } from "node:crypto";
import type { Stage12CodecSafeLraGuardControllerPolicy,
  Stage12CodecSafeTruePeakCandidate, Stage12MediaReceipt,
  Stage12MediaRequest } from "./stage12-pre-master";
import { getFactoryEnv } from "./runtime-env";

export type Stage12MediaStartRequest = Stage12MediaRequest & {
  objectAccess: { url: string; token: string };
  callback: { url: string; token: string };
};

export type Stage12MediaRecoveryRequest = Stage12MediaStartRequest & {
  recovery: {
    attemptOrdinal: 3;
    preMaster: { r2Key: string; sha256: string; byteLength: number };
    render: false;
  };
};

export type Stage12MediaDiagnosticRequest = Stage12MediaRecoveryRequest & {
  diagnostic: {
    sourceAttemptOrdinal: 3;
    sourceJobId: string;
    generation: false;
    publish: false;
  };
};

export type Stage12MediaRemediationRequest = Stage12MediaStartRequest & {
  remediation: {
    sourceAttemptOrdinal: 3;
    diagnosticOrdinal: 2;
    strategyVersion: 1;
    sourcePreMaster: { r2Key: string; sha256: string; byteLength: number };
    diagnosticReceiptSha256: string;
    providerDispatch: "OFF";
    providerCallCount: 0;
    autoPublish: "OFF";
  };
};

export type Stage12MediaAudioP0CorrectionRequest = Stage12MediaStartRequest & {
  remediation: {
    sourceAttemptOrdinal: 3;
    diagnosticOrdinal: 2;
    strategyVersion: 2 | 3;
    correctionOrdinal: 2 | 3;
    predecessorCorrectionJobId: string;
    sourceCorrectedPreMaster: { r2Key: string; sha256: string; byteLength: number };
    sourceCorrectionReceiptSha256: string;
    correctionPassLimit: number;
    providerDispatch: "OFF";
    providerCallCount: 0;
    autoPublish: "OFF";
  };
};

export type Stage12MediaEncodedLoudnessDiagnosticReplayRequest = Stage12MediaStartRequest & {
  diagnosticReplay: {
    schemaVersion: 1;
    evidenceSemantics: "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL";
    sourceAttemptOrdinal: 3;
    sourceCorrectionOrdinal: 2;
    historicalFailureCorrectionOrdinal: 3;
    correctionStrategyVersion: 3;
    correctionPassLimit: 3;
    sourceCorrectionJobId: string;
    historicalFailureJobId: string;
    sourceCorrectedPreMaster: { r2Key: string; sha256: string; byteLength: number };
    sourceCorrectionReceiptSha256: string;
    expectedWorkerImageDigest: string;
    algorithmFingerprint: string;
    thresholdSnapshotSha256: string;
    historicalBackfill: false;
    uploadCorrectedOutput: false;
    providerDispatch: "OFF";
    providerCallCount: 0;
    calibration: false;
    finalize: false;
    release: false;
    autoPublish: "OFF";
  };
};

export type Stage12MediaCodecSafeTruePeakShadowReplayRequest = Stage12MediaStartRequest & {
  codecSafeShadowReplay: {
    schemaVersion: 1;
    evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION";
    sourceAttemptOrdinal: 3;
    sourceCorrectionOrdinal: 2;
    historicalFailureCorrectionOrdinal: 3;
    correctionPassLimit: 3;
    sourceCorrectionJobId: string;
    historicalFailureJobId: string;
    diagnosticReplayJobId: string;
    diagnosticReplayEvidenceId: string;
    sourceCorrectedPreMaster: { r2Key: string; sha256: string; byteLength: number };
    sourceCorrectionReceiptSha256: string;
    expectedWorkerImageDigest: string;
    algorithmFingerprint: string;
    thresholdSnapshotSha256: string;
    historicalBackfill: false;
    uploadCorrectedOutput: false;
    providerDispatch: "OFF";
    providerCallCount: 0;
    calibration: false;
    finalize: false;
    release: false;
    productionActivation: false;
    autoPublish: "OFF";
  };
};

export type Stage12MediaCodecSafeLraGuardShadowReplayRequest = Stage12MediaStartRequest & {
  codecSafeLraGuardShadowReplay: {
    schemaVersion: 1;
    evidenceSemantics: "CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION";
    sourceAttemptOrdinal: 3;
    sourceCorrectionOrdinal: 2;
    historicalFailureCorrectionOrdinal: 3;
    sourceCorrectionJobId: string;
    historicalFailureJobId: string;
    diagnosticReplayJobId: string;
    diagnosticReplayEvidenceId: string;
    codecSafeTruePeakShadowJobId: string;
    codecSafeTruePeakShadowEvidenceId: string;
    sourceCorrectedPreMaster: { r2Key: string; sha256: string; byteLength: number };
    sourceCorrectionReceiptSha256: string;
    parentWorkerImageDigest: string;
    parentAlgorithmFingerprint: string;
    parentThresholdSnapshotSha256: string;
    parentLosslessReference: { sha256: string; byteLength: number;
      audioFrameMd5Sha256: string; codec: "pcm_f32le"; sampleRateHz: number };
    parentRuntimeProvenance: { ffmpegVersion: string; ffmpegBuildFingerprint: string;
      libopusEncoderFingerprint: string };
    anchorReference: Stage12CodecSafeTruePeakCandidate;
    highBracketReference: Stage12CodecSafeTruePeakCandidate;
    controllerPolicy: Stage12CodecSafeLraGuardControllerPolicy;
    expectedWorkerImageDigest: string;
    algorithmFingerprint: string;
    thresholdSnapshotSha256: string;
    controllerPolicySha256: string;
    renderKernelFingerprint: string;
    parentRenderRuntimeFingerprint: string;
    historicalBackfill: false;
    uploadCorrectedOutput: false;
    providerDispatch: "OFF";
    providerCallCount: 0;
    calibration: false;
    finalize: false;
    release: false;
    productionActivation: false;
    autoPublish: "OFF";
  };
};

export type Stage12MediaJobReceipt = {
  accepted: true;
  jobStatus: "PENDING" | "READY";
  idempotencyKey: string;
  imageDigest: string;
};

export type Stage12MediaWorkerHealth = {
  ok: true;
  imageDigest: string;
  stage12Ready: true;
  encodedLoudnessDiagnosticReplayReady: true;
  codecSafeTruePeakShadowReady: true;
  codecSafeLraGuardShadowReady: true;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function signedMediaFetch(path: string, payload: unknown): Promise<Response> {
  const env = getFactoryEnv();
  const baseUrl = env.MEDIA_WORKER_URL?.replace(/\/$/u, "");
  const signingKey = env.MEDIA_REQUEST_SIGNING_KEY;
  if (!baseUrl?.startsWith("https://")) throw new Error("MEDIA_WORKER_URL_UNAVAILABLE");
  if (!signingKey) throw new Error("MEDIA_REQUEST_SIGNING_KEY_UNAVAILABLE");
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const timestamp = new Date().toISOString();
  const message = new TextEncoder().encode(`${timestamp}\n${sha256(body)}`);
  const privateKey = createPrivateKey({
    key: Buffer.from(signingKey, "base64"), format: "der", type: "pkcs8",
  });
  const signature = sign(null, message, privateKey).toString("base64");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-factory-timestamp": timestamp,
      "x-factory-signature": signature },
    body,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("TRACK_G_STAGE_12_MEDIA_WORKER_REDIRECT_REJECTED");
  }
  return response;
}

export async function readStage12MediaWorkerHealth(): Promise<Stage12MediaWorkerHealth> {
  const baseUrl = getFactoryEnv().MEDIA_WORKER_URL?.replace(/\/$/u, "");
  if (!baseUrl?.startsWith("https://")) throw new Error("MEDIA_WORKER_URL_UNAVAILABLE");
  const response = await fetch(`${baseUrl}/health`, { method: "GET", redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("TRACK_G_STAGE_12_MEDIA_WORKER_REDIRECT_REJECTED");
  }
  const value = await response.json() as Partial<Stage12MediaWorkerHealth> & { code?: string };
  if (!response.ok || value.ok !== true || value.stage12Ready !== true
    || value.encodedLoudnessDiagnosticReplayReady !== true
    || value.codecSafeTruePeakShadowReady !== true
    || value.codecSafeLraGuardShadowReady !== true
    || !/^sha256:[a-f0-9]{64}$/u.test(value.imageDigest ?? "")) {
    throw new Error(`TRACK_G_STAGE_12_MEDIA_WORKER_HEALTH_FAILED:${value.code ?? response.status}`);
  }
  return value as Stage12MediaWorkerHealth;
}

export async function dispatchStage12CodecSafeTruePeakShadowReplay(
  payload: Stage12MediaCodecSafeTruePeakShadowReplayRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/codec-safe-true-peak-shadow-replay", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || result.imageDigest !== payload.codecSafeShadowReplay.expectedWorkerImageDigest) {
    throw new Error(
      `TRACK_G_STAGE_12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY_FAILED:${result.code ?? response.status}`,
    );
  }
  return result;
}

export async function dispatchStage12CodecSafeLraGuardShadowReplay(
  payload: Stage12MediaCodecSafeLraGuardShadowReplayRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/codec-safe-lra-guard-shadow-replay", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || result.imageDigest !== payload.codecSafeLraGuardShadowReplay.expectedWorkerImageDigest) {
    throw new Error(
      `TRACK_G_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY_FAILED:${result.code ?? response.status}`,
    );
  }
  return result;
}

export async function dispatchStage12MediaStart(
  payload: Stage12MediaStartRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/start", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || !/^sha256:[a-f0-9]{64}$/u.test(result.imageDigest)) {
    throw new Error(`TRACK_G_STAGE_12_MEDIA_WORKER_START_FAILED:${result.code ?? response.status}`);
  }
  return result;
}

export async function dispatchStage12MediaRecovery(
  payload: Stage12MediaRecoveryRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/recover", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || !/^sha256:[a-f0-9]{64}$/u.test(result.imageDigest)) {
    throw new Error(`TRACK_G_STAGE_12_MEDIA_WORKER_RECOVERY_FAILED:${result.code ?? response.status}`);
  }
  return result;
}

export async function dispatchStage12MediaDiagnostic(
  payload: Stage12MediaDiagnosticRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/diagnostic", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || !/^sha256:[a-f0-9]{64}$/u.test(result.imageDigest)) {
    throw new Error(`TRACK_G_STAGE_12_MEDIA_WORKER_DIAGNOSTIC_FAILED:${result.code ?? response.status}`);
  }
  return result;
}

export async function dispatchStage12MediaRemediation(
  payload: Stage12MediaRemediationRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/remediate", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || !/^sha256:[a-f0-9]{64}$/u.test(result.imageDigest)) {
    throw new Error(`TRACK_G_STAGE_12_MEDIA_WORKER_REMEDIATION_FAILED:${result.code ?? response.status}`);
  }
  return result;
}

export async function dispatchStage12MediaAudioP0Correction(
  payload: Stage12MediaAudioP0CorrectionRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/audio-p0-correct", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || !/^sha256:[a-f0-9]{64}$/u.test(result.imageDigest)) {
    throw new Error(`TRACK_G_STAGE_12_AUDIO_P0_CORRECTION_FAILED:${result.code ?? response.status}`);
  }
  return result;
}

export async function dispatchStage12EncodedLoudnessDiagnosticReplay(
  payload: Stage12MediaEncodedLoudnessDiagnosticReplayRequest,
): Promise<Stage12MediaJobReceipt> {
  const response = await signedMediaFetch("/stage12/encoded-loudness-diagnostic-replay", payload);
  const result = await response.json() as Stage12MediaJobReceipt & { code?: string };
  if (!response.ok || result.accepted !== true
    || !["PENDING", "READY"].includes(result.jobStatus)
    || result.idempotencyKey !== payload.idempotencyKey
    || result.imageDigest !== payload.diagnosticReplay.expectedWorkerImageDigest) {
    throw new Error(
      `TRACK_G_STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_FAILED:${result.code ?? response.status}`,
    );
  }
  return result;
}

export function parseStage12MediaReceipt(value: unknown): Stage12MediaReceipt {
  if (typeof value !== "object" || value === null) {
    throw new Error("TRACK_G_STAGE_12_MEDIA_WORKER_RECEIPT_INVALID");
  }
  return value as Stage12MediaReceipt;
}
