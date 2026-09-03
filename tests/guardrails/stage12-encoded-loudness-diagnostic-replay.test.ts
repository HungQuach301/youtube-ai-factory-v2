import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const repo = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");

describe("Stage 12 encoded-loudness diagnostic replay boundary", () => {
  test("exposes one typed command and a GET/POST-only source/callback route", () => {
    const route = read("sites/control-plane/app/api/media-worker/stage12-encoded-loudness-diagnostic-replay/route.ts");
    const mcp = read("sites/control-plane/app/mcp/route.ts");
    expect(route).toMatch(/export async function GET/u);
    expect(route).toMatch(/export async function POST/u);
    expect(route).not.toMatch(/export async function PUT/u);
    expect(mcp).toMatch(/RUN_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY/u);
    expect(mcp).toMatch(/RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY/u);
  });

  test("worker replay is pinned, read-only and has no corrected-output upload", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const worker = read("packages/media-worker/container-entry.mjs");
    const smoke = read("packages/media-worker/stage12-diagnostic-replay-smoke.mjs");
    const workflow = read(".github/workflows/media-worker-image.yml");
    const start = runtime.indexOf("export async function executeStage12EncodedLoudnessDiagnosticReplay");
    const end = runtime.indexOf("\nexport ", start + 1);
    const replay = runtime.slice(start, end < 0 ? undefined : end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(replay).toMatch(/kind=source-ordinal-2/u);
    expect(replay).toMatch(/expectedWorkerImageDigest/u);
    expect(replay).toMatch(/correctedOutputUploaded: false/u);
    expect(replay).not.toMatch(/uploadPreMaster|method:\s*'PUT'/u);
    expect(worker).toMatch(/request\.url === '\/stage12\/encoded-loudness-diagnostic-replay'/u);
    expect(smoke).toMatch(/sourceReads !== 1 \|\| writes !== 0/u);
    expect(workflow).toMatch(/stage12-diagnostic-replay-smoke\.mjs/u);
  });

  test("migration 0030 seals separate append-only job/evidence without ordinal 4", () => {
    const migration = read("sites/control-plane/drizzle/0030_stage12_encoded_loudness_diagnostic_replay.sql");
    expect(migration).toMatch(/stage12_encoded_loudness_diagnostic_replay_job/u);
    expect(migration).toMatch(/stage12_encoded_loudness_diagnostic_replay_evidence/u);
    expect(migration).toMatch(/NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL/u);
    expect(migration).toMatch(/STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_IMMUTABLE/u);
    expect(migration).not.toMatch(/attempt_ordinal[^\n]*4|correction_ordinal[^\n]*4/u);
  });
});
