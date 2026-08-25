import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";

const ownerHeaders = {
  "content-type": "application/json",
  "oai-authenticated-user-email": "owner@example.com",
  "oai-authenticated-user-full-name": "Factory%20Owner",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

test("executes PREPARE_CHANNEL idempotently against real local D1", async () => {
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
    d1Databases: { DB: "g01a-operator-test" },
    bindings: { FACTORY_OWNER_EMAIL: "owner@example.com" },
  });

  try {
    const d1 = await mf.getD1Database("DB");
    const migration = await readFile(new URL("../drizzle/0000_opposite_random.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      await d1.prepare(statement).run();
    }

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
