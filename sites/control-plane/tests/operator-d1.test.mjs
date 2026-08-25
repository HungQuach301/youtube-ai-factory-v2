import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ownerHeaders = {
  "content-type": "application/json",
  "oai-authenticated-user-email": "owner@example.com",
  "oai-authenticated-user-full-name": "Factory%20Owner",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

async function createFactoryFixture(databaseName) {
  const serverRoot = fileURLToPath(new URL("../dist/server", import.meta.url));
  const entries = await readdir(serverRoot, { recursive: true, withFileTypes: true });
  const modulePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => resolve(entry.parentPath, entry.name));
  const entryPath = resolve(serverRoot, "index.js");
  const orderedPaths = [entryPath, ...modulePaths.filter((path) => path !== entryPath)];
  const modules = await Promise.all(orderedPaths.map(async (path) => ({
    type: "ESModule",
    path: relative(serverRoot, path),
    contents: await readFile(path, "utf8"),
  })));
  const mf = new Miniflare({
    modules,
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: databaseName },
    bindings: { FACTORY_OWNER_EMAIL: "owner@example.com" },
  });
  const d1 = await mf.getD1Database("DB");
  const migrationRoot = fileURLToPath(new URL("../drizzle", import.meta.url));
  const migrations = (await readdir(migrationRoot))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const migrationName of migrations) {
    const migration = await readFile(resolve(migrationRoot, migrationName), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      await d1.prepare(statement).run();
    }
  }
  return { mf, d1 };
}

test("executes PREPARE_CHANNEL idempotently against real local D1", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-operator-test");

  try {
    const objective = "Persist the approved AI-Era Money Defense channel strategy and verify Production read-back.";
    const command = {
      commandType: "PREPARE_CHANNEL",
      objective,
      idempotencyKey: createHash("sha256").update(`PREPARE_CHANNEL|HP-01|${objective}`).digest("hex"),
    };
    const firstResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(command),
    });
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 201);
    assert.equal(first.replayed, false);
    assert.equal(first.run.status, "COMPLETED");
    assert.equal(first.run.currentStep, "CHANNEL_STATE_READ_BACK");

    const replayResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(command),
    });
    const replay = await replayResponse.json();
    assert.equal(replayResponse.status, 200);
    assert.equal(replay.replayed, true);
    assert.equal(replay.run.id, first.run.id);

    const snapshotResponse = await mf.dispatchFetch("http://localhost/api/operator", { headers: ownerHeaders });
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshot.actor.role, "OWNER");
    assert.equal(snapshot.channel.status, "PREPARED");
    assert.equal(snapshot.identityContract.approvalState, "PERSISTED");
    assert.equal(snapshot.decision.decisionKey, "HP-01:AI-ERA-MONEY-DEFENSE:2026-08-25");
    assert.equal(snapshot.pillar.name, "How Modern Money Traps Work");
    assert.equal(snapshot.episodes.length, 10);
    assert.equal(snapshot.runs.length, 1);
    assert.deepEqual(snapshot.latestRunEvents.map((event) => event.eventType), [
      "COMMAND_ACCEPTED",
      "OWNER_AUTHORIZED",
      "CHANNEL_PREPARED",
      "READ_BACK_VERIFIED",
    ]);

    const episodeCount = await d1.prepare("SELECT count(*) AS count FROM episode").first();
    assert.equal(episodeCount.count, 10);
    await assert.rejects(
      d1.prepare("UPDATE command_log SET next_state = 'ACTIVE'").run(),
      /COMMAND_LOG_APPEND_ONLY/,
    );
  } finally {
    await mf.dispose();
  }
});

test("exposes owner-authorized MCP tools and persists the Production command path", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-mcp-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-e2e-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "get_factory_state",
      "prepare_approved_channel",
    ]);

    const before = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(before.structuredContent.channelStatus, "NOT_PREPARED");
    assert.equal(before.structuredContent.episodeCount, 0);
    assert.equal(before.structuredContent.providerDispatch, "OFF");

    const objective = "Persist the approved AI-Era Money Defense strategy through the ChatGPT Production command surface.";
    const prepared = await client.callTool({
      name: "prepare_approved_channel",
      arguments: { objective, confirm: true },
    });
    assert.equal(prepared.isError, undefined);
    assert.equal(prepared.structuredContent.accepted, true);
    assert.equal(prepared.structuredContent.replayed, false);
    assert.equal(prepared.structuredContent.runStatus, "COMPLETED");
    assert.equal(prepared.structuredContent.currentStep, "CHANNEL_STATE_READ_BACK");
    assert.equal(prepared.structuredContent.channelStatus, "PREPARED");
    assert.equal(prepared.structuredContent.contractState, "PERSISTED");
    assert.equal(prepared.structuredContent.episodeCount, 10);
    assert.equal(prepared.structuredContent.providerDispatch, "OFF");
    assert.equal(prepared.structuredContent.autoPublish, "OFF");

    const replay = await client.callTool({
      name: "prepare_approved_channel",
      arguments: { objective, confirm: true },
    });
    assert.equal(replay.structuredContent.replayed, true);

    const commandCount = await d1.prepare("SELECT count(*) AS count FROM command_log").first();
    const runCount = await d1.prepare("SELECT count(*) AS count FROM operation_run").first();
    const eventCount = await d1.prepare("SELECT count(*) AS count FROM operation_event").first();
    assert.equal(commandCount.count, 1);
    assert.equal(runCount.count, 1);
    assert.equal(eventCount.count, 4);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("completes ChatGPT OAuth discovery, PKCE exchange and bearer-authorized MCP calls", async () => {
  const { mf } = await createFactoryFixture("g01a-oauth-test");
  const productionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
  const resource = `${productionOrigin}/api/mcp`;
  const verifier = "factory-owner-pkce-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const clientId = "https://chatgpt.com/oauth/client.json";
  const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";

  try {
    const unauthenticated = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(unauthenticated.status, 401);
    assert.match(unauthenticated.headers.get("www-authenticate") ?? "", /oauth-protected-resource/);

    const resourceMetadataResponse = await mf.dispatchFetch(`${productionOrigin}/.well-known/oauth-protected-resource`);
    const resourceMetadata = await resourceMetadataResponse.json();
    assert.equal(resourceMetadata.resource, resource);
    assert.deepEqual(resourceMetadata.authorization_servers, [productionOrigin]);
    assert.deepEqual(resourceMetadata.scopes_supported, ["factory.read", "factory.prepare"]);

    const issuerMetadataResponse = await mf.dispatchFetch(`${productionOrigin}/.well-known/oauth-authorization-server`);
    const issuerMetadata = await issuerMetadataResponse.json();
    assert.equal(issuerMetadata.issuer, productionOrigin);
    assert.equal(issuerMetadata.client_id_metadata_document_supported, true);
    assert.deepEqual(issuerMetadata.code_challenge_methods_supported, ["S256"]);

    const authorize = new URL(`${productionOrigin}/oauth/authorize`);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", "oauth-state-123");
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("resource", resource);
    authorize.searchParams.set("scope", "factory.read factory.prepare");
    const consentResponse = await mf.dispatchFetch(authorize, { headers: ownerHeaders });
    const consentHtml = await consentResponse.text();
    assert.equal(consentResponse.status, 200);
    assert.match(consentHtml, /Connect ChatGPT to YouTube AI Factory V2/i);
    const nonce = consentHtml.match(/name="nonce" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);

    const approvalResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/authorize/approve`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nonce }),
      redirect: "manual",
    });
    assert.equal(approvalResponse.status, 303);
    const callback = new URL(approvalResponse.headers.get("location"));
    assert.equal(callback.origin + callback.pathname, redirectUri);
    assert.equal(callback.searchParams.get("state"), "oauth-state-123");
    assert.equal(callback.searchParams.get("iss"), productionOrigin);
    const code = callback.searchParams.get("code");
    assert.ok(code);

    const tokenResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    const token = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.equal(token.token_type, "Bearer");
    assert.equal(token.scope, "factory.read factory.prepare");
    assert.ok(token.access_token);

    const replayResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    assert.equal(replayResponse.status, 400);
    assert.equal((await replayResponse.json()).error, "invalid_grant");

    const rawToolsResponse = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.access_token}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} }),
    });
    const rawTools = await rawToolsResponse.json();
    assert.deepEqual(rawTools.result.tools.find((tool) => tool.name === "get_factory_state")?.securitySchemes, [
      { type: "oauth2", scopes: ["factory.read"] },
    ]);

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
      fetch: (input, init) => mf.dispatchFetch(input, init),
    });
    const client = new Client({ name: "factory-oauth-e2e-test", version: "1.0.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "get_factory_state",
      "prepare_approved_channel",
    ]);
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});

test("accepts only the callback-bound Codex CIMD client and loopback redirect", async () => {
  const { mf } = await createFactoryFixture("g01a-codex-oauth-test");
  const productionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
  const resource = `${productionOrigin}/api/mcp`;
  const callbackId = "taI8_cm2QJRi";
  const clientId = `https://chatgpt.com/oauth/codex/${callbackId}/client.json`;
  const redirectUri = `http://127.0.0.1:38311/callback/${callbackId}`;
  const verifier = "codex-owner-pkce-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  function authorizationUrl(candidateClientId = clientId, candidateRedirectUri = redirectUri) {
    const url = new URL(`${productionOrigin}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", candidateClientId);
    url.searchParams.set("redirect_uri", candidateRedirectUri);
    url.searchParams.set("state", "codex-oauth-state");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", resource);
    url.searchParams.set("scope", "factory.read factory.prepare");
    return url;
  }

  try {
    const consentResponse = await mf.dispatchFetch(authorizationUrl(), { headers: ownerHeaders });
    const consentHtml = await consentResponse.text();
    assert.equal(consentResponse.status, 200);
    const nonce = consentHtml.match(/name="nonce" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);

    const mismatchedCallback = await mf.dispatchFetch(
      authorizationUrl(clientId, "http://127.0.0.1:38311/callback/not-the-client"),
      { headers: ownerHeaders },
    );
    assert.match(await mismatchedCallback.text(), /OAUTH_REDIRECT_URI_NOT_ALLOWED/);

    const lookalikeClient = await mf.dispatchFetch(
      authorizationUrl(`https://chatgpt.com.evil.example/oauth/codex/${callbackId}/client.json`, redirectUri),
      { headers: ownerHeaders },
    );
    assert.match(await lookalikeClient.text(), /OAUTH_CLIENT_NOT_ALLOWED/);

    const approvalResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/authorize/approve`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nonce }),
      redirect: "manual",
    });
    assert.equal(approvalResponse.status, 303);
    const callback = new URL(approvalResponse.headers.get("location"));
    assert.equal(callback.origin + callback.pathname, redirectUri);
    assert.equal(callback.searchParams.get("iss"), productionOrigin);
    const code = callback.searchParams.get("code");
    assert.ok(code);

    const tokenResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    const token = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.ok(token.access_token);

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
      fetch: (input, init) => mf.dispatchFetch(input, init),
    });
    const client = new Client({ name: "factory-codex-oauth-test", version: "1.0.0" });
    await client.connect(transport);
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});

test("accepts only the fixed Work OAuth client on the exact terminal callback", async () => {
  const { mf } = await createFactoryFixture("g01a-work-oauth-test");
  const productionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
  const resource = `${productionOrigin}/api/mcp`;
  const clientId = "youtube-ai-factory-v2-work";
  const redirectUri = "http://terminal.local:44401/callback/taI8_cm2QJRi";
  const verifier = "work-owner-pkce-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  function authorizationUrl(candidateClientId = clientId, candidateRedirectUri = redirectUri) {
    const url = new URL(`${productionOrigin}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", candidateClientId);
    url.searchParams.set("redirect_uri", candidateRedirectUri);
    url.searchParams.set("state", "work-oauth-state");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", resource);
    url.searchParams.set("scope", "factory.read factory.prepare");
    return url;
  }

  try {
    const consentResponse = await mf.dispatchFetch(authorizationUrl(), { headers: ownerHeaders });
    const consentHtml = await consentResponse.text();
    assert.equal(consentResponse.status, 200);
    const nonce = consentHtml.match(/name="nonce" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);

    for (const rejectedRedirect of [
      "http://terminal.local:44402/callback/taI8_cm2QJRi",
      "http://terminal.local:44401/callback/not-the-server",
      "http://terminal.local.evil.example:44401/callback/taI8_cm2QJRi",
      "http://terminal.local:44401/callback/taI8_cm2QJRi?next=evil",
    ]) {
      const rejected = await mf.dispatchFetch(authorizationUrl(clientId, rejectedRedirect), { headers: ownerHeaders });
      assert.match(await rejected.text(), /OAUTH_REDIRECT_URI_NOT_ALLOWED/);
    }

    const unknownClient = await mf.dispatchFetch(authorizationUrl("youtube-ai-factory-v2-work-copy", redirectUri), {
      headers: ownerHeaders,
    });
    assert.match(await unknownClient.text(), /OAUTH_CLIENT_NOT_ALLOWED/);

    const approvalResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/authorize/approve`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nonce }),
      redirect: "manual",
    });
    assert.equal(approvalResponse.status, 303);
    const callback = new URL(approvalResponse.headers.get("location"));
    assert.equal(callback.origin + callback.pathname, redirectUri);
    const code = callback.searchParams.get("code");
    assert.ok(code);

    const tokenResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    const token = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.ok(token.access_token);

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
      fetch: (input, init) => mf.dispatchFetch(input, init),
    });
    const client = new Client({ name: "factory-work-oauth-test", version: "1.0.0" });
    await client.connect(transport);
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});
