import type { Stage12CodecSafeLraFeasibilityResult } from
  "../../../stage12-lra-feasibility-contract";
import { stage12LraFeasibilityCanonicalSha256 } from
  "../../../stage12-lra-feasibility-dispatch";
import {
  readTrackGVideoOneStage12CodecSafeLraFeasibilitySource,
  recordTrackGVideoOneStage12CodecSafeLraFeasibilityCallback,
  renewTrackGVideoOneStage12CodecSafeLraFeasibilityLease,
} from "../../../track-g-video-one";

function token(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const value = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("STAGE_12_LRA_FEASIBILITY_UNAUTHORIZED");
  }
  return value;
}

function idempotencyKey(request: Request) {
  const value = new URL(request.url).searchParams.get("idempotencyKey") ?? "";
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("STAGE_12_LRA_FEASIBILITY_IDEMPOTENCY_INVALID");
  }
  return value;
}

function fencingToken(request: Request) {
  const raw = new URL(request.url).searchParams.get("fencingToken") ?? "";
  if (!/^[1-9][0-9]*$/u.test(raw)) {
    throw new Error("STAGE_12_LRA_FEASIBILITY_FENCING_TOKEN_INVALID");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error("STAGE_12_LRA_FEASIBILITY_FENCING_TOKEN_INVALID");
  }
  return value;
}

const CALLBACK_CLIENT_ERRORS = new Map<string, number>([
  ["STAGE_12_LRA_FEASIBILITY_UNAUTHORIZED", 401],
  ["STAGE_12_LRA_FEASIBILITY_CALLBACK_STATE_CONFLICT", 409],
  ["STAGE_12_LRA_FEASIBILITY_TERMINAL_RECEIPT_HASH_INVALID", 409],
  ["STAGE_12_LRA_FEASIBILITY_TERMINAL_STATE_CONFLICT", 409],
  ["STAGE_12_LRA_FEASIBILITY_SOURCE_CONFLICT", 409],
  ["STAGE12_LRA_FEASIBILITY_STALE_FENCE", 409],
  ["STAGE12_LRA_FEASIBILITY_LEASE_EXPIRED", 409],
  ["STAGE12_LRA_FEASIBILITY_HEARTBEAT_CONFLICT", 409],
  ["STAGE12_LRA_FEASIBILITY_HEARTBEAT_SEQUENCE_CONFLICT", 409],
  ["STAGE12_LRA_FEASIBILITY_DISPATCH_EVENT_CONFLICT", 409],
  ["STAGE_12_LRA_FEASIBILITY_CALLBACK_INVALID", 422],
  ["STAGE12_LRA_FEASIBILITY_RESULT_INVALID", 422],
  ["STAGE12_LRA_FEASIBILITY_RESULT_LINEAGE_INVALID", 422],
]);

function callbackFailure(error: unknown) {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_CALLBACK_INVALID" },
      { status: 400 });
  }
  const message = error instanceof Error ? error.message : "";
  const status = CALLBACK_CLIENT_ERRORS.get(message);
  if (status !== undefined) return Response.json({ error: message }, { status });
  return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_CALLBACK_RETRYABLE" },
    { status: 503 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("kind") !== "codec-safe-lra-feasibility-source-ordinal-2") {
      return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_OBJECT_KIND_INVALID" },
        { status: 400 });
    }
    const expectedSha256 = url.searchParams.get("sha256") ?? "";
    if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
      return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_SHA256_INVALID" },
        { status: 400 });
    }
    const bytes = await readTrackGVideoOneStage12CodecSafeLraFeasibilitySource(
      idempotencyKey(request), token(request), expectedSha256, fencingToken(request),
    );
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body.buffer, { headers: { "content-type": "video/webm" } });
  } catch (error) {
    const message = error instanceof Error ? error.message
      : "STAGE_12_LRA_FEASIBILITY_READ_FAILED";
    return Response.json({ error: message }, {
      status: message.includes("UNAUTHORIZED") ? 401 : 422,
    });
  }
}

export async function POST(request: Request) {
  try {
    const callbackToken = token(request);
    const body = await request.json() as {
      idempotencyKey?: string;
      kind?: string;
      requestSha256?: string;
      fencingToken?: number;
      leaseId?: string;
      heartbeatId?: string;
      heartbeatSequence?: number;
      terminalReceiptSha256?: string;
      result?: Stage12CodecSafeLraFeasibilityResult;
      errorCode?: string;
    };
    if (body.kind === "LEASE_HEARTBEAT") {
      if (Object.keys(body).sort().join(",") !== ["fencingToken", "heartbeatId",
        "heartbeatSequence", "idempotencyKey", "kind", "leaseId",
        "requestSha256"].join(",")
        || !/^[a-f0-9]{64}$/u.test(body.idempotencyKey ?? "")
        || !/^[a-f0-9]{64}$/u.test(body.requestSha256 ?? "")
        || !Number.isSafeInteger(body.fencingToken) || (body.fencingToken ?? 0) < 1
        || typeof body.leaseId !== "string"
        || !/^[A-Za-z0-9_-]{1,160}$/u.test(body.leaseId)
        || !/^[a-f0-9]{64}$/u.test(body.heartbeatId ?? "")
        || !Number.isSafeInteger(body.heartbeatSequence)
        || (body.heartbeatSequence ?? 0) < 1) {
        return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_HEARTBEAT_INVALID" },
          { status: 400 });
      }
      const renewal = await renewTrackGVideoOneStage12CodecSafeLraFeasibilityLease({
        idempotencyKey: body.idempotencyKey!, token: callbackToken,
        requestSha256: body.requestSha256!, fencingToken: body.fencingToken!,
        leaseId: body.leaseId, heartbeatId: body.heartbeatId!,
        heartbeatSequence: body.heartbeatSequence!,
      });
      return Response.json(renewal, { status: renewal.replayed ? 200 : 201 });
    }
    if (!/^[a-f0-9]{64}$/u.test(body.idempotencyKey ?? "")
      || !/^[a-f0-9]{64}$/u.test(body.requestSha256 ?? "")
      || !Number.isSafeInteger(body.fencingToken) || (body.fencingToken ?? 0) < 1
      || typeof body.leaseId !== "string"
      || !/^[A-Za-z0-9_-]{1,160}$/u.test(body.leaseId)
      || !/^[a-f0-9]{64}$/u.test(body.terminalReceiptSha256 ?? "")
      || (body.result === undefined) === (body.errorCode === undefined)
      || (body.result !== undefined
        && (typeof body.result !== "object" || body.result === null))
      || (body.errorCode !== undefined
        && (typeof body.errorCode !== "string"
          || !/^[A-Z0-9_:.-]{1,160}$/u.test(body.errorCode)))) {
      return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_CALLBACK_INVALID" },
        { status: 400 });
    }
    const terminal = body.result !== undefined ? body.result : { errorCode: body.errorCode };
    if (stage12LraFeasibilityCanonicalSha256(terminal) !== body.terminalReceiptSha256) {
      return Response.json({ error: "STAGE_12_LRA_FEASIBILITY_CALLBACK_RECEIPT_CONFLICT" },
        { status: 409 });
    }
    const result = await recordTrackGVideoOneStage12CodecSafeLraFeasibilityCallback({
      idempotencyKey: body.idempotencyKey!,
      token: callbackToken,
      requestSha256: body.requestSha256!,
      fencingToken: body.fencingToken!,
      leaseId: body.leaseId,
      terminalReceiptSha256: body.terminalReceiptSha256!,
      ...(body.result !== undefined
        ? { result: body.result } : { errorCode: body.errorCode }),
    });
    return Response.json({ ...result,
      idempotencyKey: body.idempotencyKey,
      requestSha256: body.requestSha256,
      terminalReceiptSha256: body.terminalReceiptSha256,
      fencingToken: body.fencingToken,
      leaseId: body.leaseId }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return callbackFailure(error);
  }
}
