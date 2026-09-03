import type { Stage12EncodedLoudnessDiagnosticReplayResult } from
  "../../../stage12-pre-master";
import {
  readTrackGVideoOneStage12EncodedLoudnessDiagnosticReplaySource,
  recordTrackGVideoOneStage12EncodedLoudnessDiagnosticReplayCallback,
} from "../../../track-g-video-one";

function token(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const value = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_UNAUTHORIZED");
  }
  return value;
}

function idempotencyKey(request: Request) {
  const value = new URL(request.url).searchParams.get("idempotencyKey") ?? "";
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_IDEMPOTENCY_INVALID");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("kind") !== "source-ordinal-2") {
      return Response.json({
        error: "STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_OBJECT_KIND_INVALID",
      }, { status: 400 });
    }
    const expectedSha256 = url.searchParams.get("sha256") ?? "";
    if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
      return Response.json({
        error: "STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_SHA256_INVALID",
      }, { status: 400 });
    }
    const bytes = await readTrackGVideoOneStage12EncodedLoudnessDiagnosticReplaySource(
      idempotencyKey(request), token(request), expectedSha256,
    );
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body.buffer, { headers: { "content-type": "video/webm" } });
  } catch (error) {
    const message = error instanceof Error ? error.message
      : "STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_READ_FAILED";
    return Response.json({ error: message }, {
      status: message.includes("UNAUTHORIZED") ? 401 : 422,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      idempotencyKey?: string;
      result?: Stage12EncodedLoudnessDiagnosticReplayResult;
      errorCode?: string;
    };
    if (!/^[a-f0-9]{64}$/u.test(body.idempotencyKey ?? "")
      || (body.result === undefined) === (body.errorCode === undefined)) {
      return Response.json({
        error: "STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_CALLBACK_INVALID",
      }, { status: 400 });
    }
    const result = await recordTrackGVideoOneStage12EncodedLoudnessDiagnosticReplayCallback({
      idempotencyKey: body.idempotencyKey!,
      token: token(request),
      ...(body.result ? { result: body.result } : { errorCode: body.errorCode }),
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message
      : "STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_CALLBACK_FAILED";
    return Response.json({ error: message }, {
      status: message.includes("UNAUTHORIZED") ? 401 : 422,
    });
  }
}
