import { describe, expect, it, vi } from "vitest";

import { planStage12LraFeasibilityRecovery } from
  "../../sites/control-plane/app/stage12-lra-feasibility-dispatch";
import { stage12LraFeasibilityCanonicalSha256 } from
  "../../sites/control-plane/app/stage12-lra-feasibility-dispatch";
import {
  assertStage12LraFeasibilityCallbackFenceOpen,
  assertStage12LraFeasibilityDispatchEventIntegrity,
  isStage12LraFeasibilityEventCasConflict,
  settleStage12LraFeasibilityDispatchMutation,
  stage12LraFeasibilityDispatchEventId,
  stage12LraFeasibilityHeartbeatId,
  type Stage12LraFeasibilityDispatchIntegrityRow,
} from "../../sites/control-plane/app/track-g-video-one";

const claim = { eventType: "CLAIMED" as const, fencingToken: 1,
  leaseId: "lease-1",
  leaseExpiresAt: "2026-01-01T00:01:30.000Z" };

const requestSha256 = "a".repeat(64);
const statusIdentity = { requestSha256, fencingToken: 1, leaseId: "lease-1" };

describe("Stage 12 feasibility durable dispatch recovery", () => {
  it("classifies only bounded event-CAS conflicts that require a fresh read", () => {
    expect(isStage12LraFeasibilityEventCasConflict(new Error(
      "D1_ERROR: STAGE12_LRA_FEASIBILITY_EVENT_ORDINAL_INVALID",
    ))).toBe(true);
    expect(isStage12LraFeasibilityEventCasConflict(new Error(
      "UNIQUE constraint failed: stage12_codec_safe_lra_feasibility_dispatch_event"
        + ".idempotency_key, stage12_codec_safe_lra_feasibility_dispatch_event.event_ordinal",
    ))).toBe(true);
    expect(isStage12LraFeasibilityEventCasConflict(new Error(
      "D1_ERROR: STAGE12_LRA_FEASIBILITY_EVENT_TIME_REGRESSION",
    ))).toBe(true);
    expect(isStage12LraFeasibilityEventCasConflict(new Error(
      "D1_ERROR: STAGE12_LRA_FEASIBILITY_EVENT_CLOCK_DRIFT",
    ))).toBe(false);
    expect(isStage12LraFeasibilityEventCasConflict(new Error(
      "STAGE12_LRA_FEASIBILITY_TERMINAL_RECEIPT_INVALID",
    ))).toBe(false);
    expect(isStage12LraFeasibilityEventCasConflict(new Error(
      "UNIQUE constraint failed: stage12_codec_safe_lra_feasibility_dispatch_event.id",
    ))).toBe(false);
  });

  it("reconciles an accepted response lost as present without redispatch", () => {
    expect(planStage12LraFeasibilityRecovery({ events: [claim, {
      eventType: "DISPATCH_AMBIGUOUS", fencingToken: 1, leaseId: "lease-1",
      leaseExpiresAt: null,
    }], terminalExists: false, now: "2026-01-01T00:00:30.000Z",
    workerStatus: { state: "RUNNING", ...statusIdentity }, requestSha256 }))
      .toEqual({ action: "RECONCILE_PRESENT", fencingToken: 1 });
  });

  it("waits before lease expiry and recovers a crash-after-claim only after NOT_FOUND", () => {
    const input = { events: [claim], terminalExists: false,
      requestSha256,
      workerStatus: { state: "NOT_FOUND" as const, ...statusIdentity },
    };
    expect(planStage12LraFeasibilityRecovery({ ...input,
      now: "2026-01-01T00:01:29.000Z" })).toEqual({
      action: "WAIT_FOR_LEASE", fencingToken: 1,
      leaseExpiresAt: "2026-01-01T00:01:30.000Z",
    });
    expect(planStage12LraFeasibilityRecovery({ ...input,
      now: "2026-01-01T00:01:30.000Z" })).toEqual({
      action: "RECONCILE_EXPIRED", fencingToken: 1,
    });
    expect(planStage12LraFeasibilityRecovery({ events: [claim, {
      eventType: "RECONCILED_EXPIRED", fencingToken: 1, leaseId: "lease-1",
      leaseExpiresAt: null,
    }], terminalExists: false, now: "2026-01-01T00:01:31.000Z",
    workerStatus: { state: "NOT_FOUND", ...statusIdentity }, requestSha256 }))
      .toEqual({ action: "CLAIM", fencingToken: 2 });
  });

  it("uses the latest append-only renewal as the effective lease deadline", () => {
    const renewed = { eventType: "LEASE_RENEWED" as const, fencingToken: 1,
      leaseId: "lease-1", leaseExpiresAt: "2026-01-01T00:02:30.000Z" };
    const running = { state: "RUNNING" as const, ...statusIdentity };
    expect(planStage12LraFeasibilityRecovery({ events: [claim, renewed],
      terminalExists: false, now: "2026-01-01T00:02:29.999Z",
      requestSha256, workerStatus: running })).toEqual({
      action: "RECONCILE_PRESENT", fencingToken: 1,
    });
    expect(planStage12LraFeasibilityRecovery({ events: [claim, renewed],
      terminalExists: false, now: "2026-01-01T00:02:30.000Z",
      requestSha256, workerStatus: running })).toEqual({
      action: "RECONCILE_EXPIRED", fencingToken: 1,
    });
  });

  it("ingests a worker terminal through the same callback validator", () => {
    const result = { outcome: "PASS", terminalReason: "PASS" };
    expect(planStage12LraFeasibilityRecovery({ events: [claim], terminalExists: false,
      now: "2026-01-01T00:00:30.000Z", requestSha256,
      workerStatus: { state: "TERMINAL_PENDING_CALLBACK", ...statusIdentity,
        terminalReceiptSha256: "b".repeat(64),
        result } })).toEqual({ action: "PERSIST_WORKER_TERMINAL", fencingToken: 1,
          terminalReceiptSha256: "b".repeat(64), result });
  });

  it("fails closed on a status response bound to another request", () => {
    expect(() => planStage12LraFeasibilityRecovery({ events: [claim],
      terminalExists: false, now: "2026-01-01T00:00:30.000Z",
      requestSha256, workerStatus: { state: "RUNNING",
        ...statusIdentity, requestSha256: "b".repeat(64) } }))
      .toThrow(/STATUS_CONFLICT/u);
  });

  it("fails closed on a status response bound to another lease", () => {
    expect(() => planStage12LraFeasibilityRecovery({ events: [claim],
      terminalExists: false, now: "2026-01-01T00:00:30.000Z", requestSha256,
      workerStatus: { state: "RUNNING", ...statusIdentity, leaseId: "other-lease" } }))
      .toThrow(/STATUS_CONFLICT/u);
  });

  it("returns a durable rejection without redispatch", () => {
    expect(planStage12LraFeasibilityRecovery({ events: [claim, {
      eventType: "DISPATCH_REJECTED", fencingToken: 1, leaseId: "lease-1",
      leaseExpiresAt: null,
    }], terminalExists: false, now: "2026-01-01T00:00:30.000Z", requestSha256 }))
      .toEqual({ action: "RETURN_REJECTED" });
  });

  it("converges when a callback terminal wins between rejection precheck and batch", async () => {
    let releaseCallback!: () => void;
    let signalRejectionWrite!: () => void;
    let callbackCommitted = false;
    const callbackCommit = new Promise<void>((resolve) => { releaseCallback = resolve; });
    const rejectionWriteStarted = new Promise<void>((resolve) => {
      signalRejectionWrite = resolve;
    });
    const rejectionWriteError = new Error("synthetic rejection lost terminal race");

    const settlement = settleStage12LraFeasibilityDispatchMutation({
      persistDispatchMutation: async () => {
        signalRejectionWrite();
        await callbackCommit;
        throw rejectionWriteError;
      },
      readValidatedTerminal: async () => callbackCommitted,
    });
    await rejectionWriteStarted;
    callbackCommitted = true;
    releaseCallback();

    await expect(settlement).resolves.toBe("CONVERGED");
  });

  it("fails closed when a lost rejection sees no complete validated terminal", async () => {
    const rejectionWriteError = new Error("rejection write failed");
    await expect(settleStage12LraFeasibilityDispatchMutation({
      persistDispatchMutation: async () => { throw rejectionWriteError; },
      readValidatedTerminal: async () => false,
    })).rejects.toBe(rejectionWriteError);

    const integrityError = new Error("terminal read-back integrity failed");
    await expect(settleStage12LraFeasibilityDispatchMutation({
      persistDispatchMutation: async () => { throw rejectionWriteError; },
      readValidatedTerminal: async () => { throw integrityError; },
    })).rejects.toBe(integrityError);
  });

  it("converges a colliding nonterminal append only on validated same-fence progress",
    async () => {
      const ordinalCollision = new Error("synthetic event ordinal collision");
      await expect(settleStage12LraFeasibilityDispatchMutation({
        persistDispatchMutation: async () => { throw ordinalCollision; },
        readValidatedTerminal: async () => false,
        readValidatedProgress: async () => true,
      })).resolves.toBe("CONVERGED");

      await expect(settleStage12LraFeasibilityDispatchMutation({
        persistDispatchMutation: async () => { throw ordinalCollision; },
        readValidatedTerminal: async () => false,
        readValidatedProgress: async () => false,
      })).rejects.toBe(ordinalCollision);

      const integrityError = new Error("progress read-back integrity failed");
      await expect(settleStage12LraFeasibilityDispatchMutation({
        persistDispatchMutation: async () => { throw ordinalCollision; },
        readValidatedTerminal: async () => false,
        readValidatedProgress: async () => { throw integrityError; },
      })).rejects.toBe(integrityError);
    });

  it("converges when callback commits before an in-flight ABSENT append", async () => {
    let releaseAbsent!: () => void;
    let signalAbsentWrite!: () => void;
    let callbackCommitted = false;
    const callbackCommit = new Promise<void>((resolve) => { releaseAbsent = resolve; });
    const absentWriteStarted = new Promise<void>((resolve) => { signalAbsentWrite = resolve; });
    const settlement = settleStage12LraFeasibilityDispatchMutation({
      persistDispatchMutation: async () => {
        signalAbsentWrite();
        await callbackCommit;
        throw new Error("terminal callback made ABSENT stale");
      },
      readValidatedTerminal: async () => callbackCommitted,
    });
    await absentWriteStarted;
    callbackCommitted = true;
    releaseAbsent();

    await expect(settlement).resolves.toBe("CONVERGED");
  });

  it("keeps an expired fence authoritative when expiry wins before callback", async () => {
    const readValidatedTerminal = vi.fn(async () => false);
    let absentCommitted = false;
    const settlement = await settleStage12LraFeasibilityDispatchMutation({
      persistDispatchMutation: async () => { absentCommitted = true; },
      readValidatedTerminal,
    });
    expect(settlement).toBe("PERSISTED");
    expect(readValidatedTerminal).not.toHaveBeenCalled();
    expect(absentCommitted).toBe(true);
    expect(() => assertStage12LraFeasibilityCallbackFenceOpen([{
      eventType: "RECONCILED_EXPIRED", fencingToken: 1, leaseExpiresAt: null,
    }], 1, "2026-01-01T00:01:31.000Z"))
      .toThrow("STAGE12_LRA_FEASIBILITY_STALE_FENCE");
  });

  it("rejects a new callback at the lease deadline but accepts an active renewal", () => {
    const leaseEvents = [claim, { eventType: "LEASE_RENEWED" as const,
      fencingToken: 1, leaseId: "lease-1",
      leaseExpiresAt: "2026-01-01T00:02:30.000Z" }];
    expect(() => assertStage12LraFeasibilityCallbackFenceOpen(
      leaseEvents, 1, "2026-01-01T00:02:29.999Z",
    )).not.toThrow();
    expect(() => assertStage12LraFeasibilityCallbackFenceOpen(
      leaseEvents, 1, "2026-01-01T00:02:30.000Z",
    )).toThrow("STAGE12_LRA_FEASIBILITY_LEASE_EXPIRED");
  });

  it("binds payload, hash, id, lease expiry and event time in event read-back", () => {
    const idempotencyKey = "a".repeat(64);
    const payloadJson = JSON.stringify({ requestSha256: "b".repeat(64) });
    const payloadSha256 = stage12LraFeasibilityCanonicalSha256(JSON.parse(payloadJson));
    const event = {
      idempotencyKey,
      eventOrdinal: 1,
      eventType: "CLAIMED",
      fencingToken: 1,
      leaseHolder: "lease-1",
      leaseExpiresAt: "2026-01-01T00:01:30.000Z",
      payloadJson,
      payloadSha256,
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies Omit<Stage12LraFeasibilityDispatchIntegrityRow, "id">;
    const valid: Stage12LraFeasibilityDispatchIntegrityRow = { ...event,
      id: stage12LraFeasibilityDispatchEventId({ ...event, leaseId: event.leaseHolder }) };
    expect(() => assertStage12LraFeasibilityDispatchEventIntegrity(
      idempotencyKey, [valid],
    )).not.toThrow();

    const heartbeatPayload = { heartbeatId: stage12LraFeasibilityHeartbeatId({
        idempotencyKey, requestSha256: "b".repeat(64), fencingToken: 1,
        leaseId: "lease-1", heartbeatSequence: 1,
      }), heartbeatSequence: 1, requestSha256: "b".repeat(64) };
    const renewalBase = { idempotencyKey, eventOrdinal: 2,
      eventType: "LEASE_RENEWED", fencingToken: 1, leaseHolder: "lease-1",
      leaseExpiresAt: "2026-01-01T00:02:00.000Z",
      payloadJson: JSON.stringify(heartbeatPayload),
      payloadSha256: stage12LraFeasibilityCanonicalSha256(heartbeatPayload),
      createdAt: "2026-01-01T00:00:30.000Z" };
    const renewal: Stage12LraFeasibilityDispatchIntegrityRow = { ...renewalBase,
      id: stage12LraFeasibilityDispatchEventId({ ...renewalBase,
        leaseId: renewalBase.leaseHolder }) };
    expect(() => assertStage12LraFeasibilityDispatchEventIntegrity(
      idempotencyKey, [valid, renewal],
    )).not.toThrow();
    expect(() => assertStage12LraFeasibilityDispatchEventIntegrity(
      idempotencyKey, [valid, { ...renewal,
        payloadJson: JSON.stringify({ ...heartbeatPayload, heartbeatSequence: 2 }) }],
    )).toThrow("STAGE12_LRA_FEASIBILITY_DISPATCH_EVENT_INTEGRITY_FAILED");

    const corruptions: Stage12LraFeasibilityDispatchIntegrityRow[] = [
      { ...valid, payloadJson: JSON.stringify({ requestSha256: "c".repeat(64) }) },
      { ...valid, payloadSha256: "d".repeat(64) },
      { ...valid, id: "e".repeat(64) },
      { ...valid, createdAt: "2026-01-01T00:00:00.001Z" },
      { ...valid, leaseExpiresAt: "2026-01-01T00:01:31.000Z" },
    ];
    for (const corrupted of corruptions) {
      expect(() => assertStage12LraFeasibilityDispatchEventIntegrity(
        idempotencyKey, [corrupted],
      )).toThrow("STAGE12_LRA_FEASIBILITY_DISPATCH_EVENT_INTEGRITY_FAILED");
    }
  });
});
