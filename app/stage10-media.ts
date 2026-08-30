import { createHash, createPrivateKey, sign } from "node:crypto";
import { getFactoryEnv } from "./runtime-env";

export type Stage10MediaRequest = {
  schemaVersion: 1;
  idempotencyKey: string;
  packageId: string;
  stageInstanceId: string;
  candidatesPerSegment: 2;
  maxProviderCalls: 12;
  maxTotalCharacters: number;
  voice: {
    voiceId: string;
    modelId: string;
    outputFormat: "mp3_44100_128";
    settings: Record<string, unknown>;
    settingsHash: string;
  };
  segments: Array<{
    segmentId: string;
    text: string;
    previousText: string;
    nextText: string;
    pauseAfterMs: number;
  }>;
};

export type Stage10MediaCandidate = {
  takeId: string;
  segmentId: string;
  route: "A" | "B";
  seed: number;
  audioBase64: string;
  audioSha256: string;
  providerRequestId: string;
  phonemeEdits: number;
  referencePhonemes: number;
  phonemeMismatchRate: number;
  observedTranscript: string;
  eligible: boolean;
};

export type Stage10MediaResult = {
  accepted: true;
  imageDigest: string;
  calibration: {
    observer: string;
    errorFloor: number;
    threshold: number;
    evidenceSha256: string;
  };
  champions: Stage10MediaCandidate[];
  rejected: Stage10MediaCandidate[];
  narration: {
    audioBase64: string;
    audioSha256: string;
    seamScore: number;
    seamThreshold: number;
  };
  providerCallCount: number;
  totalCharacters: number;
  gateResults: Array<{ gate: string; state: "PASS"; evidence: string }>;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function dispatchStage10Media(
  payload: Stage10MediaRequest,
): Promise<Stage10MediaResult> {
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
  const response = await fetch(`${baseUrl}/stage10/narrate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-factory-timestamp": timestamp,
      "x-factory-signature": signature,
    },
    body,
    redirect: "error",
  });
  const result = await response.json() as Stage10MediaResult & { code?: string };
  if (!response.ok || result.accepted !== true) {
    throw new Error(`TRACK_G_STAGE_10_MEDIA_WORKER_FAILED:${result.code ?? response.status}`);
  }
  if (result.providerCallCount !== 12 || result.champions.length !== 6
    || result.rejected.length !== 6
    || result.gateResults.length !== 2
    || result.gateResults.some((gate) => gate.state !== "PASS")
    || !Number.isFinite(result.calibration.errorFloor)
    || !Number.isFinite(result.calibration.threshold)
    || result.calibration.threshold < result.calibration.errorFloor) {
    throw new Error("TRACK_G_STAGE_10_MEDIA_WORKER_RECEIPT_INVALID");
  }
  return result;
}
