import type { Stage12MediaReceipt } from "../../../stage12-pre-master";
import {
  readTrackGVideoOneStage12RemediationSource,
  recordTrackGVideoOneStage12RemediationCallback,
  storeTrackGVideoOneStage12CorrectedPreMaster,
} from "../../../track-g-video-one";

function token(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const value = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("STAGE_12_REMEDIATION_UNAUTHORIZED");
  return value;
}

function idempotencyKey(request: Request) {
  const value = new URL(request.url).searchParams.get("idempotencyKey") ?? "";
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("STAGE_12_REMEDIATION_IDEMPOTENCY_INVALID");
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("kind") !== "source-pre-master") {
      return Response.json({ error: "STAGE_12_REMEDIATION_OBJECT_KIND_INVALID" }, { status: 400 });
    }
    const expectedSha256 = url.searchParams.get("sha256") ?? "";
    if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
      return Response.json({ error: "STAGE_12_REMEDIATION_SHA256_INVALID" }, { status: 400 });
    }
    const bytes = await readTrackGVideoOneStage12RemediationSource(
      idempotencyKey(request), token(request), expectedSha256,
    );
    return new Response(bytes, { headers: { "content-type": "video/webm" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_REMEDIATION_READ_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}

export async function PUT(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("kind") !== "corrected-pre-master") {
      return Response.json({ error: "STAGE_12_REMEDIATION_OBJECT_KIND_INVALID" }, { status: 400 });
    }
    const expectedSha256 = request.headers.get("x-factory-object-sha256") ?? "";
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await storeTrackGVideoOneStage12CorrectedPreMaster(
      idempotencyKey(request), token(request), bytes, expectedSha256,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_REMEDIATION_UPLOAD_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      idempotencyKey?: string; result?: Stage12MediaReceipt; errorCode?: string;
    };
    if (!/^[a-f0-9]{64}$/u.test(body.idempotencyKey ?? "")
      || (body.result === undefined) === (body.errorCode === undefined)) {
      return Response.json({ error: "STAGE_12_REMEDIATION_CALLBACK_INVALID" }, { status: 400 });
    }
    const result = await recordTrackGVideoOneStage12RemediationCallback({
      idempotencyKey: body.idempotencyKey!, token: token(request),
      ...(body.result ? { result: body.result } : { errorCode: body.errorCode }),
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_REMEDIATION_CALLBACK_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}
