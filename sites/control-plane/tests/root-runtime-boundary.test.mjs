import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("root Server Component delegates owner authorization to the Worker boundary", async () => {
  const [page, homeReadiness, ownerAuth, operatorRuntime, worker] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/home-readiness.ts"),
    source("../app/owner-auth.ts"),
    source("../app/operator-runtime.ts"),
    source("../worker/index.ts"),
  ]);

  assert.doesNotMatch(page, /from ["']\.\/operator-runtime["']/u);
  assert.match(page, /from ["']\.\/home-readiness["']/u);
  assert.doesNotMatch(page, /from ["']\.\/owner-auth["']/u);
  assert.doesNotMatch(page, /requireOwner/u);
  assert.doesNotMatch(homeReadiness, /operator-runtime|node:crypto|track-g-video-one|stage11-audio|voice-qualification/u);
  assert.match(ownerAuth, /FACTORY_OWNER_ALLOWLIST_UNCONFIGURED/u);
  assert.match(ownerAuth, /FACTORY_OWNER_AUTHORIZATION_DENIED/u);
  assert.match(operatorRuntime, /from ["']\.\/owner-auth["']/u);
  assert.match(worker, /authorizeOwnerPageRequest/u);
  assert.match(worker, /FACTORY_OWNER_ALLOWLIST_UNCONFIGURED/u);
  assert.match(worker, /FACTORY_OWNER_AUTHORIZATION_DENIED/u);
});
