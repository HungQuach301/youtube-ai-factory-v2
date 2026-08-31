import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Stage 10 edge fetch contract", () => {
  it("uses the edge-supported manual mode and rejects redirects", async () => {
    const source = await readFile(
      new URL("../../app/stage10-media.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('redirect: "manual"');
    expect(source).not.toContain('redirect: "error"');
    expect(source).toContain("response.status >= 300 && response.status < 400");
    expect(source).toContain("TRACK_G_STAGE_10_MEDIA_WORKER_REDIRECT_REJECTED");
  });
});
