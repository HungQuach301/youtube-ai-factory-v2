import type { Stage12MediaReceipt } from "../../../stage12-pre-master";
import {
  readTrackGVideoOneStage12AudioP0CorrectionSource,
  recordTrackGVideoOneStage12AudioP0CorrectionCallback,
  storeTrackGVideoOneStage12AudioP0CorrectedPreMaster,
} from "../../../track-g-video-one";

function token(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const value = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("STAGE_12_AUDIO_P0_CORRECTION_UNAUTHORIZED");
  return value;
}

function idempotencyKey(request: Request) {
  const value = new URL(request.url).searchParams.get("idempotencyKey") ?? "";
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("STAGE_12_AUDIO_P0_CORRECTION_IDEMPOTENCY_INVALID");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("kind") !== "source-audio-p0-pre-master") {
      return Response.json({ error: "STAGE_12_AUDIO_P0_CORRECTION_OBJECT_KIND_INVALID" }, { status: 400 });
    }
    const expectedSha256 = url.searchParams.get("sha256") ?? "";
    if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
      return Response.json({ error: "STAGE_12_AUDIO_P0_CORRECTION_SHA256_INVALID" }, { status: 400 });
    }
    const bytes = await readTrackGVideoOneStage12AudioP0CorrectionSource(
      idempotencyKey(request), token(request), expectedSha256,
    );
    return new Response(bytes, { headers: { "content-type": "video/webm" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_AUDIO_P0_CORRECTION_READ_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}

export async function PUT(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("kind") !== "audio-p0-corrected-pre-master") {
      return Response.json({ error: "STAGE_12_AUDIO_P0_CORRECTION_OBJECT_KIND_INVALID" }, { status: 400 });
    }
    const expectedSha256 = request.headers.get("x-factory-object-sha256") ?? "";
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await storeTrackGVideoOneStage12AudioP0CorrectedPreMaster(
      idempotencyKey(request), token(request), bytes, expectedSha256,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_AUDIO_P0_CORRECTION_UPLOAD_FAILED";
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
      return Response.json({ error: "STAGE_12_AUDIO_P0_CORRECTION_CALLBACK_INVALID" }, { status: 400 });
    }
    const result = await recordTrackGVideoOneStage12AudioP0CorrectionCallback({
      idempotencyKey: body.idempotencyKey!, token: token(request),
      ...(body.result ? { result: body.result } : { errorCode: body.errorCode }),
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_12_AUDIO_P0_CORRECTION_CALLBACK_FAILED";
    return Response.json({ error: message }, { status: message.includes("UNAUTHORIZED") ? 401 : 422 });
  }
}
