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
  assert.match(html, /9 \/ 33 work packages/i);
  assert.match(html, /Lease &amp; Fencing/i);
  assert.match(html, /Definition of Ready Resolver/i);
  assert.match(html, /Standard &amp; Policy Registry/i);
  assert.match(html, /Evidence Store/i);
  assert.match(html, /Provider Adapter Framework/i);
  assert.match(html, /Cost Reservation &amp; Ledger/i);
  assert.match(html, /Two-phase reservation/i);
  assert.match(html, /Capability Registry &amp; Dispatch Guard/i);
  assert.match(html, /nine-step dispatch guard/i);
  assert.doesNotMatch(html, /codex-preview/i);
});
