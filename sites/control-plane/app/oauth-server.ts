import { createHash, timingSafeEqual } from "node:crypto";
import { getD1 } from "../db";
import type { ChatGPTUser } from "./chatgpt-auth";
import { getFactoryEnv } from "./runtime-env";

export const oauthProductionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
const CHATGPT_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
const CHATGPT_REDIRECT_URI = "https://chatgpt.com/connector_platform_oauth_redirect";
const SUPPORTED_SCOPES = ["factory.read", "factory.prepare"] as const;
const AUTHORIZATION_TTL_SECONDS = 10 * 60;
const CODE_TTL_SECONDS = 5 * 60;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export const oauthScopes = [...SUPPORTED_SCOPES];

export type OAuthAuthorizationParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  scope: string;
};

type StoredAuthorizationRequest = {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  resource: string;
  scope: string;
  owner_identity: string;
  expires_at: number;
  used_at: number | null;
};

type StoredAuthorizationCode = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  scope: string;
  owner_identity: string;
  expires_at: number;
  used_at: number | null;
};

type StoredAccessToken = {
  client_id: string;
  resource: string;
  scope: string;
  owner_identity: string;
  expires_at: number;
  revoked_at: number | null;
};

export function factoryOrigin(request: Request): string {
  const origin = new URL(request.url).origin;
  return origin === "http://localhost" ? origin : oauthProductionOrigin;
}

export function oauthIssuer(request: Request): string {
  return factoryOrigin(request);
}

export function oauthResource(request: Request): string {
  return `${factoryOrigin(request)}/api/mcp`;
}

export function protectedResourceMetadataUrl(request: Request): string {
  return `${factoryOrigin(request)}/.well-known/oauth-protected-resource`;
}

export function protectedResourceMetadata(request: Request) {
  return {
    resource: oauthResource(request),
    authorization_servers: [oauthIssuer(request)],
    scopes_supported: oauthScopes,
    bearer_methods_supported: ["header"],
    resource_documentation: `${factoryOrigin(request)}/operate`,
  };
}

export function authorizationServerMetadata(request: Request) {
  const issuer = oauthIssuer(request);
  return {
    issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    scopes_supported: oauthScopes,
  };
}

export function bearerChallenge(request: Request, error = "invalid_token", description = "Sign in with ChatGPT to continue"): string {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl(request)}", scope="${oauthScopes.join(" ")}", error="${error}", error_description="${description}"`;
}

export function parseAuthorizationParams(request: Request): OAuthAuthorizationParams {
  const url = new URL(request.url);
  return parseAuthorizationSearchParams(url.searchParams, oauthResource(request));
}

export function parseAuthorizationSearchParams(
  searchParams: URLSearchParams,
  expectedResource = `${oauthProductionOrigin}/api/mcp`,
): OAuthAuthorizationParams {
  const responseType = searchParams.get("response_type");
  const clientId = searchParams.get("client_id") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const state = searchParams.get("state") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const challengeMethod = searchParams.get("code_challenge_method");
  const resource = searchParams.get("resource") ?? "";
  const requestedScope = searchParams.get("scope") ?? oauthScopes.join(" ");

  if (responseType !== "code") throw new Error("OAUTH_UNSUPPORTED_RESPONSE_TYPE");
  if (clientId !== CHATGPT_CLIENT_ID) throw new Error("OAUTH_CLIENT_NOT_ALLOWED");
  if (redirectUri !== CHATGPT_REDIRECT_URI) throw new Error("OAUTH_REDIRECT_URI_NOT_ALLOWED");
  if (!state || state.length > 2048) throw new Error("OAUTH_STATE_REQUIRED");
  if (challengeMethod !== "S256" || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeChallenge)) {
    throw new Error("OAUTH_PKCE_S256_REQUIRED");
  }
  if (resource !== expectedResource) throw new Error("OAUTH_RESOURCE_MISMATCH");
  const scope = normalizeScope(requestedScope);
  if (!scope.includes("factory.read")) throw new Error("OAUTH_READ_SCOPE_REQUIRED");

  return { clientId, redirectUri, state, codeChallenge, resource, scope: scope.join(" ") };
}

export async function createAuthorizationRequest(user: ChatGPTUser, params: OAuthAuthorizationParams): Promise<string> {
  requireConfiguredOwner(user.email);
  const nonce = randomToken();
  const now = nowSeconds();
  await getD1().prepare(`INSERT INTO oauth_authorization_request
    (nonce_hash, client_id, redirect_uri, state, code_challenge, resource, scope, owner_identity, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      hashSecret(nonce),
      params.clientId,
      params.redirectUri,
      params.state,
      params.codeChallenge,
      params.resource,
      params.scope,
      user.email.trim().toLowerCase(),
      now + AUTHORIZATION_TTL_SECONDS,
      now,
    ).run();
  return nonce;
}

export async function approveAuthorizationRequest(user: ChatGPTUser, nonce: string): Promise<string> {
  requireConfiguredOwner(user.email);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(nonce)) throw new Error("OAUTH_INVALID_CONSENT_NONCE");
  const d1 = getD1();
  const stored = await d1.prepare(`SELECT client_id, redirect_uri, state, code_challenge, resource, scope,
      owner_identity, expires_at, used_at
    FROM oauth_authorization_request WHERE nonce_hash = ?`)
    .bind(hashSecret(nonce)).first<StoredAuthorizationRequest>();
  const now = nowSeconds();
  if (!stored || stored.used_at !== null || stored.expires_at <= now) throw new Error("OAUTH_CONSENT_EXPIRED");
  if (stored.owner_identity !== user.email.trim().toLowerCase()) throw new Error("OAUTH_CONSENT_OWNER_MISMATCH");

  const code = randomToken();
  const results = await d1.batch([
    d1.prepare(`INSERT INTO oauth_authorization_code
      (code_hash, client_id, redirect_uri, code_challenge, resource, scope, owner_identity, expires_at, created_at)
      SELECT ?, client_id, redirect_uri, code_challenge, resource, scope, owner_identity, ?, ?
      FROM oauth_authorization_request
      WHERE nonce_hash = ? AND used_at IS NULL AND expires_at > ?`)
      .bind(hashSecret(code), now + CODE_TTL_SECONDS, now, hashSecret(nonce), now),
    d1.prepare(`UPDATE oauth_authorization_request SET used_at = ?
      WHERE nonce_hash = ? AND used_at IS NULL AND expires_at > ?`)
      .bind(now, hashSecret(nonce), now),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) throw new Error("OAUTH_CONSENT_ALREADY_USED");

  const redirect = new URL(stored.redirect_uri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", stored.state);
  redirect.searchParams.set("iss", oauthProductionOrigin);
  return redirect.toString();
}

export async function exchangeAuthorizationCode(request: Request): Promise<Response> {
  const body = await request.formData();
  if (body.get("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type");
  const code = stringField(body, "code");
  const clientId = stringField(body, "client_id");
  const redirectUri = stringField(body, "redirect_uri");
  const codeVerifier = stringField(body, "code_verifier");
  const resource = stringField(body, "resource");
  if (!code || !clientId || !redirectUri || !codeVerifier || !resource) return oauthError("invalid_request");
  if (clientId !== CHATGPT_CLIENT_ID || redirectUri !== CHATGPT_REDIRECT_URI) return oauthError("invalid_client");
  if (resource !== oauthResource(request)) return oauthError("invalid_target");

  const d1 = getD1();
  const stored = await d1.prepare(`SELECT client_id, redirect_uri, code_challenge, resource, scope,
      owner_identity, expires_at, used_at
    FROM oauth_authorization_code WHERE code_hash = ?`)
    .bind(hashSecret(code)).first<StoredAuthorizationCode>();
  const now = nowSeconds();
  if (!stored || stored.used_at !== null || stored.expires_at <= now) return oauthError("invalid_grant");
  if (stored.client_id !== clientId || stored.redirect_uri !== redirectUri || stored.resource !== resource) {
    return oauthError("invalid_grant");
  }
  if (!safeEqual(base64UrlSha256(codeVerifier), stored.code_challenge)) return oauthError("invalid_grant");

  const accessToken = randomToken();
  const results = await d1.batch([
    d1.prepare(`INSERT INTO oauth_access_token
      (token_hash, client_id, resource, scope, owner_identity, expires_at, created_at)
      SELECT ?, client_id, resource, scope, owner_identity, ?, ?
      FROM oauth_authorization_code
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`)
      .bind(hashSecret(accessToken), now + TOKEN_TTL_SECONDS, now, hashSecret(code), now),
    d1.prepare(`UPDATE oauth_authorization_code SET used_at = ?
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`)
      .bind(now, hashSecret(code), now),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) return oauthError("invalid_grant");

  return Response.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    scope: stored.scope,
  }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export async function authenticateBearer(request: Request): Promise<{ user: ChatGPTUser; scopes: Set<string> } | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (!match) return null;
  const stored = await getD1().prepare(`SELECT client_id, resource, scope, owner_identity, expires_at, revoked_at
    FROM oauth_access_token WHERE token_hash = ?`)
    .bind(hashSecret(match[1])).first<StoredAccessToken>();
  const now = nowSeconds();
  if (!stored || stored.revoked_at !== null || stored.expires_at <= now) return null;
  if (stored.client_id !== CHATGPT_CLIENT_ID || stored.resource !== oauthResource(request)) return null;
  requireConfiguredOwner(stored.owner_identity);
  return {
    user: { displayName: stored.owner_identity, email: stored.owner_identity, fullName: null },
    scopes: new Set(normalizeScope(stored.scope)),
  };
}

function normalizeScope(value: string): Array<string> {
  const scopes = [...new Set(value.split(/\s+/).filter(Boolean))];
  if (!scopes.length || scopes.some((scope) => !SUPPORTED_SCOPES.includes(scope as typeof SUPPORTED_SCOPES[number]))) {
    throw new Error("OAUTH_INVALID_SCOPE");
  }
  return scopes;
}

function requireConfiguredOwner(identity: string): void {
  const owner = getFactoryEnv().FACTORY_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) throw new Error("FACTORY_OWNER_ALLOWLIST_UNCONFIGURED");
  if (identity.trim().toLowerCase() !== owner) throw new Error("FACTORY_OWNER_AUTHORIZATION_DENIED");
}

function oauthError(error: string): Response {
  return Response.json({ error }, {
    status: 400,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

function stringField(body: FormData, key: string): string {
  const value = body.get(key);
  return typeof value === "string" ? value : "";
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function base64UrlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
