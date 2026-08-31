import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("Stage 10 bounds TTS concurrency to two provider calls", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(source, /const TTS_BATCH_SIZE = 2\b/);
  assert.match(source, /offset \+= TTS_BATCH_SIZE/);
  assert.match(source, /slice\(offset, offset \+ TTS_BATCH_SIZE\)/);
});

test("Stage 10 observes all tournament takes in one WhisperX batch", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../scripts/whisperx-phoneme-observer.py", import.meta.url)),
    "utf8",
  );
  assert.match(source, /combined_audio = np\.concatenate\(clips\)/);
  assert.match(source, /model\.transcribe\(combined_audio, batch_size=8/);
  assert.equal(source.match(/model\.transcribe\(/g)?.length, 1);
  assert.equal(source.match(/whisperx\.align\(/g)?.length, 1);
});

test("Stage 10 replays one bounded worker execution per idempotency key", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(source, /const STAGE10_EXECUTION_CACHE_LIMIT = 8/);
  assert.match(source, /stage10Executions\.get\(payload\.idempotencyKey\)/);
  assert.match(source, /stage10Executions\.set\(payload\.idempotencyKey, execution\)/);
  assert.match(source, /stage10Executions\.delete\(payload\.idempotencyKey\)/);
  assert.match(source, /processStage10Idempotent\(validateStage10Payload/);
});

test("Stage 10 separates bounded start from durable receipt finalization", async () => {
  const worker = await readFile(
    fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)),
    "utf8",
  );
  const domain = await readFile(
    fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)),
    "utf8",
  );
  const callback = await readFile(
    fileURLToPath(new URL("../app/api/media-worker/stage10/route.ts", import.meta.url)),
    "utf8",
  );
  const flyConfig = await readFile(
    fileURLToPath(new URL("../packages/media-worker/fly.toml", import.meta.url)),
    "utf8",
  );
  assert.match(worker, /request\.url === '\/stage10\/start'/);
  assert.match(worker, /publishStage10Callback/);
  assert.match(worker, /publishStage10Failure/);
  assert.match(worker, /AbortSignal\.timeout\(TTS_REQUEST_TIMEOUT_MS\)/);
  assert.match(callback, /errorCode\?: string/);
  assert.match(callback, /jobStatus: "FAILED"/);
  assert.match(flyConfig, /min_machines_running = 1/);
  assert.match(domain, /START_TRACK_G_VIDEO_1_STAGE_10/);
  assert.match(domain, /FINALIZE_TRACK_G_VIDEO_1_STAGE_10/);
  assert.match(domain, /TRACK_G_STAGE_10_JOB_PENDING/);
  assert.match(domain, /STAGE_10_RETRYABLE_ERROR_CODES/);
  assert.match(domain, /attemptOrdinal/);
  assert.match(domain, /retryOfJobId/);
  assert.match(domain, /orderBy\(desc\(stage10MediaJobs\.attemptOrdinal\)\)/);
  assert.match(domain, /TRACK_G_STAGE_10_JOB_RETRY_NOT_ALLOWED/);
  assert.match(callback, /putImmutableProductionEvidence/);
  assert.match(callback, /state = 'READY'/);
});

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
    r2Buckets: ["BUCKET"],
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

function qualificationFixture() {
  const audio = Buffer.alloc(42);
  audio.write("fLaC", 0, "ascii");
  audio[4] = 0x80;
  audio[7] = 34;
  const sampleRate = 44_100n;
  const totalSamples = sampleRate * 30n;
  let streamInfo = (sampleRate << 44n) | (15n << 36n) | totalSamples;
  for (let index = 25; index >= 18; index -= 1) {
    audio[index] = Number(streamInfo & 0xffn);
    streamInfo >>= 8n;
  }
  const audioSha256 = createHash("sha256").update(audio).digest("hex");
  const embeddingJson = JSON.stringify({
    schemaVersion: 1,
    algorithm: "log-goertzel-voiceprint-v1",
    sourceAudioSha256: audioSha256,
    sampleRateHz: 16_000,
    frameSize: 400,
    hopSize: 160,
    dimensions: 64,
    vector: [1, ...Array(63).fill(0)],
  });
  const archetypes = [
    "high_energy_hook",
    "number_heavy_narration",
    "dense_mechanism",
    "authorization_clearing_settlement",
    "long_section_continuity",
    "causal_sfx_ambience",
    "music_transition",
    "silence_consequence_payoff",
  ];
  const providerEvidenceJson = JSON.stringify({
    schemaVersion: 1,
    state: "PROVIDER_GENERATED_PENDING_PERCEPTUAL_QA",
    namespace: "qualification",
    channelId: "ai-era-money-defense",
    voiceId: "KXyrWqXTuK63FlJ9XZ33",
    model: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
    voiceSettings: {
      stability: 0.7,
      similarityBoost: 0.75,
      style: 0,
      useSpeakerBoost: true,
      speed: 1.02,
    },
    settingsHash: "5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9",
    capabilityId: "tts-elevenlabs-ai-era-money-defense",
    capabilityVersion: "elevenlabs-tts-v1",
    actualCostUsd: 0.3195,
    maxCostUsd: 1.5,
    fingerprint: { durationSec: 30, sha256: "a".repeat(64) },
    generated: archetypes.map((archetype, index) => ({
      archetype,
      requestId: `qualification-request-${index + 1}`,
    })),
    productionEligible: false,
  });
  return {
    audioBase64: audio.toString("base64"),
    audioSha256,
    embeddingJson,
    embeddingSha256: createHash("sha256").update(embeddingJson).digest("hex"),
    providerEvidenceJson,
    providerEvidenceSha256: createHash("sha256").update(providerEvidenceJson).digest("hex"),
  };
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
      "advance_track_g_video_1_stage",
      "apply_track_g_video_1_stage_06_editorial_decision",
      "execute_track_g_video_1_stage_00",
      "finalize_track_g_video_1_stage_10",
      "finalize_track_g_video_1_stage_12",
      "get_factory_state",
      "prepare_approved_channel",
      "prepare_track_g_video_1_stage_04_tournament",
      "prepare_track_g_video_1_stage_06_script_review",
      "prepare_track_g_video_1_stage_07a_voice_tournament",
      "prepare_track_g_video_1_stage_09_visual_review",
      "register_qualified_voice",
      "select_track_g_video_1_stage_04_champion",
      "select_track_g_video_1_stage_07a_tone",
      "select_track_g_video_1_stage_09_thumbnail",
      "start_track_g_video_1_qualification",
      "start_track_g_video_1_stage_10",
      "start_track_g_video_1_stage_12",
    ]);

    const before = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(before.structuredContent.channelStatus, "NOT_PREPARED");
    assert.equal(before.structuredContent.episodeCount, 0);
    assert.equal(before.structuredContent.providerDispatch, "OFF");
    assert.deepEqual(before.structuredContent.activationBlockers, [
      "qualified_voice_fingerprint",
      "critic_qualification_and_real_calibration_evidence",
    ]);

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
    assert.deepEqual(prepared.structuredContent.activationBlockers, [
      "qualified_voice_fingerprint",
      "critic_qualification_and_real_calibration_evidence",
    ]);

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

test("registers approved voice evidence immutably and removes only the voice blocker", async () => {
  const { mf, d1 } = await createFactoryFixture("g02d-qualified-voice-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-voice-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await client.callTool({
      name: "prepare_approved_channel",
      arguments: {
        objective: "Prepare the approved channel before registering its owner-approved voice.",
        confirm: true,
      },
    });
    const evidence = qualificationFixture();
    const objective = "Register the owner-approved ElevenLabs voice and verify immutable qualification evidence.";
    const first = await client.callTool({
      name: "register_qualified_voice",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "APPROVE VOICE",
        ...evidence,
      },
    });
    assert.equal(first.isError, undefined, JSON.stringify(first));
    assert.equal(first.structuredContent.accepted, true);
    assert.equal(first.structuredContent.replayed, false);
    assert.equal(first.structuredContent.runStatus, "COMPLETED");
    assert.equal(first.structuredContent.currentStep, "VOICE_EVIDENCE_READ_BACK_VERIFIED");
    assert.equal(first.structuredContent.voiceFingerprintState, "QUALIFIED");
    assert.equal(first.structuredContent.voiceBindingCount, 8);
    assert.deepEqual(first.structuredContent.activationBlockers, [
      "critic_qualification_and_real_calibration_evidence",
    ]);
    assert.equal(first.structuredContent.providerDispatch, "OFF");
    assert.equal(first.structuredContent.autoPublish, "OFF");

    const replay = await client.callTool({
      name: "register_qualified_voice",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "APPROVE VOICE",
        ...evidence,
      },
    });
    assert.equal(replay.structuredContent.replayed, true);
    assert.equal(replay.structuredContent.voiceFingerprintState, "QUALIFIED");

    const fingerprint = await d1.prepare("SELECT * FROM voice_fingerprint_evidence").first();
    const bindingCount = await d1.prepare("SELECT count(*) AS count FROM voice_fingerprint_binding").first();
    const identity = await d1.prepare("SELECT version, approval_state FROM channel_identity_contract ORDER BY version DESC LIMIT 1").first();
    assert.equal(fingerprint.qualification_state, "QUALIFIED");
    assert.equal(fingerprint.audio_sha256, evidence.audioSha256);
    assert.equal(bindingCount.count, 8);
    assert.equal(identity.version, 2);
    assert.equal(identity.approval_state, "PERSISTED");

    const bucket = await mf.getR2Bucket("BUCKET");
    assert.ok(await bucket.get(fingerprint.audio_r2_key));
    assert.ok(await bucket.get(fingerprint.embedding_r2_key));
    assert.ok(await bucket.get(fingerprint.evidence_r2_key));
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

    const openIdMetadataResponse = await mf.dispatchFetch(`${productionOrigin}/.well-known/openid-configuration`);
    const openIdMetadata = await openIdMetadataResponse.json();
    assert.equal(openIdMetadataResponse.status, 200);
    assert.deepEqual(openIdMetadata, issuerMetadata);

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

    const discoveryId = "mcp-2026-discovery-probe";
    const discoveryResponse = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.access_token}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: discoveryId,
        method: "server/discover",
        params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
      }),
    });
    const discovery = await discoveryResponse.json();
    assert.equal(discoveryResponse.status, 200);
    assert.equal(discovery.id, discoveryId);
    assert.equal(discovery.error.code, -32601);

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
      "advance_track_g_video_1_stage",
      "apply_track_g_video_1_stage_06_editorial_decision",
      "execute_track_g_video_1_stage_00",
      "finalize_track_g_video_1_stage_10",
      "finalize_track_g_video_1_stage_12",
      "get_factory_state",
      "prepare_approved_channel",
      "prepare_track_g_video_1_stage_04_tournament",
      "prepare_track_g_video_1_stage_06_script_review",
      "prepare_track_g_video_1_stage_07a_voice_tournament",
      "prepare_track_g_video_1_stage_09_visual_review",
      "register_qualified_voice",
      "select_track_g_video_1_stage_04_champion",
      "select_track_g_video_1_stage_07a_tone",
      "select_track_g_video_1_stage_09_thumbnail",
      "start_track_g_video_1_qualification",
      "start_track_g_video_1_stage_10",
      "start_track_g_video_1_stage_12",
    ]);
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});

test("opens Video #1 in the bounded Track G qualification lane and replays idempotently", async () => {
  const { mf, d1 } = await createFactoryFixture("g02i1c-track-g-video-one-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-track-g-video-one-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await client.callTool({
      name: "prepare_approved_channel",
      arguments: {
        objective: "Prepare the approved channel before opening the first bounded Track G run.",
        confirm: true,
      },
    });
    const voiceEvidence = qualificationFixture();
    await client.callTool({
      name: "register_qualified_voice",
      arguments: {
        objective: "Register the approved voice before opening the first bounded Track G run.",
        confirm: true,
        ownerApprovalText: "APPROVE VOICE",
        ...voiceEvidence,
      },
    });

    const objective = "Open Video #1 in the bounded Track G qualification lane and stop before release or publish.";
    const first = await client.callTool({
      name: "start_track_g_video_1_qualification",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "START VIDEO 1 QUALIFICATION",
      },
    });
    assert.equal(first.isError, undefined, JSON.stringify(first));
    assert.equal(first.structuredContent.accepted, true);
    assert.equal(first.structuredContent.replayed, false);
    assert.equal(first.structuredContent.runStatus, "RUNNING");
    assert.equal(first.structuredContent.currentStep, "STAGE_00_READY");
    assert.equal(first.structuredContent.episodeStatus, "IN_PRODUCTION");
    assert.equal(first.structuredContent.profile, "REDUCED");
    assert.equal(first.structuredContent.assuranceMode, "WARNING_ONLY");
    assert.deepEqual(first.structuredContent.stageCodes, [
      "00", "01", "02", "03", "04", "05", "06", "07A",
      "07B", "08", "09", "10", "11", "12", "13", "14",
    ]);
    assert.equal(first.structuredContent.stopBeforeStage, "15");
    assert.equal(first.structuredContent.releaseEligible, false);
    assert.equal(first.structuredContent.providerDispatch, "OFF");
    assert.equal(first.structuredContent.autoPublish, "OFF");
    assert.match(first.structuredContent.bootstrapEvidenceSha256, /^[0-9a-f]{64}$/u);

    const replay = await client.callTool({
      name: "start_track_g_video_1_qualification",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "START VIDEO 1 QUALIFICATION",
      },
    });
    assert.equal(replay.structuredContent.replayed, true);
    assert.equal(replay.structuredContent.runId, first.structuredContent.runId);

    const stage00Objective = "Open the Production package, bind the approved brief, freeze Stage 00 and stop at Stage 01 readiness.";
    const stage00 = await client.callTool({
      name: "execute_track_g_video_1_stage_00",
      arguments: {
        objective: stage00Objective,
        confirm: true,
        ownerApprovalText: "START STAGE 00",
      },
    });
    assert.equal(stage00.isError, undefined, JSON.stringify(stage00));
    assert.equal(stage00.structuredContent.accepted, true);
    assert.equal(stage00.structuredContent.replayed, false);
    assert.equal(stage00.structuredContent.runId, first.structuredContent.runId);
    assert.equal(stage00.structuredContent.currentStep, "STAGE_01_READY");
    assert.equal(stage00.structuredContent.packageId, "package_track_g_video_1_v1");
    assert.equal(stage00.structuredContent.stageCode, "00");
    assert.equal(stage00.structuredContent.stageState, "FROZEN");
    assert.equal(stage00.structuredContent.artifactState, "SEALED");
    assert.equal(stage00.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.equal(stage00.structuredContent.videoCeilingUsd, 30);
    assert.equal(stage00.structuredContent.trackGCeilingUsd, 350);
    assert.equal(stage00.structuredContent.stageReservedUsd, 0);
    assert.equal(stage00.structuredContent.stageActualUsd, 0);
    assert.equal(stage00.structuredContent.providerDispatch, "OFF");
    assert.equal(stage00.structuredContent.releaseEligible, false);
    assert.equal(stage00.structuredContent.autoPublish, "OFF");

    const stage00Replay = await client.callTool({
      name: "execute_track_g_video_1_stage_00",
      arguments: {
        objective: stage00Objective,
        confirm: true,
        ownerApprovalText: "START STAGE 00",
      },
    });
    assert.equal(stage00Replay.structuredContent.replayed, true);
    assert.equal(stage00Replay.structuredContent.briefSha256, stage00.structuredContent.briefSha256);

    const contract = await d1.prepare("SELECT * FROM track_g_run_contract").first();
    assert.equal(contract.profile, "REDUCED");
    assert.equal(contract.assurance_mode, "WARNING_ONLY");
    assert.equal(contract.execution_namespace, "production");
    assert.equal(contract.release_eligible, 0);
    assert.equal(contract.provider_dispatch, 0);
    assert.equal(contract.auto_publish, 0);
    assert.equal(contract.stop_before_stage, "15");
    assert.equal(contract.preserve_rejected_candidates, 1);
    await assert.rejects(
      d1.prepare("UPDATE track_g_run_contract SET release_eligible = 1").run(),
      /TRACK_G_RUN_CONTRACT_APPEND_ONLY/u,
    );
    await assert.rejects(
      d1.prepare("DELETE FROM track_g_run_contract").run(),
      /TRACK_G_RUN_CONTRACT_APPEND_ONLY/u,
    );

    const episode = await d1.prepare("SELECT status FROM episode WHERE sequence = 1").first();
    assert.equal(episode.status, "IN_PRODUCTION");
    const stagePlan = JSON.parse(contract.stage_plan_json);
    assert.equal(stagePlan.includes("15"), false);
    assert.equal(stagePlan.includes("16"), false);

    const productionPackage = await d1.prepare("SELECT * FROM production_package").first();
    const brief = await d1.prepare("SELECT * FROM content_brief").first();
    const stageInstance = await d1.prepare("SELECT * FROM stage_instance").first();
    const stageArtifact = await d1.prepare("SELECT * FROM stage_artifact").first();
    const spendCeilings = await d1.prepare("SELECT * FROM spend_ceiling ORDER BY scope").all();
    assert.equal(productionPackage.namespace, "production");
    assert.equal(productionPackage.brief_hash, brief.canonical_hash);
    assert.equal(productionPackage.request_ceiling, 0);
    assert.equal(productionPackage.spend_ceiling_usd, 30);
    assert.equal(productionPackage.auto_dispatch, 0);
    assert.equal(productionPackage.auto_publish, 0);
    assert.equal(stageInstance.stage_code, "00");
    assert.equal(stageInstance.control_state, "FROZEN");
    assert.equal(stageArtifact.canonical_hash, brief.canonical_hash);
    assert.equal(stageArtifact.immutability_state, "SEALED");
    assert.equal(stageArtifact.eligibility_state, "ELIGIBLE_FOR_STAGE");
    assert.equal(spendCeilings.results.length, 4);

    const bucket = await mf.getR2Bucket("BUCKET");
    const productionEvidence = await bucket.get(stageArtifact.r2_key);
    assert.ok(productionEvidence);
    const productionEvidenceBytes = Buffer.from(await productionEvidence.arrayBuffer());
    assert.equal(createHash("sha256").update(productionEvidenceBytes).digest("hex"), brief.canonical_hash);
    await assert.rejects(
      d1.prepare("UPDATE stage_artifact SET eligibility_state = 'INELIGIBLE'").run(),
      /STAGE_ARTIFACT_APPEND_ONLY/u,
    );
    await assert.rejects(
      d1.prepare("UPDATE production_package SET auto_dispatch = 1").run(),
      /TRACK_G_PRODUCTION_PACKAGE_FAIL_CLOSED/u,
    );

    const evidence = await bucket.get(contract.bootstrap_evidence_r2_key);
    assert.ok(evidence);
    const evidenceBytes = Buffer.from(await evidence.arrayBuffer());
    assert.equal(createHash("sha256").update(evidenceBytes).digest("hex"), contract.bootstrap_evidence_sha256);

    const stage01Objective = "Produce the source-bound market and audience baseline, pass M0 and M1, and stop at Stage 02 readiness.";
    const stage01 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "01",
        objective: stage01Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage01.isError, undefined, JSON.stringify(stage01));
    assert.equal(stage01.structuredContent.accepted, true);
    assert.equal(stage01.structuredContent.replayed, false);
    assert.equal(stage01.structuredContent.runId, first.structuredContent.runId);
    assert.equal(stage01.structuredContent.currentStep, "STAGE_02_READY");
    assert.equal(stage01.structuredContent.stageCode, "01");
    assert.equal(stage01.structuredContent.stageState, "FROZEN");
    assert.equal(stage01.structuredContent.artifactType, "MARKET_AUDIENCE_INTELLIGENCE");
    assert.equal(stage01.structuredContent.artifactState, "SEALED");
    assert.equal(stage01.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage01.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_SOURCE_PROVENANCE", "PASS"],
      ["M1_AUDIENCE_JOB_LINT", "PASS"],
    ]);
    assert.equal(stage01.structuredContent.stageReservedUsd, 0);
    assert.equal(stage01.structuredContent.stageActualUsd, 0);
    assert.equal(stage01.structuredContent.humanGate, "NOT_REQUIRED");
    assert.equal(stage01.structuredContent.providerDispatch, "OFF");
    assert.equal(stage01.structuredContent.releaseEligible, false);
    assert.equal(stage01.structuredContent.autoPublish, "OFF");

    const stage01Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "01",
        objective: stage01Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage01Replay.structuredContent.replayed, true);
    assert.equal(stage01Replay.structuredContent.artifactSha256, stage01.structuredContent.artifactSha256);

    const stage01Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '01'").first();
    const stage01Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage01Instance.id).first();
    assert.equal(stage01Instance.control_state, "FROZEN");
    assert.equal(stage01Artifact.artifact_type, "MARKET_AUDIENCE_INTELLIGENCE");
    assert.equal(stage01Artifact.canonical_hash, stage01.structuredContent.artifactSha256);
    const stage01Evidence = await bucket.get(stage01Artifact.r2_key);
    assert.ok(stage01Evidence);
    const stage01EvidenceJson = JSON.parse(Buffer.from(await stage01Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage01EvidenceJson.researchMode, "SEALED_INTERNAL_PROVENANCE_ONLY");
    assert.deepEqual(stage01EvidenceJson.market.externalClaims, []);
    assert.equal(stage01EvidenceJson.controls.providerDispatch, "OFF");
    assert.equal(stage01EvidenceJson.budget.actualUsd, 0);

    const stage02Objective = "Seal the owner-approved reference set, run deterministic anti-copy measurements, and stop at Stage 03 readiness.";
    const stage02 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "02",
        objective: stage02Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage02.isError, undefined, JSON.stringify(stage02));
    assert.equal(stage02.structuredContent.accepted, true);
    assert.equal(stage02.structuredContent.replayed, false);
    assert.equal(stage02.structuredContent.currentStep, "STAGE_03_READY");
    assert.equal(stage02.structuredContent.stageCode, "02");
    assert.equal(stage02.structuredContent.stageState, "FROZEN");
    assert.equal(stage02.structuredContent.artifactType, "REFERENCE_ANTI_COPY");
    assert.equal(stage02.structuredContent.artifactState, "SEALED");
    assert.equal(stage02.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage02.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_ANTI_COPY", "PASS"],
      ["M1_DIFFERENTIATION", "PASS"],
    ]);
    assert.equal(stage02.structuredContent.stageReservedUsd, 0);
    assert.equal(stage02.structuredContent.stageActualUsd, 0);
    assert.equal(stage02.structuredContent.humanGate, "NOT_REQUIRED");
    assert.equal(stage02.structuredContent.providerDispatch, "OFF");
    assert.equal(stage02.structuredContent.releaseEligible, false);
    assert.equal(stage02.structuredContent.autoPublish, "OFF");

    const stage02Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "02",
        objective: stage02Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage02Replay.structuredContent.replayed, true);
    assert.equal(stage02Replay.structuredContent.artifactSha256, stage02.structuredContent.artifactSha256);

    const stage02Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '02'").first();
    const stage02Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage02Instance.id).first();
    assert.equal(stage02Instance.control_state, "FROZEN");
    assert.equal(stage02Artifact.artifact_type, "REFERENCE_ANTI_COPY");
    assert.equal(stage02Artifact.canonical_hash, stage02.structuredContent.artifactSha256);
    const stage02Evidence = await bucket.get(stage02Artifact.r2_key);
    assert.ok(stage02Evidence);
    const stage02EvidenceJson = JSON.parse(Buffer.from(await stage02Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage02EvidenceJson.referenceMode, "SEALED_OWNER_APPROVED_QUEUE_ONLY");
    assert.equal(stage02EvidenceJson.referenceSet.count, 9);
    assert.equal(stage02EvidenceJson.fourDimensionAntiCopy.lexicalSevenGram.maxSharedSevenGrams, 0);
    assert.equal(stage02EvidenceJson.fourDimensionAntiCopy.visualPHash.state, "DEFERRED_TO_STAGE_09");
    assert.equal(stage02EvidenceJson.fourDimensionAntiCopy.calibrationState, "WARNING_ONLY_UNCALIBRATED");
    assert.equal(stage02EvidenceJson.controls.providerDispatch, "OFF");
    assert.equal(stage02EvidenceJson.budget.actualUsd, 0);

    const stage03Objective = "Seal the federal source snapshots, build the claim graph and terminology ledger, pass advice and numeric gates, and stop at Stage 04 readiness.";
    const stage03 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "03",
        objective: stage03Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage03.isError, undefined, JSON.stringify(stage03));
    assert.equal(stage03.structuredContent.accepted, true);
    assert.equal(stage03.structuredContent.replayed, false);
    assert.equal(stage03.structuredContent.currentStep, "STAGE_04_READY");
    assert.equal(stage03.structuredContent.stageCode, "03");
    assert.equal(stage03.structuredContent.stageState, "FROZEN");
    assert.equal(stage03.structuredContent.artifactType, "TRUTH_CLAIM_GRAPH_TERMINOLOGY");
    assert.equal(stage03.structuredContent.artifactState, "SEALED");
    assert.equal(stage03.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage03.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_ADVICE_LINT", "PASS"],
      ["M0_CRITICAL_CLAIM_TIER", "PASS"],
      ["M1_NUMERIC_SCHEMA", "PASS"],
    ]);
    assert.equal(stage03.structuredContent.stageReservedUsd, 0);
    assert.equal(stage03.structuredContent.stageActualUsd, 0);
    assert.equal(stage03.structuredContent.humanGate, "NOT_REQUIRED");
    assert.equal(stage03.structuredContent.providerDispatch, "OFF");
    assert.equal(stage03.structuredContent.releaseEligible, false);
    assert.equal(stage03.structuredContent.autoPublish, "OFF");

    const stage03Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "03",
        objective: stage03Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage03Replay.structuredContent.replayed, true);
    assert.equal(stage03Replay.structuredContent.artifactSha256, stage03.structuredContent.artifactSha256);

    const stage03Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '03'").first();
    const stage03Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage03Instance.id).first();
    const truthSources = await d1.prepare("SELECT * FROM truth_source ORDER BY id").all();
    const truthClaims = await d1.prepare("SELECT * FROM truth_claim ORDER BY id").all();
    const truthClaimSources = await d1.prepare("SELECT * FROM truth_claim_source ORDER BY claim_id, source_id").all();
    const truthTerminology = await d1.prepare("SELECT * FROM truth_terminology ORDER BY id").all();
    assert.equal(stage03Instance.control_state, "FROZEN");
    assert.equal(stage03Artifact.artifact_type, "TRUTH_CLAIM_GRAPH_TERMINOLOGY");
    assert.equal(stage03Artifact.canonical_hash, stage03.structuredContent.artifactSha256);
    assert.equal(truthSources.results.length, 3);
    assert.equal(truthClaims.results.length, 6);
    assert.equal(truthClaimSources.results.length, 7);
    assert.equal(truthTerminology.results.length, 4);
    assert.ok(truthSources.results.every((source) => source.tier === 1));
    assert.ok(truthSources.results.every((source) => /^[0-9a-f]{64}$/u.test(source.content_hash)));
    const numericClaim = truthClaims.results.find((claim) => claim.id === "truth_claim_video_1_001");
    assert.deepEqual(JSON.parse(numericClaim.numeric_json), {
      amount: 3.5,
      currency: "USD",
      display: "$3.5 billion",
      observationPeriod: "2025",
      scale: "BILLION",
      sourceId: "truth_source_ftc_imposter_losses_2025_v1",
    });
    const stage03Evidence = await bucket.get(stage03Artifact.r2_key);
    assert.ok(stage03Evidence);
    const stage03EvidenceJson = JSON.parse(Buffer.from(await stage03Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage03EvidenceJson.researchMode, "BUILD_VERIFIED_FEDERAL_PRIMARY_SOURCES");
    assert.equal(stage03EvidenceJson.sources.length, 3);
    assert.equal(stage03EvidenceJson.claimGraph.claims.length, 6);
    assert.equal(stage03EvidenceJson.claimGraph.contradictions.length, 0);
    assert.equal(stage03EvidenceJson.adviceLint.adversarialFixtureCount, 31);
    assert.equal(stage03EvidenceJson.adviceLint.adversarialDetectedCount, 31);
    assert.equal(stage03EvidenceJson.numericSchema.numericClaimCount, 1);
    assert.equal(stage03EvidenceJson.controls.nextHumanGate, "STAGE_04_CHAMPION_SELECTION");
    for (const source of truthSources.results) {
      const sourceEvidence = await bucket.get(source.snapshot_r2_key);
      assert.ok(sourceEvidence);
      const sourceBytes = Buffer.from(await sourceEvidence.arrayBuffer());
      assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), source.content_hash);
    }
    await assert.rejects(
      d1.prepare("UPDATE truth_claim SET text = 'mutated'").run(),
      /TRUTH_CLAIM_APPEND_ONLY/u,
    );

    const directAdvanceBlocked = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "04",
        objective: "Verify that the stable runner cannot bypass the required Stage 04 owner champion decision.",
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(directAdvanceBlocked.isError, true);
    assert.match(directAdvanceBlocked.content[0].text, /TRACK_G_STAGE_04_HUMAN_GATE_COMMAND_REQUIRED/u);

    const stage04Objective = "Prepare two diverse Stage 04 creative routes, run three blind qualification critics, preserve both candidates and stop for the owner champion decision.";
    const stage04Prepared = await client.callTool({
      name: "prepare_track_g_video_1_stage_04_tournament",
      arguments: {
        objective: stage04Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 04 TOURNAMENT",
      },
    });
    assert.equal(stage04Prepared.isError, undefined, JSON.stringify(stage04Prepared));
    assert.equal(stage04Prepared.structuredContent.accepted, true);
    assert.equal(stage04Prepared.structuredContent.replayed, false);
    assert.equal(stage04Prepared.structuredContent.currentStep, "STAGE_04_READY");
    assert.equal(stage04Prepared.structuredContent.stageState, "RUNNING");
    assert.equal(stage04Prepared.structuredContent.tournamentState, "AWAITING_HUMAN");
    assert.equal(stage04Prepared.structuredContent.candidates.length, 2);
    assert.equal(stage04Prepared.structuredContent.candidates.filter((candidate) => candidate.machineRecommended).length, 1);
    assert.ok(stage04Prepared.structuredContent.candidates.every((candidate) => candidate.aggregateScore >= 92));
    assert.deepEqual(stage04Prepared.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_ROUTE_DIVERSITY", "PASS"],
      ["M1_PACKAGING_CONTRACT", "PASS"],
    ]);
    assert.equal(stage04Prepared.structuredContent.humanGate, "REQUIRED:HP-02_D1_CHAMPION_SELECTION");
    assert.equal(stage04Prepared.structuredContent.providerDispatch, "OFF");
    assert.equal(stage04Prepared.structuredContent.stageActualUsd, 0);

    const stage04PrepareReplay = await client.callTool({
      name: "prepare_track_g_video_1_stage_04_tournament",
      arguments: {
        objective: stage04Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 04 TOURNAMENT",
      },
    });
    assert.equal(stage04PrepareReplay.structuredContent.replayed, true);

    const stage04InstanceRunning = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '04'").first();
    const tournament = await d1.prepare("SELECT * FROM creative_tournament").first();
    const creativeCandidates = await d1.prepare("SELECT * FROM creative_route_candidate ORDER BY route_order").all();
    const creativeJudgments = await d1.prepare("SELECT * FROM creative_tournament_judgment ORDER BY critic_id, candidate_id").all();
    assert.equal(stage04InstanceRunning.control_state, "RUNNING");
    assert.equal(tournament.route_count, 2);
    assert.equal(tournament.critic_count, 3);
    assert.equal(creativeCandidates.results.length, 2);
    assert.equal(creativeJudgments.results.length, 6);
    assert.equal(new Set(creativeJudgments.results.map((judgment) => judgment.critic_id)).size, 3);
    assert.ok(creativeJudgments.results.every((judgment) => /^[0-9a-f]{64}$/u.test(judgment.blind_input_hash)));
    const candidateSetEvidence = await bucket.get(tournament.candidate_set_r2_key);
    assert.ok(candidateSetEvidence);
    const candidateSetJson = JSON.parse(Buffer.from(await candidateSetEvidence.arrayBuffer()).toString("utf8"));
    assert.equal(candidateSetJson.generation.providerCalls, 0);
    assert.equal(candidateSetJson.controls.preserveRejectedCandidates, true);
    assert.equal(candidateSetJson.blindJudgePayloads.length, 2);
    assert.ok(candidateSetJson.blindJudgePayloads.every((payload) => !("id" in payload) && !("routeName" in payload)));
    assert.ok(candidateSetJson.blindJudgePayloads.every((payload) => !JSON.stringify(payload).includes("provider")));
    await assert.rejects(
      d1.prepare("UPDATE creative_route_candidate SET route_name = 'mutated'").run(),
      /CREATIVE_CANDIDATE_APPEND_ONLY/u,
    );

    const selectedCandidate = stage04Prepared.structuredContent.candidates
      .find((candidate) => candidate.candidateId === "creative_route_video_1_safe_account_conveyor_v1");
    assert.ok(selectedCandidate);
    const rationale = "Choose the decision-tree route because it makes the irreversible money-movement pivot easier to understand and visualize for a household audience.";
    const stage04Selected = await client.callTool({
      name: "select_track_g_video_1_stage_04_champion",
      arguments: {
        candidateId: selectedCandidate.candidateId,
        rationale,
        confirm: true,
        ownerApprovalText: "SELECT STAGE 04 CHAMPION",
      },
    });
    assert.equal(stage04Selected.isError, undefined, JSON.stringify(stage04Selected));
    assert.equal(stage04Selected.structuredContent.accepted, true);
    assert.equal(stage04Selected.structuredContent.replayed, false);
    assert.equal(stage04Selected.structuredContent.currentStep, "STAGE_05_READY");
    assert.equal(stage04Selected.structuredContent.stageState, "FROZEN");
    assert.equal(stage04Selected.structuredContent.artifactType, "CREATIVE_ROUTE_TOURNAMENT_PACKAGING");
    assert.equal(stage04Selected.structuredContent.selectedCandidateId, selectedCandidate.candidateId);
    assert.equal(stage04Selected.structuredContent.preservedCandidateCount, 2);
    assert.equal(stage04Selected.structuredContent.humanGate, "SATISFIED:HP-02_D1_CHAMPION_SELECTION");
    assert.equal(stage04Selected.structuredContent.providerDispatch, "OFF");
    assert.equal(stage04Selected.structuredContent.stageActualUsd, 0);

    const stage04SelectionReplay = await client.callTool({
      name: "select_track_g_video_1_stage_04_champion",
      arguments: {
        candidateId: selectedCandidate.candidateId,
        rationale,
        confirm: true,
        ownerApprovalText: "SELECT STAGE 04 CHAMPION",
      },
    });
    assert.equal(stage04SelectionReplay.structuredContent.replayed, true);
    assert.equal(stage04SelectionReplay.structuredContent.artifactSha256, stage04Selected.structuredContent.artifactSha256);

    const stage04InstanceFrozen = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '04'").first();
    const stage04Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage04InstanceFrozen.id).first();
    const selection = await d1.prepare("SELECT * FROM creative_tournament_selection").first();
    const humanDecision = await d1.prepare("SELECT * FROM human_decision WHERE id = ?")
      .bind(selection.human_decision_id).first();
    assert.equal(stage04InstanceFrozen.control_state, "FROZEN");
    assert.equal(stage04Artifact.artifact_type, "CREATIVE_ROUTE_TOURNAMENT_PACKAGING");
    assert.equal(selection.candidate_id, selectedCandidate.candidateId);
    assert.equal(humanDecision.decision_type, "D1");
    assert.equal(humanDecision.rationale_text, rationale);
    const finalStage04Evidence = await bucket.get(stage04Artifact.r2_key);
    const humanDecisionEvidence = await bucket.get(humanDecision.diff_r2_key);
    assert.ok(finalStage04Evidence);
    assert.ok(humanDecisionEvidence);
    const finalStage04Json = JSON.parse(Buffer.from(await finalStage04Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(finalStage04Json.champion.candidateId, selectedCandidate.candidateId);
    assert.equal(finalStage04Json.champion.machineRecommended, false);
    assert.equal(finalStage04Json.candidateSet.preservedCandidateIds.length, 2);
    await assert.rejects(
      d1.prepare("UPDATE human_decision SET rationale_text = 'mutated'").run(),
      /HUMAN_DECISION_APPEND_ONLY/u,
    );

    const stage05Objective = "Seal the selected route's story architecture, assert a knowledge-state change for every beat, and persist the mandatory uncalibrated P9 prediction before Stage 06.";
    const stage05 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "05",
        objective: stage05Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage05.isError, undefined, JSON.stringify(stage05));
    assert.equal(stage05.structuredContent.accepted, true);
    assert.equal(stage05.structuredContent.replayed, false);
    assert.equal(stage05.structuredContent.currentStep, "STAGE_06_READY");
    assert.equal(stage05.structuredContent.stageCode, "05");
    assert.equal(stage05.structuredContent.stageState, "FROZEN");
    assert.equal(stage05.structuredContent.artifactType, "STORY_ARCHITECTURE_PREDICTION_SEAL");
    assert.equal(stage05.structuredContent.artifactState, "SEALED");
    assert.equal(stage05.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage05.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_BEAT_STATE_ASSERTION", "PASS"],
      ["M1_PREDICTION_SEALED", "PASS"],
    ]);
    assert.equal(stage05.structuredContent.stageReservedUsd, 0);
    assert.equal(stage05.structuredContent.stageActualUsd, 0);
    assert.equal(stage05.structuredContent.providerDispatch, "OFF");

    const stage05Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "05",
        objective: stage05Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage05Replay.structuredContent.replayed, true);
    assert.equal(stage05Replay.structuredContent.artifactSha256, stage05.structuredContent.artifactSha256);

    const stage05Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '05'").first();
    const stage05Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage05Instance.id).first();
    const prediction = await d1.prepare("SELECT * FROM predicted_performance").first();
    assert.equal(stage05Instance.control_state, "FROZEN");
    assert.equal(stage05Artifact.artifact_type, "STORY_ARCHITECTURE_PREDICTION_SEAL");
    assert.equal(prediction.package_id, "package_track_g_video_1_v1");
    assert.equal(prediction.model_version, "qualification-prior-v1-uncalibrated");
    assert.equal(prediction.canonical_hash, stage05.structuredContent.artifactSha256);
    assert.equal(JSON.parse(prediction.retention_curve_json).length, 7);
    assert.equal(JSON.parse(prediction.beat_risk_json).length, 6);
    const stage05Evidence = await bucket.get(stage05Artifact.r2_key);
    assert.ok(stage05Evidence);
    const stage05Json = JSON.parse(Buffer.from(await stage05Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage05Json.champion.candidateId, selectedCandidate.candidateId);
    assert.equal(stage05Json.storyArchitecture.beats.length, 6);
    assert.ok(stage05Json.storyArchitecture.beats.every((beat) => beat.knowledgeBefore !== beat.knowledgeAfter));
    assert.equal(stage05Json.predictedPerformance.calibrationState, "UNCALIBRATED_VIDEO_1_PRIOR");
    assert.equal(stage05Json.predictedPerformance.gatingUse, "STRUCTURAL_SEAL_ONLY");
    await assert.rejects(
      d1.prepare("UPDATE predicted_performance SET ctr_estimate = 0.99").run(),
      /PREDICTED_PERFORMANCE_APPEND_ONLY/u,
    );

    const directStage06Blocked = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "06",
        objective: "Verify that Stage 06 cannot bypass its required HP-02 editorial decision command path.",
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(directStage06Blocked.isError, true);
    assert.match(directStage06Blocked.content[0].text, /TRACK_G_STAGE_06_HUMAN_GATE_COMMAND_REQUIRED/u);

    const stage06Objective = "Prepare the complete claim-bound Stage 06 script, run the second advice lint, script lint and number trace, then stop for a substantive HP-02 editorial decision.";
    const stage06Prepared = await client.callTool({
      name: "prepare_track_g_video_1_stage_06_script_review",
      arguments: {
        objective: stage06Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 06 SCRIPT REVIEW",
      },
    });
    assert.equal(stage06Prepared.isError, undefined, JSON.stringify(stage06Prepared));
    assert.equal(stage06Prepared.structuredContent.accepted, true);
    assert.equal(stage06Prepared.structuredContent.replayed, false);
    assert.equal(stage06Prepared.structuredContent.currentStep, "STAGE_06_READY");
    assert.equal(stage06Prepared.structuredContent.stageState, "RUNNING");
    assert.equal(stage06Prepared.structuredContent.reviewState, "AWAITING_HUMAN");
    assert.equal(stage06Prepared.structuredContent.sections.length, 6);
    assert.ok(stage06Prepared.structuredContent.wordCount >= 700);
    assert.ok(stage06Prepared.structuredContent.estimatedDurationSec >= 420);
    assert.deepEqual(stage06Prepared.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_ADVICE_LINT_SECOND_PASS", "PASS"],
      ["M1_SCRIPT_LINT", "PASS"],
      ["M1_NUMBER_TRACE", "PASS"],
    ]);
    assert.equal(stage06Prepared.structuredContent.humanGate, "REQUIRED:HP-02_D2_OR_D4_EDITORIAL_DECISION");
    assert.equal(stage06Prepared.structuredContent.providerDispatch, "OFF");
    assert.equal(stage06Prepared.structuredContent.stageActualUsd, 0);

    const stage06PrepareReplay = await client.callTool({
      name: "prepare_track_g_video_1_stage_06_script_review",
      arguments: {
        objective: stage06Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 06 SCRIPT REVIEW",
      },
    });
    assert.equal(stage06PrepareReplay.structuredContent.replayed, true);
    assert.equal(stage06PrepareReplay.structuredContent.draftSha256,
      stage06Prepared.structuredContent.draftSha256);

    const stage06InstanceRunning = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '06'").first();
    const scriptDraft = await d1.prepare("SELECT * FROM script_draft").first();
    assert.equal(stage06InstanceRunning.control_state, "RUNNING");
    assert.equal(scriptDraft.advice_lint_state, "PASS");
    assert.equal(scriptDraft.script_lint_state, "PASS");
    assert.equal(scriptDraft.number_trace_state, "PASS");
    assert.equal(JSON.parse(scriptDraft.sections_json).length, 6);
    assert.equal(JSON.parse(scriptDraft.number_trace_json).length, 2);
    const workbenchResponse = await mf.dispatchFetch("http://localhost/api/operator", { headers: ownerHeaders });
    const workbenchSnapshot = await workbenchResponse.json();
    assert.equal(workbenchResponse.status, 200, JSON.stringify(workbenchSnapshot));
    assert.equal(workbenchSnapshot.trackGWorkbench.run.currentStep, "STAGE_06_READY");
    assert.equal(workbenchSnapshot.trackGWorkbench.stage06.reviewState, "AWAITING_HUMAN");
    assert.equal(workbenchSnapshot.trackGWorkbench.stage06.sections.length, 6);
    assert.deepEqual(workbenchSnapshot.trackGWorkbench.allowedActions,
      ["APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION"]);
    assert.equal(workbenchSnapshot.latestRunEvents[0].runId, workbenchSnapshot.trackGWorkbench.run.id);
    const scriptDraftEvidence = await bucket.get(scriptDraft.r2_key);
    assert.ok(scriptDraftEvidence);
    await assert.rejects(
      d1.prepare("UPDATE script_draft SET title = 'mutated'").run(),
      /SCRIPT_DRAFT_APPEND_ONLY/u,
    );

    const emptyEditorial = await client.callTool({
      name: "apply_track_g_video_1_stage_06_editorial_decision",
      arguments: {
        decisionType: "D2",
        revisedTitle: stage06Prepared.structuredContent.draftTitle,
        revisedHook: stage06Prepared.structuredContent.draftHook,
        rationale: "A substantive human-authored edit is required before the script may be sealed.",
        confirm: true,
        ownerApprovalText: "APPLY STAGE 06 EDITORIAL DECISION",
      },
    });
    assert.equal(emptyEditorial.isError, true);
    assert.match(emptyEditorial.content[0].text, /TRACK_G_STAGE_06_D2_SUBSTANTIVE_EDIT_REQUIRED/u);

    const revisedTitle = "The Bank Fraud Alert Is the Trap — Break Its Control";
    const revisedHook = "That fraud alert may not be protecting your account. It may be the first move in a process built to control your next decision.";
    const editorialRationale = "Use a more direct opening and title so the audience immediately understands that the alert channel itself is the mechanism of control.";
    const stage06ApiResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        commandType: "APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION",
        decisionType: "D2",
        revisedTitle,
        revisedHook,
        rationale: editorialRationale,
        confirm: true,
      }),
    });
    const stage06ApiApplied = await stage06ApiResponse.json();
    assert.equal(stage06ApiResponse.status, 201);
    assert.equal(stage06ApiApplied.accepted, true);
    assert.equal(stage06ApiApplied.replayed, false);
    assert.equal(stage06ApiApplied.currentStep, "STAGE_07A_READY");
    assert.equal(stage06ApiApplied.stageState, "FROZEN");
    assert.equal(stage06ApiApplied.decisionType, "D2");
    assert.equal(stage06ApiApplied.providerDispatch, "OFF");

    const stage06Applied = await client.callTool({
      name: "apply_track_g_video_1_stage_06_editorial_decision",
      arguments: {
        decisionType: "D2",
        revisedTitle,
        revisedHook,
        rationale: editorialRationale,
        confirm: true,
        ownerApprovalText: "APPLY STAGE 06 EDITORIAL DECISION",
      },
    });
    assert.equal(stage06Applied.isError, undefined, JSON.stringify(stage06Applied));
    assert.equal(stage06Applied.structuredContent.replayed, true);
    assert.equal(stage06Applied.structuredContent.currentStep, "STAGE_07A_READY");
    assert.equal(stage06Applied.structuredContent.artifactType, "SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL");
    assert.equal(stage06Applied.structuredContent.artifactState, "SEALED");
    assert.equal(stage06Applied.structuredContent.finalTitle, revisedTitle);
    assert.equal(stage06Applied.structuredContent.finalHook, revisedHook);
    assert.equal(stage06Applied.structuredContent.artifactSha256, stage06ApiApplied.artifactSha256);

    const stage06InstanceFrozen = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '06'").first();
    const stage06Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage06InstanceFrozen.id).first();
    const stage06Decision = await d1.prepare("SELECT * FROM human_decision WHERE artifact_after_id = ?")
      .bind(stage06Artifact.id).first();
    const allHumanDecisions = await d1.prepare("SELECT * FROM human_decision ORDER BY created_at").all();
    assert.equal(stage06InstanceFrozen.control_state, "FROZEN");
    assert.equal(stage06Artifact.artifact_type, "SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL");
    assert.equal(stage06Decision.decision_type, "D2");
    assert.equal(stage06Decision.rationale_text, editorialRationale);
    assert.equal(allHumanDecisions.results.length, 2);
    const finalStage06Evidence = await bucket.get(stage06Artifact.r2_key);
    const stage06DecisionEvidence = await bucket.get(stage06Decision.diff_r2_key);
    assert.ok(finalStage06Evidence);
    assert.ok(stage06DecisionEvidence);
    const finalStage06Json = JSON.parse(Buffer.from(await finalStage06Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(finalStage06Json.finalScript.title, revisedTitle);
    assert.equal(finalStage06Json.finalScript.hook, revisedHook);
    assert.equal(finalStage06Json.editorialDecision.decisionType, "D2");

    const directStage07ABlocked = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "07A",
        objective: "Verify that Stage 07A cannot bypass its required HP-02 D5 tone selection command path.",
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(directStage07ABlocked.isError, true);
    assert.match(directStage07ABlocked.content[0].text, /TRACK_G_STAGE_07A_HUMAN_GATE_COMMAND_REQUIRED/u);

    const stage07APrepareResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT",
        confirm: true }),
    });
    const stage07APreparedApi = await stage07APrepareResponse.json();
    assert.equal(stage07APrepareResponse.status, 201, JSON.stringify(stage07APreparedApi));
    assert.equal(stage07APreparedApi.currentStep, "STAGE_07A_READY");
    assert.equal(stage07APreparedApi.stageState, "RUNNING");
    assert.equal(stage07APreparedApi.candidateCount, 2);

    const stage07APrepared = await client.callTool({
      name: "prepare_track_g_video_1_stage_07a_voice_tournament",
      arguments: { objective: "Prepare two qualified voice routes and stop for the owner D5 tone decision.",
        confirm: true, ownerApprovalText: "PREPARE STAGE 07A VOICE TOURNAMENT" },
    });
    assert.equal(stage07APrepared.isError, undefined, JSON.stringify(stage07APrepared));
    assert.equal(stage07APrepared.structuredContent.replayed, true);
    assert.equal(stage07APrepared.structuredContent.candidates.length, 2);
    assert.equal(stage07APrepared.structuredContent.segmentCount, 6);
    assert.deepEqual(stage07APrepared.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_SEGMENTATION_BOUNDARY", "PASS"],
      ["M1_VOICE_SETTINGS_HASH", "PASS"],
    ]);
    const stage07AWorkbench = await (await mf.dispatchFetch("http://localhost/api/operator",
      { headers: ownerHeaders })).json();
    assert.equal(stage07AWorkbench.trackGWorkbench.stage07A.reviewState, "AWAITING_HUMAN");
    assert.equal(stage07AWorkbench.trackGWorkbench.stage07A.candidates.length, 2);
    assert.deepEqual(stage07AWorkbench.trackGWorkbench.allowedActions,
      ["SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE"]);

    const toneCandidate = stage07APrepared.structuredContent.candidates[0];
    const toneRationale = "Use controlled urgency because this audience needs the danger and the stop action to be unmistakable without sounding alarmist.";
    const stage07ASelectResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE",
        candidateId: toneCandidate.candidateId, rationale: toneRationale, confirm: true }),
    });
    const stage07ASelectedApi = await stage07ASelectResponse.json();
    assert.equal(stage07ASelectResponse.status, 201, JSON.stringify(stage07ASelectedApi));
    assert.equal(stage07ASelectedApi.currentStep, "STAGE_07B_READY");
    assert.equal(stage07ASelectedApi.stageState, "FROZEN");
    assert.equal(stage07ASelectedApi.decisionType, "D5");

    const stage07ASelected = await client.callTool({
      name: "select_track_g_video_1_stage_07a_tone",
      arguments: { candidateId: toneCandidate.candidateId, rationale: toneRationale,
        confirm: true, ownerApprovalText: "SELECT STAGE 07A TONE" },
    });
    assert.equal(stage07ASelected.isError, undefined, JSON.stringify(stage07ASelected));
    assert.equal(stage07ASelected.structuredContent.replayed, true);
    assert.equal(stage07ASelected.structuredContent.currentStep, "STAGE_07B_READY");
    assert.equal(stage07ASelected.structuredContent.artifactType, "VOICE_DESIGN_TTS_SEGMENTATION_SEAL");
    assert.equal(stage07ASelected.structuredContent.preservedCandidateCount, 2);
    const stage07AInstance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '07A'").first();
    const stage07AArtifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage07AInstance.id).first();
    const stage07ADecision = await d1.prepare("SELECT * FROM human_decision WHERE artifact_after_id = ?")
      .bind(stage07AArtifact.id).first();
    assert.equal(stage07AInstance.control_state, "FROZEN");
    assert.equal(stage07ADecision.decision_type, "D5");
    assert.ok(await bucket.get(stage07AArtifact.r2_key));
    assert.ok(await bucket.get(stage07ADecision.diff_r2_key));

    const stage07BWorkbench = await (await mf.dispatchFetch("http://localhost/api/operator",
      { headers: ownerHeaders })).json();
    assert.deepEqual(stage07BWorkbench.trackGWorkbench.allowedActions,
      ["ADVANCE_TRACK_G_VIDEO_1_STAGE_07B"]);
    assert.equal(stage07BWorkbench.trackGWorkbench.stage07B.controlState, "READY");
    assert.equal(stage07BWorkbench.trackGWorkbench.stage07B.assignments.length, 6);
    assert.deepEqual(stage07BWorkbench.trackGWorkbench.stage07B.distribution.map((entry) => entry.count),
      [2, 2, 2]);

    const stage07BResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "ADVANCE_TRACK_G_VIDEO_1_STAGE_07B", confirm: true }),
    });
    const stage07BApi = await stage07BResponse.json();
    assert.equal(stage07BResponse.status, 201, JSON.stringify(stage07BApi));
    assert.equal(stage07BApi.currentStep, "STAGE_08_READY");
    assert.equal(stage07BApi.stageState, "FROZEN");
    assert.equal(stage07BApi.gateResults.length, 2);

    const stage07BReplay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: { stageCode: "07B", objective: "Compile the sealed visual grammar and deterministic routing for all six beats.",
        confirm: true, ownerApprovalText: "ADVANCE TRACK G VIDEO 1" },
    });
    assert.equal(stage07BReplay.isError, undefined, JSON.stringify(stage07BReplay));
    assert.equal(stage07BReplay.structuredContent.replayed, true);
    assert.equal(stage07BReplay.structuredContent.currentStep, "STAGE_08_READY");
    assert.equal(stage07BReplay.structuredContent.artifactType, "VISUAL_GRAMMAR_ROUTING");
    assert.deepEqual(stage07BReplay.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_MOTION_CLASS_TOTAL", "PASS"],
      ["M1_ROUTE_DISTRIBUTION", "PASS"],
    ]);
    const stage07BInstance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '07B'").first();
    const stage07BArtifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage07BInstance.id).first();
    assert.equal(stage07BInstance.control_state, "FROZEN");
    assert.equal(stage07BArtifact.artifact_type, "VISUAL_GRAMMAR_ROUTING");
    assert.ok(await bucket.get(stage07BArtifact.r2_key));

    const stage08Workbench = await (await mf.dispatchFetch("http://localhost/api/operator",
      { headers: ownerHeaders })).json();
    assert.deepEqual(stage08Workbench.trackGWorkbench.allowedActions,
      ["ADVANCE_TRACK_G_VIDEO_1_STAGE_08"]);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.controlState, "READY");
    const compiledShotCount = stage08Workbench.trackGWorkbench.stage08.shots.length;
    assert.ok(compiledShotCount > 0);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.assertionCount, compiledShotCount * 3);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.targetFrames, 15300);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.shots[0].startFrame, 0);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.shots.at(-1).endFrame, 15300);
    assert.ok(stage08Workbench.trackGWorkbench.stage08.shots.every((shot) => shot.assertions.length === 3));

    const stage08Response = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "ADVANCE_TRACK_G_VIDEO_1_STAGE_08", confirm: true }),
    });
    const stage08Api = await stage08Response.json();
    assert.equal(stage08Response.status, 201, JSON.stringify(stage08Api));
    assert.equal(stage08Api.currentStep, "STAGE_09_READY");
    assert.equal(stage08Api.stageState, "FROZEN");
    assert.equal(stage08Api.shotCount, compiledShotCount);
    assert.equal(stage08Api.assertionCount, compiledShotCount * 3);
    assert.deepEqual(stage08Api.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_TIMELINE_LINT", "PASS"],
      ["M1_DURATION_MATCH", "PASS"],
    ]);

    const stage08Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: { stageCode: "08", objective: "Compile the frame-exact ShotCueProgram with three assertions per adaptive shot.",
        confirm: true, ownerApprovalText: "ADVANCE TRACK G VIDEO 1" },
    });
    assert.equal(stage08Replay.isError, undefined, JSON.stringify(stage08Replay));
    assert.equal(stage08Replay.structuredContent.replayed, true);
    assert.equal(stage08Replay.structuredContent.currentStep, "STAGE_09_READY");
    assert.equal(stage08Replay.structuredContent.artifactType, "SHOT_CUE_PROGRAM");
    const stage08Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '08'").first();
    const stage08Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage08Instance.id).first();
    assert.equal(stage08Instance.control_state, "FROZEN");
    assert.equal(stage08Artifact.artifact_type, "SHOT_CUE_PROGRAM");
    const stage08Evidence = await bucket.get(stage08Artifact.r2_key);
    assert.ok(stage08Evidence);
    const stage08EvidenceJson = JSON.parse(Buffer.from(await stage08Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage08EvidenceJson.shotCueProgram.shots.length, compiledShotCount);
    assert.ok(stage08EvidenceJson.shotCueProgram.shots.every((shot) => shot.assertions.length === 3));

    const stage09BeforeResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      headers: ownerHeaders,
    });
    const stage09Before = await stage09BeforeResponse.json();
    assert.equal(stage09Before.trackGWorkbench.stage09.reviewState, "NOT_PREPARED");
    assert.deepEqual(stage09Before.trackGWorkbench.allowedActions,
      ["PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW"]);

    const stage09PrepareResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW", confirm: true }),
    });
    const stage09Prepare = await stage09PrepareResponse.json();
    assert.equal(stage09PrepareResponse.status, 201, JSON.stringify(stage09Prepare));
    assert.equal(stage09Prepare.currentStep, "STAGE_09_READY");
    assert.equal(stage09Prepare.stageState, "RUNNING");
    assert.equal(stage09Prepare.reviewState, "AWAITING_HUMAN");
    assert.equal(stage09Prepare.assetCount, compiledShotCount);
    assert.equal(stage09Prepare.candidateCount, 2);
    assert.deepEqual(stage09Prepare.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_RIGHTS_LINEAGE", "PASS"],
      ["M1_SEMANTIC_FIT", "PASS"],
      ["M1_DUPLICATE_RATE", "PASS"],
    ]);

    const stage09WorkbenchResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      headers: ownerHeaders,
    });
    const stage09Workbench = await stage09WorkbenchResponse.json();
    const stage09Model = stage09Workbench.trackGWorkbench.stage09;
    assert.equal(stage09Model.reviewState, "AWAITING_HUMAN");
    assert.equal(stage09Model.assetCount, compiledShotCount);
    assert.equal(stage09Model.sourceCandidatesPerShot, 6);
    assert.equal(stage09Model.compositionsPerShot, 1);
    assert.equal(stage09Model.duplicateRate, 0);
    assert.ok(stage09Model.assets.every((asset) => asset.rightsLineage.state === "PASS"));
    assert.ok(stage09Model.assets.every((asset) => asset.semanticFit.state === "PASS"));
    assert.equal(new Set(stage09Model.assets.map((asset) => asset.visualFingerprint)).size,
      compiledShotCount);
    const selectedThumbnail = stage09Model.candidates.find((candidate) => candidate.machineRecommended);
    const thumbnailRationale = "This direct warning exposes the trust trap immediately while preserving a clear protective action.";
    const revisedThumbnailText = "THE WARNING IS THE TRAP";
    const stage09SelectResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL",
        confirm: true, candidateId: selectedThumbnail.candidateId,
        revisedThumbnailText, rationale: thumbnailRationale }),
    });
    const stage09Select = await stage09SelectResponse.json();
    assert.equal(stage09SelectResponse.status, 201, JSON.stringify(stage09Select));
    assert.equal(stage09Select.currentStep, "STAGE_10_READY");
    assert.equal(stage09Select.stageState, "FROZEN");
    assert.equal(stage09Select.decisionType, "D3");
    assert.equal(stage09Select.revisedThumbnailText, revisedThumbnailText);

    const stage09Replay = await client.callTool({
      name: "select_track_g_video_1_stage_09_thumbnail",
      arguments: { candidateId: selectedThumbnail.candidateId, revisedThumbnailText,
        rationale: thumbnailRationale, confirm: true,
        ownerApprovalText: "SELECT STAGE 09 THUMBNAIL" },
    });
    assert.equal(stage09Replay.isError, undefined, JSON.stringify(stage09Replay));
    assert.equal(stage09Replay.structuredContent.replayed, true);
    assert.equal(stage09Replay.structuredContent.currentStep, "STAGE_10_READY");
    assert.equal(stage09Replay.structuredContent.artifactType,
      "VISUAL_ACQUISITION_COMPOSITION_SEAL");
    const stage09Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '09'").first();
    const stage09Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage09Instance.id).first();
    assert.equal(stage09Instance.control_state, "FROZEN");
    assert.equal(stage09Artifact.artifact_type, "VISUAL_ACQUISITION_COMPOSITION_SEAL");
    const stage09Evidence = await bucket.get(stage09Artifact.r2_key);
    assert.ok(stage09Evidence);
    const stage09EvidenceJson = JSON.parse(Buffer.from(await stage09Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage09EvidenceJson.visualAcquisition.assets.length, compiledShotCount);
    assert.equal(stage09EvidenceJson.selectedThumbnail.thumbnailText, revisedThumbnailText);
    assert.equal(stage09EvidenceJson.controls.humanGate,
      "SATISFIED:HP-02_D3_THUMBNAIL_SELECTION");

    const stage10WorkbenchResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      headers: ownerHeaders,
    });
    const stage10Workbench = await stage10WorkbenchResponse.json();
    assert.deepEqual(stage10Workbench.trackGWorkbench.allowedActions,
      ["START_TRACK_G_VIDEO_1_STAGE_10"]);

    const unavailableStage10 = await client.callTool({
      name: "start_track_g_video_1_stage_10",
      arguments: { objective: "Verify Stage 10 remains fail-closed without its signed calibrated media worker.",
        confirm: true, ownerApprovalText: "START STAGE 10" },
    });
    assert.equal(unavailableStage10.isError, true);
    assert.match(unavailableStage10.content[0].text, /MEDIA_WORKER_URL_UNAVAILABLE/u);
    const stage10Rows = await d1.prepare(
      "SELECT count(*) AS count FROM stage_instance WHERE stage_code = '10'",
    ).first();
    assert.equal(stage10Rows.count, 0);
    const stage10Jobs = await d1.prepare("SELECT count(*) AS count FROM stage10_media_job").first();
    assert.equal(stage10Jobs.count, 0);

    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.trackGVideo1Status, "RUNNING");
    assert.equal(state.structuredContent.trackGVideo1CurrentStep, "STAGE_10_READY");
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    assert.equal(state.structuredContent.autoPublish, "OFF");
    assert.deepEqual(state.structuredContent.activationBlockers, [
      "critic_qualification_and_real_calibration_evidence",
    ]);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("fails closed when Video #1 is opened without a qualified voice", async () => {
  const { mf } = await createFactoryFixture("g02i1c-track-g-precondition-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-track-g-precondition-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await client.callTool({
      name: "prepare_approved_channel",
      arguments: {
        objective: "Prepare the approved channel before verifying the Video #1 precondition gate.",
        confirm: true,
      },
    });
    const blocked = await client.callTool({
      name: "start_track_g_video_1_qualification",
      arguments: {
        objective: "Attempt to open Video #1 without the required qualified voice evidence.",
        confirm: true,
        ownerApprovalText: "START VIDEO 1 QUALIFICATION",
      },
    });
    assert.equal(blocked.isError, true);
    assert.match(blocked.content[0].text, /TRACK_G_VOICE_NOT_QUALIFIED/u);
  } finally {
    await client.close().catch(() => {});
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
