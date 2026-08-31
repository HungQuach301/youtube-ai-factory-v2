import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import {
  buildTrackGVideoOneStage12Request,
  validateTrackGVideoOneStage12Receipt,
} from "../../app/stage12-pre-master.js";

const migration = readFileSync(
  new URL("../../drizzle/0017_stage12_pre_master_qa.sql", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../../packages/media-worker/container-entry.mjs", import.meta.url),
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

const hex = (value: string) => value.repeat(64).slice(0, 64);

function passingReceipt() {
  return {
    accepted: true as const,
    imageDigest: `sha256:${hex("a")}`,
    preMaster: {
      r2Key: "prod/channel/episode/12/pre-master.webm",
      sha256: hex("b"),
      byteLength: 1234,
      frameMd5Sha256: hex("c"),
    },
    measurements: {
      scannedDurationSec: 510,
      blackFrameIntervalCount: 0,
      freezeFrameIntervalCount: 0,
      silenceIntervalCount: 0,
      missingFrameCount: 0,
      nearStaticViolationCount: 0,
      clippingSampleCount: 0,
      integratedLufs: -14,
      truePeakDbtp: -1.2,
      loudnessRangeLu: 6,
      avSyncOffsetMs: 0,
      mobileLegibilityPass: true,
      safeZonePass: true,
      timelineIssueCount: 0,
      debugOverlayCount: 0,
      watermarkCount: 0,
      templateResidueCount: 0,
      missingInputCount: 0,
      unresolvedRightsCount: 0,
      p0DefectCount: 0,
      width: 1920,
      height: 1080,
      fps: 30,
      colorPrimaries: "bt709",
    },
    reportSha256: hex("d"),
    renderAuthorized: true as const,
    providerCallCount: 0 as const,
    providerDispatch: "OFF" as const,
    autoPublish: "OFF" as const,
  };
}

describe("migration 0017 Stage 12 pre-master QA", () => {
  test("builds a sealed-input render request without provider or publish authority", () => {
    const request = buildTrackGVideoOneStage12Request({
      idempotencyKey: hex("e"),
      packageId: "package-track-g-video-1",
      stageInstanceId: "stage-12-track-g-video-1",
      durationSec: 510,
      narration: { r2Key: "prod/narration.mp3", sha256: hex("1") },
      stage09ArtifactSha256: hex("2"),
      stage11ArtifactSha256: hex("3"),
      rightsEvidenceSha256: hex("4"),
      shots: [{
        shotId: "shot-001", startFrame: 0, endFrame: 15300,
        headline: "The warning is the trap", background: "#071816",
        accent: "#71f6c5", signal: "#ffb84d",
      }],
      transcript: "The warning is the trap.",
    });
    expect(request.render.width).toBe(1920);
    expect(request.render.height).toBe(1080);
    expect(request.render.fps).toBe(30);
    expect(request.qa.scanStartSec).toBe(0);
    expect(request.qa.scanEndSec).toBe(510);
    expect(request.controls.providerDispatch).toBe("OFF");
    expect(request.controls.autoPublish).toBe("OFF");
  });

  test("authorizes render only when every deterministic gate passes", () => {
    expect(validateTrackGVideoOneStage12Receipt(passingReceipt(), 510).renderAuthorized).toBe(true);
    for (const mutation of [
      { blackFrameIntervalCount: 1 },
      { avSyncOffsetMs: 121 },
      { integratedLufs: -16 },
      { safeZonePass: false },
      { p0DefectCount: 1 },
      { scannedDurationSec: 509.9 },
      { unresolvedRightsCount: 1 },
    ]) {
      const receipt = passingReceipt();
      Object.assign(receipt.measurements, mutation);
      expect(() => validateTrackGVideoOneStage12Receipt(receipt, 510)).toThrow(
        /TRACK_G_STAGE_12_QA_FAILED/u,
      );
    }
  });

  test("database rejects non-authorized or incomplete Stage 12 QA rows", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`CREATE TABLE production_package (id text PRIMARY KEY);
      CREATE TABLE stage_instance (id text PRIMARY KEY);
      CREATE TABLE command_log (
        command_type text NOT NULL,
        prev_state text NOT NULL,
        next_state text NOT NULL
      );`);
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) db.exec(statement);
    }
    db.exec("INSERT INTO production_package (id) VALUES ('pkg')");
    db.exec("INSERT INTO stage_instance (id) VALUES ('s12')");
    const insert = db.prepare(`INSERT INTO stage12_pre_master_qa
      (id, package_id, stage_instance_id, job_id, pre_master_r2_key,
       pre_master_sha256, frame_md5_sha256, report_r2_key, report_sha256,
       measurements_json, render_authorized, provider_call_count, reserved_usd,
       actual_usd, created_at) VALUES (?, 'pkg', 's12', 'job', 'prod/pre.webm',
       ?, ?, 'prod/report.json', ?, ?, ?, 0, 0, 0, '2026-08-31T00:00:00Z')`);
    expect(() => insert.run("bad", hex("a"), hex("b"), hex("c"), JSON.stringify({ p0DefectCount: 0 }), 1))
      .toThrow();
    expect(() => insert.run(hex("a"), hex("b"), hex("c"), hex("d"), JSON.stringify({ p0DefectCount: 1 }), 1))
      .toThrow(/STAGE_12_QA_CONTRACT_VIOLATION/u);
    expect(() => insert.run(hex("a"), hex("b"), hex("c"), hex("d"), JSON.stringify({ p0DefectCount: 0 }), 0))
      .toThrow(/STAGE_12_QA_CONTRACT_VIOLATION/u);
  });

  test("exposes durable start/finalize and keeps publishing disabled", () => {
    expect(worker).toMatch(/MEDIA_STAGE12_ENABLED/u);
    expect(worker).toMatch(/\/stage12\/start/u);
    expect(worker).toMatch(/stage12Ready/u);
    expect(operatorRoute).toMatch(/START_TRACK_G_VIDEO_1_STAGE_12/u);
    expect(operatorRoute).toMatch(/FINALIZE_TRACK_G_VIDEO_1_STAGE_12/u);
    expect(operatorClient).toMatch(/Stage 12 pre-master QA/u);
    expect(operatorClient).toMatch(/autoPublish: "OFF"/u);
  });
});
