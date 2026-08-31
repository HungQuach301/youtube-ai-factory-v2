import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "vitest";

import { AUDIO } from "../../packages/contracts/src/thresholds.js";
import { buildTrackGVideoOneStage11AudioPlan } from "../../app/stage11-audio.js";

const migration = readFileSync(
  new URL("../../drizzle/0016_stage11_ambience_only.sql", import.meta.url),
  "utf8",
);
const operatorRoute = readFileSync(
  new URL("../../app/api/operator/route.ts", import.meta.url),
  "utf8",
);
const operatorClient = readFileSync(
  new URL("../../app/operate/operator-client.tsx", import.meta.url),
  "utf8",
);

function applyMigration(db: DatabaseSync) {
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    db.exec(statement);
  }
}

function insertPlan(db: DatabaseSync, overrides: Record<string, unknown> = {}) {
  const values = {
    id: "plan-1",
    mode: "ambience_only",
    cues: JSON.stringify({ cues: [{ kind: "AMBIENCE", assetId: "procedural://room-tone",
      monetizationAllowed: true, licenseEvidenceHash: "b".repeat(64) }] }),
    passes: JSON.stringify({ passes: [{ pass: 1 }, { pass: 2 }] }),
    providerCallCount: 0,
    ...overrides,
  };
  db.prepare(`INSERT INTO stage11_audio_plan
    (id, package_id, stage_instance_id, mode, narration_sha256, cue_program_json,
     rights_evidence_sha256, loudnorm_plan_json, ducking_filter, provider_call_count,
     reserved_usd, actual_usd, evidence_r2_key, evidence_sha256, created_at)
    VALUES (?, 'package-1', 'stage-11', ?, ?, ?, ?, ?, 'sidechaincompress', ?, 0, 0,
      'prod/stage11/evidence.json', ?, '2026-08-31T00:00:00.000Z')`)
    .run(values.id, values.mode, "a".repeat(64), values.cues, "b".repeat(64),
      values.passes, values.providerCallCount, "c".repeat(64));
}

describe("migration 0016 Stage 11 ambience-only", () => {
  test("builds one deterministic zero-provider plan from centralized AUDIO thresholds", () => {
    const plan = buildTrackGVideoOneStage11AudioPlan(600, "a".repeat(64));
    const replay = buildTrackGVideoOneStage11AudioPlan(600, "a".repeat(64));
    assert.deepEqual(plan, replay);
    assert.equal(plan.mode, "ambience_only");
    assert.equal(plan.providerCallCount, 0);
    assert.equal(plan.actualUsd, 0);
    assert.equal(plan.cues.some((cue) => (cue.kind as string) === "MUSIC"), false);
    assert.equal(plan.loudnormPlan.length, 2);
    assert.equal(plan.loudnessTarget.integratedLufs, AUDIO.LUFS_I.target);
    assert.equal(plan.loudnessTarget.truePeakMaxDbtp, AUDIO.TRUE_PEAK_MAX_DBTP);
    assert.deepEqual(plan.gateResults.map((gate) => gate.gate),
      ["M0_MUSIC_LICENSE", "M1_LOUDNESS_BALANCE_PLAN"]);
  });

  test("rejects MUSIC cues and non-zero provider dispatch at the D1 boundary", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE production_package (id text PRIMARY KEY NOT NULL);
      CREATE TABLE stage_instance (id text PRIMARY KEY NOT NULL);
      INSERT INTO production_package (id) VALUES ('package-1');
      INSERT INTO stage_instance (id) VALUES ('stage-11');`);
    applyMigration(db);
    insertPlan(db);
    assert.throws(() => insertPlan(db, { id: "music-plan",
      cues: JSON.stringify({ cues: [{ kind: "MUSIC", assetId: "external://track",
        monetizationAllowed: true, licenseEvidenceHash: "b".repeat(64) }] }) }),
    /STAGE_11_AUDIO_CONTRACT_VIOLATION/u);
    assert.throws(() => insertPlan(db, { id: "paid-plan", providerCallCount: 1 }),
      /CHECK constraint failed/u);
  });

  test("exposes the same Stage 11 command through Operator and keeps publishing off", () => {
    assert.match(operatorRoute, /ADVANCE_TRACK_G_VIDEO_1_STAGE_11/u);
    assert.match(operatorRoute, /stageCode: "11"/u);
    assert.match(operatorRoute, /providerDispatch: "OFF"/u);
    assert.match(operatorRoute, /autoPublish: "OFF"/u);
    assert.match(operatorClient, /Seal Stage 11 ambience plan/u);
    assert.match(operatorClient, /does not render the master, call a media provider, release, or publish/u);
  });
});
