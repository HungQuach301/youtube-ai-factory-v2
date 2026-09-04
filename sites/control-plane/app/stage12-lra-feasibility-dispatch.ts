import { createHash } from "node:crypto";

export type Stage12LraFeasibilityDispatchEventType = "CLAIMED" | "DISPATCH_ACCEPTED"
  | "DISPATCH_AMBIGUOUS" | "DISPATCH_REJECTED" | "RECONCILED_PRESENT"
  | "RECONCILED_EXPIRED" | "LEASE_RENEWED"
  | "CALLBACK_TERMINAL";

export type Stage12LraFeasibilityDispatchEvent = {
  eventType: Stage12LraFeasibilityDispatchEventType;
  fencingToken: number;
  leaseId: string;
  leaseExpiresAt: string | null;
};

export type Stage12LraFeasibilityWorkerStatus = {
  requestSha256: string;
  fencingToken: number;
  leaseId: string;
} & ({ state: "NOT_FOUND" } | {
  state: "RUNNING";
  terminalReceiptSha256?: null;
  result?: never;
  errorCode?: never;
} | ({
  state: "TERMINAL_PENDING_CALLBACK" | "ACKED";
  terminalReceiptSha256: string;
} & ({ result: unknown; errorCode?: never }
  | { errorCode: string; result?: never })));

export function stage12LraFeasibilityEffectiveLeaseExpiresAt(
  events: readonly { eventType: string; fencingToken: number;
    leaseExpiresAt: string | null }[],
  fencingToken: number,
) {
  return events.filter((event) => event.fencingToken === fencingToken
    && ["CLAIMED", "LEASE_RENEWED"].includes(event.eventType)
    && event.leaseExpiresAt !== null).at(-1)?.leaseExpiresAt ?? null;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("NON_FINITE_FEASIBILITY_OUTBOX_VALUE");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value !== "object" || value === undefined) {
    throw new TypeError("INVALID_FEASIBILITY_OUTBOX_VALUE");
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

export function stage12LraFeasibilityCanonicalSha256(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function planStage12LraFeasibilityRecovery(input: {
  events: readonly Stage12LraFeasibilityDispatchEvent[];
  terminalExists: boolean;
  now: string;
  requestSha256: string;
  workerStatus?: Stage12LraFeasibilityWorkerStatus | null;
}) {
  if (input.terminalExists) return { action: "RETURN_TERMINAL" as const };
  if (input.events.some((event) => event.eventType === "DISPATCH_REJECTED")) {
    return { action: "RETURN_REJECTED" as const };
  }
  const claims = input.events.filter((event) => event.eventType === "CLAIMED")
    .sort((left, right) => left.fencingToken - right.fencingToken);
  const current = claims.at(-1);
  if (!current) return { action: "CLAIM" as const, fencingToken: 1 };
  const fenceClosed = input.events.some((event) =>
    event.eventType === "RECONCILED_EXPIRED"
      && event.fencingToken === current.fencingToken);
  if (fenceClosed) return { action: "CLAIM" as const,
    fencingToken: current.fencingToken + 1 };

  const leaseExpiresAt = stage12LraFeasibilityEffectiveLeaseExpiresAt(
    input.events, current.fencingToken,
  );

  const status = input.workerStatus;
  if (!status) return { action: "WAIT_AMBIGUOUS" as const,
    fencingToken: current.fencingToken };
  if (status.requestSha256 !== input.requestSha256
    || status.fencingToken !== current.fencingToken
    || status.leaseId !== current.leaseId) {
    throw new Error("STAGE12_LRA_FEASIBILITY_STATUS_CONFLICT");
  }
  if (status.state === "ACKED") {
    throw new Error("STAGE12_LRA_FEASIBILITY_ACK_WITHOUT_TERMINAL_CONFLICT");
  }
  if (!leaseExpiresAt || input.now >= leaseExpiresAt) {
    return { action: "RECONCILE_EXPIRED" as const,
      fencingToken: current.fencingToken };
  }
  if (status.state !== "NOT_FOUND") {
    if (["TERMINAL_PENDING_CALLBACK", "ACKED"].includes(status.state)
      && status.terminalReceiptSha256
      && (status.result !== undefined || status.errorCode !== undefined)) {
      if (status.result !== undefined) {
        return { action: "PERSIST_WORKER_TERMINAL" as const,
          fencingToken: current.fencingToken,
          terminalReceiptSha256: status.terminalReceiptSha256,
          result: status.result };
      }
      return { action: "PERSIST_WORKER_TERMINAL" as const,
        fencingToken: current.fencingToken,
        terminalReceiptSha256: status.terminalReceiptSha256,
        errorCode: status.errorCode! };
    }
    return { action: "RECONCILE_PRESENT" as const,
      fencingToken: current.fencingToken };
  }

  return { action: "WAIT_FOR_LEASE" as const,
    fencingToken: current.fencingToken, leaseExpiresAt };
}
