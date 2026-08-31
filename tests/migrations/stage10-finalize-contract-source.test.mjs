import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";

const domain = readFileSync(
  new URL("../../app/track-g-video-one.ts", import.meta.url),
  "utf8",
);

describe("Stage 10 finalize command contract", () => {
  test("uses the canonical run state accepted by the sealed D1 trigger", () => {
    assert.match(domain, /VALUES \(\?, 'FINALIZE_TRACK_G_VIDEO_1_STAGE_10',[\s\S]*?'TRACK_G_VIDEO_1_STAGE_10_READY',[\s\S]*?'TRACK_G_VIDEO_1_STAGE_11_READY'/u);
    assert.doesNotMatch(domain, /TRACK_G_VIDEO_1_STAGE_10_RECEIPT_READY/u);
  });
});
