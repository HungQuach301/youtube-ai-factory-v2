import { createHash, createPrivateKey, sign } from "node:crypto";
import type { Stage12MediaReceipt, Stage12MediaRequest } from "./stage12-pre-master";
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

export type Stage12MediaJobReceipt = {
  accepted: true;
  jobStatus: "PENDING" | "READY";
  idempotencyKey: string;
  imageDigest: string;
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

export function parseStage12MediaReceipt(value: unknown): Stage12MediaReceipt {
  if (typeof value !== "object" || value === null) {
    throw new Error("TRACK_G_STAGE_12_MEDIA_WORKER_RECEIPT_INVALID");
  }
  return value as Stage12MediaReceipt;
}
