import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Stage 12 codec-safe true-peak shadow boundary", () => {
  test("exposes one typed command through a read-only source route", () => {
    const route = read(
      "sites/control-plane/app/api/media-worker/stage12-codec-safe-true-peak-shadow-replay/route.ts",
    );
    const mcp = read("sites/control-plane/app/mcp/route.ts");
    expect(route).toMatch(/kind"\) !== "codec-safe-source-ordinal-2"/u);
    expect(route).not.toMatch(/putImmutable|upload|PUT/u);
    expect(mcp).toMatch(/RUN_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY/u);
    expect(mcp).toMatch(/RUN STAGE 12 CODEC SAFE TRUE PEAK SHADOW REPLAY/u);
  });

  test("always renders each Opus candidate from one canonical lossless reference", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const start = runtime.indexOf(
      "export async function executeStage12CodecSafeTruePeakShadowReplay",
    );
    const end = runtime.indexOf("function stage12Receipt", start);
    const body = runtime.slice(start, end);
    expect(body).toMatch(/canonical-lossless-reference\.wav/u);
    expect(body).toMatch(/-c:a', 'pcm_f32le'/u);
    expect(body).toMatch(/renderStage12CodecSafeCandidate\(payload, losslessReferencePath/u);
    expect(body).not.toMatch(/putImmutable|uploadPreMaster|rename\(/u);
  });

  test("pins post-Opus feedback, worker provenance and disabled side effects", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const worker = read("packages/media-worker/container-entry.mjs");
    const domain = read("sites/control-plane/app/track-g-video-one.ts");
    const migration = read(
      "sites/control-plane/drizzle/0031_stage12_codec_safe_true_peak_shadow.sql",
    );
    expect(runtime).toMatch(/boundary: 'POST_OPUS_TRUE_PEAK_FEEDBACK'/u);
    expect(worker).toMatch(/codecSafeTruePeakShadowReady: stage12Ready\(\)/u);
    expect(worker).toMatch(/\/stage12\/codec-safe-true-peak-shadow-replay/u);
    expect(domain).toMatch(/diagnosticReplayEvidenceId/u);
    expect(domain).toMatch(/productionActivation: false/u);
    expect(migration).toMatch(/production_activation_executed[^\n]+DEFAULT 0/u);
    expect(migration).toMatch(/STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_EVIDENCE_IMMUTABLE/u);
  });

  test("does not introduce ordinal 4, attempt 4, provider or threshold drift", () => {
    const changed = [
      read("packages/media-worker/stage12-runtime.mjs"),
      read("sites/control-plane/app/track-g-video-one.ts"),
      read("sites/control-plane/drizzle/0031_stage12_codec_safe_true_peak_shadow.sql"),
    ].join("\n");
    expect(changed).not.toMatch(/correctionOrdinal:\s*4|correction_ordinal[^\n]*= 4/u);
    expect(changed).not.toMatch(/attemptOrdinal:\s*4|attempt_ordinal[^\n]*= 4/u);
    expect(changed).not.toMatch(/providerDispatch:\s*"ON"|provider_dispatch[^\n]*'ON'/u);
    expect(changed).toMatch(/integratedLufs: payload\.qa\.loudness\.integratedLufs/u);
    expect(changed).toMatch(/truePeakMaxDbtp: payload\.qa\.loudness\.truePeakMaxDbtp/u);
  });
});
