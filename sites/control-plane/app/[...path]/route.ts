import { authorizationServerMetadata, protectedResourceMetadata } from "../oauth-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = `/${path.join("/")}`;
  const headers = { "Cache-Control": "public, max-age=300" };
  if (route === "/.well-known/oauth-protected-resource") {
    return Response.json(protectedResourceMetadata(request), { headers });
  }
  if (route === "/.well-known/oauth-authorization-server" || route === "/.well-known/openid-configuration") {
    return Response.json(authorizationServerMetadata(request), { headers });
  }
  return new Response("Not Found", { status: 404 });
}
