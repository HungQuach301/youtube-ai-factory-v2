import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  "utf8",
);

const ORDINAL_TWO_SHA256 =
  "163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2";
const TRUE_PEAK_PARENT_EVIDENCE_ID =
  "41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb";
const LRA_GUARD_PARENT_EVIDENCE_ID =
  "4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9";

function boundArgumentCount(source: string) {
  let count = source.trim() ? 1 : 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "\"" || character === "'" || character === "`") {
      quote = character;
    } else if (character === "(" || character === "[" || character === "{") {
      depth += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      count += 1;
    }
  }
  return count;
}

function preparedBinding(source: string, statementMarker: string) {
  const statement = source.indexOf(statementMarker);
  const prepare = source.lastIndexOf("getD1().prepare(`", statement);
  const sqlStart = prepare + "getD1().prepare(`".length;
  const sqlEnd = source.indexOf("`", sqlStart);
  const binding = /^\)\s*\.bind\(/u.exec(source.slice(sqlEnd + 1));
  if (statement < 0 || prepare < 0 || sqlEnd < 0 || !binding) {
    throw new Error(`Missing prepared binding: ${statementMarker}`);
  }
  const argsStart = sqlEnd + 1 + binding[0].length;
  let depth = 1;
  let quote: string | null = null;
  let argsEnd = argsStart;
  for (; argsEnd < source.length && depth > 0; argsEnd += 1) {
    const character = source[argsEnd];
    if (quote) {
      if (character === "\\") argsEnd += 1;
      else if (character === quote) quote = null;
    } else if (character === "\"" || character === "'" || character === "`") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    }
  }
  return { sql: source.slice(sqlStart, sqlEnd),
    args: source.slice(argsStart, argsEnd - 1) };
}

describe("Stage 12 codec-safe LRA feasibility-search boundary", () => {
  test("exposes the one typed owner command through an authenticated read-only source route", () => {
    const route = read(
      "sites/control-plane/app/api/media-worker/stage12-codec-safe-lra-feasibility-search/route.ts",
    );
    const mcp = read("sites/control-plane/app/mcp/route.ts");

    expect(route).toMatch(/codec-safe-lra-feasibility-source-ordinal-2/u);
    expect(route).toMatch(/export async function GET/u);
    expect(route).toMatch(/export async function POST/u);
    expect(route).not.toMatch(/putImmutable|upload|export async function PUT/u);
    expect(mcp).toMatch(/RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH/u);
    expect(mcp).toMatch(/RUN STAGE 12 CODEC SAFE LRA FEASIBILITY SEARCH/u);
  });

  test("keeps actual Sites callback SQL placeholders aligned with every bound value", () => {
    const domain = read("sites/control-plane/app/track-g-video-one.ts");
    for (const marker of [
      "INSERT INTO stage12_codec_safe_lra_feasibility_search_job",
      "INSERT INTO stage12_codec_safe_lra_feasibility_search_evidence",
      "UPDATE stage12_codec_safe_lra_feasibility_search_job SET state='READY'",
    ]) {
      const prepared = preparedBinding(domain, marker);
      expect(prepared.sql.match(/\?/gu)?.length ?? 0)
        .toBe(boundArgumentCount(prepared.args));
    }
    expect(domain).toMatch(
      /lastEvaluatedCandidateOrdinal:\s*evidence\.lastCandidateOrdinal/u,
    );
    expect(domain).toMatch(
      /verifiedCandidateOrdinal:\s*evidence\.verifiedCandidateOrdinal/u,
    );
    expect(domain).toMatch(
      /parentRenderKernelFingerprint:\s*evidence\.parentRenderKernelFingerprint/u,
    );
  });

  test("binds the immutable ordinal-two source and both exact parent evidence records", () => {
    const domain = read("sites/control-plane/app/track-g-video-one.ts");
    const migration = read(
      "sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql",
    );
    const changed = `${domain}\n${migration}`;

    expect(changed).toContain(ORDINAL_TWO_SHA256);
    expect(changed).toContain(TRUE_PEAK_PARENT_EVIDENCE_ID);
    expect(changed).toContain(LRA_GUARD_PARENT_EVIDENCE_ID);
    expect(changed).toMatch(/CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION/u);
  });

  test("renders every candidate from one canonical lossless source without an output path", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const start = runtime.indexOf(
      "export async function executeStage12CodecSafeLraFeasibilitySearch",
    );
    const end = runtime.indexOf("function stage12Receipt", start);
    const body = runtime.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/canonical-lossless-reference\.wav/u);
    expect(body).toMatch(/codec-safe-lra-feasibility-source-ordinal-2/u);
    expect(body).toMatch(/renderStage12CodecSafeCandidate\(payload, losslessReferencePath/u);
    expect(body).toMatch(/plan\.phase === 'FINAL_VERIFY'[\s\S]*candidatePaths\.get\(plan\.parentCandidateOrdinal\)/u);
    expect(body).toMatch(/plan\.phase === 'FINAL_VERIFY'[\s\S]*\} else \{[\s\S]*renderStage12CodecSafeCandidate/u);
    expect(body).toMatch(/candidatePaths\.set\(candidate\.candidateOrdinal, candidatePath\)/u);
    expect(body).toMatch(/encodedArtifactSha256:\s*sha256\(await readFile\(candidatePath\)\)/u);
    expect(body).not.toMatch(/putImmutable|uploadPreMaster|rename\(/u);
  });

  test("pins the six independent phase budgets and deterministic non-monotonic map", () => {
    const runtime = read("packages/media-worker/stage12-runtime.mjs");
    const policy = read(
      "packages/contracts/src/stage12-codec-safe-lra-feasibility.ts",
    );
    const policyMirror = read(
      "sites/control-plane/packages/contracts/src/stage12-codec-safe-lra-feasibility.ts",
    );
    const runtimePolicy = read(
      "packages/contracts/src/stage12-codec-safe-lra-feasibility-policy.mjs",
    );
    const runtimePolicyMirror = read(
      "sites/control-plane/packages/contracts/src/stage12-codec-safe-lra-feasibility-policy.mjs",
    );
    const controller = read(
      "packages/media-worker/stage12-codec-safe-lra-feasibility-controller.mjs",
    );
    const controllerMirror = read(
      "sites/control-plane/packages/media-worker/stage12-codec-safe-lra-feasibility-controller.mjs",
    );

    for (const phase of [
      "LRA_MAP",
      "TP_CONTAINMENT",
      "LUFS_TRIM",
      "POST_TRIM_STABILIZATION",
      "FINAL_VERIFY",
      "ROLLBACK_VERIFY",
    ]) {
      expect(controller).toContain(phase);
    }
    expect(controller).toMatch(/selectedGap|selectedLeft|mapDepth/u);
    expect(controller).not.toMatch(
      /BOUNDED_BISECTION[\s\S]*codec-safe-lra-feasibility-search-v1/u,
    );
    expect(policy).toEqual(policyMirror);
    expect(runtimePolicy).toEqual(runtimePolicyMirror);
    expect(controller).toEqual(controllerMirror);
    expect(runtimePolicy).toMatch(/macroDepthMinDb: 10\.9/u);
    expect(runtimePolicy).toMatch(/macroDepthMaxDb: 14/u);
    expect(runtimePolicy).toMatch(/lraMapBudget: 8/u);
    expect(runtimePolicy).toMatch(/truePeakContainmentBudget: 4/u);
    expect(runtimePolicy).toMatch(/lufsTrimBudget: 3/u);
    expect(runtimePolicy).toMatch(/postTrimStabilizationBudget: 2/u);
    expect(runtimePolicy).toMatch(/finalVerifyBudget: 1/u);
    expect(runtimePolicy).toMatch(/rollbackVerifyBudget: 1/u);
    expect(controller).toMatch(/sameFinalArtifact/u);
    expect(controller).toMatch(/function sameSignalReproduction/u);
    expect(controller).toMatch(/plan\.phase === 'FINAL_VERIFY'[\s\S]*sameFinalArtifact/u);
    expect(controller).toMatch(/else \{[\s\S]*sameSignalReproduction/u);
  });

  test("copies and resolves the shared runtime policy for root and Sites workers", async () => {
    const tsconfig = read("packages/contracts/tsconfig.json");
    expect(tsconfig).toMatch(/"allowJs":\s*true/u);
    expect(tsconfig).toMatch(/src\/\*\*\/\*\.mjs/u);
    expect(existsSync(new URL(
      "../../packages/contracts/dist/stage12-codec-safe-lra-feasibility-policy.mjs",
      import.meta.url,
    ))).toBe(true);

    const [rootPolicy, sitesPolicy, rootController, sitesController] = await Promise.all([
      import("../../packages/contracts/src/stage12-codec-safe-lra-feasibility-policy.mjs"),
      import("../../sites/control-plane/packages/contracts/src/stage12-codec-safe-lra-feasibility-policy.mjs"),
      import("../../packages/media-worker/stage12-codec-safe-lra-feasibility-controller.mjs"),
      import("../../sites/control-plane/packages/media-worker/stage12-codec-safe-lra-feasibility-controller.mjs"),
    ]);
    expect(rootPolicy.STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY)
      .toEqual(sitesPolicy.STAGE12_CODEC_SAFE_LRA_FEASIBILITY_POLICY);
    expect(typeof rootController.planStage12CodecSafeLraFeasibilityCandidate).toBe("function");
    expect(typeof sitesController.planStage12CodecSafeLraFeasibilityCandidate).toBe("function");
  });

  test("keeps the job and evidence append-only, shadow-only and inactive", () => {
    const schema = read("sites/control-plane/db/schema.ts");
    const migration = read(
      "sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql",
    );
    const worker = read("packages/media-worker/container-entry.mjs");

    expect(schema).toMatch(/stage12CodecSafeLraFeasibilitySearchJobs/u);
    expect(schema).toMatch(/stage12CodecSafeLraFeasibilitySearchEvidence/u);
    expect(migration).toMatch(/stage12_codec_safe_lra_feasibility_search_job/u);
    expect(migration).toMatch(/stage12_codec_safe_lra_feasibility_search_evidence/u);
    expect(migration).toMatch(/FEASIBILITY_SEARCH_JOB_IMMUTABLE/u);
    expect(migration).toMatch(/FEASIBILITY_SEARCH_EVIDENCE_IMMUTABLE/u);
    expect(migration).toMatch(/verified_candidate_ordinal/u);
    expect(migration).toMatch(/encodedArtifactSha256/u);
    expect(migration).toMatch(/macroDepthDb'\) NOT BETWEEN 10\.9 AND 14/u);
    expect(migration).toMatch(/macroDepthDb'\) <> 10\.70625/u);
    expect(migration).toMatch(/production_activation_executed[\s\S]*DEFAULT 0/u);
    expect(worker).toMatch(/codecSafeLraFeasibilitySearchReady: stage12Ready\(\)/u);
    expect(worker).toMatch(/\/stage12\/codec-safe-lra-feasibility-search/u);
  });

  test("does not create ordinal or attempt four, dispatch providers, upload output, or drift QA thresholds", () => {
    const changed = [
      read("packages/media-worker/stage12-runtime.mjs"),
      read("packages/media-worker/container-entry.mjs"),
      read("sites/control-plane/app/track-g-video-one.ts"),
      read(
        "sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql",
      ),
    ].join("\n");
    const rootThresholds = read("packages/contracts/src/thresholds.ts");
    const mirrorThresholds = read(
      "sites/control-plane/packages/contracts/src/thresholds.ts",
    );

    expect(changed).not.toMatch(/correctionOrdinal:\s*4|correction_ordinal[^\n]*= 4/u);
    expect(changed).not.toMatch(/attemptOrdinal:\s*4|attempt_ordinal[^\n]*= 4/u);
    expect(changed).not.toMatch(/providerDispatch:\s*["']ON["']|provider_dispatch[^\n]*'ON'/u);
    expect(changed).not.toMatch(/uploadCorrectedOutput:\s*true|corrected_output_uploaded[^\n]*= 1/u);
    expect(changed).not.toMatch(/calibration:\s*true|finalize:\s*true|releaseEligible:\s*true/u);
    expect(rootThresholds).toEqual(mirrorThresholds);
    expect(createHash("sha256").update(rootThresholds).digest("hex")).toBe(
      "ac91efcbba037881eac637e1c58a2c70c6133608b32549a3b713d19a5d1962c8",
    );
    expect(rootThresholds).toMatch(/LUFS_I: \{ target: -14, tolerance: 1 \}/u);
    expect(rootThresholds).toMatch(/TRUE_PEAK_MAX_DBTP: -1/u);
    expect(rootThresholds).toMatch(/LRA: \{ min: 4, max: 8 \}/u);
  });
});
