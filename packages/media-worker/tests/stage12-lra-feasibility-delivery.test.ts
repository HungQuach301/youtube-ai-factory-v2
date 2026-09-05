import { describe, expect, it, vi } from "vitest";

import { createStage12LraFeasibilityWorkerCoordinator,
  stage12LraFeasibilityRequestSha256 } from
  "../stage12-lra-feasibility-delivery.mjs";

const hex = (value: string) => value.repeat(64).slice(0, 64);

function payload(fencingToken = 1, variant = "stable") {
  const value = {
    idempotencyKey: hex("1"),
    callback: { url: "https://example.com/callback", token: hex("2") },
    objectAccess: { url: "https://example.com/object", token: hex("3") },
    work: { variant },
    durability: { requestSha256: "", fencingToken, leaseId: `lease-${fencingToken}` },
  };
  value.durability.requestSha256 = stage12LraFeasibilityRequestSha256(value);
  return value;
}

function acknowledgement(delivery: { idempotencyKey: string; requestSha256: string;
  fencingToken: number; leaseId: string; terminalReceiptSha256: string }) {
  return { accepted: true, replayed: false,
    idempotencyKey: delivery.idempotencyKey,
    requestSha256: delivery.requestSha256,
    fencingToken: delivery.fencingToken,
    leaseId: delivery.leaseId,
    terminalReceiptSha256: delivery.terminalReceiptSha256 };
}

describe("Stage 12 feasibility worker delivery coordinator", () => {
  it("renews a long-running generation and retries the same heartbeat identity", async () => {
    let pulse!: () => void;
    let release!: (value: { outcome: string; terminalReason: string }) => void;
    const execution = new Promise<{ outcome: string; terminalReason: string }>(
      (resolve) => { release = resolve; },
    );
    const heartbeats: Array<{ heartbeatId: string; heartbeatSequence: number;
      idempotencyKey: string; requestSha256: string; fencingToken: number;
      leaseId: string }> = [];
    let heartbeatAttempt = 0;
    const deliver = vi.fn(async (delivery) => acknowledgement(delivery));
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => execution, deliver,
      heartbeat: async (heartbeat) => {
        heartbeats.push(heartbeat);
        heartbeatAttempt += 1;
        if (heartbeatAttempt === 1) {
          throw Object.assign(new Error("heartbeat response lost"), { retryable: true });
        }
        return { accepted: true, replayed: true, ...heartbeat,
          leaseExpiresAt: "2026-01-01T00:03:00.000Z" };
      },
      scheduleInterval: (callback) => {
        pulse = callback;
        return { unref: () => undefined };
      },
      cancelInterval: () => undefined,
      wait: async () => undefined,
    });
    await coordinator.start(payload());
    pulse();
    await vi.waitFor(() => expect(heartbeats).toHaveLength(1));
    await vi.waitFor(() => expect(coordinator.status(hex("1"),
      payload().durability.requestSha256, 1, "lease-1"))
      .toMatchObject({ heartbeatErrorCode: "heartbeat response lost" }));
    pulse();
    await vi.waitFor(() => expect(heartbeats).toHaveLength(2));
    expect(heartbeats[1].heartbeatId).toBe(heartbeats[0].heartbeatId);
    expect(heartbeats[1].heartbeatSequence).toBe(1);
    expect(coordinator.status(hex("1"), payload().durability.requestSha256,
      1, "lease-1")).toMatchObject({ state: "RUNNING", heartbeatSequence: 1,
      leaseExpiresAt: "2026-01-01T00:03:00.000Z" });
    release({ outcome: "PASS", terminalReason: "PASS" });
    await coordinator.waitForIdle(hex("1"));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("serializes terminal delivery after an in-flight heartbeat acknowledgement", async () => {
    let pulse!: () => void;
    let releaseExecution!: (value: { outcome: string }) => void;
    let releaseHeartbeat!: (value: Record<string, unknown>) => void;
    const execution = new Promise<{ outcome: string }>((resolve) => {
      releaseExecution = resolve;
    });
    const heartbeatAck = new Promise<Record<string, unknown>>((resolve) => {
      releaseHeartbeat = resolve;
    });
    let heartbeatSnapshot!: Record<string, unknown>;
    const deliver = vi.fn(async (delivery) => acknowledgement(delivery));
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => execution, deliver,
      heartbeat: async (heartbeat) => {
        heartbeatSnapshot = heartbeat;
        return heartbeatAck;
      },
      scheduleInterval: (callback) => {
        pulse = callback;
        return { unref: () => undefined };
      },
      cancelInterval: () => undefined,
      wait: async () => undefined,
    });
    await coordinator.start(payload());
    pulse();
    await vi.waitFor(() => expect(heartbeatSnapshot).toBeDefined());
    releaseExecution({ outcome: "PASS" });
    await Promise.resolve();
    expect(deliver).not.toHaveBeenCalled();
    releaseHeartbeat({ accepted: true, ...heartbeatSnapshot,
      leaseExpiresAt: "2026-01-01T00:03:00.000Z" });
    await coordinator.waitForIdle(hex("1"));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("deduplicates 100 concurrent starts within one live worker process", async () => {
    let release!: (value: { outcome: string }) => void;
    const execution = new Promise<{ outcome: string }>((resolve) => { release = resolve; });
    const execute = vi.fn(async () => execution);
    const deliver = vi.fn(async (delivery) => acknowledgement(delivery));
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({ execute, deliver,
      wait: async () => undefined });
    const receipts = await Promise.all(Array.from({ length: 100 }, () =>
      coordinator.start(payload())));
    expect(new Set(receipts.map((receipt) => receipt.requestSha256)))
      .toEqual(new Set([payload().durability.requestSha256]));
    expect(execute).toHaveBeenCalledTimes(1);
    release({ outcome: "PASS" });
    await coordinator.waitForIdle(hex("1"));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("retries byte-identical terminal success after callback 503 without emitting failure", async () => {
    const bodies: string[] = [];
    let attempt = 0;
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => ({ outcome: "PASS", terminalReason: "PASS" }),
      deliver: async (delivery) => {
        bodies.push(new TextDecoder().decode(delivery.body));
        attempt += 1;
        if (attempt === 1) throw Object.assign(new Error("503"), { retryable: true });
        return acknowledgement(delivery);
      },
      wait: async () => undefined,
    });
    await coordinator.start(payload());
    await coordinator.waitForIdle(hex("1"));
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[0])).toMatchObject({ result: {
      outcome: "PASS", terminalReason: "PASS" } });
    expect(JSON.parse(bodies[0])).not.toHaveProperty("errorCode");
    expect(coordinator.status(hex("1"), payload().durability.requestSha256, 1, "lease-1"))
      .toMatchObject({
      state: "ACKED", executionCount: 1,
    });
  });

  it("retains the original terminal result for redelivery after delivery exhaustion", async () => {
    const bodies: string[] = [];
    let available = false;
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => ({ outcome: "FAIL", terminalReason: "MEASUREMENT_FAILED",
        candidateTrace: [{ candidateOrdinal: 0 }] }),
      deliver: async (delivery) => {
        bodies.push(new TextDecoder().decode(delivery.body));
        if (!available) throw Object.assign(new Error("control plane unavailable"),
          { retryable: true });
        return { ...acknowledgement(delivery), replayed: true };
      },
      retryDelaysMs: [0], wait: async () => undefined,
    });
    await coordinator.start(payload());
    await coordinator.waitForIdle(hex("1"));
    const requestSha256 = payload().durability.requestSha256;
    expect(coordinator.status(hex("1"), requestSha256, 1, "lease-1")).toMatchObject({
      state: "TERMINAL_PENDING_CALLBACK", executionCount: 1,
    });
    expect(bodies).toHaveLength(1);
    available = true;
    await coordinator.redrive(hex("1"), requestSha256);
    await coordinator.waitForIdle(hex("1"));
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(coordinator.status(hex("1"), requestSha256, 1, "lease-1")).toMatchObject({
      state: "ACKED", executionCount: 1,
    });
  });

  it("rejects a conflicting duplicate and stale fence without recomputing", async () => {
    const execute = vi.fn(async () => ({ outcome: "PASS" }));
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({ execute,
      deliver: async (delivery) => acknowledgement(delivery),
      wait: async () => undefined });
    await coordinator.start(payload(2));
    await expect(coordinator.start(payload(2, "conflicting")))
      .rejects.toThrow(/IDEMPOTENCY_CONFLICT/u);
    const conflictingLease = payload(2);
    conflictingLease.durability.leaseId = "different-lease-for-same-fence";
    await expect(coordinator.start(conflictingLease))
      .rejects.toThrow(/FENCE_CONFLICT/u);
    await expect(coordinator.start(payload(1)))
      .rejects.toThrow(/STALE_FENCE/u);
    await coordinator.waitForIdle(hex("1"));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reports NOT_FOUND from a fresh coordinator so the durable gateway can fence recovery", () => {
    const restarted = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => ({ outcome: "PASS" }),
      deliver: async () => { throw new Error("unused"); },
      wait: async () => undefined,
    });
    expect(restarted.status(hex("1"), payload().durability.requestSha256, 1, "lease-1"))
      .toEqual({ state: "NOT_FOUND", requestSha256: payload().durability.requestSha256,
        fencingToken: 1, leaseId: "lease-1" });
  });

  it("hashes stable work identity while excluding bearer tokens and durability", () => {
    const first = payload(1);
    const recovered = structuredClone(first);
    recovered.callback.token = hex("8");
    recovered.objectAccess.token = hex("9");
    recovered.durability = { requestSha256: hex("f"), fencingToken: 7,
      leaseId: "recovered-lease" };
    expect(stage12LraFeasibilityRequestSha256(recovered))
      .toBe(first.durability.requestSha256);
    recovered.callback.url = "https://example.com/other-callback";
    expect(stage12LraFeasibilityRequestSha256(recovered))
      .not.toBe(first.durability.requestSha256);
  });

  it("starts a fresh generation for a higher fence while running and ignores old completion",
    async () => {
    const releases: Array<(value: { generation: string; outcome: string;
      terminalReason: string }) => void> = [];
    const execute = vi.fn(async () => new Promise<{ generation: string; outcome: string;
      terminalReason: string }>((resolve) => { releases.push(resolve); }));
    const deliveries: Array<{ fencingToken: number; leaseId: string;
      generation: string }> = [];
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({ execute,
      deliver: async (delivery) => {
        const envelope = JSON.parse(new TextDecoder().decode(delivery.body));
        deliveries.push({ fencingToken: delivery.fencingToken, leaseId: delivery.leaseId,
          generation: envelope.result.generation });
        return acknowledgement(delivery);
      }, wait: async () => undefined });
    await coordinator.start(payload(1));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    await coordinator.start(payload(2));
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[0]({ generation: "stale", outcome: "PASS", terminalReason: "PASS" });
    await Promise.resolve();
    expect(deliveries).toEqual([]);
    releases[1]({ generation: "current", outcome: "PASS", terminalReason: "PASS" });
    await coordinator.waitForIdle(hex("1"));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(deliveries).toEqual([{ fencingToken: 2, leaseId: "lease-2",
      generation: "current" }]);
    expect(coordinator.status(hex("1"), payload().durability.requestSha256, 2, "lease-2"))
      .toMatchObject({ state: "ACKED", executionCount: 2,
      result: { generation: "current" } });
  });

  it("single-flights concurrent duplicate higher-fence recovery starts", async () => {
    const releases: Array<(value: { generation: string; outcome: string }) => void> = [];
    const execute = vi.fn(async () => new Promise<{ generation: string; outcome: string }>(
      (resolve) => { releases.push(resolve); },
    ));
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({ execute,
      deliver: async (delivery) => acknowledgement(delivery),
      wait: async () => undefined });
    await coordinator.start(payload(1));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    const receipts = await Promise.all(Array.from({ length: 20 }, () =>
      coordinator.start(payload(2))));
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(new Set(receipts.map((item) => `${item.fencingToken}:${item.leaseId}`)))
      .toEqual(new Set(["2:lease-2"]));
    releases[0]({ generation: "stale", outcome: "PASS" });
    releases[1]({ generation: "current", outcome: "PASS" });
    await coordinator.waitForIdle(hex("1"));
    expect(coordinator.status(hex("1"), payload().durability.requestSha256,
      2, "lease-2")).toMatchObject({ state: "ACKED", executionCount: 2,
        result: { generation: "current" } });
  });

  it("keeps fencing monotonic when fence two and three recovery starts overlap", async () => {
    const releases: Array<(value: { generation: string; outcome: string }) => void> = [];
    let releaseHeartbeat!: (value: Record<string, unknown>) => void;
    const heartbeat = new Promise<Record<string, unknown>>((resolve) => {
      releaseHeartbeat = resolve;
    });
    let pulse!: () => void;
    let heartbeatSnapshot!: Record<string, unknown>;
    const execute = vi.fn(async (value) => new Promise<{ generation: string;
      outcome: string }>((resolve) => {
      releases.push((result) => resolve({ ...result,
        generation: `fence-${value.durability.fencingToken}` }));
    }));
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({ execute,
      heartbeat: async (snapshot) => {
        heartbeatSnapshot = snapshot;
        return heartbeat;
      },
      scheduleInterval: (callback) => {
        pulse = callback;
        return { unref: () => undefined };
      },
      cancelInterval: () => undefined,
      deliver: async (delivery) => acknowledgement(delivery),
      wait: async () => undefined });
    await coordinator.start(payload(1));
    pulse();
    await vi.waitFor(() => expect(heartbeatSnapshot).toBeDefined());
    const fenceTwo = coordinator.start(payload(2));
    const fenceThree = coordinator.start(payload(3));
    releaseHeartbeat({ accepted: true, ...heartbeatSnapshot,
      leaseExpiresAt: "2026-01-01T00:03:00.000Z" });
    await expect(fenceTwo).resolves.toMatchObject({ fencingToken: 2, leaseId: "lease-2" });
    await expect(fenceThree).resolves.toMatchObject({ fencingToken: 3, leaseId: "lease-3" });
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[0]({ generation: "ignored", outcome: "PASS" });
    releases[1]({ generation: "ignored", outcome: "PASS" });
    releases[2]({ generation: "current", outcome: "PASS" });
    await coordinator.waitForIdle(hex("1"));
    expect(execute).toHaveBeenCalledTimes(3);
    expect(() => coordinator.status(hex("1"), payload().durability.requestSha256,
      2, "lease-2")).toThrow(/STALE_FENCE/u);
    expect(coordinator.status(hex("1"), payload().durability.requestSha256,
      3, "lease-3")).toMatchObject({ state: "ACKED", executionCount: 3,
        result: { generation: "fence-3" } });
  });

  it("redelivers a frozen terminal under a higher fence without recomputing", async () => {
    const execute = vi.fn(async () => ({ outcome: "PASS", terminalReason: "PASS",
      candidateSha256: hex("c") }));
    const deliveries: Array<{ fencingToken: number; terminalReceiptSha256: string;
      result: unknown }> = [];
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({ execute,
      deliver: async (delivery) => {
        const envelope = JSON.parse(new TextDecoder().decode(delivery.body));
        deliveries.push({ fencingToken: delivery.fencingToken,
          terminalReceiptSha256: delivery.terminalReceiptSha256,
          result: envelope.result });
        return acknowledgement(delivery);
      }, wait: async () => undefined });
    await coordinator.start(payload(1));
    await coordinator.waitForIdle(hex("1"));
    await coordinator.start(payload(2));
    await coordinator.waitForIdle(hex("1"));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deliveries.map((delivery) => delivery.fencingToken)).toEqual([1, 2]);
    expect(new Set(deliveries.map((delivery) => delivery.terminalReceiptSha256)).size).toBe(1);
    expect(deliveries[1].result).toEqual(deliveries[0].result);
  });

  it("delivers the truthful partial runtime result instead of replacing it with an error", async () => {
    const partial = { outcome: "FAIL", terminalReason: "MEASUREMENT_FAILED",
      errorCode: "STAGE12_LRA_FEASIBILITY_MEASUREMENT_INVALID",
      candidateTrace: [{ phase: "LRA_MAP", candidateOrdinal: 0 }],
      phaseBudgetUsed: { lraMap: 1 }, failedProbe: { phase: "LRA_MAP", phaseOrdinal: 1 } };
    const error = Object.assign(new Error("probe failed"), { feasibilityResult: partial });
    let body = "";
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => { throw error; },
      deliver: async (delivery) => {
        body = new TextDecoder().decode(delivery.body);
        return acknowledgement(delivery);
      }, wait: async () => undefined });
    await coordinator.start(payload());
    await coordinator.waitForIdle(hex("1"));
    expect(JSON.parse(body)).toMatchObject({ result: partial });
    expect(JSON.parse(body)).not.toHaveProperty("errorCode");
  });

  it("fails closed on a conflicting acknowledgement until a higher fence recovers it", async () => {
    let acknowledgements = 0;
    const deliver = vi.fn(async (delivery) => {
      acknowledgements += 1;
      return { ...acknowledgement(delivery),
        terminalReceiptSha256: acknowledgements === 1
          ? hex("f") : delivery.terminalReceiptSha256,
      };
    });
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => ({ outcome: "PASS", terminalReason: "PASS" }),
      deliver, wait: async () => undefined,
    });
    await coordinator.start(payload(1));
    await coordinator.waitForIdle(hex("1"));
    const requestSha256 = payload().durability.requestSha256;
    expect(coordinator.status(hex("1"), requestSha256, 1, "lease-1")).toMatchObject({
      state: "TERMINAL_PENDING_CALLBACK", deliveryState: "DELIVERY_CONFLICT",
      executionCount: 1,
    });
    await coordinator.start(payload(1));
    await coordinator.waitForIdle(hex("1"));
    expect(deliver).toHaveBeenCalledTimes(1);
    await expect(coordinator.redrive(hex("1"), requestSha256))
      .rejects.toThrow(/ACK_CONFLICT/u);
    await coordinator.start(payload(2));
    await coordinator.waitForIdle(hex("1"));
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(coordinator.status(hex("1"), requestSha256, 2, "lease-2")).toMatchObject({
      state: "ACKED", deliveryState: "ACKED", executionCount: 1,
    });
  });

  it("preserves terminal identity when stateless restart requires fenced re-execution",
    async () => {
    const deterministicTerminal = { outcome: "PASS", terminalReason: "PASS",
      selectedCandidateSha256: hex("d") };
    let physicalExecutions = 0;
    let acceptedTerminalEffects = 0;
    let acceptedReceiptSha256: string | null = null;
    const bodies: Array<{ body: string; fencingToken: number; leaseId: string }> = [];
    const acceptOnce = (delivery: { idempotencyKey: string; requestSha256: string;
      terminalReceiptSha256: string; fencingToken: number; leaseId: string;
      body: Uint8Array }) => {
      bodies.push({ body: new TextDecoder().decode(delivery.body),
        fencingToken: delivery.fencingToken, leaseId: delivery.leaseId });
      if (acceptedReceiptSha256 === null) {
        acceptedReceiptSha256 = delivery.terminalReceiptSha256;
        acceptedTerminalEffects += 1;
      } else {
        expect(delivery.terminalReceiptSha256).toBe(acceptedReceiptSha256);
      }
      return { ...acknowledgement(delivery), replayed: acceptedTerminalEffects === 1 };
    };
    const first = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => { physicalExecutions += 1; return deterministicTerminal; },
      deliver: async (delivery) => {
        acceptOnce(delivery);
        throw Object.assign(new Error("503 after terminal persistence"), { retryable: true });
      }, retryDelaysMs: [0], wait: async () => undefined,
    });
    await first.start(payload(1));
    await first.waitForIdle(hex("1"));
    const requestSha256 = payload().durability.requestSha256;
    const firstStatus = first.status(hex("1"), requestSha256, 1, "lease-1");
    expect(firstStatus).toMatchObject({ state: "TERMINAL_PENDING_CALLBACK",
      executionCount: 1 });

    const restarted = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => { physicalExecutions += 1; return deterministicTerminal; },
      deliver: async (delivery) => acceptOnce(delivery),
      retryDelaysMs: [0], wait: async () => undefined,
    });
    expect(restarted.status(hex("1"), requestSha256, 2, "lease-2"))
      .toEqual({ state: "NOT_FOUND", requestSha256, fencingToken: 2,
        leaseId: "lease-2" });
    await restarted.start(payload(2));
    await restarted.waitForIdle(hex("1"));
    const recoveredStatus = restarted.status(hex("1"), requestSha256, 2, "lease-2");
    expect(recoveredStatus).toMatchObject({ state: "ACKED", executionCount: 1,
      result: deterministicTerminal });
    expect(recoveredStatus.terminalReceiptSha256)
      .toBe(firstStatus.terminalReceiptSha256);
    expect(physicalExecutions).toBe(2);
    expect(acceptedTerminalEffects).toBe(1);
    expect(bodies.map(({ fencingToken, leaseId }) => ({ fencingToken, leaseId })))
      .toEqual([{ fencingToken: 1, leaseId: "lease-1" },
        { fencingToken: 2, leaseId: "lease-2" }]);
    expect(JSON.parse(bodies[1].body).result).toEqual(JSON.parse(bodies[0].body).result);
    expect(bodies[1].body).not.toBe(bodies[0].body);
  });

  it("fails closed when status or callback acknowledgement uses the wrong lease", async () => {
    const coordinator = createStage12LraFeasibilityWorkerCoordinator({
      execute: async () => ({ outcome: "PASS", terminalReason: "PASS" }),
      deliver: async (delivery) => ({ ...acknowledgement(delivery), leaseId: "wrong-lease" }),
      retryDelaysMs: [0], wait: async () => undefined,
    });
    await coordinator.start(payload());
    await coordinator.waitForIdle(hex("1"));
    const requestSha256 = payload().durability.requestSha256;
    expect(() => coordinator.status(hex("1"), requestSha256, 1, "wrong-lease"))
      .toThrow(/FENCE_CONFLICT/u);
    expect(coordinator.status(hex("1"), requestSha256, 1, "lease-1"))
      .toMatchObject({ state: "TERMINAL_PENDING_CALLBACK",
        deliveryState: "DELIVERY_CONFLICT" });
  });
});
