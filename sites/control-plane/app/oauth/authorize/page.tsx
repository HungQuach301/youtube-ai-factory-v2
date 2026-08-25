import Link from "next/link";
import { requireChatGPTUser } from "../../chatgpt-auth";
import {
  createAuthorizationRequest,
  oauthProductionOrigin,
  parseAuthorizationSearchParams,
} from "../../oauth-server";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  }
  const returnTo = `/oauth/authorize?${query.toString()}`;
  const user = await requireChatGPTUser(returnTo);

  let authorization: { nonce: string; requestedScopes: string[] } | null = null;
  let errorMessage: string | null = null;
  try {
    const parsed = parseAuthorizationSearchParams(query, `${oauthProductionOrigin}/mcp`);
    authorization = {
      nonce: await createAuthorizationRequest(user, parsed),
      requestedScopes: parsed.scope.split(" "),
    };
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "OAUTH_REQUEST_INVALID";
  }

  if (!authorization) {
    return (
      <main className="oauth-shell">
        <section className="oauth-card" aria-labelledby="oauth-title">
          <p className="eyebrow">CONNECTION BLOCKED</p>
          <h1 id="oauth-title">This authorization request is not valid.</h1>
          <p className="oauth-lead">The Factory rejected the request before granting any access.</p>
          <code>{errorMessage}</code>
          <div className="oauth-actions"><Link className="secondary-action" href="/operate">Return to Production operator</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="oauth-shell">
      <section className="oauth-card" aria-labelledby="oauth-title">
        <div className="brand-mark" aria-hidden="true">YF</div>
        <p className="eyebrow">OWNER AUTHORIZATION</p>
        <h1 id="oauth-title">Connect ChatGPT to YouTube AI Factory V2?</h1>
        <p className="oauth-lead">ChatGPT is requesting owner-only access to the same Production control plane and D1 state.</p>
        <div className="oauth-permissions">
          <h2>Requested permissions</h2>
          <ul>
            {authorization.requestedScopes.includes("factory.read") && <li><strong>Read factory state</strong><span>View persisted decisions, deliverables, runs and activation blockers.</span></li>}
            {authorization.requestedScopes.includes("factory.prepare") && <li><strong>Prepare the approved channel</strong><span>Run the idempotent PREPARE_CHANNEL command. Provider dispatch and auto-publish remain OFF.</span></li>}
          </ul>
        </div>
        <p className="oauth-account">Signed in as <strong>{user.email}</strong></p>
        <form action="/oauth/authorize/approve" method="post" className="oauth-actions">
          <input type="hidden" name="nonce" value={authorization.nonce} />
          <button className="primary-action" type="submit">Allow connection</button>
          <Link className="secondary-action" href="/operate">Cancel</Link>
        </form>
        <p className="oauth-footnote">Access tokens expire after eight hours. This approval cannot activate providers, spend budget or publish to YouTube.</p>
      </section>
    </main>
  );
}
