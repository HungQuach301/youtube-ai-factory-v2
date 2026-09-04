import { createHash, createPrivateKey, sign } from "node:crypto";
import type { Stage12CodecSafeLraGuardControllerPolicy,
  Stage12CodecSafeTruePeakCandidate, Stage12MediaReceipt,
  Stage12MediaRequest } from "./stage12-pre-master";
import type { STAGE12_LRA_FEASIBILITY_POLICY,
  Stage12CodecSafeLraFeasibilityResult,
  Stage12CodecSafeLraFeasibilityRuntimeProvenance,
  Stage12CodecSafeLraFeasibilitySafeRollbackReference } from
  "./stage12-lra-feasibility-contract";
import { stage12LraFeasibilityCanonicalSha256 } from
  "./stage12-lra-feasibility-dispatch";
import { getFactoryEnv } from "./runtime-env";

const STAGE12_LRA_FEASIBILITY_MEDIA_TIMEOUT_MS = 30_000;

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

export type Stage12MediaCodecSafeLraFeasibilitySearchRequest = Stage12MediaStartRequest & {
  durability: {
    requestSha256: string;
    fencingToken: number;
    leaseId: string;
  };
  codecSafeLraFeasibilitySearch: {
    schemaVersion: 1;
    evidenceSemantics: "CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION";
    sourceAttemptOrdinal: 3;
    sourceCorrectionOrdinal: 2;
    historicalFailureCorrectionOrdinal: 3;
    sourceSha256: "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2";
    parentEvidenceId: "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb";
    lraGuardEvidenceId: "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9";
    sourceCorrectionJobId: string;
    lraGuardJobId: string;
    sourceCorrectedPreMaster: { r2Key: string; sha256: string; byteLength: number };
    sourceCorrectionReceiptSha256: string;
    safeRollbackReference: Stage12CodecSafeLraFeasibilitySafeRollbackReference;
    parentLosslessReference: { sha256: string; byteLength: number;
      audioFrameMd5Sha256: string; codec: "pcm_f32le"; sampleRateHz: 48000 };
    parentRuntimeProvenance: Stage12CodecSafeLraFeasibilityRuntimeProvenance;
    policy: typeof STAGE12_LRA_FEASIBILITY_POLICY;
    expectedWorkerImageDigest: string;
    algorithmFingerprint: string;
    thresholdSnapshotSha256: string;
    shadowOnly: true;
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

export type Stage12MediaCodecSafeLraFeasibilityHashableRequest = Omit<
  Stage12MediaCodecSafeLraFeasibilitySearchRequest,
  "objectAccess" | "callback" | "durability"
> & {
  objectAccess: { url: string; token?: string };
  callback: { url: string; token?: string };
  durability?: Stage12MediaCodecSafeLraFeasibilitySearchRequest["durability"];
};

export type Stage12MediaCodecSafeLraFeasibilityJobReceipt = {
  accepted: true;
  jobStatus: "PENDING" | "READY" | "FAILED";
  idempotencyKey: string;
  imageDigest: string;
  requestSha256: string;
  fencingToken: number;
  leaseId: string;
  terminalReceiptSha256: string | null;
};

export type Stage12MediaCodecSafeLraFeasibilityStatusRequest = {
  idempotencyKey: string;
  requestSha256: string;
  fencingToken: number;
  leaseId: string;
  expectedWorkerImageDigest: string;
};

type Stage12MediaCodecSafeLraFeasibilityStatusMetadata = {
  idempotencyKey: string;
  imageDigest: string;
  requestSha256: string;
  fencingToken: number;
  leaseId: string;
};

export type Stage12MediaCodecSafeLraFeasibilityStatusResponse =
  Stage12MediaCodecSafeLraFeasibilityStatusMetadata & ({
    state: "NOT_FOUND";
  } | {
    state: "RUNNING";
    terminalReceiptSha256: null;
  } | ({
    state: "TERMINAL_PENDING_CALLBACK" | "ACKED";
    terminalReceiptSha256: string;
  } & ({
    result: Stage12CodecSafeLraFeasibilityResult;
    errorCode?: never;
  } | {
    result?: never;
    errorCode: string;
  })));

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
  codecSafeLraFeasibilitySearchReady: true;
  codecSafeLraFeasibilityExecutionSemantics:
    "AT_LEAST_ONCE_COMPUTE_FENCED_SINGLE_TERMINAL_EFFECT";
};

export class Stage12MediaDispatchError extends Error {
  readonly dispatchAmbiguous: boolean;

  constructor(message: string, dispatchAmbiguous: boolean) {
    super(message);
    this.name = "Stage12MediaDispatchError";
    this.dispatchAmbiguous = dispatchAmbiguous;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isPositiveFencingToken(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 1;
}

export function stage12LraFeasibilityRequestSha256(
  payload: Stage12MediaCodecSafeLraFeasibilityHashableRequest,
): string {
  const request = { ...payload } as Record<string, unknown>;
  const objectAccess = { ...payload.objectAccess };
  const callback = { ...payload.callback };
  delete request.durability;
  delete objectAccess.token;
  delete callback.token;
  return stage12LraFeasibilityCanonicalSha256({
    ...request,
    objectAccess,
    callback,
  });
}

function prepareSignedMediaRequest(path: string, payload: unknown) {
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
  return { url: `${baseUrl}${path}`, init: {
    method: "POST",
    headers: { "content-type": "application/json", "x-factory-timestamp": timestamp,
      "x-factory-signature": signature },
    body,
    redirect: "manual",
  } satisfies RequestInit };
}

async function issueSignedMediaRequest(
  request: ReturnType<typeof prepareSignedMediaRequest>,
): Promise<Response> {
  const response = await fetch(request.url, request.init);
  if (response.status >= 300 && response.status < 400) {
    throw new Error("TRACK_G_STAGE_12_MEDIA_WORKER_REDIRECT_REJECTED");
  }
  return response;
}

function withStage12LraFeasibilityTimeout(
  request: ReturnType<typeof prepareSignedMediaRequest>,
) {
  return { ...request, init: { ...request.init,
    signal: AbortSignal.timeout(STAGE12_LRA_FEASIBILITY_MEDIA_TIMEOUT_MS) } };
}

async function signedStage12LraFeasibilityFetch(path: string, payload: unknown) {
  return issueSignedMediaRequest(withStage12LraFeasibilityTimeout(
    prepareSignedMediaRequest(path, payload),
  ));
}

async function signedMediaFetch(path: string, payload: unknown): Promise<Response> {
  return issueSignedMediaRequest(prepareSignedMediaRequest(path, payload));
}

function feasibilityDispatchError(
  error: unknown,
  dispatchAmbiguous: boolean,
  fallback: string,
) {
  return new Stage12MediaDispatchError(
    error instanceof Error ? error.message : fallback,
    dispatchAmbiguous,
  );
}

function ambiguousHttpDispatch(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function mediaResponseCode(value: unknown, fallback: number) {
  if (typeof value === "object" && value !== null && "code" in value
    && typeof value.code === "string") return value.code;
  return fallback;
}

export async function readStage12MediaWorkerHealth(): Promise<Stage12MediaWorkerHealth> {
  const baseUrl = getFactoryEnv().MEDIA_WORKER_URL?.replace(/\/$/u, "");
  if (!baseUrl?.startsWith("https://")) throw new Error("MEDIA_WORKER_URL_UNAVAILABLE");
  const response = await fetch(`${baseUrl}/health`, { method: "GET", redirect: "manual",
    signal: AbortSignal.timeout(STAGE12_LRA_FEASIBILITY_MEDIA_TIMEOUT_MS) });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("TRACK_G_STAGE_12_MEDIA_WORKER_REDIRECT_REJECTED");
  }
  const value = await response.json() as Partial<Stage12MediaWorkerHealth> & { code?: string };
  if (!response.ok || value.ok !== true || value.stage12Ready !== true
    || value.encodedLoudnessDiagnosticReplayReady !== true
    || value.codecSafeTruePeakShadowReady !== true
    || value.codecSafeLraGuardShadowReady !== true
    || value.codecSafeLraFeasibilitySearchReady !== true
    || value.codecSafeLraFeasibilityExecutionSemantics
      !== "AT_LEAST_ONCE_COMPUTE_FENCED_SINGLE_TERMINAL_EFFECT"
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

export async function dispatchStage12CodecSafeLraFeasibilitySearch(
  payload: Stage12MediaCodecSafeLraFeasibilitySearchRequest,
): Promise<Stage12MediaCodecSafeLraFeasibilityJobReceipt> {
  let request: ReturnType<typeof prepareSignedMediaRequest>;
  try {
    if (!isSha256(payload.idempotencyKey)
      || !isSha256(payload.durability.requestSha256)
      || !isPositiveFencingToken(payload.durability.fencingToken)
      || !/^[A-Za-z0-9_-]{1,160}$/u.test(payload.durability.leaseId)
      || stage12LraFeasibilityRequestSha256(payload) !== payload.durability.requestSha256) {
      throw new Error("TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_REQUEST_INVALID");
    }
    request = prepareSignedMediaRequest(
      "/stage12/codec-safe-lra-feasibility-search", payload,
    );
  } catch (error) {
    throw feasibilityDispatchError(error, false,
      "TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_REQUEST_INVALID");
  }
  let response: Response;
  try {
    response = await issueSignedMediaRequest(withStage12LraFeasibilityTimeout(request));
  } catch (error) {
    throw feasibilityDispatchError(error, true,
      "TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_TRANSPORT_FAILED");
  }
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw new Stage12MediaDispatchError(
      `TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_FAILED:${
        mediaResponseCode(errorBody, response.status)}`,
      ambiguousHttpDispatch(response.status),
    );
  }
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch (error) {
    throw feasibilityDispatchError(error, true,
      "TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_RESPONSE_INVALID");
  }
  if (typeof responseBody !== "object" || responseBody === null) {
    throw new Stage12MediaDispatchError(
      "TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_RESPONSE_INVALID", true,
    );
  }
  const result = responseBody as Partial<Stage12MediaCodecSafeLraFeasibilityJobReceipt>
    & { code?: string };
  if (result.accepted !== true
    || !["PENDING", "READY", "FAILED"].includes(result.jobStatus ?? "")
    || result.idempotencyKey !== payload.idempotencyKey
    || result.imageDigest !== payload.codecSafeLraFeasibilitySearch.expectedWorkerImageDigest
    || result.requestSha256 !== payload.durability.requestSha256
    || result.fencingToken !== payload.durability.fencingToken
    || result.leaseId !== payload.durability.leaseId
    || !(result.terminalReceiptSha256 === null
      || isSha256(result.terminalReceiptSha256))
    || (result.jobStatus === "PENDING") !== (result.terminalReceiptSha256 === null)) {
    throw new Stage12MediaDispatchError(
      `TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_FAILED:${result.code ?? response.status}`,
      true,
    );
  }
  return result as Stage12MediaCodecSafeLraFeasibilityJobReceipt;
}

export async function readStage12CodecSafeLraFeasibilityWorkerStatus(
  payload: Stage12MediaCodecSafeLraFeasibilityStatusRequest,
): Promise<Stage12MediaCodecSafeLraFeasibilityStatusResponse> {
  if (!isSha256(payload.idempotencyKey) || !isSha256(payload.requestSha256)
    || !isPositiveFencingToken(payload.fencingToken)
    || !/^[A-Za-z0-9_-]{1,160}$/u.test(payload.leaseId)
    || !/^sha256:[a-f0-9]{64}$/u.test(payload.expectedWorkerImageDigest)) {
    throw new Error("TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_STATUS_REQUEST_INVALID");
  }
  const response = await signedStage12LraFeasibilityFetch(
    "/stage12/codec-safe-lra-feasibility-search/status", payload,
  );
  const result = await response.json() as {
    state?: unknown;
    idempotencyKey?: unknown;
    imageDigest?: unknown;
    requestSha256?: unknown;
    fencingToken?: unknown;
    leaseId?: unknown;
    terminalReceiptSha256?: unknown;
    result?: unknown;
    errorCode?: unknown;
    code?: unknown;
  };
  if (!response.ok || result.idempotencyKey !== payload.idempotencyKey
    || result.imageDigest !== payload.expectedWorkerImageDigest
    || result.requestSha256 !== payload.requestSha256
    || result.fencingToken !== payload.fencingToken
    || result.leaseId !== payload.leaseId) {
    throw new Error(
      `TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_STATUS_FAILED:${
        typeof result.code === "string" ? result.code : response.status}`,
    );
  }
  if (result.state === "NOT_FOUND") {
    return result as Stage12MediaCodecSafeLraFeasibilityStatusResponse;
  }
  if (typeof result.state !== "string"
    || !["RUNNING", "TERMINAL_PENDING_CALLBACK", "ACKED"].includes(result.state)
    || result.requestSha256 !== payload.requestSha256
    || result.fencingToken !== payload.fencingToken
    || result.leaseId !== payload.leaseId) {
    throw new Error("TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_STATUS_CONFLICT");
  }
  if (result.state === "RUNNING") {
    if (result.terminalReceiptSha256 !== null
      || result.result !== undefined || result.errorCode !== undefined) {
      throw new Error("TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_STATUS_CONFLICT");
    }
    return result as Stage12MediaCodecSafeLraFeasibilityStatusResponse;
  }
  if (!isSha256(result.terminalReceiptSha256)
    || (result.result === undefined) === (result.errorCode === undefined)
    || (result.errorCode !== undefined
      && (typeof result.errorCode !== "string"
        || !/^[A-Z0-9_:.-]{1,160}$/u.test(result.errorCode)))) {
    throw new Error("TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_STATUS_CONFLICT");
  }
  const terminal = result.result ?? { errorCode: result.errorCode };
  if (stage12LraFeasibilityCanonicalSha256(terminal)
    !== result.terminalReceiptSha256) {
    throw new Error("TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_STATUS_CONFLICT");
  }
  return result as Stage12MediaCodecSafeLraFeasibilityStatusResponse;
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
