import { getChatGPTUser } from "../../chatgpt-auth";
import { getOperatorSnapshot, prepareApprovedChannel } from "../../operator-runtime";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "UNEXPECTED_OPERATOR_ERROR";
  const status = message.includes("AUTHORIZATION") || message.includes("ALLOWLIST") ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "CHATGPT_SIGN_IN_REQUIRED" }, { status: 401 });
    return Response.json(await getOperatorSnapshot(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "CHATGPT_SIGN_IN_REQUIRED" }, { status: 401 });
    const body = await request.json() as {
      commandType?: string;
      objective?: string;
      idempotencyKey?: string;
    };
    if (body.commandType !== "PREPARE_CHANNEL") {
      return Response.json({ error: "COMMAND_NOT_ALLOWED_IN_G01A1" }, { status: 400 });
    }
    const result = await prepareApprovedChannel(user, {
      objective: body.objective ?? "",
      idempotencyKey: body.idempotencyKey ?? "",
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
