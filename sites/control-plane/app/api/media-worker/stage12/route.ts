import type { Stage12MediaReceipt } from "../../../stage12-pre-master";
import {
  readTrackGVideoOneStage12Narration,
  recordTrackGVideoOneStage12Callback,
  storeTrackGVideoOneStage12PreMaster,
} from "../../../track-g-video-one";

function token(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const value = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("STAGE_12_WORKER_UNAUTHORIZED");
  return value;
}

function idempotencyKey(request: Request): string {
  const value = new URL(request.url).searchParams.get("idempotencyKey") ?? "";
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("STAGE_12_IDEMPOTENCY_INVALID");
  return value;
}

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("kind") !== "narration") {
      return Response.json({ error: "STAGE_12_OBJECT_KIND_INVALID" }, { status: 400 });
    }
    const bytes = await readTrackGVideoOneStage12Narration(idempotencyKey(request), token(request));
    return new Response(bytes, { headers: { "content-type": "audio/mpeg" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_OBJECT_READ_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}

export async function PUT(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("kind") !== "pre-master") {
      return Response.json({ error: "STAGE_12_OBJECT_KIND_INVALID" }, { status: 400 });
    }
    const expectedSha256 = request.headers.get("x-factory-object-sha256") ?? "";
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await storeTrackGVideoOneStage12PreMaster(
      idempotencyKey(request), token(request), bytes, expectedSha256,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_OBJECT_WRITE_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      idempotencyKey?: string;
      result?: Stage12MediaReceipt;
      errorCode?: string;
    };
    if (!/^[a-f0-9]{64}$/u.test(body.idempotencyKey ?? "")
      || (body.result === undefined) === (body.errorCode === undefined)) {
      return Response.json({ error: "STAGE_12_CALLBACK_INVALID" }, { status: 400 });
    }
    const result = await recordTrackGVideoOneStage12Callback({
      idempotencyKey: body.idempotencyKey!,
      token: token(request),
      ...(body.result === undefined ? {} : { result: body.result }),
      ...(body.errorCode === undefined ? {} : { errorCode: body.errorCode }),
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_CALLBACK_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}
