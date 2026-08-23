import assert from "node:assert/strict";
import test from "node:test";

test("renders the canonical-source control plane", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /YouTube AI Factory V2/i);
  assert.match(html, /Single source of truth policy active/i);
  assert.match(html, /Production remains locked/i);
  assert.match(html, /19 evidence-ready · 22 implemented \/ 33/i);
  assert.match(html, /Lease &amp; Fencing/i);
  assert.match(html, /Definition of Ready Resolver/i);
  assert.match(html, /Standard &amp; Policy Registry/i);
  assert.match(html, /Evidence Store/i);
  assert.match(html, /Provider Adapter Framework/i);
  assert.match(html, /Cost Reservation &amp; Ledger/i);
  assert.match(html, /Two-phase reservation/i);
  assert.match(html, /Capability Registry &amp; Dispatch Guard/i);
  assert.match(html, /nine-step fail-closed guard/i);
  assert.match(html, /Stage Runner Framework/i);
  assert.match(html, /deterministic preflight/i);
  assert.match(html, /Tournament Engine/i);
  assert.match(html, /deterministic seeded selection/i);
  assert.match(html, /Media Worker Runtime/i);
  assert.match(html, /Pinned CPU-only image/i);
  assert.match(html, /Cost Benchmark/i);
  assert.match(html, /selected PROFILE=REDUCED/i);
  assert.match(html, /Deterministic Measurement/i);
  assert.match(html, /All 15 MSR-01 measurements/i);
  assert.match(html, /Gold Set &amp; Calibration/i);
  assert.match(html, /15 real rejected masters/i);
  assert.match(html, /Aligner Calibration/i);
  assert.match(html, /10–15 real human-reader samples/i);
  assert.match(html, /Truth Layer/i);
  assert.match(html, /Intelligence &amp; Anti-copy/i);
  assert.match(html, /ShotCueProgram Compiler/i);
  assert.match(html, /no fixed shot-count gate/i);
  assert.match(html, /Human Evidence/i);
  assert.match(html, /explicit real-human allowlist identity/i);
  assert.match(html, /Policy Defense · Minimum/i);
  assert.match(html, /minimum policy boundary implemented/i);
  assert.match(html, /WP-16, WP-17, WP-20 and minimum WP-29 are evidence-ready/i);
  assert.match(html, /Provider dispatch[\s\S]*OFF/i);
  assert.match(html, /Production spend[\s\S]*\$0/i);
  assert.match(html, /Automatic publishing[\s\S]*BLOCKED/i);
  assert.doesNotMatch(html, /codex-preview/i);
});
