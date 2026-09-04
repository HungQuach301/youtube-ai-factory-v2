import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Stage 12 codec-safe LRA guard shadow boundary", () => {
  test("exposes one typed command through an authenticated read-only source route", () => {
    const route = read(
      "sites/control-plane/app/api/media-worker/stage12-codec-safe-lra-guard-shadow-replay/route.ts",
    );
    const mcp = read("sites/control-plane/app/mcp/route.ts");
    expect(route).toMatch(/kind"\) !== "codec-safe-lra-guard-source-ordinal-2"/u);
    expect(route).toMatch(/export async function GET/u);
    expect(route).toMatch(/export async function POST/u);
    expect(route).not.toMatch(/putImmutable|upload|export async function PUT/u);
    expect(mcp).toMatch(/RUN_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY/u);
    expect(mcp).toMatch(/RUN STAGE 12 CODEC SAFE LRA GUARD SHADOW REPLAY/u);
  });

  test("reproduces the parent anchor and renders every candidate from one lossless source", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const start = runtime.indexOf(
      "export async function executeStage12CodecSafeLraGuardShadowReplay",
    );
    const end = runtime.indexOf("function stage12Receipt", start);
    const body = runtime.slice(start, end);
    expect(body).toMatch(/canonical-lossless-reference\.wav/u);
    expect(body).toMatch(/kind=codec-safe-lra-guard-source-ordinal-2/u);
    expect(body).toMatch(/canonicalize\(losslessReference\)[\s\S]*parentLosslessReference/u);
    expect(body).toMatch(/planStage12CodecSafeLraGuardCandidate/u);
    expect(body).toMatch(/renderStage12CodecSafeCandidate\(payload, losslessReferencePath/u);
    expect(body).not.toMatch(/putImmutable|uploadPreMaster|rename\(/u);
  });

  test("pins bounded bisection, nearest-boundary trim and regression rollback", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const thresholds = read("packages/contracts/src/thresholds.ts");
    expect(runtime).toMatch(/lraSearch: 'BOUNDED_BISECTION'/u);
    expect(runtime).toMatch(/integratedTrim: 'NEAREST_INTERIOR_BOUNDARY'/u);
    expect(runtime).toMatch(/regression: 'ROLLBACK_TO_BEST_SAFE'/u);
    expect(runtime).toMatch(/targetStepLufs = last\.targetStepLufs \/ 2/u);
    expect(runtime).toMatch(/macroDepthDb: lraGuardRound\(\(bracketLowDepthDb \+ bracketHighDepthDb\) \/ 2\)/u);
    expect(thresholds).toMatch(/MAX_CANDIDATES: 8/u);
    expect(thresholds).toMatch(/CODEC_OVERSHOOT_REGRESSION_MAX_DB: 0\.25/u);
    expect(thresholds).toMatch(/INTEGRATED_BOUNDARY_MARGIN_LU: 0\.05/u);
    expect(thresholds).toMatch(/MAX_INTEGRATED_TARGET_STEP_LU: 0\.25/u);
  });

  test("pins runtime/render lineage and keeps all activation side effects disabled", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const worker = read("packages/media-worker/container-entry.mjs");
    const domain = read("sites/control-plane/app/track-g-video-one.ts");
    const schema = read("sites/control-plane/db/schema.ts");
    const migration = read(
      "sites/control-plane/drizzle/0032_stage12_codec_safe_lra_guard_shadow.sql",
    );
    expect(runtime).toMatch(/STAGE12_CODEC_SAFE_LRA_GUARD_RUNTIME_DRIFT/u);
    expect(runtime).toMatch(/parentRenderRuntimeFingerprint/u);
    expect(worker).toMatch(/codecSafeLraGuardShadowReady: stage12Ready\(\)/u);
    expect(worker).toMatch(/\/stage12\/codec-safe-lra-guard-shadow-replay/u);
    expect(domain).toMatch(/parentShadowEvidenceId/u);
    expect(domain).toMatch(/productionActivation: false/u);
    expect(schema).toMatch(/stage12CodecSafeLraGuardShadowEvidence/u);
    expect(migration).toMatch(/CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION/u);
    expect(migration).toMatch(/STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_IMMUTABLE/u);
    expect(migration).toMatch(/production_activation_executed[\s\S]*DEFAULT 0/u);
  });

  test("keeps the typed job and evidence INSERT arity exact", () => {
    const domain = read("sites/control-plane/app/track-g-video-one.ts");
    const jobStart = domain.indexOf(
      "INSERT INTO stage12_codec_safe_lra_guard_shadow_job",
    );
    const evidenceStart = domain.indexOf(
      "INSERT INTO stage12_codec_safe_lra_guard_shadow_evidence",
    );
    const jobSql = domain.slice(jobStart, domain.indexOf("`).bind(", jobStart));
    const evidenceSql = domain.slice(
      evidenceStart, domain.indexOf("`).bind(", evidenceStart),
    );
    expect(jobStart).toBeGreaterThan(-1);
    expect(evidenceStart).toBeGreaterThan(-1);
    expect(jobSql.match(/\?/gu)).toHaveLength(26);
    expect(evidenceSql.match(/\?/gu)).toHaveLength(45);
  });

  test("does not alter ordinal 2/3, create ordinal 4/attempt 4, call providers or drift thresholds", () => {
    const changed = [
      read("packages/media-worker/stage12-runtime.mjs"),
      read("sites/control-plane/app/track-g-video-one.ts"),
      read("sites/control-plane/drizzle/0032_stage12_codec_safe_lra_guard_shadow.sql"),
    ].join("\n");
    const rootThresholds = read("packages/contracts/src/thresholds.ts");
    const mirrorThresholds = read("sites/control-plane/packages/contracts/src/thresholds.ts");
    expect(changed).not.toMatch(/correctionOrdinal:\s*4|correction_ordinal[^\n]*= 4/u);
    expect(changed).not.toMatch(/attemptOrdinal:\s*4|attempt_ordinal[^\n]*= 4/u);
    expect(changed).not.toMatch(/providerDispatch:\s*"ON"|provider_dispatch[^\n]*'ON'/u);
    expect(changed).not.toMatch(/uploadCorrectedOutput:\s*true|corrected_output_uploaded[^\n]*= 1/u);
    expect(rootThresholds).toEqual(mirrorThresholds);
    expect(rootThresholds).toMatch(/LUFS_I: \{ target: -14, tolerance: 1 \}/u);
    expect(rootThresholds).toMatch(/TRUE_PEAK_MAX_DBTP: -1/u);
    expect(rootThresholds).toMatch(/LRA: \{ min: 4, max: 8 \}/u);
  });
});
