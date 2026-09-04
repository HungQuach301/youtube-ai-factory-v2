import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStage12LraFeasibilityWorkerCoordinator,
  stage12LraFeasibilityRequestSha256 } from
  "../../packages/media-worker/stage12-lra-feasibility-delivery.mjs";
import { stage12LraFeasibilityCanonicalSha256 } from
  "../../sites/control-plane/app/stage12-lra-feasibility-dispatch";

const trackG = vi.hoisted(() => ({
  readSource: vi.fn(),
  recordCallback: vi.fn(),
  renewLease: vi.fn(),
}));

vi.mock("../../sites/control-plane/app/track-g-video-one", () => ({
  readTrackGVideoOneStage12CodecSafeLraFeasibilitySource: trackG.readSource,
  recordTrackGVideoOneStage12CodecSafeLraFeasibilityCallback: trackG.recordCallback,
  renewTrackGVideoOneStage12CodecSafeLraFeasibilityLease: trackG.renewLease,
}));

import { GET, POST } from
  "../../sites/control-plane/app/api/media-worker/stage12-codec-safe-lra-feasibility-search/route";

const hex = (value: string) => value.repeat(64);

beforeEach(() => {
  trackG.readSource.mockReset();
  trackG.recordCallback.mockReset();
  trackG.renewLease.mockReset();
});

describe("Stage 12 feasibility callback route", () => {
  it("binds source access to the current fencing token", async () => {
    trackG.readSource.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const idempotencyKey = hex("a");
    const bearer = hex("b");
    const sha256 = hex("c");
    const response = await GET(new Request(
      "https://control.example.test/api/media-worker/feasibility"
        + `?kind=codec-safe-lra-feasibility-source-ordinal-2&idempotencyKey=${idempotencyKey}`
        + `&sha256=${sha256}&fencingToken=9`,
      { headers: { authorization: `Bearer ${bearer}` } },
    ));

    expect(response.status).toBe(200);
    expect(trackG.readSource).toHaveBeenCalledWith(idempotencyKey, bearer, sha256, 9);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("accepts only a receipt-bound callback envelope and echoes its acknowledgement", async () => {
    trackG.recordCallback.mockResolvedValue({ accepted: true, replayed: false,
      jobStatus: "FAILED" });
    const errorCode = "STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENCODE_FAILED";
    const body = {
      idempotencyKey: hex("a"),
      requestSha256: hex("b"),
      fencingToken: 3,
      leaseId: "lease-3",
      terminalReceiptSha256: stage12LraFeasibilityCanonicalSha256({ errorCode }),
      errorCode,
    };
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify(body) },
    ));

    expect(response.status).toBe(201);
    expect(trackG.recordCallback).toHaveBeenCalledWith({
      ...body,
      token: hex("c"),
    });
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      fencingToken: 3,
      terminalReceiptSha256: body.terminalReceiptSha256,
    });
  });

  it("accepts only an identity-bound lease heartbeat envelope", async () => {
    const body = { kind: "LEASE_HEARTBEAT", idempotencyKey: hex("a"),
      requestSha256: hex("b"), fencingToken: 3, leaseId: "lease-3",
      heartbeatId: hex("d"), heartbeatSequence: 2 };
    trackG.renewLease.mockResolvedValue({ accepted: true, replayed: false, ...body,
      leaseExpiresAt: "2026-01-01T00:03:00.000Z" });
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify(body) },
    ));

    expect(response.status).toBe(201);
    expect(trackG.renewLease).toHaveBeenCalledWith({
      idempotencyKey: body.idempotencyKey, requestSha256: body.requestSha256,
      fencingToken: body.fencingToken, leaseId: body.leaseId,
      heartbeatId: body.heartbeatId, heartbeatSequence: body.heartbeatSequence,
      token: hex("c"),
    });
    await expect(response.json()).resolves.toMatchObject({ accepted: true,
      heartbeatId: body.heartbeatId, heartbeatSequence: 2 });
  });

  it("rejects a forged receipt before persistence", async () => {
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify({
          idempotencyKey: hex("a"),
          requestSha256: hex("b"),
          fencingToken: 3,
          leaseId: "lease-3",
          terminalReceiptSha256: hex("d"),
          errorCode: "STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENCODE_FAILED",
        }) },
    ));

    expect(response.status).toBe(409);
    expect(trackG.recordCallback).not.toHaveBeenCalled();
  });

  it("rejects a numeric error code instead of coercing it before persistence", async () => {
    const errorCode = 123;
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify({
          idempotencyKey: hex("a"),
          requestSha256: hex("b"),
          fencingToken: 3,
          leaseId: "lease-3",
          terminalReceiptSha256: stage12LraFeasibilityCanonicalSha256({ errorCode }),
          errorCode,
        }) },
    ));

    expect(response.status).toBe(400);
    expect(trackG.recordCallback).not.toHaveBeenCalled();
  });

  it("maps transient terminal persistence failures to a retryable safe 503", async () => {
    trackG.recordCallback.mockRejectedValue(new Error("D1_ERROR: transient write failure"));
    const errorCode = "STAGE12_CODEC_SAFE_LRA_FEASIBILITY_ENCODE_FAILED";
    const body = { idempotencyKey: hex("a"), requestSha256: hex("b"),
      fencingToken: 3, leaseId: "lease-3",
      terminalReceiptSha256: stage12LraFeasibilityCanonicalSha256({ errorCode }),
      errorCode };
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify(body) },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "STAGE_12_LRA_FEASIBILITY_CALLBACK_RETRYABLE",
    });
  });

  it("maps transient heartbeat persistence failures to a retryable safe 503", async () => {
    trackG.renewLease.mockRejectedValue(new Error("D1_ERROR: transient read failure"));
    const body = { kind: "LEASE_HEARTBEAT", idempotencyKey: hex("a"),
      requestSha256: hex("b"), fencingToken: 3, leaseId: "lease-3",
      heartbeatId: hex("d"), heartbeatSequence: 2 };
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify(body) },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "STAGE_12_LRA_FEASIBILITY_CALLBACK_RETRYABLE",
    });
  });

  it("keeps known heartbeat protocol conflicts non-retryable", async () => {
    trackG.renewLease.mockRejectedValue(new Error(
      "STAGE12_LRA_FEASIBILITY_HEARTBEAT_SEQUENCE_CONFLICT",
    ));
    const body = { kind: "LEASE_HEARTBEAT", idempotencyKey: hex("a"),
      requestSha256: hex("b"), fencingToken: 3, leaseId: "lease-3",
      heartbeatId: hex("d"), heartbeatSequence: 2 };
    const response = await POST(new Request(
      "https://control.example.test/api/media-worker/feasibility",
      { method: "POST", headers: { authorization: `Bearer ${hex("c")}`,
        "content-type": "application/json" }, body: JSON.stringify(body) },
    ));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "STAGE12_LRA_FEASIBILITY_HEARTBEAT_SEQUENCE_CONFLICT",
    });
  });

  it("retries one heartbeat identity and one terminal body through transient route 503s",
    async () => {
      let renewalAttempt = 0;
      trackG.renewLease.mockImplementation(async (input) => {
        renewalAttempt += 1;
        if (renewalAttempt === 1) throw new Error("D1_ERROR: transient heartbeat write");
        const { token: _token, ...identity } = input;
        return { accepted: true, replayed: true, ...identity,
          leaseExpiresAt: "2026-01-01T00:03:00.000Z" };
      });
      let terminalAttempt = 0;
      trackG.recordCallback.mockImplementation(async () => {
        terminalAttempt += 1;
        if (terminalAttempt === 1) throw new Error("D1_ERROR: transient terminal write");
        return { accepted: true, replayed: false, jobStatus: "READY" };
      });
      const callbackUrl = "https://control.example.test/api/media-worker/feasibility";
      const postRoute = async (body: string) => {
        const response = await POST(new Request(callbackUrl, { method: "POST",
          headers: { authorization: `Bearer ${hex("2")}`,
            "content-type": "application/json" }, body }));
        const acknowledgement = await response.json() as Record<string, unknown>;
        if (!response.ok) {
          throw Object.assign(new Error(`callback returned ${response.status}`), {
            code: acknowledgement.error,
            retryable: response.status === 408 || response.status === 425
              || response.status === 429 || response.status >= 500,
          });
        }
        return acknowledgement;
      };
      const terminalBodies: string[] = [];
      const heartbeatBodies: string[] = [];
      let pulse!: () => void;
      let releaseExecution!: (value: { outcome: string; terminalReason: string }) => void;
      const execution = new Promise<{ outcome: string; terminalReason: string }>(
        (resolve) => { releaseExecution = resolve; },
      );
      const coordinator = createStage12LraFeasibilityWorkerCoordinator({
        execute: async () => execution,
        deliver: async (delivery) => {
          const body = new TextDecoder().decode(delivery.body);
          terminalBodies.push(body);
          return postRoute(body);
        },
        heartbeat: async (heartbeat) => {
          const body = JSON.stringify({ kind: "LEASE_HEARTBEAT",
            idempotencyKey: heartbeat.idempotencyKey,
            requestSha256: heartbeat.requestSha256,
            fencingToken: heartbeat.fencingToken, leaseId: heartbeat.leaseId,
            heartbeatId: heartbeat.heartbeatId,
            heartbeatSequence: heartbeat.heartbeatSequence });
          heartbeatBodies.push(body);
          return postRoute(body);
        },
        retryDelaysMs: [0, 0],
        scheduleInterval: (callback) => {
          pulse = callback;
          return { unref: () => undefined };
        },
        cancelInterval: () => undefined,
        wait: async () => undefined,
      });
      const workerPayload = { idempotencyKey: hex("1"),
        callback: { url: callbackUrl, token: hex("2") },
        objectAccess: { url: "https://control.example.test/source", token: hex("3") },
        work: { variant: "stable" },
        durability: { requestSha256: "", fencingToken: 1, leaseId: "lease-1" } };
      workerPayload.durability.requestSha256 =
        stage12LraFeasibilityRequestSha256(workerPayload);

      await coordinator.start(workerPayload);
      pulse();
      await vi.waitFor(() => expect(trackG.renewLease).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(coordinator.status(hex("1"),
        workerPayload.durability.requestSha256, 1, "lease-1").heartbeatErrorCode)
        .toBe("STAGE_12_LRA_FEASIBILITY_CALLBACK_RETRYABLE"));
      pulse();
      await vi.waitFor(() => expect(trackG.renewLease).toHaveBeenCalledTimes(2));
      expect(heartbeatBodies).toHaveLength(2);
      expect(heartbeatBodies[1]).toBe(heartbeatBodies[0]);

      releaseExecution({ outcome: "PASS", terminalReason: "PASS" });
      await coordinator.waitForIdle(hex("1"));
      expect(trackG.recordCallback).toHaveBeenCalledTimes(2);
      expect(terminalBodies).toHaveLength(2);
      expect(terminalBodies[1]).toBe(terminalBodies[0]);
      expect(coordinator.status(hex("1"), workerPayload.durability.requestSha256,
        1, "lease-1")).toMatchObject({ state: "ACKED", heartbeatSequence: 1,
          executionCount: 1 });
    });
});
