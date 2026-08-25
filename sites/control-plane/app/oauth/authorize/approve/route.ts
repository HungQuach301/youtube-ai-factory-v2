import { getChatGPTUser } from "../../../chatgpt-auth";
import { approveAuthorizationRequest, oauthProductionOrigin } from "../../../oauth-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "CHATGPT_SIGN_IN_REQUIRED" }, { status: 401 });
    const body = await request.formData();
    const nonce = body.get("nonce");
    if (typeof nonce !== "string") return Response.json({ error: "OAUTH_INVALID_CONSENT_NONCE" }, { status: 400 });
    return Response.redirect(await approveAuthorizationRequest(user, nonce), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAUTH_CONSENT_FAILED";
    const redirect = new URL("/operate", oauthProductionOrigin);
    redirect.searchParams.set("oauth_error", message);
    return Response.redirect(redirect, 303);
  }
}
