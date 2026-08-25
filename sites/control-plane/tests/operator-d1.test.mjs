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
  const migration = await readFile(new URL("../drizzle/0000_opposite_random.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    await d1.prepare(statement).run();
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
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
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
