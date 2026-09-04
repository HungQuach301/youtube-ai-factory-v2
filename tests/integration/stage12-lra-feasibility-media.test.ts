import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchStage12CodecSafeLraFeasibilitySearch,
  readStage12CodecSafeLraFeasibilityWorkerStatus,
  stage12LraFeasibilityRequestSha256,
  type Stage12MediaCodecSafeLraFeasibilityHashableRequest,
  type Stage12MediaCodecSafeLraFeasibilitySearchRequest,
} from "../../sites/control-plane/app/stage12-media";
import { stage12LraFeasibilityCanonicalSha256 } from
  "../../sites/control-plane/app/stage12-lra-feasibility-dispatch";
import { stage12LraFeasibilityRequestSha256 as workerRequestSha256 } from
  "../../packages/media-worker/stage12-lra-feasibility-delivery.mjs";
import { runWithFactoryEnv, type FactoryRuntimeEnv } from
  "../../sites/control-plane/app/runtime-env";

const hex = (value: string) => value.repeat(64);
const imageDigest = `sha256:${hex("a")}`;

function signingKey() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
}

function runtimeEnv(): FactoryRuntimeEnv {
  return {
    ASSETS: {} as FactoryRuntimeEnv["ASSETS"],
    MEDIA_WORKER_URL: "https://media-worker.example.test",
    MEDIA_REQUEST_SIGNING_KEY: signingKey(),
  };
}

function feasibilityRequest() {
  const base = {
    idempotencyKey: hex("b"),
    objectAccess: { url: "https://control.example.test/source", token: hex("c") },
    callback: { url: "https://control.example.test/callback", token: hex("d") },
    codecSafeLraFeasibilitySearch: { expectedWorkerImageDigest: imageDigest },
  } as unknown as Stage12MediaCodecSafeLraFeasibilityHashableRequest;
  return { ...base, durability: {
    requestSha256: stage12LraFeasibilityRequestSha256(base),
    fencingToken: 1,
    leaseId: "lease-1",
  } } as Stage12MediaCodecSafeLraFeasibilitySearchRequest;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stage 12 feasibility media durability protocol", () => {
  it("hashes a token-free, fence-stable projection while binding both URLs", () => {
    const first = {
      idempotencyKey: hex("b"),
      objectAccess: { url: "https://control.example.test/source", token: hex("c"),
        binding: "source" },
      callback: { url: "https://control.example.test/callback", token: hex("d") },
      durability: { requestSha256: hex("e"), fencingToken: 1, leaseId: "lease-1" },
      codecSafeLraFeasibilitySearch: { marker: "immutable" },
    } as unknown as Stage12MediaCodecSafeLraFeasibilitySearchRequest;
    const retried = {
      ...first,
      objectAccess: { ...first.objectAccess, token: hex("f") },
      callback: { ...first.callback, token: hex("0") },
      durability: { requestSha256: hex("1"), fencingToken: 2, leaseId: "lease-2" },
    };
    expect(stage12LraFeasibilityRequestSha256(retried))
      .toBe(stage12LraFeasibilityRequestSha256(first));
    expect(workerRequestSha256(first))
      .toBe(stage12LraFeasibilityRequestSha256(first));
    expect(workerRequestSha256(retried))
      .toBe(stage12LraFeasibilityRequestSha256(first));
    expect(stage12LraFeasibilityRequestSha256({
      ...retried,
      callback: { ...retried.callback, url: "https://control.example.test/changed" },
    })).not.toBe(stage12LraFeasibilityRequestSha256(first));
    expect(stage12LraFeasibilityRequestSha256({
      ...retried,
      objectAccess: { ...retried.objectAccess, binding: "changed" },
    } as unknown as Stage12MediaCodecSafeLraFeasibilitySearchRequest))
      .not.toBe(stage12LraFeasibilityRequestSha256(first));
  });

  it("dispatches only a hash-bound claim and binds the echoed durable receipt", async () => {
    const request = feasibilityRequest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      accepted: true,
      jobStatus: "PENDING",
      idempotencyKey: request.idempotencyKey,
      imageDigest,
      requestSha256: request.durability.requestSha256,
      fencingToken: request.durability.fencingToken,
      leaseId: request.durability.leaseId,
      terminalReceiptSha256: null,
    }, { status: 202 }));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .resolves.toMatchObject({ accepted: true, jobStatus: "PENDING" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects request-hash drift before dispatch", async () => {
    const request = feasibilityRequest();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch({ ...request,
        durability: { ...request.durability, requestSha256: hex("f") } })))
      .rejects.toMatchObject({
        message: "TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_REQUEST_INVALID",
        dispatchAmbiguous: false,
      });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a definitive non-retryable worker rejection as non-ambiguous", async () => {
    const request = feasibilityRequest();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      ok: false,
      code: "INVALID_STAGE12_LRA_FEASIBILITY_DURABILITY",
    }, { status: 422 }));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .rejects.toMatchObject({
        message: "TRACK_G_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_FAILED:"
          + "INVALID_STAGE12_LRA_FEASIBILITY_DURABILITY",
        dispatchAmbiguous: false,
      });
  });

  it("marks a transport exception as ambiguous", async () => {
    const request = feasibilityRequest();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("socket reset"));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .rejects.toMatchObject({ message: "socket reset", dispatchAmbiguous: true });
  });

  it.each([408, 425, 429, 500, 503])(
    "marks retryable HTTP %i as ambiguous",
    async (status) => {
      const request = feasibilityRequest();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
        ok: false,
        code: "WORKER_RETRYABLE_RESPONSE",
      }, { status }));

      await expect(runWithFactoryEnv(runtimeEnv(), () =>
        dispatchStage12CodecSafeLraFeasibilitySearch(request)))
        .rejects.toMatchObject({ dispatchAmbiguous: true });
    },
  );

  it("marks malformed and invalid success responses as ambiguous", async () => {
    const request = feasibilityRequest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{", { status: 202,
        headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(Response.json(null, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ accepted: false }, { status: 202 }));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .rejects.toMatchObject({ dispatchAmbiguous: true });
    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .rejects.toMatchObject({ dispatchAmbiguous: true });
    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .rejects.toMatchObject({ dispatchAmbiguous: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reads signed terminal status only when receipt, image, request and fence bind", async () => {
    const terminal = { errorCode: "STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENCODE_FAILED" };
    const request = { idempotencyKey: hex("b"), requestSha256: hex("c"),
      fencingToken: 7, leaseId: "lease-7", expectedWorkerImageDigest: imageDigest };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      state: "TERMINAL_PENDING_CALLBACK",
      idempotencyKey: request.idempotencyKey,
      imageDigest,
      requestSha256: request.requestSha256,
      fencingToken: request.fencingToken,
      leaseId: request.leaseId,
      terminalReceiptSha256: stage12LraFeasibilityCanonicalSha256(terminal),
      ...terminal,
    }));

    const status = await runWithFactoryEnv(runtimeEnv(), () =>
      readStage12CodecSafeLraFeasibilityWorkerStatus(request));

    expect(status.state).toBe("TERMINAL_PENDING_CALLBACK");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://media-worker.example.test"
      + "/stage12/codec-safe-lra-feasibility-search/status");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("x-factory-signature")).toMatch(/^[A-Za-z0-9+/]+=*$/u);
  });

  it("rejects a forged terminal status receipt", async () => {
    const request = { idempotencyKey: hex("b"), requestSha256: hex("c"),
      fencingToken: 7, leaseId: "lease-7", expectedWorkerImageDigest: imageDigest };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      state: "TERMINAL_PENDING_CALLBACK",
      idempotencyKey: request.idempotencyKey,
      imageDigest,
      requestSha256: request.requestSha256,
      fencingToken: request.fencingToken,
      leaseId: request.leaseId,
      terminalReceiptSha256: hex("d"),
      errorCode: "STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENCODE_FAILED",
    }));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      readStage12CodecSafeLraFeasibilityWorkerStatus(request)))
      .rejects.toThrow("STATUS_CONFLICT");
  });

  it("rejects a start receipt bound to another lease as ambiguous", async () => {
    const request = feasibilityRequest();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      accepted: true,
      jobStatus: "PENDING",
      idempotencyKey: request.idempotencyKey,
      imageDigest,
      requestSha256: request.durability.requestSha256,
      fencingToken: request.durability.fencingToken,
      leaseId: "wrong-lease",
      terminalReceiptSha256: null,
    }, { status: 202 }));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      dispatchStage12CodecSafeLraFeasibilitySearch(request)))
      .rejects.toMatchObject({ dispatchAmbiguous: true });
  });

  it("rejects a worker status bound to another lease", async () => {
    const request = { idempotencyKey: hex("b"), requestSha256: hex("c"),
      fencingToken: 7, leaseId: "lease-7", expectedWorkerImageDigest: imageDigest };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      state: "RUNNING",
      idempotencyKey: request.idempotencyKey,
      imageDigest,
      requestSha256: request.requestSha256,
      fencingToken: request.fencingToken,
      leaseId: "wrong-lease",
      terminalReceiptSha256: null,
    }));

    await expect(runWithFactoryEnv(runtimeEnv(), () =>
      readStage12CodecSafeLraFeasibilityWorkerStatus(request)))
      .rejects.toThrow(/STATUS_FAILED/u);
  });
});
