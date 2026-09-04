import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function canonicalTestValue(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalTestValue).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key.normalize("NFC"))}:${canonicalTestValue(value[key])}`).join(",")}}`;
}

function canonicalTestSha256(value) {
  return createHash("sha256").update(canonicalTestValue(value)).digest("hex");
}

test("Stage 10 bounds TTS concurrency to two provider calls", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(source, /const TTS_BATCH_SIZE = 2\b/);
  assert.match(source, /offset \+= TTS_BATCH_SIZE/);
  assert.match(source, /slice\(offset, offset \+ TTS_BATCH_SIZE\)/);
});

test("Stage 10 observes all tournament takes in one WhisperX batch", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../scripts/whisperx-phoneme-observer.py", import.meta.url)),
    "utf8",
  );
  assert.match(source, /combined_audio = np\.concatenate\(clips\)/);
  assert.match(source, /model\.transcribe\(combined_audio, batch_size=8/);
  assert.equal(source.match(/model\.transcribe\(/g)?.length, 1);
  assert.equal(source.match(/whisperx\.align\(/g)?.length, 1);
});

test("Stage 10 replays one bounded worker execution per idempotency key", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(source, /const STAGE10_EXECUTION_CACHE_LIMIT = 8/);
  assert.match(source, /stage10Executions\.get\(payload\.idempotencyKey\)/);
  assert.match(source, /stage10Executions\.set\(payload\.idempotencyKey, execution\)/);
  assert.match(source, /stage10Executions\.delete\(payload\.idempotencyKey\)/);
  assert.match(source, /processStage10Idempotent\(validateStage10Payload/);
});

test("Stage 10 separates bounded start from durable receipt finalization", async () => {
  const worker = await readFile(
    fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)),
    "utf8",
  );
  const domain = await readFile(
    fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)),
    "utf8",
  );
  const callback = await readFile(
    fileURLToPath(new URL("../app/api/media-worker/stage10/route.ts", import.meta.url)),
    "utf8",
  );
  const flyConfig = await readFile(
    fileURLToPath(new URL("../packages/media-worker/fly.toml", import.meta.url)),
    "utf8",
  );
  assert.match(worker, /request\.url === '\/stage10\/start'/);
  assert.match(worker, /publishStage10Callback/);
  assert.match(worker, /publishStage10Failure/);
  assert.match(worker, /AbortSignal\.timeout\(TTS_REQUEST_TIMEOUT_MS\)/);
  assert.match(callback, /errorCode\?: string/);
  assert.match(callback, /jobStatus: "FAILED"/);
  assert.match(flyConfig, /min_machines_running = 1/);
  assert.match(domain, /START_TRACK_G_VIDEO_1_STAGE_10/);
  assert.match(domain, /FINALIZE_TRACK_G_VIDEO_1_STAGE_10/);
  assert.match(domain, /TRACK_G_STAGE_10_JOB_PENDING/);
  assert.match(domain, /STAGE_10_RETRYABLE_ERROR_CODES/);
  assert.match(domain, /attemptOrdinal/);
  assert.match(domain, /retryOfJobId/);
  assert.match(domain, /orderBy\(desc\(stage10MediaJobs\.attemptOrdinal\)\)/);
  assert.match(domain, /TRACK_G_STAGE_10_JOB_RETRY_NOT_ALLOWED/);
  assert.match(callback, /putImmutableProductionEvidence/);
  assert.match(callback, /state = 'READY'/);
});

test("Stage 12 derives command idempotency from one hydrated preflight", async () => {
  const domain = await readFile(
    fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)),
    "utf8",
  );
  const mcpRoute = await readFile(
    fileURLToPath(new URL("../app/mcp/route.ts", import.meta.url)),
    "utf8",
  );
  const operatorRoute = await readFile(
    fileURLToPath(new URL("../app/api/operator/route.ts", import.meta.url)),
    "utf8",
  );
  const startWrapper = domain.slice(
    domain.indexOf("export async function startTrackGVideoOneStage12WithDerivedIdempotency"),
    domain.indexOf("async function readBackStage12("),
  );
  const finalizeWrapper = domain.slice(
    domain.indexOf("export async function finalizeTrackGVideoOneStage12WithDerivedIdempotency"),
    domain.indexOf("export async function advanceTrackGVideoOneStage("),
  );
  assert.equal(startWrapper.match(/prepareStage12StartAttempt\(\)/g)?.length, 1);
  assert.equal(finalizeWrapper.match(/readBackStage12Job\(\)/g)?.length, 1);
  for (const route of [mcpRoute, operatorRoute]) {
    assert.match(route, /startTrackGVideoOneStage12WithDerivedIdempotency/);
    assert.match(route, /finalizeTrackGVideoOneStage12WithDerivedIdempotency/);
    assert.doesNotMatch(route, /trackGVideoOneStage12StartIdempotencyKey/);
    assert.doesNotMatch(route, /trackGVideoOneStage12FinalizeIdempotencyKey/);
  }
});

test("Stage 12 verifies its renderer and permits a bounded third runtime attempt", async () => {
  const [dockerfile, worker, runtime, smoke, audioSmoke, domain, schema, migration,
    qaMigration, diagnosticRetryMigration, correctedMigration, audioP0Migration,
    audioP0RetryMigration, loudnessFailureMigration, diagnosticRoute,
    remediationRoute, audioP0Route, mcpRoute] = await Promise.all([
    readFile(fileURLToPath(new URL("../packages/media-worker/Dockerfile", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../packages/media-worker/stage12-runtime.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../packages/media-worker/stage12-render-smoke.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../packages/media-worker/stage12-audio-smoke.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../db/schema.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0020_stage12_attempt_three.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0023_stage12_qa_evidence.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0024_stage12_diagnostic_callback_retry.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0025_stage12_corrected_pre_master.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0026_stage12_audio_p0_correction.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0028_stage12_audio_p0_correction_ordinal_three.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0029_stage12_encoded_loudness_failure_observability.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/api/media-worker/stage12-diagnostic/route.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/api/media-worker/stage12-remediation/route.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/api/media-worker/stage12-audio-p0-correction/route.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/mcp/route.ts", import.meta.url)), "utf8"),
  ]);
  assert.match(dockerfile, /fonts-dejavu-core/);
  assert.match(dockerfile, /test -r \/usr\/share\/fonts\/truetype\/dejavu\/DejaVuSans-Bold\.ttf/);
  assert.match(worker, /stage12FontVerified: existsSync\(STAGE12_FONT_PATH\)/);
  assert.match(runtime, /STAGE12_RENDER_FAILED/);
  assert.match(runtime, /overlay=x='mod\(t\*\$\{scanSpeed\}\\\\,W\+w\)-w'.*eval=frame/u);
  assert.match(smoke, /STAGE12_RENDER_SMOKE_PASS/);
  assert.match(audioSmoke, /STAGE12_AUDIO_SMOKE_PASS/);
  assert.match(runtime, /correctStage12EncodedLoudness/u);
  assert.match(worker, /request\.url === '\/stage12\/diagnostic'/u);
  assert.match(domain, /STAGE_12_RETRYABLE_ERROR_CODES/);
  assert.match(domain, /orderBy\(desc\(stage12MediaJobs\.attemptOrdinal\)\)/);
  assert.match(domain, /TRACK_G_STAGE_12_JOB_RETRY_NOT_ALLOWED/);
  assert.match(schema, /stage12_media_job_package_attempt_unique/);
  assert.match(migration, /STAGE12_RETRY_CONTRACT_VIOLATION/);
  assert.match(migration, /attempt_ordinal` BETWEEN 1 AND 3/);
  assert.match(qaMigration, /stage12_qa_evidence_immutable_update/u);
  assert.match(qaMigration, /STAGE12_QA_DIAGNOSTIC_SOURCE_NOT_ELIGIBLE/u);
  assert.match(diagnosticRetryMigration, /STAGE12_QA_DIAGNOSTIC_TERMINAL_IMMUTABLE/u);
  assert.match(diagnosticRetryMigration, /STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT/u);
  assert.match(correctedMigration, /stage12_corrected_pre_master_lineage_insert/u);
  assert.match(correctedMigration, /STAGE12_CORRECTED_PRE_MASTER_TERMINAL_IMMUTABLE/u);
  assert.match(audioP0Migration, /stage12_audio_p0_correction_lineage_insert/u);
  assert.match(audioP0Migration, /STAGE12_AUDIO_P0_CORRECTION_TERMINAL_IMMUTABLE/u);
  assert.match(audioP0RetryMigration, /stage12_audio_p0_correction_ordinal3_lineage_insert/u);
  assert.match(audioP0RetryMigration, /STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_TERMINAL_IMMUTABLE/u);
  assert.match(loudnessFailureMigration, /stage12_audio_p0_correction_failure_evidence_insert/u);
  assert.match(loudnessFailureMigration, /STAGE12_ENCODED_LOUDNESS_FAILURE_EVIDENCE_IMMUTABLE/u);
  assert.match(diagnosticRoute, /readTrackGVideoOneStage12DiagnosticPreMaster/u);
  assert.match(remediationRoute, /storeTrackGVideoOneStage12CorrectedPreMaster/u);
  assert.match(audioP0Route, /storeTrackGVideoOneStage12AudioP0CorrectedPreMaster/u);
  assert.match(runtime, /executeStage12Remediation/u);
  assert.match(runtime, /compand=attacks=/u);
  assert.match(worker, /request\.url === '\/stage12\/remediate'/u);
  assert.match(worker, /request\.url === '\/stage12\/audio-p0-correct'/u);
  assert.match(runtime, /executeStage12AudioP0Correction/u);
  assert.match(runtime, /STAGE12_ENCODED_LOUDNESS_UNRESOLVED/u);
  assert.match(runtime, /measurementsByPass/u);
  assert.match(worker, /failureDiagnostic: stage12EncodedLoudnessFailureDiagnostic/u);
  assert.match(domain, /encodedLoudnessFailure/u);
  assert.match(domain, /correctedFrameMd5Sha256/u);
  assert.match(domain, /const useAudioP0Correction =/u);
  assert.match(domain, /audioP0CorrectionJobId: audioP0Correction!\.id/u);
  assert.match(domain, /verifyStage12DiagnosticPreMasterPointer/u);
  assert.match(domain, /diagnosticJob\.targetDurationSec/u);
  assert.match(domain, /generation: false/u);
  assert.match(domain, /providerDispatch: "OFF"/u);
  assert.match(domain, /autoPublish: "OFF"/u);
  assert.match(mcpRoute, /commandType === "SCAN_STAGE_12_ATTEMPT_3"/u);
  assert.match(mcpRoute, /commandType === "CREATE_STAGE_12_CORRECTED_PREMASTER"/u);
  assert.match(mcpRoute, /commandType === "CREATE_STAGE_12_AUDIO_P0_CORRECTION"/u);
  assert.match(mcpRoute, /execute_factory_command/u);
});

test("Stage 12 encoded-loudness replay is separate, pinned and read-only at the object route", async () => {
  const [runtime, worker, domain, schema, migration, route, mcpRoute] = await Promise.all([
    readFile(fileURLToPath(new URL("../packages/media-worker/stage12-runtime.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../db/schema.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0030_stage12_encoded_loudness_diagnostic_replay.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/api/media-worker/stage12-encoded-loudness-diagnostic-replay/route.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/mcp/route.ts", import.meta.url)), "utf8"),
  ]);
  assert.match(runtime, /executeStage12EncodedLoudnessDiagnosticReplay/u);
  assert.match(runtime, /kind=source-ordinal-2/u);
  assert.match(runtime, /correctedOutputUploaded: false/u);
  assert.match(worker, /\/stage12\/encoded-loudness-diagnostic-replay/u);
  assert.match(worker, /encodedLoudnessDiagnosticReplayReady: stage12Ready\(\)/u);
  assert.match(domain, /stage12EncodedLoudnessDiagnosticReplaySource/u);
  assert.match(domain, /readStage12MediaWorkerHealth/u);
  assert.match(schema, /stage12EncodedLoudnessDiagnosticReplayEvidence/u);
  assert.match(migration, /NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL/u);
  assert.match(migration, /STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_IMMUTABLE/u);
  assert.match(route, /export async function GET/u);
  assert.match(route, /export async function POST/u);
  assert.doesNotMatch(route, /export async function PUT/u);
  assert.match(mcpRoute, /RUN_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY/u);
  assert.match(mcpRoute, /RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY/u);
});

test("Stage 12 codec-safe true-peak engine remains shadow-only and lossless-source based", async () => {
  const [runtime, worker, domain, schema, migration, route, mcpRoute, workflow] =
    await Promise.all([
      readFile(fileURLToPath(new URL("../packages/media-worker/stage12-runtime.mjs", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../db/schema.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../drizzle/0031_stage12_codec_safe_true_peak_shadow.sql", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../app/api/media-worker/stage12-codec-safe-true-peak-shadow-replay/route.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../app/mcp/route.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../.github/workflows/media-worker-image.yml", import.meta.url)), "utf8"),
    ]);
  assert.match(runtime, /executeStage12CodecSafeTruePeakShadowReplay/u);
  assert.match(runtime, /canonical-lossless-reference\.wav/u);
  assert.match(runtime, /POST_OPUS_TRUE_PEAK_FEEDBACK/u);
  assert.match(runtime, /renderStage12CodecSafeCandidate\(payload, losslessReferencePath/u);
  assert.match(worker, /codecSafeTruePeakShadowReady: stage12Ready\(\)/u);
  assert.match(worker, /\/stage12\/codec-safe-true-peak-shadow-replay/u);
  assert.match(domain, /stage12CodecSafeTruePeakShadowSource/u);
  assert.match(domain, /diagnosticReplayEvidenceId/u);
  assert.match(schema, /stage12CodecSafeTruePeakShadowEvidence/u);
  assert.match(migration, /CODEC_SAFE_SHADOW_NOT_CORRECTION/u);
  assert.match(migration, /production_activation_executed/u);
  assert.match(migration, /STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_EVIDENCE_IMMUTABLE/u);
  assert.match(route, /export async function GET/u);
  assert.match(route, /export async function POST/u);
  assert.doesNotMatch(route, /export async function PUT/u);
  assert.match(mcpRoute, /RUN_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY/u);
  assert.match(workflow, /stage12-codec-safe-true-peak-shadow-smoke\.mjs/u);
});

test("Stage 12 codec-safe LRA guard remains bounded, pinned and shadow-only", async () => {
  const [runtime, worker, domain, schema, migration, route, mcpRoute] = await Promise.all([
    readFile(fileURLToPath(new URL("../packages/media-worker/stage12-runtime.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../packages/media-worker/container-entry.mjs", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/track-g-video-one.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../db/schema.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../drizzle/0032_stage12_codec_safe_lra_guard_shadow.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/api/media-worker/stage12-codec-safe-lra-guard-shadow-replay/route.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../app/mcp/route.ts", import.meta.url)), "utf8"),
  ]);
  assert.match(runtime, /executeStage12CodecSafeLraGuardShadowReplay/u);
  assert.match(runtime, /anchor: 'PRIOR_SHADOW_CANDIDATE_PASS_1'/u);
  assert.match(runtime, /lraSearch: 'BOUNDED_BISECTION'/u);
  assert.match(runtime, /integratedTrim: 'NEAREST_INTERIOR_BOUNDARY'/u);
  assert.match(runtime, /regression: 'ROLLBACK_TO_BEST_SAFE'/u);
  assert.match(worker, /codecSafeLraGuardShadowReady: stage12Ready\(\)/u);
  assert.match(worker, /\/stage12\/codec-safe-lra-guard-shadow-replay/u);
  assert.match(domain, /parentShadowEvidenceId/u);
  assert.match(domain, /parentRenderRuntimeFingerprint/u);
  assert.match(schema, /stage12CodecSafeLraGuardShadowEvidence/u);
  assert.match(migration, /CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION/u);
  assert.match(migration, /STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_IMMUTABLE/u);
  assert.match(route, /export async function GET/u);
  assert.match(route, /export async function POST/u);
  assert.doesNotMatch(route, /export async function PUT/u);
  assert.match(mcpRoute, /RUN_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY/u);
  assert.match(mcpRoute, /RUN STAGE 12 CODEC SAFE LRA GUARD SHADOW REPLAY/u);
});

const ownerHeaders = {
  "content-type": "application/json",
  "oai-authenticated-user-email": "owner@example.com",
  "oai-authenticated-user-full-name": "Factory%20Owner",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

async function createFactoryFixture(databaseName, bindings = { FACTORY_OWNER_EMAIL: "owner@example.com" }) {
  const serverRoot = fileURLToPath(new URL("../dist/server", import.meta.url));
  const entries = await readdir(serverRoot, { recursive: true, withFileTypes: true });
  const modulePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => resolve(entry.parentPath, entry.name));
  const entryPath = resolve(serverRoot, "index.js");
  const orderedPaths = [entryPath, ...modulePaths.filter((path) => path !== entryPath)];
  const modules = await Promise.all(orderedPaths.map(async (path) => ({
    type: "ESModule",
    path: relative(serverRoot, path),
    contents: await readFile(path, "utf8"),
  })));
  const mf = new Miniflare({
    modules,
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: databaseName },
    r2Buckets: ["BUCKET"],
    bindings,
  });
  const d1 = await mf.getD1Database("DB");
  const migrationRoot = fileURLToPath(new URL("../drizzle", import.meta.url));
  const migrations = (await readdir(migrationRoot))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const migrationName of migrations) {
    const migration = await readFile(resolve(migrationRoot, migrationName), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      await d1.prepare(statement).run();
    }
  }
  return { mf, d1 };
}

function qualificationFixture() {
  const audio = Buffer.alloc(42);
  audio.write("fLaC", 0, "ascii");
  audio[4] = 0x80;
  audio[7] = 34;
  const sampleRate = 44_100n;
  const totalSamples = sampleRate * 30n;
  let streamInfo = (sampleRate << 44n) | (15n << 36n) | totalSamples;
  for (let index = 25; index >= 18; index -= 1) {
    audio[index] = Number(streamInfo & 0xffn);
    streamInfo >>= 8n;
  }
  const audioSha256 = createHash("sha256").update(audio).digest("hex");
  const embeddingJson = JSON.stringify({
    schemaVersion: 1,
    algorithm: "log-goertzel-voiceprint-v1",
    sourceAudioSha256: audioSha256,
    sampleRateHz: 16_000,
    frameSize: 400,
    hopSize: 160,
    dimensions: 64,
    vector: [1, ...Array(63).fill(0)],
  });
  const archetypes = [
    "high_energy_hook",
    "number_heavy_narration",
    "dense_mechanism",
    "authorization_clearing_settlement",
    "long_section_continuity",
    "causal_sfx_ambience",
    "music_transition",
    "silence_consequence_payoff",
  ];
  const providerEvidenceJson = JSON.stringify({
    schemaVersion: 1,
    state: "PROVIDER_GENERATED_PENDING_PERCEPTUAL_QA",
    namespace: "qualification",
    channelId: "ai-era-money-defense",
    voiceId: "KXyrWqXTuK63FlJ9XZ33",
    model: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
    voiceSettings: {
      stability: 0.7,
      similarityBoost: 0.75,
      style: 0,
      useSpeakerBoost: true,
      speed: 1.02,
    },
    settingsHash: "5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9",
    capabilityId: "tts-elevenlabs-ai-era-money-defense",
    capabilityVersion: "elevenlabs-tts-v1",
    actualCostUsd: 0.3195,
    maxCostUsd: 1.5,
    fingerprint: { durationSec: 30, sha256: "a".repeat(64) },
    generated: archetypes.map((archetype, index) => ({
      archetype,
      requestId: `qualification-request-${index + 1}`,
    })),
    productionEligible: false,
  });
  return {
    audioBase64: audio.toString("base64"),
    audioSha256,
    embeddingJson,
    embeddingSha256: createHash("sha256").update(embeddingJson).digest("hex"),
    providerEvidenceJson,
    providerEvidenceSha256: createHash("sha256").update(providerEvidenceJson).digest("hex"),
  };
}

async function seedStage12AudioP0CorrectionSource(client, mf, d1) {
  const prepared = await client.callTool({
    name: "prepare_approved_channel",
    arguments: {
      objective: "Prepare the approved channel for the Stage 12 command-contract regression.",
      confirm: true,
    },
  });
  assert.equal(prepared.isError, undefined, JSON.stringify(prepared));
  const voiceRegistered = await client.callTool({
    name: "register_qualified_voice",
    arguments: {
      objective: "Register the approved voice for the Stage 12 command-contract regression.",
      confirm: true,
      ownerApprovalText: "APPROVE VOICE",
      ...qualificationFixture(),
    },
  });
  assert.equal(voiceRegistered.isError, undefined, JSON.stringify(voiceRegistered));
  const trackStarted = await client.callTool({
    name: "start_track_g_video_1_qualification",
    arguments: {
      objective: "Open the bounded Track G run for the Stage 12 command-contract regression.",
      confirm: true,
      ownerApprovalText: "START VIDEO 1 QUALIFICATION",
    },
  });
  assert.equal(trackStarted.isError, undefined, JSON.stringify(trackStarted));
  const stage00Started = await client.callTool({
    name: "execute_track_g_video_1_stage_00",
    arguments: {
      objective: "Create the bounded package needed by the Stage 12 command-contract regression.",
      confirm: true,
      ownerApprovalText: "START STAGE 00",
    },
  });
  assert.equal(stage00Started.isError, undefined, JSON.stringify(stage00Started));

  const contract = await d1.prepare(
    "SELECT operation_run_id FROM track_g_run_contract WHERE episode_id = ?",
  ).bind("episode_ai_money_defense_01").first();
  assert.ok(contract?.operation_run_id);
  const productionPackage = await d1.prepare(
    "SELECT id FROM production_package WHERE episode_id = ?",
  ).bind("episode_ai_money_defense_01").first();
  assert.ok(productionPackage?.id);
  await d1.prepare("UPDATE operation_run SET current_step = 'STAGE_12_READY' WHERE id = ?")
    .bind(contract.operation_run_id).run();

  const stage12Jobs = [
    ["stage12-contract-attempt-1", 1, null, "STAGE12_RENDER_FAILED"],
    ["stage12-contract-attempt-2", 2, "stage12-contract-attempt-1", "STAGE12_RENDER_FAILED"],
    ["stage12-contract-attempt-3", 3, "stage12-contract-attempt-2",
      "S12QA:CONTROL_CONTRACT.TECHNICAL_DEFECT.LOUDNESS.M0_INPUT_RIGHTS_P0"],
  ];
  for (const [id, ordinal, retryOf, errorCode] of stage12Jobs) {
    await d1.prepare(`INSERT INTO stage12_media_job
      (id, package_id, operation_run_id, stage_instance_id, idempotency_key,
       callback_token_hash, state, error_code, attempt_ordinal, retry_of_job_id)
      VALUES (?, ?, ?, 'stage_track_g_video_1_12_attempt_1', ?, ?, 'FAILED', ?, ?, ?)`)
      .bind(id, productionPackage.id, contract.operation_run_id,
        createHash("sha256").update(`${id}:key`).digest("hex"),
        createHash("sha256").update(`${id}:token`).digest("hex"),
        errorCode, ordinal, retryOf).run();
  }

  const sourceBytes = Buffer.from("sealed-corrected-pre-master-command-contract-regression");
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const sourceR2Key = ["prod", "channel_ai_era_money_defense_v1",
    "episode_ai_money_defense_01", "12", "corrected-pre-master",
    `${sourceSha256}.webm`].join("/");
  const receiptSha256 = createHash("sha256").update("corrected-receipt").digest("hex");
  const diagnosticReceiptSha256 = createHash("sha256")
    .update("diagnostic-receipt").digest("hex");
  const preMasterSha256 = createHash("sha256").update("attempt-3-pre-master").digest("hex");
  const imageDigest = `sha256:${"a".repeat(64)}`;

  await d1.prepare(`INSERT INTO stage12_qa_diagnostic_job
    (id, stage12_job_id, idempotency_key, callback_token_hash, state, error_code,
     diagnostic_ordinal, target_duration_sec)
    VALUES ('stage12-contract-diagnostic-1', 'stage12-contract-attempt-3', ?, ?,
      'FAILED', '23', 1, 510)`)
    .bind(createHash("sha256").update("diagnostic-1:key").digest("hex"),
      createHash("sha256").update("diagnostic-1:token").digest("hex")).run();
  await d1.prepare(`INSERT INTO stage12_qa_diagnostic_job
    (id, stage12_job_id, idempotency_key, callback_token_hash, state,
     receipt_r2_key, receipt_sha256, worker_image_digest, diagnostic_ordinal,
     retry_of_diagnostic_job_id, retry_reason_code, target_duration_sec)
    VALUES ('stage12-contract-diagnostic-2', 'stage12-contract-attempt-3', ?, ?,
      'READY', 'prod/diagnostic/receipt.json', ?, ?, 2,
      'stage12-contract-diagnostic-1', 'STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT', 510)`)
    .bind(createHash("sha256").update("diagnostic-2:key").digest("hex"),
      createHash("sha256").update("diagnostic-2:token").digest("hex"),
      diagnosticReceiptSha256, imageDigest).run();
  await d1.prepare(`INSERT INTO stage12_qa_evidence
    (id, job_id, source, outcome, pre_master_r2_key, pre_master_sha256,
     receipt_r2_key, receipt_sha256, worker_image_digest, report_sha256,
     failures_json, measurements_json, render_authorized, provider_call_count,
     provider_dispatch, auto_publish)
    VALUES ('stage12-contract-evidence-2', 'stage12-contract-attempt-3',
      'DIAGNOSTIC', 'FAIL', 'prod/stage12/attempt-3.webm', ?,
      'prod/stage12/diagnostic-2.json', ?, ?, ?,
      '["TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.48,"loudnessRangeLu":2.9,"p0DefectCount":1}',
      0, 0, 'OFF', 'OFF')`)
    .bind(preMasterSha256, diagnosticReceiptSha256, imageDigest,
      createHash("sha256").update("diagnostic-report").digest("hex")).run();
  await d1.prepare(`INSERT INTO stage12_corrected_pre_master_job
    (id, stage12_job_id, diagnostic_job_id, diagnostic_evidence_id,
     idempotency_key, callback_token_hash, actor_identity, owner_approval_text,
     state, source_pre_master_r2_key, source_pre_master_sha256,
     source_pre_master_byte_length, corrected_pre_master_r2_key,
     corrected_pre_master_sha256, corrected_pre_master_byte_length,
     corrected_frame_md5_sha256, receipt_r2_key, receipt_sha256,
     worker_image_digest, report_sha256, outcome, failures_json,
     measurements_json, provider_call_count, provider_dispatch, auto_publish)
    VALUES ('stage12-contract-corrected-1', 'stage12-contract-attempt-3',
      'stage12-contract-diagnostic-2', 'stage12-contract-evidence-2', ?, ?,
      'owner@example.com', 'CREATE STAGE 12 CORRECTED PRE-MASTER', 'READY',
      'prod/stage12/attempt-3.webm', ?, 42, ?, ?, ?, ?,
      'prod/stage12/corrected-receipt.json', ?, ?, ?, 'FAIL',
      '["TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
      '{"clippingSampleCount":1,"truePeakDbtp":-0.48,"loudnessRangeLu":2.9,"p0DefectCount":1}',
      0, 'OFF', 'OFF')`)
    .bind(createHash("sha256").update("corrected:key").digest("hex"),
      createHash("sha256").update("corrected:token").digest("hex"),
      preMasterSha256, sourceR2Key, sourceSha256, sourceBytes.length,
      createHash("sha256").update("corrected-frame-md5").digest("hex"),
      receiptSha256, imageDigest,
      createHash("sha256").update("corrected-report").digest("hex")).run();

  const bucket = await mf.getR2Bucket("BUCKET");
  await bucket.put(sourceR2Key, sourceBytes, {
    httpMetadata: { contentType: "video/webm" },
    customMetadata: { sha256: sourceSha256, namespace: "production" },
  });
}

async function seedStage12AudioP0OrdinalThreePending(mf, d1) {
  const predecessor = await d1.prepare(`SELECT id, stage12_job_id,
    corrected_pre_master_r2_key, corrected_pre_master_sha256,
    corrected_pre_master_byte_length, receipt_sha256
    FROM stage12_corrected_pre_master_job`).first();
  assert.ok(predecessor);
  const bucket = await mf.getR2Bucket("BUCKET");
  const ordinalTwoBytes = Buffer.from("immutable-audio-p0-correction-ordinal-two");
  const ordinalTwoSha256 = createHash("sha256").update(ordinalTwoBytes).digest("hex");
  const ordinalTwoR2Key = ["prod", "channel_ai_era_money_defense_v1",
    "episode_ai_money_defense_01", "12", "audio-p0-corrected-pre-master",
    `${ordinalTwoSha256}.webm`].join("/");
  await bucket.put(ordinalTwoR2Key, ordinalTwoBytes, {
    httpMetadata: { contentType: "video/webm" },
    customMetadata: { sha256: ordinalTwoSha256, namespace: "production" },
  });
  const ordinalTwoReceiptSha256 = createHash("sha256")
    .update("ordinal-two-receipt").digest("hex");
  await d1.prepare(`INSERT INTO stage12_audio_p0_correction_job
    (id, predecessor_corrected_pre_master_job_id, stage12_job_id, correction_ordinal,
     idempotency_key, callback_token_hash, actor_identity, owner_approval_text, state,
     source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
     source_receipt_sha256, corrected_pre_master_r2_key, corrected_pre_master_sha256,
     corrected_pre_master_byte_length, corrected_frame_md5_sha256, receipt_r2_key,
     receipt_sha256, worker_image_digest, report_sha256, outcome, failures_json,
     measurements_json)
    VALUES ('stage12-audio-p0-correction-2', ?, ?, 2, ?, ?, 'owner@example.com',
     'CREATE STAGE 12 AUDIO P0 CORRECTION', 'READY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
     'FAIL', '["TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
     '{"clippingSampleCount":1,"truePeakDbtp":-0.9,"loudnessRangeLu":3,"p0DefectCount":1}')`)
    .bind(predecessor.id, predecessor.stage12_job_id,
      createHash("sha256").update("ordinal-two-key").digest("hex"),
      createHash("sha256").update("ordinal-two-token").digest("hex"),
      predecessor.corrected_pre_master_r2_key, predecessor.corrected_pre_master_sha256,
      predecessor.corrected_pre_master_byte_length, predecessor.receipt_sha256,
      ordinalTwoR2Key, ordinalTwoSha256, ordinalTwoBytes.length,
      createHash("sha256").update("ordinal-two-frame-md5").digest("hex"),
      "prod/receipts/ordinal-two.json", ordinalTwoReceiptSha256,
      `sha256:${"2".repeat(64)}`,
      createHash("sha256").update("ordinal-two-report").digest("hex")).run();

  const idempotencyKey = createHash("sha256").update("ordinal-three-key").digest("hex");
  const callbackToken = "7".repeat(64);
  const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
  await d1.prepare(`INSERT INTO stage12_audio_p0_correction_retry_job
    (id, predecessor_correction_job_id, stage12_job_id, correction_ordinal,
     correction_strategy_version, retry_reason_code, idempotency_key, callback_token_hash,
     actor_identity, owner_approval_text, state, source_pre_master_r2_key,
     source_pre_master_sha256, source_pre_master_byte_length, source_receipt_sha256)
    VALUES ('stage12-audio-p0-correction-3', 'stage12-audio-p0-correction-2', ?, 3, 3,
     'STAGE12_AUDIO_P0_ENCODED_QA_FAIL', ?, ?, 'owner@example.com',
     'CREATE STAGE 12 AUDIO P0 CORRECTION', 'PENDING', ?, ?, ?, ?)`)
    .bind(predecessor.stage12_job_id, idempotencyKey, callbackTokenHash,
      ordinalTwoR2Key, ordinalTwoSha256, ordinalTwoBytes.length,
      ordinalTwoReceiptSha256).run();
  return { idempotencyKey, callbackToken, ordinalTwoR2Key, ordinalTwoSha256,
    ordinalTwoByteLength: ordinalTwoBytes.length, ordinalTwoReceiptSha256 };
}

test("renders the root Server Component with a real D1 binding", async () => {
  const { mf } = await createFactoryFixture("root-rsc-d1-test");

  try {
    const responses = await Promise.all(Array.from({ length: 8 }, () =>
      mf.dispatchFetch("http://localhost/", {
        headers: { ...ownerHeaders, accept: "text/html" },
      })));
    for (const response of responses) {
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-factory-root-actor"), "owner");
      assert.equal(response.headers.get("x-factory-root-authorization"), "allowed");
      assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
      assert.match(html, /YouTube AI Factory V2/i);
      assert.match(html, /D1 is live; the owner must issue PREPARE_CHANNEL/i);
      assert.doesNotMatch(html, /An error occurred in the Server Components render/i);
    }
  } finally {
    await mf.dispose();
  }
});

test("rejects a non-owner at the Worker boundary before rendering the root Server Component", async () => {
  const { mf } = await createFactoryFixture("root-owner-boundary-test");

  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      headers: {
        ...ownerHeaders,
        "oai-authenticated-user-email": "not-owner@example.com",
        "oai-authenticated-user-id": "unconfigured-identity-claim",
        accept: "text/html",
      },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("x-factory-root-actor"), "authenticated-non-owner");
    assert.equal(response.headers.get("x-factory-root-authorization"), "denied");
    assert.equal(await response.text(), "FACTORY_OWNER_AUTHORIZATION_DENIED");
  } finally {
    await mf.dispose();
  }
});

test("does not let a renderer marker override an authenticated owner decision", async () => {
  const { mf } = await createFactoryFixture("root-owner-renderer-marker-test");

  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      headers: {
        ...ownerHeaders,
        "signature-agent": "https://web-bot-auth.cloudflare-browser-rendering-085.workers.dev",
        accept: "text/html",
      },
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-factory-root-actor"), "owner");
    assert.equal(response.headers.get("x-factory-root-authorization"), "allowed");
    assert.match(html, /YouTube AI Factory V2/i);
  } finally {
    await mf.dispose();
  }
});

test("classifies a Cloudflare rendering probe without treating it as the owner", async () => {
  const { mf } = await createFactoryFixture("root-renderer-boundary-test");

  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      headers: {
        ...ownerHeaders,
        "oai-authenticated-user-email": "rendering-probe@example.com",
        "signature-agent": "https://web-bot-auth.cloudflare-browser-rendering-085.workers.dev",
        accept: "text/html",
      },
    });
    const body = await response.text();
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("x-factory-root-actor"), "platform-renderer");
    assert.equal(response.headers.get("x-factory-root-authorization"), "denied");
    assert.equal(body, "FACTORY_OWNER_AUTHORIZATION_DENIED");
    assert.doesNotMatch(body, /Server Components render/iu);
  } finally {
    await mf.dispose();
  }
});

test("keeps anonymous root requests on the canonical sign-in path", async () => {
  const { mf } = await createFactoryFixture("root-anonymous-boundary-test");

  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, "http://localhost");
    assert.equal(location.pathname, "/signin-with-chatgpt");
    assert.equal(location.search, "?return_to=%2F");
    assert.equal(response.headers.get("x-factory-root-actor"), "anonymous");
    assert.equal(response.headers.get("x-factory-root-authorization"), "deferred");
  } finally {
    await mf.dispose();
  }
});

test("fails closed with typed root evidence when the owner allowlist is absent", async () => {
  const { mf } = await createFactoryFixture("root-owner-config-test", {});

  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      headers: { ...ownerHeaders, accept: "text/html" },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-factory-root-actor"), "configuration-error");
    assert.equal(response.headers.get("x-factory-root-authorization"), "misconfigured");
    assert.equal(await response.text(), "FACTORY_OWNER_ALLOWLIST_UNCONFIGURED");
  } finally {
    await mf.dispose();
  }
});

test("executes PREPARE_CHANNEL idempotently against real local D1", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-operator-test");

  try {
    const objective = "Persist the approved AI-Era Money Defense channel strategy and verify Production read-back.";
    const command = {
      commandType: "PREPARE_CHANNEL",
      objective,
      idempotencyKey: createHash("sha256").update(`PREPARE_CHANNEL|HP-01|${objective}`).digest("hex"),
    };
    const firstResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(command),
    });
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 201);
    assert.equal(first.replayed, false);
    assert.equal(first.run.status, "COMPLETED");
    assert.equal(first.run.currentStep, "CHANNEL_STATE_READ_BACK");

    const replayResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(command),
    });
    const replay = await replayResponse.json();
    assert.equal(replayResponse.status, 200);
    assert.equal(replay.replayed, true);
    assert.equal(replay.run.id, first.run.id);

    const snapshotResponse = await mf.dispatchFetch("http://localhost/api/operator", { headers: ownerHeaders });
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshot.actor.role, "OWNER");
    assert.equal(snapshot.channel.status, "PREPARED");
    assert.equal(snapshot.identityContract.approvalState, "PERSISTED");
    assert.equal(snapshot.decision.decisionKey, "HP-01:AI-ERA-MONEY-DEFENSE:2026-08-25");
    assert.equal(snapshot.pillar.name, "How Modern Money Traps Work");
    assert.equal(snapshot.episodes.length, 10);
    assert.equal(snapshot.runs.length, 1);
    assert.deepEqual(snapshot.latestRunEvents.map((event) => event.eventType), [
      "COMMAND_ACCEPTED",
      "OWNER_AUTHORIZED",
      "CHANNEL_PREPARED",
      "READ_BACK_VERIFIED",
    ]);

    const episodeCount = await d1.prepare("SELECT count(*) AS count FROM episode").first();
    assert.equal(episodeCount.count, 10);
    await assert.rejects(
      d1.prepare("UPDATE command_log SET next_state = 'ACTIVE'").run(),
      /COMMAND_LOG_APPEND_ONLY/,
    );
  } finally {
    await mf.dispose();
  }
});

test("exposes owner-authorized MCP tools and persists the Production command path", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-mcp-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-e2e-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const contract = JSON.parse(await readFile(
      fileURLToPath(new URL("../mcp-contract-v1.json", import.meta.url)), "utf8",
    ));
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), contract.toolNames);

    const before = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(before.structuredContent.channelStatus, "NOT_PREPARED");
    assert.equal(before.structuredContent.episodeCount, 0);
    assert.equal(before.structuredContent.providerDispatch, "OFF");
    assert.deepEqual(before.structuredContent.activationBlockers, [
      "qualified_voice_fingerprint",
      "critic_qualification_and_real_calibration_evidence",
    ]);

    const diagnostic = await client.callTool({
      name: "diagnose_factory_command",
      arguments: {
        commandType: "RECOVER_STAGE_12_ATTEMPT_3",
        trackCode: "G",
        videoNumber: 1,
        stageCode: "12",
        attemptOrdinal: 3,
      },
    });
    assert.equal(diagnostic.structuredContent.contractVersion, "1");
    assert.equal(diagnostic.structuredContent.providerDispatch, "OFF");
    assert.equal(diagnostic.structuredContent.autoPublish, "OFF");

    const qaDiagnostic = await client.callTool({
      name: "diagnose_factory_command",
      arguments: {
        commandType: "SCAN_STAGE_12_ATTEMPT_3",
        trackCode: "G",
        videoNumber: 1,
        stageCode: "12",
        attemptOrdinal: 3,
      },
    });
    assert.equal(qaDiagnostic.structuredContent.contractVersion, "1");
    assert.equal(qaDiagnostic.structuredContent.operationState, "NOT_STARTED");
    assert.equal(qaDiagnostic.structuredContent.providerDispatch, "OFF");
    assert.equal(qaDiagnostic.structuredContent.autoPublish, "OFF");

    const remediationDiagnostic = await client.callTool({
      name: "diagnose_factory_command",
      arguments: {
        commandType: "CREATE_STAGE_12_CORRECTED_PREMASTER",
        trackCode: "G",
        videoNumber: 1,
        stageCode: "12",
        attemptOrdinal: 3,
      },
    });
    assert.equal(remediationDiagnostic.structuredContent.contractVersion, "1");
    assert.equal(remediationDiagnostic.structuredContent.operationState, "BLOCKED");
    assert.equal(remediationDiagnostic.structuredContent.providerDispatch, "OFF");
    assert.equal(remediationDiagnostic.structuredContent.autoPublish, "OFF");

    const audioP0Diagnostic = await client.callTool({
      name: "diagnose_factory_command",
      arguments: {
        commandType: "CREATE_STAGE_12_AUDIO_P0_CORRECTION",
        trackCode: "G",
        videoNumber: 1,
        stageCode: "12",
        attemptOrdinal: 3,
      },
    });
    assert.equal(audioP0Diagnostic.structuredContent.contractVersion, "1");
    assert.equal(audioP0Diagnostic.structuredContent.operationState, "BLOCKED");
    assert.equal(audioP0Diagnostic.structuredContent.providerDispatch, "OFF");
    assert.equal(audioP0Diagnostic.structuredContent.autoPublish, "OFF");

    const rejectedStableWrite = await client.callTool({
      name: "execute_factory_command",
      arguments: {
        commandType: "RECOVER_STAGE_12_ATTEMPT_3",
        trackCode: "G",
        videoNumber: 1,
        stageCode: "12",
        attemptOrdinal: 3,
        expectedCurrentStep: "STAGE_12_READY",
        objective: "Verify the stable command rejects a stale expected state without mutation.",
        confirm: true,
        ownerApprovalText: "RECOVER STAGE 12 ATTEMPT 3",
      },
    });
    assert.equal(rejectedStableWrite.isError, true);
    assert.match(rejectedStableWrite.content[0].text, /STABLE_COMMAND_EXPECTED_STATE_MISMATCH/);

    const objective = "Persist the approved AI-Era Money Defense strategy through the ChatGPT Production command surface.";
    const prepared = await client.callTool({
      name: "prepare_approved_channel",
      arguments: { objective, confirm: true },
    });
    assert.equal(prepared.isError, undefined);
    assert.equal(prepared.structuredContent.accepted, true);
    assert.equal(prepared.structuredContent.replayed, false);
    assert.equal(prepared.structuredContent.runStatus, "COMPLETED");
    assert.equal(prepared.structuredContent.currentStep, "CHANNEL_STATE_READ_BACK");
    assert.equal(prepared.structuredContent.channelStatus, "PREPARED");
    assert.equal(prepared.structuredContent.contractState, "PERSISTED");
    assert.equal(prepared.structuredContent.episodeCount, 10);
    assert.equal(prepared.structuredContent.providerDispatch, "OFF");
    assert.equal(prepared.structuredContent.autoPublish, "OFF");
    assert.deepEqual(prepared.structuredContent.activationBlockers, [
      "qualified_voice_fingerprint",
      "critic_qualification_and_real_calibration_evidence",
    ]);

    const replay = await client.callTool({
      name: "prepare_approved_channel",
      arguments: { objective, confirm: true },
    });
    assert.equal(replay.structuredContent.replayed, true);

    const commandCount = await d1.prepare("SELECT count(*) AS count FROM command_log").first();
    const runCount = await d1.prepare("SELECT count(*) AS count FROM operation_run").first();
    const eventCount = await d1.prepare("SELECT count(*) AS count FROM operation_event").first();
    assert.equal(commandCount.count, 1);
    assert.equal(runCount.count, 1);
    assert.equal(eventCount.count, 4);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("stable MCP gateway accepts the 0027 audio/P0 command and maps legacy trigger failures", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-stage12-audio-p0-command-contract", {
    FACTORY_OWNER_EMAIL: "owner@example.com",
    MEDIA_REQUEST_SIGNING_KEY: "test-only-stage12-command-contract-signing-key",
  });
  const transport = new StreamableHTTPClientTransport(new URL("https://factory.test/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-stage12-command-contract-test", version: "1.0.0" });
  const command = {
    commandType: "CREATE_STAGE_12_AUDIO_P0_CORRECTION",
    trackCode: "G",
    videoNumber: 1,
    stageCode: "12",
    attemptOrdinal: 3,
    expectedCurrentStep: "STAGE_12_READY",
    objective: "Create the typed Stage 12 audio and P0 correction from immutable evidence.",
    confirm: true,
    ownerApprovalText: "CREATE STAGE 12 AUDIO P0 CORRECTION",
  };
  try {
    await client.connect(transport);
    await seedStage12AudioP0CorrectionSource(client, mf, d1);
    await d1.prepare("DROP TRIGGER command_log_validate_insert").run();
    await d1.prepare(`CREATE TRIGGER command_log_validate_insert
      BEFORE INSERT ON command_log
      WHEN NEW.command_type = 'CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION'
      BEGIN SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION'); END`).run();

    const legacyFailure = await client.callTool({ name: "execute_factory_command", arguments: command });
    assert.equal(legacyFailure.isError, true);
    assert.match(legacyFailure.content[0].text, /STABLE_COMMAND_CONTRACT_VIOLATION/u);
    assert.doesNotMatch(legacyFailure.content[0].text, /D1_ERROR|SQLITE_CONSTRAINT/u);
    assert.equal((await d1.prepare(`SELECT count(*) AS count FROM command_log
      WHERE command_type = 'CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION'`).first()).count, 0);
    assert.equal((await d1.prepare("SELECT count(*) AS count FROM stage12_audio_p0_correction_job")
      .first()).count, 0);

    const migration = await readFile(
      fileURLToPath(new URL("../drizzle/0027_stage12_audio_p0_command_contract.sql", import.meta.url)),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")
      .map((value) => value.trim()).filter(Boolean)) {
      await d1.prepare(statement).run();
    }

    const acceptedByContract = await client.callTool({
      name: "execute_factory_command",
      arguments: command,
    });
    assert.equal(acceptedByContract.isError, true);
    assert.doesNotMatch(acceptedByContract.content[0].text,
      /STABLE_COMMAND_CONTRACT_VIOLATION|COMMAND_CONTRACT_VIOLATION/u);
    assert.match(acceptedByContract.content[0].text,
      /TRACK_G_STAGE_[0-9A-Z]+_READ_BACK_FAILED/u);
    const commandRow = await d1.prepare(`SELECT command_type, prev_state, next_state
      FROM command_log
      WHERE command_type = 'CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION'`).first();
    assert.deepEqual(commandRow, {
      command_type: "CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION",
      prev_state: "TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL",
      next_state: "TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING",
    });
    const job = await d1.prepare(`SELECT state, correction_ordinal, provider_call_count,
      provider_dispatch, auto_publish FROM stage12_audio_p0_correction_job`).first();
    assert.deepEqual(job, {
      state: "PENDING",
      correction_ordinal: 2,
      provider_call_count: 0,
      provider_dispatch: "OFF",
      auto_publish: "OFF",
    });
    assert.equal((await d1.prepare(
      "SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal = 4",
    ).first()).count, 0);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("stable MCP diagnostic reads the complete immutable ordinal-3 correction lineage", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-stage12-audio-p0-ordinal3-readback", {
    FACTORY_OWNER_EMAIL: "owner@example.com",
    MEDIA_REQUEST_SIGNING_KEY: "test-only-stage12-ordinal3-signing-key",
  });
  const transport = new StreamableHTTPClientTransport(new URL("https://factory.test/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-stage12-ordinal3-readback-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await seedStage12AudioP0CorrectionSource(client, mf, d1);
    const predecessor = await d1.prepare(`SELECT id, stage12_job_id,
      corrected_pre_master_r2_key, corrected_pre_master_sha256,
      corrected_pre_master_byte_length, receipt_sha256
      FROM stage12_corrected_pre_master_job`).first();
    assert.ok(predecessor);
    const bucket = await mf.getR2Bucket("BUCKET");
    const ordinalTwoBytes = Buffer.from("immutable-audio-p0-correction-ordinal-two");
    const ordinalTwoSha256 = createHash("sha256").update(ordinalTwoBytes).digest("hex");
    const ordinalTwoR2Key = ["prod", "channel_ai_era_money_defense_v1",
      "episode_ai_money_defense_01", "12", "audio-p0-corrected-pre-master",
      `${ordinalTwoSha256}.webm`].join("/");
    await bucket.put(ordinalTwoR2Key, ordinalTwoBytes, {
      httpMetadata: { contentType: "video/webm" },
      customMetadata: { sha256: ordinalTwoSha256, namespace: "production" },
    });
    const ordinalTwoReceiptSha256 = createHash("sha256").update("ordinal-two-receipt").digest("hex");
    await d1.prepare(`INSERT INTO stage12_audio_p0_correction_job
      (id, predecessor_corrected_pre_master_job_id, stage12_job_id, correction_ordinal,
       idempotency_key, callback_token_hash, actor_identity, owner_approval_text, state,
       source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
       source_receipt_sha256, corrected_pre_master_r2_key, corrected_pre_master_sha256,
       corrected_pre_master_byte_length, corrected_frame_md5_sha256, receipt_r2_key,
       receipt_sha256, worker_image_digest, report_sha256, outcome, failures_json,
       measurements_json)
      VALUES ('stage12-audio-p0-correction-2', ?, ?, 2, ?, ?, 'owner@example.com',
       'CREATE STAGE 12 AUDIO P0 CORRECTION', 'READY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       'FAIL', '["TECHNICAL_DEFECT","LOUDNESS","M0_INPUT_RIGHTS_P0"]',
       '{"clippingSampleCount":1,"truePeakDbtp":-0.9,"loudnessRangeLu":3,"p0DefectCount":1}')`)
      .bind(predecessor.id, predecessor.stage12_job_id,
        createHash("sha256").update("ordinal-two-key").digest("hex"),
        createHash("sha256").update("ordinal-two-token").digest("hex"),
        predecessor.corrected_pre_master_r2_key, predecessor.corrected_pre_master_sha256,
        predecessor.corrected_pre_master_byte_length, predecessor.receipt_sha256,
        ordinalTwoR2Key, ordinalTwoSha256, ordinalTwoBytes.length,
        createHash("sha256").update("ordinal-two-frame-md5").digest("hex"),
        "prod/receipts/ordinal-two.json", ordinalTwoReceiptSha256,
        `sha256:${"2".repeat(64)}`,
        createHash("sha256").update("ordinal-two-report").digest("hex")).run();

    const ordinalThreeBytes = Buffer.from("immutable-audio-p0-correction-ordinal-three");
    const ordinalThreeSha256 = createHash("sha256").update(ordinalThreeBytes).digest("hex");
    const ordinalThreeR2Key = ["prod", "channel_ai_era_money_defense_v1",
      "episode_ai_money_defense_01", "12", "audio-p0-corrected-pre-master",
      `${ordinalThreeSha256}.webm`].join("/");
    await bucket.put(ordinalThreeR2Key, ordinalThreeBytes, {
      httpMetadata: { contentType: "video/webm" },
      customMetadata: { sha256: ordinalThreeSha256, namespace: "production" },
    });
    const frameMd5Sha256 = createHash("sha256").update("ordinal-three-frame-md5").digest("hex");
    const receiptSha256 = createHash("sha256").update("ordinal-three-receipt").digest("hex");
    const reportSha256 = createHash("sha256").update("ordinal-three-report").digest("hex");
    const imageDigest = `sha256:${"3".repeat(64)}`;
    await d1.prepare(`INSERT INTO stage12_audio_p0_correction_retry_job
      (id, predecessor_correction_job_id, stage12_job_id, correction_ordinal,
       correction_strategy_version, retry_reason_code, idempotency_key, callback_token_hash,
       actor_identity, owner_approval_text, state, source_pre_master_r2_key,
       source_pre_master_sha256, source_pre_master_byte_length, source_receipt_sha256)
      VALUES ('stage12-audio-p0-correction-3', 'stage12-audio-p0-correction-2', ?, 3, 3,
       'STAGE12_AUDIO_P0_ENCODED_QA_FAIL', ?, ?, 'owner@example.com',
       'CREATE STAGE 12 AUDIO P0 CORRECTION', 'PENDING', ?, ?, ?, ?)`)
      .bind(predecessor.stage12_job_id,
        createHash("sha256").update("ordinal-three-key").digest("hex"),
        createHash("sha256").update("ordinal-three-token").digest("hex"),
        ordinalTwoR2Key, ordinalTwoSha256, ordinalTwoBytes.length,
        ordinalTwoReceiptSha256).run();
    await d1.prepare(`UPDATE stage12_audio_p0_correction_retry_job SET state='READY',
      corrected_pre_master_r2_key=?, corrected_pre_master_sha256=?,
      corrected_pre_master_byte_length=?, corrected_frame_md5_sha256=?, receipt_r2_key=?,
      receipt_sha256=?, worker_image_digest=?, report_sha256=?, outcome='PASS',
      failures_json='[]', measurements_json='{"clippingSampleCount":0,"truePeakDbtp":-2,"loudnessRangeLu":6,"p0DefectCount":0}'
      WHERE id='stage12-audio-p0-correction-3'`)
      .bind(ordinalThreeR2Key, ordinalThreeSha256, ordinalThreeBytes.length,
        frameMd5Sha256, "prod/receipts/ordinal-three.json", receiptSha256,
        imageDigest, reportSha256).run();

    const result = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "CREATE_STAGE_12_AUDIO_P0_CORRECTION", trackCode: "G",
      videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    const diagnostic = JSON.parse(result.structuredContent.diagnosticJson);
    assert.deepEqual({
      correctionOrdinal: diagnostic.correctionOrdinal,
      correctionStrategyVersion: diagnostic.correctionStrategyVersion,
      predecessorCorrectionJobId: diagnostic.predecessorCorrectionJobId,
      sourcePreMasterR2Key: diagnostic.sourcePreMasterR2Key,
      sourcePreMasterSha256: diagnostic.sourcePreMasterSha256,
      sourcePreMasterByteLength: diagnostic.sourcePreMasterByteLength,
      correctedPreMasterR2Key: diagnostic.correctedPreMasterR2Key,
      correctedPreMasterSha256: diagnostic.correctedPreMasterSha256,
      correctedPreMasterByteLength: diagnostic.correctedPreMasterByteLength,
      correctedFrameMd5Sha256: diagnostic.correctedFrameMd5Sha256,
      receiptR2Key: diagnostic.receiptR2Key,
      receiptSha256: diagnostic.receiptSha256,
      reportSha256: diagnostic.reportSha256,
      workerImageDigest: diagnostic.workerImageDigest,
    }, {
      correctionOrdinal: 3, correctionStrategyVersion: 3,
      predecessorCorrectionJobId: "stage12-audio-p0-correction-2",
      sourcePreMasterR2Key: ordinalTwoR2Key, sourcePreMasterSha256: ordinalTwoSha256,
      sourcePreMasterByteLength: ordinalTwoBytes.length,
      correctedPreMasterR2Key: ordinalThreeR2Key,
      correctedPreMasterSha256: ordinalThreeSha256,
      correctedPreMasterByteLength: ordinalThreeBytes.length,
      correctedFrameMd5Sha256: frameMd5Sha256,
      receiptR2Key: "prod/receipts/ordinal-three.json", receiptSha256,
      reportSha256, workerImageDigest: imageDigest,
    });
    assert.equal((await d1.prepare(
      "SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal = 4",
    ).first()).count, 0);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("persists exact encoded-loudness failure callback evidence append-only", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-stage12-loudness-failure-evidence", {
    FACTORY_OWNER_EMAIL: "owner@example.com",
    MEDIA_REQUEST_SIGNING_KEY: "test-only-stage12-loudness-evidence-signing-key",
  });
  const transport = new StreamableHTTPClientTransport(new URL("https://factory.test/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-stage12-loudness-evidence-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await seedStage12AudioP0CorrectionSource(client, mf, d1);
    const source = await seedStage12AudioP0OrdinalThreePending(mf, d1);
    const measurementsByPass = [
      { correctionPass: 0, phase: "INITIAL_ENCODED_MEASUREMENT", integratedLufs: -14.51,
        truePeakDbtp: -0.9, loudnessRangeLu: 3,
        failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { correctionPass: 1, phase: "POST_CORRECTION_PASS", integratedLufs: -14.2,
        truePeakDbtp: -1.3, loudnessRangeLu: 3.4,
        failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { correctionPass: 2, phase: "POST_CORRECTION_PASS", integratedLufs: -13.9,
        truePeakDbtp: -1.5, loudnessRangeLu: 3.8,
        failedPredicates: ["LOUDNESS_RANGE_LU_BELOW_MIN"] },
      { correctionPass: 3, phase: "FINAL_POST_ENCODE_VERIFICATION", integratedLufs: -13.8,
        truePeakDbtp: -0.8, loudnessRangeLu: 3.9,
        failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"] },
    ];
    const workerImageDigest = `sha256:${"3".repeat(64)}`;
    const failureDiagnostic = {
      schemaVersion: 1, boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
      correctionPass: 3, correctionPassLimit: 3, measurementsByPass,
      finalMeasurements: { integratedLufs: -13.8, truePeakDbtp: -0.8,
        loudnessRangeLu: 3.9 },
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
      workerImageDigest,
    };
    const callbackBody = JSON.stringify({
      idempotencyKey: source.idempotencyKey,
      errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
      failureDiagnostic,
    });
    const incompleteCallback = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-audio-p0-correction",
      { method: "POST", headers: { authorization: `Bearer ${source.callbackToken}`,
        "content-type": "application/json" }, body: JSON.stringify({
        idempotencyKey: source.idempotencyKey,
        errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
      }) },
    );
    assert.equal(incompleteCallback.status, 400);
    assert.equal((await d1.prepare(`SELECT state FROM stage12_audio_p0_correction_retry_job
      WHERE id='stage12-audio-p0-correction-3'`).first()).state, "PENDING");
    const callback = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-audio-p0-correction",
      { method: "POST", headers: { authorization: `Bearer ${source.callbackToken}`,
        "content-type": "application/json" }, body: callbackBody },
    );
    assert.equal(callback.status, 201, await callback.text());
    assert.deepEqual(await d1.prepare(`SELECT state, error_code, corrected_pre_master_sha256,
      measurements_json, provider_call_count, provider_dispatch, auto_publish
      FROM stage12_audio_p0_correction_retry_job WHERE id='stage12-audio-p0-correction-3'`).first(), {
      state: "FAILED", error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
      corrected_pre_master_sha256: null, measurements_json: null,
      provider_call_count: 0, provider_dispatch: "OFF", auto_publish: "OFF",
    });
    const evidence = await d1.prepare(`SELECT correction_pass, correction_pass_limit,
      measurements_by_pass_json, final_integrated_lufs, final_true_peak_dbtp,
      final_loudness_range_lu, failed_predicates_json, worker_image_digest,
      source_pre_master_r2_key, source_pre_master_sha256, source_pre_master_byte_length,
      source_receipt_sha256 FROM stage12_audio_p0_correction_failure_evidence`).first();
    const { measurements_by_pass_json: measurementsJson, ...evidenceScalars } = evidence;
    assert.deepEqual(JSON.parse(measurementsJson), measurementsByPass);
    assert.deepEqual(evidenceScalars, {
      correction_pass: 3, correction_pass_limit: 3,
      final_integrated_lufs: -13.8, final_true_peak_dbtp: -0.8,
      final_loudness_range_lu: 3.9,
      failed_predicates_json:
        '["TRUE_PEAK_DBTP_ABOVE_MAX","LOUDNESS_RANGE_LU_BELOW_MIN"]',
      worker_image_digest: workerImageDigest,
      source_pre_master_r2_key: source.ordinalTwoR2Key,
      source_pre_master_sha256: source.ordinalTwoSha256,
      source_pre_master_byte_length: source.ordinalTwoByteLength,
      source_receipt_sha256: source.ordinalTwoReceiptSha256,
    });

    const diagnosticResult = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "CREATE_STAGE_12_AUDIO_P0_CORRECTION", trackCode: "G",
      videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    const diagnostic = JSON.parse(diagnosticResult.structuredContent.diagnosticJson);
    const { evidenceId, ...failureReadBack } = diagnostic.encodedLoudnessFailure;
    assert.match(evidenceId, /^[a-f0-9]{64}$/u);
    assert.deepEqual(failureReadBack, {
      failureBoundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
      correctionPass: 3, correctionPassLimit: 3, measurementsByPass,
      finalMeasurements: failureDiagnostic.finalMeasurements,
      failedPredicates: failureDiagnostic.failedPredicates,
      workerImageDigest, sourcePreMasterR2Key: source.ordinalTwoR2Key,
      sourcePreMasterSha256: source.ordinalTwoSha256,
      sourcePreMasterByteLength: source.ordinalTwoByteLength,
      sourceReceiptSha256: source.ordinalTwoReceiptSha256,
    });
    const replay = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-audio-p0-correction",
      { method: "POST", headers: { authorization: `Bearer ${source.callbackToken}`,
        "content-type": "application/json" }, body: callbackBody },
    );
    assert.equal(replay.status, 422);
    assert.equal((await d1.prepare(
      "SELECT count(*) AS count FROM stage12_audio_p0_correction_failure_evidence",
    ).first()).count, 1);
    await assert.rejects(d1.prepare(`UPDATE stage12_audio_p0_correction_failure_evidence
      SET final_integrated_lufs=-14`).run(), /FAILURE_EVIDENCE_IMMUTABLE/u);
    assert.equal((await d1.prepare(
      "SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4",
    ).first()).count, 0);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("diagnostic replay reads ordinal 2 and persists only new append-only evidence", async () => {
  const { mf, d1 } = await createFactoryFixture("g01a-stage12-loudness-diagnostic-replay", {
    FACTORY_OWNER_EMAIL: "owner@example.com",
    MEDIA_REQUEST_SIGNING_KEY: "test-only-stage12-loudness-replay-signing-key",
  });
  const transport = new StreamableHTTPClientTransport(new URL("https://factory.test/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-stage12-loudness-replay-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await seedStage12AudioP0CorrectionSource(client, mf, d1);
    const source = await seedStage12AudioP0OrdinalThreePending(mf, d1);
    await d1.prepare(`UPDATE stage12_audio_p0_correction_retry_job SET state='FAILED',
      error_code='STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
      WHERE id='stage12-audio-p0-correction-3'`).run();

    const eligible = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "RUN_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(eligible.isError, undefined, JSON.stringify(eligible));
    assert.equal(eligible.structuredContent.operationState, "ELIGIBLE");
    assert.equal(eligible.structuredContent.diagnosticState, "PASS");

    const unavailable = await client.callTool({ name: "execute_factory_command", arguments: {
      commandType: "RUN_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
      expectedCurrentStep: "STAGE_12_READY",
      objective: "Reproduce encoded loudness measurements from immutable ordinal two evidence.",
      confirm: true,
      ownerApprovalText: "RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY",
    } });
    assert.equal(unavailable.isError, true);
    assert.match(unavailable.content[0].text, /MEDIA_WORKER_URL_UNAVAILABLE/u);
    assert.equal((await d1.prepare(`SELECT count(*) AS count
      FROM stage12_encoded_loudness_diagnostic_replay_job`).first()).count, 0);
    assert.equal((await d1.prepare(`SELECT count(*) AS count FROM command_log
      WHERE command_type='RUN_TRACK_G_VIDEO_1_STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY'`)
      .first()).count, 0);

    const idempotencyKey = createHash("sha256").update("diagnostic-replay-key").digest("hex");
    const callbackToken = "8".repeat(64);
    const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
    const expectedWorkerImageDigest = `sha256:${"9".repeat(64)}`;
    const algorithmFingerprint = "3".repeat(64);
    const thresholdSnapshotSha256 = "4".repeat(64);
    await d1.prepare(`INSERT INTO stage12_encoded_loudness_diagnostic_replay_job
      (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,idempotency_key,
       callback_token_hash,actor_identity,owner_approval_text,state,evidence_semantics,
       source_pre_master_r2_key,source_pre_master_sha256,source_pre_master_byte_length,
       source_receipt_sha256,correction_strategy_version,correction_pass_limit,
       expected_worker_image_digest,algorithm_fingerprint,threshold_snapshot_sha256)
      VALUES ('stage12-loudness-replay-1','stage12-contract-attempt-3',
       'stage12-audio-p0-correction-2','stage12-audio-p0-correction-3',?,?,
       'owner@example.com','RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY','PENDING',
       'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL',?,?,?,?,3,3,?,?,?)`)
      .bind(idempotencyKey, callbackTokenHash, source.ordinalTwoR2Key,
        source.ordinalTwoSha256, source.ordinalTwoByteLength, source.ordinalTwoReceiptSha256,
        expectedWorkerImageDigest, algorithmFingerprint, thresholdSnapshotSha256).run();

    const sourceRead = await mf.dispatchFetch(
      `https://factory.test/api/media-worker/stage12-encoded-loudness-diagnostic-replay?kind=source-ordinal-2&idempotencyKey=${idempotencyKey}&sha256=${source.ordinalTwoSha256}`,
      { headers: { authorization: `Bearer ${callbackToken}` } },
    );
    assert.equal(sourceRead.status, 200, await sourceRead.clone().text());
    assert.equal(createHash("sha256").update(Buffer.from(await sourceRead.arrayBuffer())).digest("hex"),
      source.ordinalTwoSha256);

    const exactMeasurement = (correctionPass, phase, values, failedPredicates) => ({
      correctionPass, phase, ...values, failedPredicates,
      audioFrameMd5Sha256: createHash("sha256").update(`audio-frame-${correctionPass}`).digest("hex"),
    });
    const sourceBaseline = {
      phase: "SOURCE_ORDINAL2_BASELINE",
      integratedLufs: -14.51, integratedLufsExact: "-14.51",
      truePeakDbtp: -0.9, truePeakDbtpExact: "-0.90",
      loudnessRangeLu: 3, loudnessRangeLuExact: "3.00",
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
      audioFrameMd5Sha256: createHash("sha256").update("source-audio-frame").digest("hex"),
    };
    const measurementsByPass = [
      exactMeasurement(0, "INITIAL_ENCODED_MEASUREMENT", {
        integratedLufs: -14.4, integratedLufsExact: "-14.40",
        truePeakDbtp: -1.2, truePeakDbtpExact: "-1.20",
        loudnessRangeLu: 3.2, loudnessRangeLuExact: "3.20",
      }, ["LOUDNESS_RANGE_LU_BELOW_MIN"]),
      exactMeasurement(1, "POST_CORRECTION_PASS", {
        integratedLufs: -14.1, integratedLufsExact: "-14.10",
        truePeakDbtp: -1.3, truePeakDbtpExact: "-1.30",
        loudnessRangeLu: 3.6, loudnessRangeLuExact: "3.60",
      }, ["LOUDNESS_RANGE_LU_BELOW_MIN"]),
      exactMeasurement(2, "POST_CORRECTION_PASS", {
        integratedLufs: -13.9, integratedLufsExact: "-13.90",
        truePeakDbtp: -1.4, truePeakDbtpExact: "-1.40",
        loudnessRangeLu: 3.8, loudnessRangeLuExact: "3.80",
      }, ["LOUDNESS_RANGE_LU_BELOW_MIN"]),
      exactMeasurement(3, "FINAL_POST_ENCODE_VERIFICATION", {
        integratedLufs: -13.8, integratedLufsExact: "-13.80",
        truePeakDbtp: -0.8, truePeakDbtpExact: "-0.80",
        loudnessRangeLu: 3.9, loudnessRangeLuExact: "3.90",
      }, ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"]),
    ];
    const replayResult = {
      accepted: true, schemaVersion: 1,
      evidenceSemantics: "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL",
      boundary: "FINAL_POST_ENCODE_LOUDNESS_VERIFICATION",
      source: { correctionOrdinal: 2, correctionJobId: "stage12-audio-p0-correction-2",
        r2Key: source.ordinalTwoR2Key, sha256: source.ordinalTwoSha256,
        byteLength: source.ordinalTwoByteLength, receiptSha256: source.ordinalTwoReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: "stage12-audio-p0-correction-3",
        errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
      sourceBaseline, measurementsByPass, terminalCorrectionPass: 3,
      finalMeasurements: { integratedLufs: -13.8, integratedLufsExact: "-13.80",
        truePeakDbtp: -0.8, truePeakDbtpExact: "-0.80",
        loudnessRangeLu: 3.9, loudnessRangeLuExact: "3.90" },
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_BELOW_MIN"],
      replayOutcome: "FAIL", workerImageDigest: expectedWorkerImageDigest,
      expectedWorkerImageDigest, algorithmFingerprint, thresholdSnapshotSha256,
      runtimeProvenance: { ffmpegVersion: "ffmpeg version 7.1.1",
        ffmpegBuildFingerprint: "6".repeat(64), libopusEncoderFingerprint: "7".repeat(64) },
      correctionStrategyVersion: 3, correctionPassLimit: 3,
      correctedOutputUploaded: false, historicalBackfill: false,
      providerCallCount: 0, providerDispatch: "OFF", calibration: false,
      finalize: false, releaseEligible: false, autoPublish: "OFF",
    };
    const callback = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-encoded-loudness-diagnostic-replay",
      { method: "POST", headers: { authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey, result: replayResult }) },
    );
    assert.equal(callback.status, 201, await callback.text());
    assert.deepEqual(await d1.prepare(`SELECT state,replay_outcome,terminal_correction_pass,
      expected_worker_image_digest,worker_image_digest,corrected_output_uploaded,
      historical_backfill,provider_call_count,provider_dispatch,auto_publish
      FROM stage12_encoded_loudness_diagnostic_replay_job`).first(), {
      state: "READY", replay_outcome: "FAIL", terminal_correction_pass: 3,
      expected_worker_image_digest: expectedWorkerImageDigest,
      worker_image_digest: expectedWorkerImageDigest, corrected_output_uploaded: 0,
      historical_backfill: 0, provider_call_count: 0, provider_dispatch: "OFF",
      auto_publish: "OFF",
    });
    const replayEvidence = await d1.prepare(`SELECT id,evidence_semantics,
      final_integrated_lufs_exact,final_true_peak_dbtp_exact,final_loudness_range_lu_exact,
      measurements_by_pass_json,ffmpeg_version FROM
      stage12_encoded_loudness_diagnostic_replay_evidence`).first();
    assert.equal(replayEvidence.evidence_semantics,
      "NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL");
    assert.equal(replayEvidence.final_integrated_lufs_exact, "-13.80");
    assert.equal(replayEvidence.final_true_peak_dbtp_exact, "-0.80");
    assert.equal(replayEvidence.final_loudness_range_lu_exact, "3.90");
    assert.deepEqual(JSON.parse(replayEvidence.measurements_by_pass_json), measurementsByPass);
    assert.equal(replayEvidence.ffmpeg_version, "ffmpeg version 7.1.1");

    const ready = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "RUN_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(ready.structuredContent.operationState, "READY");
    const diagnostic = JSON.parse(ready.structuredContent.diagnosticJson);
    assert.equal(diagnostic.result.replayOutcome, "FAIL");
    assert.equal(diagnostic.result.correctedOutputUploaded, false);

    const shadowEligible = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "RUN_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(shadowEligible.isError, undefined, JSON.stringify(shadowEligible));
    assert.equal(shadowEligible.structuredContent.operationState, "ELIGIBLE");
    assert.equal(shadowEligible.structuredContent.diagnosticState, "PASS");

    const shadowKey = createHash("sha256").update("codec-safe-shadow-key").digest("hex");
    const shadowToken = "a".repeat(64);
    const shadowTokenHash = createHash("sha256").update(shadowToken).digest("hex");
    const shadowImageDigest = `sha256:${"5".repeat(64)}`;
    const shadowAlgorithmFingerprint = "6".repeat(64);
    await d1.prepare(`INSERT INTO stage12_codec_safe_true_peak_shadow_job
      (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
       diagnostic_replay_job_id,diagnostic_replay_evidence_id,idempotency_key,
       callback_token_hash,actor_identity,owner_approval_text,state,evidence_semantics,
       source_pre_master_r2_key,source_pre_master_sha256,source_pre_master_byte_length,
       source_receipt_sha256,correction_pass_limit,expected_worker_image_digest,
       algorithm_fingerprint,threshold_snapshot_sha256)
      VALUES ('stage12-codec-safe-shadow-1','stage12-contract-attempt-3',
       'stage12-audio-p0-correction-2','stage12-audio-p0-correction-3',
       'stage12-loudness-replay-1',?,?,?,
       'owner@example.com','RUN STAGE 12 CODEC SAFE TRUE PEAK SHADOW REPLAY','PENDING',
       'CODEC_SAFE_SHADOW_NOT_CORRECTION',?,?,?,?,3,?,?,?)`)
      .bind(replayEvidence.id, shadowKey, shadowTokenHash,
        source.ordinalTwoR2Key, source.ordinalTwoSha256, source.ordinalTwoByteLength,
        source.ordinalTwoReceiptSha256, shadowImageDigest, shadowAlgorithmFingerprint,
        thresholdSnapshotSha256).run();

    const shadowSourceRead = await mf.dispatchFetch(
      `https://factory.test/api/media-worker/stage12-codec-safe-true-peak-shadow-replay?kind=codec-safe-source-ordinal-2&idempotencyKey=${shadowKey}&sha256=${source.ordinalTwoSha256}`,
      { headers: { authorization: `Bearer ${shadowToken}` } },
    );
    assert.equal(shadowSourceRead.status, 200, await shadowSourceRead.clone().text());
    assert.equal(createHash("sha256").update(
      Buffer.from(await shadowSourceRead.arrayBuffer()),
    ).digest("hex"), source.ordinalTwoSha256);

    const losslessReferenceSha256 = "1".repeat(64);
    const shadowCandidate = { candidatePass: 0, phase: "INITIAL_CODEC_SAFE_CANDIDATE",
      losslessReferenceSha256, integratedTargetLufs: -14, limiterCeilingDbtp: -2,
      macroDepthDb: 5, codecOvershootDb: 0.8,
      integratedLufs: -14, integratedLufsExact: "-14.00",
      truePeakDbtp: -1.2, truePeakDbtpExact: "-1.20",
      loudnessRangeLu: 5, loudnessRangeLuExact: "5.00", failedPredicates: [],
      audioFrameMd5Sha256: "2".repeat(64) };
    const shadowResult = { accepted: true, schemaVersion: 1,
      evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION",
      boundary: "POST_OPUS_TRUE_PEAK_FEEDBACK",
      source: { correctionOrdinal: 2,
        correctionJobId: "stage12-audio-p0-correction-2",
        r2Key: source.ordinalTwoR2Key, sha256: source.ordinalTwoSha256,
        byteLength: source.ordinalTwoByteLength,
        receiptSha256: source.ordinalTwoReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: "stage12-audio-p0-correction-3",
        errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
      diagnosticReplay: { jobId: "stage12-loudness-replay-1",
        evidenceId: replayEvidence.id },
      losslessReference: { sha256: losslessReferenceSha256, byteLength: 33554432,
        audioFrameMd5Sha256: "3".repeat(64), codec: "pcm_f32le", sampleRateHz: 48000 },
      candidates: [shadowCandidate], terminalCandidatePass: 0,
      finalMeasurements: { integratedLufs: -14, integratedLufsExact: "-14.00",
        truePeakDbtp: -1.2, truePeakDbtpExact: "-1.20",
        loudnessRangeLu: 5, loudnessRangeLuExact: "5.00" },
      failedPredicates: [], shadowOutcome: "PASS",
      workerImageDigest: shadowImageDigest,
      expectedWorkerImageDigest: shadowImageDigest,
      algorithmFingerprint: shadowAlgorithmFingerprint,
      thresholdSnapshotSha256,
      runtimeProvenance: { ffmpegVersion: "ffmpeg version 7.1.1",
        ffmpegBuildFingerprint: "7".repeat(64),
        libopusEncoderFingerprint: "8".repeat(64) },
      correctionPassLimit: 3, correctedOutputUploaded: false,
      historicalBackfill: false, providerCallCount: 0, providerDispatch: "OFF",
      calibration: false, finalize: false, releaseEligible: false,
      productionActivation: false, autoPublish: "OFF" };
    const shadowCallback = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-codec-safe-true-peak-shadow-replay",
      { method: "POST", headers: { authorization: `Bearer ${shadowToken}`,
        "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: shadowKey, result: shadowResult }) },
    );
    assert.equal(shadowCallback.status, 201, await shadowCallback.text());
    assert.deepEqual(await d1.prepare(`SELECT state,shadow_outcome,terminal_candidate_pass,
      corrected_output_uploaded,historical_backfill,provider_call_count,provider_dispatch,
      calibration_executed,finalize_executed,release_eligible,
      production_activation_executed,auto_publish
      FROM stage12_codec_safe_true_peak_shadow_job`).first(), {
      state: "READY", shadow_outcome: "PASS", terminal_candidate_pass: 0,
      corrected_output_uploaded: 0, historical_backfill: 0, provider_call_count: 0,
      provider_dispatch: "OFF", calibration_executed: 0, finalize_executed: 0,
      release_eligible: 0, production_activation_executed: 0, auto_publish: "OFF",
    });
    const shadowReady = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "RUN_STAGE12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(shadowReady.structuredContent.operationState, "READY");
    const shadowDiagnostic = JSON.parse(shadowReady.structuredContent.diagnosticJson);
    assert.equal(shadowDiagnostic.result.shadowOutcome, "PASS");
    assert.equal(shadowDiagnostic.result.productionActivation, false);

    const parentKey = createHash("sha256").update("codec-safe-lra-parent-key").digest("hex");
    const parentToken = "b".repeat(64);
    const parentTokenHash = createHash("sha256").update(parentToken).digest("hex");
    const parentRuntimeProvenance = { ffmpegVersion: "ffmpeg version 7.1.1",
      ffmpegBuildFingerprint: "7".repeat(64),
      libopusEncoderFingerprint: "8".repeat(64) };
    const parentCandidate = (candidatePass, controller, values, frameHash) => ({
      candidatePass,
      phase: candidatePass === 0 ? "INITIAL_CODEC_SAFE_CANDIDATE"
        : "POST_OPUS_FEEDBACK_CANDIDATE",
      losslessReferenceSha256,
      ...controller,
      codecOvershootDb: Math.max(0, values.truePeakDbtp - controller.limiterCeilingDbtp),
      ...values,
      failedPredicates: [
        ...(values.integratedLufs < -15 ? ["INTEGRATED_LUFS_BELOW_MIN"] : []),
        ...(values.integratedLufs > -13 ? ["INTEGRATED_LUFS_ABOVE_MAX"] : []),
        ...(values.truePeakDbtp > -1 ? ["TRUE_PEAK_DBTP_ABOVE_MAX"] : []),
        ...(values.loudnessRangeLu < 4 ? ["LOUDNESS_RANGE_LU_BELOW_MIN"] : []),
        ...(values.loudnessRangeLu > 8 ? ["LOUDNESS_RANGE_LU_ABOVE_MAX"] : []),
      ],
      audioFrameMd5Sha256: frameHash,
    });
    const parentCandidates = [
      parentCandidate(0, { integratedTargetLufs: -14, limiterCeilingDbtp: -2,
        macroDepthDb: 5 }, { integratedLufs: -14.8, integratedLufsExact: "-14.80",
        truePeakDbtp: -0.33, truePeakDbtpExact: "-0.33",
        loudnessRangeLu: 3.2, loudnessRangeLuExact: "3.20" }, "4".repeat(64)),
      parentCandidate(1, { integratedTargetLufs: -14, limiterCeilingDbtp: -2.67,
        macroDepthDb: 7.8 }, { integratedLufs: -15.09, integratedLufsExact: "-15.09",
        truePeakDbtp: -1.04, truePeakDbtpExact: "-1.04",
        loudnessRangeLu: 2.8, loudnessRangeLuExact: "2.80" }, "5".repeat(64)),
      parentCandidate(2, { integratedTargetLufs: -12.91, limiterCeilingDbtp: -2.67,
        macroDepthDb: 11 }, { integratedLufs: -15.12, integratedLufsExact: "-15.12",
        truePeakDbtp: -1, truePeakDbtpExact: "-1.00",
        loudnessRangeLu: 3, loudnessRangeLuExact: "3.00" }, "6".repeat(64)),
      parentCandidate(3, { integratedTargetLufs: -11.790000000000001,
        limiterCeilingDbtp: -2.67, macroDepthDb: 14 }, {
        integratedLufs: -14.94, integratedLufsExact: "-14.94",
        truePeakDbtp: 4.22, truePeakDbtpExact: "4.22",
        loudnessRangeLu: 14.4, loudnessRangeLuExact: "14.40" }, "7".repeat(64)),
    ];
    const parentResult = { accepted: true, schemaVersion: 1,
      evidenceSemantics: "CODEC_SAFE_SHADOW_NOT_CORRECTION",
      boundary: "POST_OPUS_TRUE_PEAK_FEEDBACK",
      source: { correctionOrdinal: 2,
        correctionJobId: "stage12-audio-p0-correction-2",
        r2Key: source.ordinalTwoR2Key, sha256: source.ordinalTwoSha256,
        byteLength: source.ordinalTwoByteLength,
        receiptSha256: source.ordinalTwoReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: "stage12-audio-p0-correction-3",
        errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
      diagnosticReplay: { jobId: "stage12-loudness-replay-1",
        evidenceId: replayEvidence.id },
      losslessReference: { sha256: losslessReferenceSha256, byteLength: 33554432,
        audioFrameMd5Sha256: "3".repeat(64), codec: "pcm_f32le", sampleRateHz: 48000 },
      candidates: parentCandidates, terminalCandidatePass: 3,
      finalMeasurements: { integratedLufs: -14.94, integratedLufsExact: "-14.94",
        truePeakDbtp: 4.22, truePeakDbtpExact: "4.22",
        loudnessRangeLu: 14.4, loudnessRangeLuExact: "14.40" },
      failedPredicates: ["TRUE_PEAK_DBTP_ABOVE_MAX", "LOUDNESS_RANGE_LU_ABOVE_MAX"],
      shadowOutcome: "FAIL", workerImageDigest: shadowImageDigest,
      expectedWorkerImageDigest: shadowImageDigest,
      algorithmFingerprint: shadowAlgorithmFingerprint, thresholdSnapshotSha256,
      runtimeProvenance: parentRuntimeProvenance,
      correctionPassLimit: 3, correctedOutputUploaded: false,
      historicalBackfill: false, providerCallCount: 0, providerDispatch: "OFF",
      calibration: false, finalize: false, releaseEligible: false,
      productionActivation: false, autoPublish: "OFF" };
    await d1.prepare(`INSERT INTO stage12_codec_safe_true_peak_shadow_job
      (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
       diagnostic_replay_job_id,diagnostic_replay_evidence_id,idempotency_key,
       callback_token_hash,actor_identity,owner_approval_text,state,evidence_semantics,
       source_pre_master_r2_key,source_pre_master_sha256,source_pre_master_byte_length,
       source_receipt_sha256,correction_pass_limit,expected_worker_image_digest,
       algorithm_fingerprint,threshold_snapshot_sha256,created_at,updated_at)
      VALUES ('stage12-codec-safe-shadow-lra-parent','stage12-contract-attempt-3',
       'stage12-audio-p0-correction-2','stage12-audio-p0-correction-3',
       'stage12-loudness-replay-1',?,?,?,?,
       'owner@example.com','RUN STAGE 12 CODEC SAFE TRUE PEAK SHADOW REPLAY','PENDING',
       'CODEC_SAFE_SHADOW_NOT_CORRECTION',?,?,?,?,3,?,?,?,'2099-01-01T00:00:00.000Z',
       '2099-01-01T00:00:00.000Z')`)
      .bind(replayEvidence.id, parentKey, parentTokenHash, source.ordinalTwoR2Key,
        source.ordinalTwoSha256, source.ordinalTwoByteLength,
        source.ordinalTwoReceiptSha256, shadowImageDigest, shadowAlgorithmFingerprint,
        thresholdSnapshotSha256).run();
    const parentCallback = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-codec-safe-true-peak-shadow-replay",
      { method: "POST", headers: { authorization: `Bearer ${parentToken}`,
        "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: parentKey, result: parentResult }) },
    );
    assert.equal(parentCallback.status, 201, await parentCallback.text());
    const parentEvidence = await d1.prepare(`SELECT id FROM
      stage12_codec_safe_true_peak_shadow_evidence
      WHERE shadow_job_id='stage12-codec-safe-shadow-lra-parent'`).first();
    assert.match(parentEvidence.id, /^[a-f0-9]{64}$/u);

    const guardEligible = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "RUN_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(guardEligible.isError, undefined, JSON.stringify(guardEligible));
    assert.equal(guardEligible.structuredContent.operationState, "ELIGIBLE");
    assert.equal(guardEligible.structuredContent.diagnosticState, "PASS");

    const controllerPolicy = { maxCandidateCount: 8,
      codecOvershootRegressionMaxDb: 0.25, integratedBoundaryMarginLu: 0.05,
      maxIntegratedTargetStepLu: 0.25 };
    const controllerPolicySha256 = canonicalTestSha256(controllerPolicy);
    const renderKernelFingerprint = "c".repeat(64);
    const parentRenderRuntimeFingerprint = canonicalTestSha256({
      renderKernelFingerprint, runtimeProvenance: parentRuntimeProvenance,
    });
    const guardAlgorithmFingerprint = "d".repeat(64);
    const guardImageDigest = `sha256:${"e".repeat(64)}`;
    const guardKey = createHash("sha256").update("codec-safe-lra-guard-key").digest("hex");
    const guardToken = "f".repeat(64);
    const guardTokenHash = createHash("sha256").update(guardToken).digest("hex");
    await d1.prepare(`INSERT INTO stage12_codec_safe_lra_guard_shadow_job
      (id,stage12_job_id,source_correction_job_id,historical_failure_job_id,
       diagnostic_replay_job_id,diagnostic_replay_evidence_id,parent_shadow_job_id,
       parent_shadow_evidence_id,idempotency_key,callback_token_hash,actor_identity,
       owner_approval_text,state,evidence_semantics,source_pre_master_r2_key,
       source_pre_master_sha256,source_pre_master_byte_length,source_receipt_sha256,
       expected_worker_image_digest,parent_worker_image_digest,algorithm_fingerprint,
       threshold_snapshot_sha256,controller_policy_sha256,render_kernel_fingerprint,
       parent_render_runtime_fingerprint)
      VALUES ('stage12-codec-safe-lra-guard-1','stage12-contract-attempt-3',
       'stage12-audio-p0-correction-2','stage12-audio-p0-correction-3',
       'stage12-loudness-replay-1',?,'stage12-codec-safe-shadow-lra-parent',?,?,?,?,
       'owner@example.com','RUN STAGE 12 CODEC SAFE LRA GUARD SHADOW REPLAY','PENDING',
       'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION',?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(replayEvidence.id, parentEvidence.id, guardKey, guardTokenHash,
        source.ordinalTwoR2Key, source.ordinalTwoSha256, source.ordinalTwoByteLength,
        source.ordinalTwoReceiptSha256, guardImageDigest, shadowImageDigest,
        guardAlgorithmFingerprint, thresholdSnapshotSha256, controllerPolicySha256,
        renderKernelFingerprint, parentRenderRuntimeFingerprint).run();
    const guardSourceRead = await mf.dispatchFetch(
      `https://factory.test/api/media-worker/stage12-codec-safe-lra-guard-shadow-replay?kind=codec-safe-lra-guard-source-ordinal-2&idempotencyKey=${guardKey}&sha256=${source.ordinalTwoSha256}`,
      { headers: { authorization: `Bearer ${guardToken}` } },
    );
    assert.equal(guardSourceRead.status, 200, await guardSourceRead.clone().text());
    assert.equal(createHash("sha256").update(
      Buffer.from(await guardSourceRead.arrayBuffer()),
    ).digest("hex"), source.ordinalTwoSha256);

    const guardCandidates = [
      { done: false, candidatePass: 0, phase: "ANCHOR_REPRODUCTION",
        decision: "ANCHOR", disposition: "SAFE_ANCHOR", parentCandidatePass: null,
        rollbackToCandidatePass: null, bracketLowDepthDb: 7.8,
        bracketHighDepthDb: 14, integratedTargetLufs: -14,
        limiterCeilingDbtp: -2.67, macroDepthDb: 7.8, targetStepLufs: 0,
        losslessReferenceSha256, codecOvershootDb: Math.max(0, -1.04 - -2.67),
        integratedLufs: -15.09, integratedLufsExact: "-15.09",
        truePeakDbtp: -1.04, truePeakDbtpExact: "-1.04",
        loudnessRangeLu: 2.8, loudnessRangeLuExact: "2.80",
        failedPredicates: ["INTEGRATED_LUFS_BELOW_MIN", "LOUDNESS_RANGE_LU_BELOW_MIN"],
        audioFrameMd5Sha256: "5".repeat(64) },
      { done: false, candidatePass: 1, phase: "LRA_BRACKET_SEARCH",
        decision: "BISECTION", disposition: "LRA_ACCEPTED", parentCandidatePass: 0,
        rollbackToCandidatePass: null, bracketLowDepthDb: 7.8,
        bracketHighDepthDb: 14, integratedTargetLufs: -14,
        limiterCeilingDbtp: -2.67, macroDepthDb: 10.9, targetStepLufs: 0,
        losslessReferenceSha256, codecOvershootDb: Math.max(0, -1.08 - -2.67),
        integratedLufs: -15.09, integratedLufsExact: "-15.09",
        truePeakDbtp: -1.08, truePeakDbtpExact: "-1.08",
        loudnessRangeLu: 5.5, loudnessRangeLuExact: "5.50",
        failedPredicates: ["INTEGRATED_LUFS_BELOW_MIN"],
        audioFrameMd5Sha256: "9".repeat(64) },
      { done: false, candidatePass: 2, phase: "INTEGRATED_LUFS_TRIM",
        decision: "NEAREST_BOUNDARY_TRIM", disposition: "FULL_PASS",
        parentCandidatePass: 1, rollbackToCandidatePass: null,
        bracketLowDepthDb: 10.9, bracketHighDepthDb: 10.9,
        integratedTargetLufs: -13.86, limiterCeilingDbtp: -2.67,
        macroDepthDb: 10.9, targetStepLufs: 0.14, losslessReferenceSha256,
        codecOvershootDb: Math.max(0, -1.03 - -2.67),
        integratedLufs: -14.98, integratedLufsExact: "-14.98",
        truePeakDbtp: -1.03, truePeakDbtpExact: "-1.03",
        loudnessRangeLu: 5.3, loudnessRangeLuExact: "5.30",
        failedPredicates: [], audioFrameMd5Sha256: "a".repeat(64) },
    ];
    const guardResult = { accepted: true, schemaVersion: 1,
      evidenceSemantics: "CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION",
      boundary: "POST_OPUS_LRA_GUARD_FEEDBACK",
      source: { correctionOrdinal: 2,
        correctionJobId: "stage12-audio-p0-correction-2",
        r2Key: source.ordinalTwoR2Key, sha256: source.ordinalTwoSha256,
        byteLength: source.ordinalTwoByteLength,
        receiptSha256: source.ordinalTwoReceiptSha256 },
      historicalFailure: { correctionOrdinal: 3,
        correctionJobId: "stage12-audio-p0-correction-3",
        errorCode: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED" },
      diagnosticReplay: { jobId: "stage12-loudness-replay-1",
        evidenceId: replayEvidence.id },
      parentShadow: { jobId: "stage12-codec-safe-shadow-lra-parent",
        evidenceId: parentEvidence.id },
      losslessReference: parentResult.losslessReference,
      anchorReference: parentCandidates[1], highBracketReference: parentCandidates[3],
      controllerPolicy, candidates: guardCandidates, shadowOutcome: "PASS",
      terminalReason: "PASS", lastEvaluatedCandidatePass: 2,
      bestSafeCandidatePass: 2, selectedCandidatePass: 2,
      finalMeasurements: { integratedLufs: -14.98, integratedLufsExact: "-14.98",
        truePeakDbtp: -1.03, truePeakDbtpExact: "-1.03",
        loudnessRangeLu: 5.3, loudnessRangeLuExact: "5.30" },
      failedPredicates: [], workerImageDigest: guardImageDigest,
      expectedWorkerImageDigest: guardImageDigest,
      parentWorkerImageDigest: shadowImageDigest,
      algorithmFingerprint: guardAlgorithmFingerprint, thresholdSnapshotSha256,
      controllerPolicySha256, renderKernelFingerprint,
      parentRenderRuntimeFingerprint, renderRuntimeFingerprint: parentRenderRuntimeFingerprint,
      parentRuntimeProvenance, runtimeProvenance: parentRuntimeProvenance,
      correctedOutputUploaded: false, historicalBackfill: false,
      providerCallCount: 0, providerDispatch: "OFF", calibration: false,
      finalize: false, releaseEligible: false, productionActivation: false,
      autoPublish: "OFF" };
    const guardCallback = await mf.dispatchFetch(
      "https://factory.test/api/media-worker/stage12-codec-safe-lra-guard-shadow-replay",
      { method: "POST", headers: { authorization: `Bearer ${guardToken}`,
        "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: guardKey, result: guardResult }) },
    );
    assert.equal(guardCallback.status, 201, await guardCallback.text());
    assert.deepEqual(await d1.prepare(`SELECT state,shadow_outcome,terminal_reason,
      last_evaluated_candidate_pass,best_safe_candidate_pass,selected_candidate_pass,
      corrected_output_uploaded,historical_backfill,provider_call_count,provider_dispatch,
      calibration_executed,finalize_executed,release_eligible,
      production_activation_executed,auto_publish
      FROM stage12_codec_safe_lra_guard_shadow_job`).first(), {
      state: "READY", shadow_outcome: "PASS", terminal_reason: "PASS",
      last_evaluated_candidate_pass: 2, best_safe_candidate_pass: 2,
      selected_candidate_pass: 2, corrected_output_uploaded: 0,
      historical_backfill: 0, provider_call_count: 0, provider_dispatch: "OFF",
      calibration_executed: 0, finalize_executed: 0, release_eligible: 0,
      production_activation_executed: 0, auto_publish: "OFF",
    });
    const guardReady = await client.callTool({ name: "diagnose_factory_command", arguments: {
      commandType: "RUN_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY",
      trackCode: "G", videoNumber: 1, stageCode: "12", attemptOrdinal: 3,
    } });
    assert.equal(guardReady.structuredContent.operationState, "READY");
    const guardDiagnostic = JSON.parse(guardReady.structuredContent.diagnosticJson);
    assert.equal(guardDiagnostic.result.shadowOutcome, "PASS");
    assert.equal(guardDiagnostic.result.correctedOutputUploaded, false);
    assert.equal(guardDiagnostic.result.productionActivation, false);
    assert.equal((await d1.prepare(
      "SELECT count(*) AS count FROM stage12_media_job WHERE attempt_ordinal=4",
    ).first()).count, 0);
    assert.deepEqual(await d1.prepare(`SELECT state,error_code,corrected_pre_master_sha256
      FROM stage12_audio_p0_correction_retry_job WHERE id='stage12-audio-p0-correction-3'`)
      .first(), { state: "FAILED", error_code: "STAGE12_ENCODED_LOUDNESS_UNRESOLVED",
      corrected_pre_master_sha256: null });
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("registers approved voice evidence immutably and removes only the voice blocker", async () => {
  const { mf, d1 } = await createFactoryFixture("g02d-qualified-voice-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-voice-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await client.callTool({
      name: "prepare_approved_channel",
      arguments: {
        objective: "Prepare the approved channel before registering its owner-approved voice.",
        confirm: true,
      },
    });
    const evidence = qualificationFixture();
    const objective = "Register the owner-approved ElevenLabs voice and verify immutable qualification evidence.";
    const first = await client.callTool({
      name: "register_qualified_voice",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "APPROVE VOICE",
        ...evidence,
      },
    });
    assert.equal(first.isError, undefined, JSON.stringify(first));
    assert.equal(first.structuredContent.accepted, true);
    assert.equal(first.structuredContent.replayed, false);
    assert.equal(first.structuredContent.runStatus, "COMPLETED");
    assert.equal(first.structuredContent.currentStep, "VOICE_EVIDENCE_READ_BACK_VERIFIED");
    assert.equal(first.structuredContent.voiceFingerprintState, "QUALIFIED");
    assert.equal(first.structuredContent.voiceBindingCount, 8);
    assert.deepEqual(first.structuredContent.activationBlockers, [
      "critic_qualification_and_real_calibration_evidence",
    ]);
    assert.equal(first.structuredContent.providerDispatch, "OFF");
    assert.equal(first.structuredContent.autoPublish, "OFF");

    const replay = await client.callTool({
      name: "register_qualified_voice",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "APPROVE VOICE",
        ...evidence,
      },
    });
    assert.equal(replay.structuredContent.replayed, true);
    assert.equal(replay.structuredContent.voiceFingerprintState, "QUALIFIED");

    const fingerprint = await d1.prepare("SELECT * FROM voice_fingerprint_evidence").first();
    const bindingCount = await d1.prepare("SELECT count(*) AS count FROM voice_fingerprint_binding").first();
    const identity = await d1.prepare("SELECT version, approval_state FROM channel_identity_contract ORDER BY version DESC LIMIT 1").first();
    assert.equal(fingerprint.qualification_state, "QUALIFIED");
    assert.equal(fingerprint.audio_sha256, evidence.audioSha256);
    assert.equal(bindingCount.count, 8);
    assert.equal(identity.version, 2);
    assert.equal(identity.approval_state, "PERSISTED");

    const bucket = await mf.getR2Bucket("BUCKET");
    assert.ok(await bucket.get(fingerprint.audio_r2_key));
    assert.ok(await bucket.get(fingerprint.embedding_r2_key));
    assert.ok(await bucket.get(fingerprint.evidence_r2_key));
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("completes ChatGPT OAuth discovery, PKCE exchange and bearer-authorized MCP calls", async () => {
  const { mf } = await createFactoryFixture("g01a-oauth-test");
  const productionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
  const resource = `${productionOrigin}/api/mcp`;
  const verifier = "factory-owner-pkce-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const clientId = "https://chatgpt.com/oauth/client.json";
  const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";

  try {
    const unauthenticated = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(unauthenticated.status, 401);
    assert.match(unauthenticated.headers.get("www-authenticate") ?? "", /oauth-protected-resource/);

    const resourceMetadataResponse = await mf.dispatchFetch(`${productionOrigin}/.well-known/oauth-protected-resource`);
    const resourceMetadata = await resourceMetadataResponse.json();
    assert.equal(resourceMetadata.resource, resource);
    assert.deepEqual(resourceMetadata.authorization_servers, [productionOrigin]);
    assert.deepEqual(resourceMetadata.scopes_supported, ["factory.read", "factory.prepare"]);

    const issuerMetadataResponse = await mf.dispatchFetch(`${productionOrigin}/.well-known/oauth-authorization-server`);
    const issuerMetadata = await issuerMetadataResponse.json();
    assert.equal(issuerMetadata.issuer, productionOrigin);
    assert.equal(issuerMetadata.client_id_metadata_document_supported, true);
    assert.deepEqual(issuerMetadata.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(issuerMetadata.grant_types_supported, ["authorization_code", "refresh_token"]);

    const openIdMetadataResponse = await mf.dispatchFetch(`${productionOrigin}/.well-known/openid-configuration`);
    const openIdMetadata = await openIdMetadataResponse.json();
    assert.equal(openIdMetadataResponse.status, 200);
    assert.deepEqual(openIdMetadata, issuerMetadata);

    const authorize = new URL(`${productionOrigin}/oauth/authorize`);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", "oauth-state-123");
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("resource", resource);
    authorize.searchParams.set("scope", "factory.read factory.prepare");
    const consentResponse = await mf.dispatchFetch(authorize, { headers: ownerHeaders });
    const consentHtml = await consentResponse.text();
    assert.equal(consentResponse.status, 200);
    assert.match(consentHtml, /Connect ChatGPT to YouTube AI Factory V2/i);
    const nonce = consentHtml.match(/name="nonce" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);

    const approvalResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/authorize/approve`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nonce }),
      redirect: "manual",
    });
    assert.equal(approvalResponse.status, 303);
    const callback = new URL(approvalResponse.headers.get("location"));
    assert.equal(callback.origin + callback.pathname, redirectUri);
    assert.equal(callback.searchParams.get("state"), "oauth-state-123");
    assert.equal(callback.searchParams.get("iss"), productionOrigin);
    const code = callback.searchParams.get("code");
    assert.ok(code);

    const tokenResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    const token = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.equal(token.token_type, "Bearer");
    assert.equal(token.scope, "factory.read factory.prepare");
    assert.ok(token.access_token);
    assert.ok(token.refresh_token);

    const refreshResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: clientId,
        resource,
      }),
    });
    const refreshedToken = await refreshResponse.json();
    assert.equal(refreshResponse.status, 200);
    assert.ok(refreshedToken.access_token);
    assert.ok(refreshedToken.refresh_token);
    assert.notEqual(refreshedToken.access_token, token.access_token);
    assert.notEqual(refreshedToken.refresh_token, token.refresh_token);

    const refreshReplayResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: clientId,
        resource,
      }),
    });
    assert.equal(refreshReplayResponse.status, 400);
    assert.equal((await refreshReplayResponse.json()).error, "invalid_grant");
    const activeAccessToken = refreshedToken.access_token;

    const replayResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    assert.equal(replayResponse.status, 400);
    assert.equal((await replayResponse.json()).error, "invalid_grant");

    const discoveryId = "mcp-2026-discovery-probe";
    const discoveryResponse = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${activeAccessToken}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: discoveryId,
        method: "server/discover",
        params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
      }),
    });
    const discovery = await discoveryResponse.json();
    assert.equal(discoveryResponse.status, 200);
    assert.equal(discovery.id, discoveryId);
    assert.equal(discovery.error.code, -32601);

    const rawToolsResponse = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${activeAccessToken}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} }),
    });
    const rawTools = await rawToolsResponse.json();
    assert.deepEqual(rawTools.result.tools.find((tool) => tool.name === "get_factory_state")?.securitySchemes, [
      { type: "oauth2", scopes: ["factory.read"] },
    ]);

    const namespacedReadResponse = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${activeAccessToken}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "youtube_ai_factory_v2.get_factory_state", arguments: {} },
      }),
    });
    const namespacedRead = await namespacedReadResponse.json();
    assert.equal(namespacedReadResponse.status, 200);
    assert.equal(namespacedRead.result.structuredContent.ownerAuthorized, true);
    assert.equal(namespacedRead.result.structuredContent.providerDispatch, "OFF");

    const namespacedBatchResponse = await mf.dispatchFetch(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${activeAccessToken}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify([{
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "youtube_ai_factory_v2.get_factory_state", arguments: {} },
      }]),
    });
    const namespacedBatch = await namespacedBatchResponse.json();
    assert.equal(namespacedBatchResponse.status, 200);
    assert.equal(namespacedBatch[0].result.structuredContent.ownerAuthorized, true);
    assert.equal(namespacedBatch[0].result.structuredContent.providerDispatch, "OFF");

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${activeAccessToken}` } },
      fetch: (input, init) => mf.dispatchFetch(input, init),
    });
    const client = new Client({ name: "factory-oauth-e2e-test", version: "1.0.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    const contract = JSON.parse(await readFile(
      fileURLToPath(new URL("../mcp-contract-v1.json", import.meta.url)), "utf8",
    ));
    assert.equal(contract.contractVersion, "1");
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), contract.toolNames);
    for (const toolName of contract.stableGatewayTools) {
      assert.ok(tools.tools.some((tool) => tool.name === toolName));
    }
    for (const toolName of ["diagnose_factory_command", "execute_factory_command"]) {
      const commandType = tools.tools.find((tool) => tool.name === toolName)
        ?.inputSchema?.properties?.commandType;
      assert.equal(commandType.type, "string");
      assert.equal(commandType.enum, undefined);
    }
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});

test("opens Video #1 in the bounded Track G qualification lane and replays idempotently", async () => {
  const { mf, d1 } = await createFactoryFixture("g02i1c-track-g-video-one-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-track-g-video-one-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await client.callTool({
      name: "prepare_approved_channel",
      arguments: {
        objective: "Prepare the approved channel before opening the first bounded Track G run.",
        confirm: true,
      },
    });
    const voiceEvidence = qualificationFixture();
    await client.callTool({
      name: "register_qualified_voice",
      arguments: {
        objective: "Register the approved voice before opening the first bounded Track G run.",
        confirm: true,
        ownerApprovalText: "APPROVE VOICE",
        ...voiceEvidence,
      },
    });

    const objective = "Open Video #1 in the bounded Track G qualification lane and stop before release or publish.";
    const first = await client.callTool({
      name: "start_track_g_video_1_qualification",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "START VIDEO 1 QUALIFICATION",
      },
    });
    assert.equal(first.isError, undefined, JSON.stringify(first));
    assert.equal(first.structuredContent.accepted, true);
    assert.equal(first.structuredContent.replayed, false);
    assert.equal(first.structuredContent.runStatus, "RUNNING");
    assert.equal(first.structuredContent.currentStep, "STAGE_00_READY");
    assert.equal(first.structuredContent.episodeStatus, "IN_PRODUCTION");
    assert.equal(first.structuredContent.profile, "REDUCED");
    assert.equal(first.structuredContent.assuranceMode, "WARNING_ONLY");
    assert.deepEqual(first.structuredContent.stageCodes, [
      "00", "01", "02", "03", "04", "05", "06", "07A",
      "07B", "08", "09", "10", "11", "12", "13", "14",
    ]);
    assert.equal(first.structuredContent.stopBeforeStage, "15");
    assert.equal(first.structuredContent.releaseEligible, false);
    assert.equal(first.structuredContent.providerDispatch, "OFF");
    assert.equal(first.structuredContent.autoPublish, "OFF");
    assert.match(first.structuredContent.bootstrapEvidenceSha256, /^[0-9a-f]{64}$/u);

    const replay = await client.callTool({
      name: "start_track_g_video_1_qualification",
      arguments: {
        objective,
        confirm: true,
        ownerApprovalText: "START VIDEO 1 QUALIFICATION",
      },
    });
    assert.equal(replay.structuredContent.replayed, true);
    assert.equal(replay.structuredContent.runId, first.structuredContent.runId);

    const stage00Objective = "Open the Production package, bind the approved brief, freeze Stage 00 and stop at Stage 01 readiness.";
    const stage00 = await client.callTool({
      name: "execute_track_g_video_1_stage_00",
      arguments: {
        objective: stage00Objective,
        confirm: true,
        ownerApprovalText: "START STAGE 00",
      },
    });
    assert.equal(stage00.isError, undefined, JSON.stringify(stage00));
    assert.equal(stage00.structuredContent.accepted, true);
    assert.equal(stage00.structuredContent.replayed, false);
    assert.equal(stage00.structuredContent.runId, first.structuredContent.runId);
    assert.equal(stage00.structuredContent.currentStep, "STAGE_01_READY");
    assert.equal(stage00.structuredContent.packageId, "package_track_g_video_1_v1");
    assert.equal(stage00.structuredContent.stageCode, "00");
    assert.equal(stage00.structuredContent.stageState, "FROZEN");
    assert.equal(stage00.structuredContent.artifactState, "SEALED");
    assert.equal(stage00.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.equal(stage00.structuredContent.videoCeilingUsd, 30);
    assert.equal(stage00.structuredContent.trackGCeilingUsd, 350);
    assert.equal(stage00.structuredContent.stageReservedUsd, 0);
    assert.equal(stage00.structuredContent.stageActualUsd, 0);
    assert.equal(stage00.structuredContent.providerDispatch, "OFF");
    assert.equal(stage00.structuredContent.releaseEligible, false);
    assert.equal(stage00.structuredContent.autoPublish, "OFF");

    const stage00Replay = await client.callTool({
      name: "execute_track_g_video_1_stage_00",
      arguments: {
        objective: stage00Objective,
        confirm: true,
        ownerApprovalText: "START STAGE 00",
      },
    });
    assert.equal(stage00Replay.structuredContent.replayed, true);
    assert.equal(stage00Replay.structuredContent.briefSha256, stage00.structuredContent.briefSha256);

    const contract = await d1.prepare("SELECT * FROM track_g_run_contract").first();
    assert.equal(contract.profile, "REDUCED");
    assert.equal(contract.assurance_mode, "WARNING_ONLY");
    assert.equal(contract.execution_namespace, "production");
    assert.equal(contract.release_eligible, 0);
    assert.equal(contract.provider_dispatch, 0);
    assert.equal(contract.auto_publish, 0);
    assert.equal(contract.stop_before_stage, "15");
    assert.equal(contract.preserve_rejected_candidates, 1);
    await assert.rejects(
      d1.prepare("UPDATE track_g_run_contract SET release_eligible = 1").run(),
      /TRACK_G_RUN_CONTRACT_APPEND_ONLY/u,
    );
    await assert.rejects(
      d1.prepare("DELETE FROM track_g_run_contract").run(),
      /TRACK_G_RUN_CONTRACT_APPEND_ONLY/u,
    );

    const episode = await d1.prepare("SELECT status FROM episode WHERE sequence = 1").first();
    assert.equal(episode.status, "IN_PRODUCTION");
    const stagePlan = JSON.parse(contract.stage_plan_json);
    assert.equal(stagePlan.includes("15"), false);
    assert.equal(stagePlan.includes("16"), false);

    const productionPackage = await d1.prepare("SELECT * FROM production_package").first();
    const brief = await d1.prepare("SELECT * FROM content_brief").first();
    const stageInstance = await d1.prepare("SELECT * FROM stage_instance").first();
    const stageArtifact = await d1.prepare("SELECT * FROM stage_artifact").first();
    const spendCeilings = await d1.prepare("SELECT * FROM spend_ceiling ORDER BY scope").all();
    assert.equal(productionPackage.namespace, "production");
    assert.equal(productionPackage.brief_hash, brief.canonical_hash);
    assert.equal(productionPackage.request_ceiling, 0);
    assert.equal(productionPackage.spend_ceiling_usd, 30);
    assert.equal(productionPackage.auto_dispatch, 0);
    assert.equal(productionPackage.auto_publish, 0);
    assert.equal(stageInstance.stage_code, "00");
    assert.equal(stageInstance.control_state, "FROZEN");
    assert.equal(stageArtifact.canonical_hash, brief.canonical_hash);
    assert.equal(stageArtifact.immutability_state, "SEALED");
    assert.equal(stageArtifact.eligibility_state, "ELIGIBLE_FOR_STAGE");
    assert.equal(spendCeilings.results.length, 4);

    const bucket = await mf.getR2Bucket("BUCKET");
    const productionEvidence = await bucket.get(stageArtifact.r2_key);
    assert.ok(productionEvidence);
    const productionEvidenceBytes = Buffer.from(await productionEvidence.arrayBuffer());
    assert.equal(createHash("sha256").update(productionEvidenceBytes).digest("hex"), brief.canonical_hash);
    await assert.rejects(
      d1.prepare("UPDATE stage_artifact SET eligibility_state = 'INELIGIBLE'").run(),
      /STAGE_ARTIFACT_APPEND_ONLY/u,
    );
    await assert.rejects(
      d1.prepare("UPDATE production_package SET auto_dispatch = 1").run(),
      /TRACK_G_PRODUCTION_PACKAGE_FAIL_CLOSED/u,
    );

    const evidence = await bucket.get(contract.bootstrap_evidence_r2_key);
    assert.ok(evidence);
    const evidenceBytes = Buffer.from(await evidence.arrayBuffer());
    assert.equal(createHash("sha256").update(evidenceBytes).digest("hex"), contract.bootstrap_evidence_sha256);

    const stage01Objective = "Produce the source-bound market and audience baseline, pass M0 and M1, and stop at Stage 02 readiness.";
    const stage01 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "01",
        objective: stage01Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage01.isError, undefined, JSON.stringify(stage01));
    assert.equal(stage01.structuredContent.accepted, true);
    assert.equal(stage01.structuredContent.replayed, false);
    assert.equal(stage01.structuredContent.runId, first.structuredContent.runId);
    assert.equal(stage01.structuredContent.currentStep, "STAGE_02_READY");
    assert.equal(stage01.structuredContent.stageCode, "01");
    assert.equal(stage01.structuredContent.stageState, "FROZEN");
    assert.equal(stage01.structuredContent.artifactType, "MARKET_AUDIENCE_INTELLIGENCE");
    assert.equal(stage01.structuredContent.artifactState, "SEALED");
    assert.equal(stage01.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage01.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_SOURCE_PROVENANCE", "PASS"],
      ["M1_AUDIENCE_JOB_LINT", "PASS"],
    ]);
    assert.equal(stage01.structuredContent.stageReservedUsd, 0);
    assert.equal(stage01.structuredContent.stageActualUsd, 0);
    assert.equal(stage01.structuredContent.humanGate, "NOT_REQUIRED");
    assert.equal(stage01.structuredContent.providerDispatch, "OFF");
    assert.equal(stage01.structuredContent.releaseEligible, false);
    assert.equal(stage01.structuredContent.autoPublish, "OFF");

    const stage01Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "01",
        objective: stage01Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage01Replay.structuredContent.replayed, true);
    assert.equal(stage01Replay.structuredContent.artifactSha256, stage01.structuredContent.artifactSha256);

    const stage01Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '01'").first();
    const stage01Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage01Instance.id).first();
    assert.equal(stage01Instance.control_state, "FROZEN");
    assert.equal(stage01Artifact.artifact_type, "MARKET_AUDIENCE_INTELLIGENCE");
    assert.equal(stage01Artifact.canonical_hash, stage01.structuredContent.artifactSha256);
    const stage01Evidence = await bucket.get(stage01Artifact.r2_key);
    assert.ok(stage01Evidence);
    const stage01EvidenceJson = JSON.parse(Buffer.from(await stage01Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage01EvidenceJson.researchMode, "SEALED_INTERNAL_PROVENANCE_ONLY");
    assert.deepEqual(stage01EvidenceJson.market.externalClaims, []);
    assert.equal(stage01EvidenceJson.controls.providerDispatch, "OFF");
    assert.equal(stage01EvidenceJson.budget.actualUsd, 0);

    const stage02Objective = "Seal the owner-approved reference set, run deterministic anti-copy measurements, and stop at Stage 03 readiness.";
    const stage02 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "02",
        objective: stage02Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage02.isError, undefined, JSON.stringify(stage02));
    assert.equal(stage02.structuredContent.accepted, true);
    assert.equal(stage02.structuredContent.replayed, false);
    assert.equal(stage02.structuredContent.currentStep, "STAGE_03_READY");
    assert.equal(stage02.structuredContent.stageCode, "02");
    assert.equal(stage02.structuredContent.stageState, "FROZEN");
    assert.equal(stage02.structuredContent.artifactType, "REFERENCE_ANTI_COPY");
    assert.equal(stage02.structuredContent.artifactState, "SEALED");
    assert.equal(stage02.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage02.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_ANTI_COPY", "PASS"],
      ["M1_DIFFERENTIATION", "PASS"],
    ]);
    assert.equal(stage02.structuredContent.stageReservedUsd, 0);
    assert.equal(stage02.structuredContent.stageActualUsd, 0);
    assert.equal(stage02.structuredContent.humanGate, "NOT_REQUIRED");
    assert.equal(stage02.structuredContent.providerDispatch, "OFF");
    assert.equal(stage02.structuredContent.releaseEligible, false);
    assert.equal(stage02.structuredContent.autoPublish, "OFF");

    const stage02Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "02",
        objective: stage02Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage02Replay.structuredContent.replayed, true);
    assert.equal(stage02Replay.structuredContent.artifactSha256, stage02.structuredContent.artifactSha256);

    const stage02Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '02'").first();
    const stage02Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage02Instance.id).first();
    assert.equal(stage02Instance.control_state, "FROZEN");
    assert.equal(stage02Artifact.artifact_type, "REFERENCE_ANTI_COPY");
    assert.equal(stage02Artifact.canonical_hash, stage02.structuredContent.artifactSha256);
    const stage02Evidence = await bucket.get(stage02Artifact.r2_key);
    assert.ok(stage02Evidence);
    const stage02EvidenceJson = JSON.parse(Buffer.from(await stage02Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage02EvidenceJson.referenceMode, "SEALED_OWNER_APPROVED_QUEUE_ONLY");
    assert.equal(stage02EvidenceJson.referenceSet.count, 9);
    assert.equal(stage02EvidenceJson.fourDimensionAntiCopy.lexicalSevenGram.maxSharedSevenGrams, 0);
    assert.equal(stage02EvidenceJson.fourDimensionAntiCopy.visualPHash.state, "DEFERRED_TO_STAGE_09");
    assert.equal(stage02EvidenceJson.fourDimensionAntiCopy.calibrationState, "WARNING_ONLY_UNCALIBRATED");
    assert.equal(stage02EvidenceJson.controls.providerDispatch, "OFF");
    assert.equal(stage02EvidenceJson.budget.actualUsd, 0);

    const stage03Objective = "Seal the federal source snapshots, build the claim graph and terminology ledger, pass advice and numeric gates, and stop at Stage 04 readiness.";
    const stage03 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "03",
        objective: stage03Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage03.isError, undefined, JSON.stringify(stage03));
    assert.equal(stage03.structuredContent.accepted, true);
    assert.equal(stage03.structuredContent.replayed, false);
    assert.equal(stage03.structuredContent.currentStep, "STAGE_04_READY");
    assert.equal(stage03.structuredContent.stageCode, "03");
    assert.equal(stage03.structuredContent.stageState, "FROZEN");
    assert.equal(stage03.structuredContent.artifactType, "TRUTH_CLAIM_GRAPH_TERMINOLOGY");
    assert.equal(stage03.structuredContent.artifactState, "SEALED");
    assert.equal(stage03.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage03.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_ADVICE_LINT", "PASS"],
      ["M0_CRITICAL_CLAIM_TIER", "PASS"],
      ["M1_NUMERIC_SCHEMA", "PASS"],
    ]);
    assert.equal(stage03.structuredContent.stageReservedUsd, 0);
    assert.equal(stage03.structuredContent.stageActualUsd, 0);
    assert.equal(stage03.structuredContent.humanGate, "NOT_REQUIRED");
    assert.equal(stage03.structuredContent.providerDispatch, "OFF");
    assert.equal(stage03.structuredContent.releaseEligible, false);
    assert.equal(stage03.structuredContent.autoPublish, "OFF");

    const stage03Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "03",
        objective: stage03Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage03Replay.structuredContent.replayed, true);
    assert.equal(stage03Replay.structuredContent.artifactSha256, stage03.structuredContent.artifactSha256);

    const stage03Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '03'").first();
    const stage03Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage03Instance.id).first();
    const truthSources = await d1.prepare("SELECT * FROM truth_source ORDER BY id").all();
    const truthClaims = await d1.prepare("SELECT * FROM truth_claim ORDER BY id").all();
    const truthClaimSources = await d1.prepare("SELECT * FROM truth_claim_source ORDER BY claim_id, source_id").all();
    const truthTerminology = await d1.prepare("SELECT * FROM truth_terminology ORDER BY id").all();
    assert.equal(stage03Instance.control_state, "FROZEN");
    assert.equal(stage03Artifact.artifact_type, "TRUTH_CLAIM_GRAPH_TERMINOLOGY");
    assert.equal(stage03Artifact.canonical_hash, stage03.structuredContent.artifactSha256);
    assert.equal(truthSources.results.length, 3);
    assert.equal(truthClaims.results.length, 6);
    assert.equal(truthClaimSources.results.length, 7);
    assert.equal(truthTerminology.results.length, 4);
    assert.ok(truthSources.results.every((source) => source.tier === 1));
    assert.ok(truthSources.results.every((source) => /^[0-9a-f]{64}$/u.test(source.content_hash)));
    const numericClaim = truthClaims.results.find((claim) => claim.id === "truth_claim_video_1_001");
    assert.deepEqual(JSON.parse(numericClaim.numeric_json), {
      amount: 3.5,
      currency: "USD",
      display: "$3.5 billion",
      observationPeriod: "2025",
      scale: "BILLION",
      sourceId: "truth_source_ftc_imposter_losses_2025_v1",
    });
    const stage03Evidence = await bucket.get(stage03Artifact.r2_key);
    assert.ok(stage03Evidence);
    const stage03EvidenceJson = JSON.parse(Buffer.from(await stage03Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage03EvidenceJson.researchMode, "BUILD_VERIFIED_FEDERAL_PRIMARY_SOURCES");
    assert.equal(stage03EvidenceJson.sources.length, 3);
    assert.equal(stage03EvidenceJson.claimGraph.claims.length, 6);
    assert.equal(stage03EvidenceJson.claimGraph.contradictions.length, 0);
    assert.equal(stage03EvidenceJson.adviceLint.adversarialFixtureCount, 31);
    assert.equal(stage03EvidenceJson.adviceLint.adversarialDetectedCount, 31);
    assert.equal(stage03EvidenceJson.numericSchema.numericClaimCount, 1);
    assert.equal(stage03EvidenceJson.controls.nextHumanGate, "STAGE_04_CHAMPION_SELECTION");
    for (const source of truthSources.results) {
      const sourceEvidence = await bucket.get(source.snapshot_r2_key);
      assert.ok(sourceEvidence);
      const sourceBytes = Buffer.from(await sourceEvidence.arrayBuffer());
      assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), source.content_hash);
    }
    await assert.rejects(
      d1.prepare("UPDATE truth_claim SET text = 'mutated'").run(),
      /TRUTH_CLAIM_APPEND_ONLY/u,
    );

    const directAdvanceBlocked = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "04",
        objective: "Verify that the stable runner cannot bypass the required Stage 04 owner champion decision.",
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(directAdvanceBlocked.isError, true);
    assert.match(directAdvanceBlocked.content[0].text, /TRACK_G_STAGE_04_HUMAN_GATE_COMMAND_REQUIRED/u);

    const stage04Objective = "Prepare two diverse Stage 04 creative routes, run three blind qualification critics, preserve both candidates and stop for the owner champion decision.";
    const stage04Prepared = await client.callTool({
      name: "prepare_track_g_video_1_stage_04_tournament",
      arguments: {
        objective: stage04Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 04 TOURNAMENT",
      },
    });
    assert.equal(stage04Prepared.isError, undefined, JSON.stringify(stage04Prepared));
    assert.equal(stage04Prepared.structuredContent.accepted, true);
    assert.equal(stage04Prepared.structuredContent.replayed, false);
    assert.equal(stage04Prepared.structuredContent.currentStep, "STAGE_04_READY");
    assert.equal(stage04Prepared.structuredContent.stageState, "RUNNING");
    assert.equal(stage04Prepared.structuredContent.tournamentState, "AWAITING_HUMAN");
    assert.equal(stage04Prepared.structuredContent.candidates.length, 2);
    assert.equal(stage04Prepared.structuredContent.candidates.filter((candidate) => candidate.machineRecommended).length, 1);
    assert.ok(stage04Prepared.structuredContent.candidates.every((candidate) => candidate.aggregateScore >= 92));
    assert.deepEqual(stage04Prepared.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_ROUTE_DIVERSITY", "PASS"],
      ["M1_PACKAGING_CONTRACT", "PASS"],
    ]);
    assert.equal(stage04Prepared.structuredContent.humanGate, "REQUIRED:HP-02_D1_CHAMPION_SELECTION");
    assert.equal(stage04Prepared.structuredContent.providerDispatch, "OFF");
    assert.equal(stage04Prepared.structuredContent.stageActualUsd, 0);

    const stage04PrepareReplay = await client.callTool({
      name: "prepare_track_g_video_1_stage_04_tournament",
      arguments: {
        objective: stage04Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 04 TOURNAMENT",
      },
    });
    assert.equal(stage04PrepareReplay.structuredContent.replayed, true);

    const stage04InstanceRunning = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '04'").first();
    const tournament = await d1.prepare("SELECT * FROM creative_tournament").first();
    const creativeCandidates = await d1.prepare("SELECT * FROM creative_route_candidate ORDER BY route_order").all();
    const creativeJudgments = await d1.prepare("SELECT * FROM creative_tournament_judgment ORDER BY critic_id, candidate_id").all();
    assert.equal(stage04InstanceRunning.control_state, "RUNNING");
    assert.equal(tournament.route_count, 2);
    assert.equal(tournament.critic_count, 3);
    assert.equal(creativeCandidates.results.length, 2);
    assert.equal(creativeJudgments.results.length, 6);
    assert.equal(new Set(creativeJudgments.results.map((judgment) => judgment.critic_id)).size, 3);
    assert.ok(creativeJudgments.results.every((judgment) => /^[0-9a-f]{64}$/u.test(judgment.blind_input_hash)));
    const candidateSetEvidence = await bucket.get(tournament.candidate_set_r2_key);
    assert.ok(candidateSetEvidence);
    const candidateSetJson = JSON.parse(Buffer.from(await candidateSetEvidence.arrayBuffer()).toString("utf8"));
    assert.equal(candidateSetJson.generation.providerCalls, 0);
    assert.equal(candidateSetJson.controls.preserveRejectedCandidates, true);
    assert.equal(candidateSetJson.blindJudgePayloads.length, 2);
    assert.ok(candidateSetJson.blindJudgePayloads.every((payload) => !("id" in payload) && !("routeName" in payload)));
    assert.ok(candidateSetJson.blindJudgePayloads.every((payload) => !JSON.stringify(payload).includes("provider")));
    await assert.rejects(
      d1.prepare("UPDATE creative_route_candidate SET route_name = 'mutated'").run(),
      /CREATIVE_CANDIDATE_APPEND_ONLY/u,
    );

    const selectedCandidate = stage04Prepared.structuredContent.candidates
      .find((candidate) => candidate.candidateId === "creative_route_video_1_safe_account_conveyor_v1");
    assert.ok(selectedCandidate);
    const rationale = "Choose the decision-tree route because it makes the irreversible money-movement pivot easier to understand and visualize for a household audience.";
    const stage04Selected = await client.callTool({
      name: "select_track_g_video_1_stage_04_champion",
      arguments: {
        candidateId: selectedCandidate.candidateId,
        rationale,
        confirm: true,
        ownerApprovalText: "SELECT STAGE 04 CHAMPION",
      },
    });
    assert.equal(stage04Selected.isError, undefined, JSON.stringify(stage04Selected));
    assert.equal(stage04Selected.structuredContent.accepted, true);
    assert.equal(stage04Selected.structuredContent.replayed, false);
    assert.equal(stage04Selected.structuredContent.currentStep, "STAGE_05_READY");
    assert.equal(stage04Selected.structuredContent.stageState, "FROZEN");
    assert.equal(stage04Selected.structuredContent.artifactType, "CREATIVE_ROUTE_TOURNAMENT_PACKAGING");
    assert.equal(stage04Selected.structuredContent.selectedCandidateId, selectedCandidate.candidateId);
    assert.equal(stage04Selected.structuredContent.preservedCandidateCount, 2);
    assert.equal(stage04Selected.structuredContent.humanGate, "SATISFIED:HP-02_D1_CHAMPION_SELECTION");
    assert.equal(stage04Selected.structuredContent.providerDispatch, "OFF");
    assert.equal(stage04Selected.structuredContent.stageActualUsd, 0);

    const stage04SelectionReplay = await client.callTool({
      name: "select_track_g_video_1_stage_04_champion",
      arguments: {
        candidateId: selectedCandidate.candidateId,
        rationale,
        confirm: true,
        ownerApprovalText: "SELECT STAGE 04 CHAMPION",
      },
    });
    assert.equal(stage04SelectionReplay.structuredContent.replayed, true);
    assert.equal(stage04SelectionReplay.structuredContent.artifactSha256, stage04Selected.structuredContent.artifactSha256);

    const stage04InstanceFrozen = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '04'").first();
    const stage04Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage04InstanceFrozen.id).first();
    const selection = await d1.prepare("SELECT * FROM creative_tournament_selection").first();
    const humanDecision = await d1.prepare("SELECT * FROM human_decision WHERE id = ?")
      .bind(selection.human_decision_id).first();
    assert.equal(stage04InstanceFrozen.control_state, "FROZEN");
    assert.equal(stage04Artifact.artifact_type, "CREATIVE_ROUTE_TOURNAMENT_PACKAGING");
    assert.equal(selection.candidate_id, selectedCandidate.candidateId);
    assert.equal(humanDecision.decision_type, "D1");
    assert.equal(humanDecision.rationale_text, rationale);
    const finalStage04Evidence = await bucket.get(stage04Artifact.r2_key);
    const humanDecisionEvidence = await bucket.get(humanDecision.diff_r2_key);
    assert.ok(finalStage04Evidence);
    assert.ok(humanDecisionEvidence);
    const finalStage04Json = JSON.parse(Buffer.from(await finalStage04Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(finalStage04Json.champion.candidateId, selectedCandidate.candidateId);
    assert.equal(finalStage04Json.champion.machineRecommended, false);
    assert.equal(finalStage04Json.candidateSet.preservedCandidateIds.length, 2);
    await assert.rejects(
      d1.prepare("UPDATE human_decision SET rationale_text = 'mutated'").run(),
      /HUMAN_DECISION_APPEND_ONLY/u,
    );

    const stage05Objective = "Seal the selected route's story architecture, assert a knowledge-state change for every beat, and persist the mandatory uncalibrated P9 prediction before Stage 06.";
    const stage05 = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "05",
        objective: stage05Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage05.isError, undefined, JSON.stringify(stage05));
    assert.equal(stage05.structuredContent.accepted, true);
    assert.equal(stage05.structuredContent.replayed, false);
    assert.equal(stage05.structuredContent.currentStep, "STAGE_06_READY");
    assert.equal(stage05.structuredContent.stageCode, "05");
    assert.equal(stage05.structuredContent.stageState, "FROZEN");
    assert.equal(stage05.structuredContent.artifactType, "STORY_ARCHITECTURE_PREDICTION_SEAL");
    assert.equal(stage05.structuredContent.artifactState, "SEALED");
    assert.equal(stage05.structuredContent.artifactEligibility, "ELIGIBLE_FOR_STAGE");
    assert.deepEqual(stage05.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_BEAT_STATE_ASSERTION", "PASS"],
      ["M1_PREDICTION_SEALED", "PASS"],
    ]);
    assert.equal(stage05.structuredContent.stageReservedUsd, 0);
    assert.equal(stage05.structuredContent.stageActualUsd, 0);
    assert.equal(stage05.structuredContent.providerDispatch, "OFF");

    const stage05Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "05",
        objective: stage05Objective,
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(stage05Replay.structuredContent.replayed, true);
    assert.equal(stage05Replay.structuredContent.artifactSha256, stage05.structuredContent.artifactSha256);

    const stage05Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '05'").first();
    const stage05Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage05Instance.id).first();
    const prediction = await d1.prepare("SELECT * FROM predicted_performance").first();
    assert.equal(stage05Instance.control_state, "FROZEN");
    assert.equal(stage05Artifact.artifact_type, "STORY_ARCHITECTURE_PREDICTION_SEAL");
    assert.equal(prediction.package_id, "package_track_g_video_1_v1");
    assert.equal(prediction.model_version, "qualification-prior-v1-uncalibrated");
    assert.equal(prediction.canonical_hash, stage05.structuredContent.artifactSha256);
    assert.equal(JSON.parse(prediction.retention_curve_json).length, 7);
    assert.equal(JSON.parse(prediction.beat_risk_json).length, 6);
    const stage05Evidence = await bucket.get(stage05Artifact.r2_key);
    assert.ok(stage05Evidence);
    const stage05Json = JSON.parse(Buffer.from(await stage05Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage05Json.champion.candidateId, selectedCandidate.candidateId);
    assert.equal(stage05Json.storyArchitecture.beats.length, 6);
    assert.ok(stage05Json.storyArchitecture.beats.every((beat) => beat.knowledgeBefore !== beat.knowledgeAfter));
    assert.equal(stage05Json.predictedPerformance.calibrationState, "UNCALIBRATED_VIDEO_1_PRIOR");
    assert.equal(stage05Json.predictedPerformance.gatingUse, "STRUCTURAL_SEAL_ONLY");
    await assert.rejects(
      d1.prepare("UPDATE predicted_performance SET ctr_estimate = 0.99").run(),
      /PREDICTED_PERFORMANCE_APPEND_ONLY/u,
    );

    const directStage06Blocked = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "06",
        objective: "Verify that Stage 06 cannot bypass its required HP-02 editorial decision command path.",
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(directStage06Blocked.isError, true);
    assert.match(directStage06Blocked.content[0].text, /TRACK_G_STAGE_06_HUMAN_GATE_COMMAND_REQUIRED/u);

    const stage06Objective = "Prepare the complete claim-bound Stage 06 script, run the second advice lint, script lint and number trace, then stop for a substantive HP-02 editorial decision.";
    const stage06Prepared = await client.callTool({
      name: "prepare_track_g_video_1_stage_06_script_review",
      arguments: {
        objective: stage06Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 06 SCRIPT REVIEW",
      },
    });
    assert.equal(stage06Prepared.isError, undefined, JSON.stringify(stage06Prepared));
    assert.equal(stage06Prepared.structuredContent.accepted, true);
    assert.equal(stage06Prepared.structuredContent.replayed, false);
    assert.equal(stage06Prepared.structuredContent.currentStep, "STAGE_06_READY");
    assert.equal(stage06Prepared.structuredContent.stageState, "RUNNING");
    assert.equal(stage06Prepared.structuredContent.reviewState, "AWAITING_HUMAN");
    assert.equal(stage06Prepared.structuredContent.sections.length, 6);
    assert.ok(stage06Prepared.structuredContent.wordCount >= 700);
    assert.ok(stage06Prepared.structuredContent.estimatedDurationSec >= 420);
    assert.deepEqual(stage06Prepared.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_ADVICE_LINT_SECOND_PASS", "PASS"],
      ["M1_SCRIPT_LINT", "PASS"],
      ["M1_NUMBER_TRACE", "PASS"],
    ]);
    assert.equal(stage06Prepared.structuredContent.humanGate, "REQUIRED:HP-02_D2_OR_D4_EDITORIAL_DECISION");
    assert.equal(stage06Prepared.structuredContent.providerDispatch, "OFF");
    assert.equal(stage06Prepared.structuredContent.stageActualUsd, 0);

    const stage06PrepareReplay = await client.callTool({
      name: "prepare_track_g_video_1_stage_06_script_review",
      arguments: {
        objective: stage06Objective,
        confirm: true,
        ownerApprovalText: "PREPARE STAGE 06 SCRIPT REVIEW",
      },
    });
    assert.equal(stage06PrepareReplay.structuredContent.replayed, true);
    assert.equal(stage06PrepareReplay.structuredContent.draftSha256,
      stage06Prepared.structuredContent.draftSha256);

    const stage06InstanceRunning = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '06'").first();
    const scriptDraft = await d1.prepare("SELECT * FROM script_draft").first();
    assert.equal(stage06InstanceRunning.control_state, "RUNNING");
    assert.equal(scriptDraft.advice_lint_state, "PASS");
    assert.equal(scriptDraft.script_lint_state, "PASS");
    assert.equal(scriptDraft.number_trace_state, "PASS");
    assert.equal(JSON.parse(scriptDraft.sections_json).length, 6);
    assert.equal(JSON.parse(scriptDraft.number_trace_json).length, 2);
    const workbenchResponse = await mf.dispatchFetch("http://localhost/api/operator", { headers: ownerHeaders });
    const workbenchSnapshot = await workbenchResponse.json();
    assert.equal(workbenchResponse.status, 200, JSON.stringify(workbenchSnapshot));
    assert.equal(workbenchSnapshot.trackGWorkbench.run.currentStep, "STAGE_06_READY");
    assert.equal(workbenchSnapshot.trackGWorkbench.stage06.reviewState, "AWAITING_HUMAN");
    assert.equal(workbenchSnapshot.trackGWorkbench.stage06.sections.length, 6);
    assert.deepEqual(workbenchSnapshot.trackGWorkbench.allowedActions,
      ["APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION"]);
    assert.equal(workbenchSnapshot.latestRunEvents[0].runId, workbenchSnapshot.trackGWorkbench.run.id);
    const scriptDraftEvidence = await bucket.get(scriptDraft.r2_key);
    assert.ok(scriptDraftEvidence);
    await assert.rejects(
      d1.prepare("UPDATE script_draft SET title = 'mutated'").run(),
      /SCRIPT_DRAFT_APPEND_ONLY/u,
    );

    const emptyEditorial = await client.callTool({
      name: "apply_track_g_video_1_stage_06_editorial_decision",
      arguments: {
        decisionType: "D2",
        revisedTitle: stage06Prepared.structuredContent.draftTitle,
        revisedHook: stage06Prepared.structuredContent.draftHook,
        rationale: "A substantive human-authored edit is required before the script may be sealed.",
        confirm: true,
        ownerApprovalText: "APPLY STAGE 06 EDITORIAL DECISION",
      },
    });
    assert.equal(emptyEditorial.isError, true);
    assert.match(emptyEditorial.content[0].text, /TRACK_G_STAGE_06_D2_SUBSTANTIVE_EDIT_REQUIRED/u);

    const revisedTitle = "The Bank Fraud Alert Is the Trap — Break Its Control";
    const revisedHook = "That fraud alert may not be protecting your account. It may be the first move in a process built to control your next decision.";
    const editorialRationale = "Use a more direct opening and title so the audience immediately understands that the alert channel itself is the mechanism of control.";
    const stage06ApiResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        commandType: "APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION",
        decisionType: "D2",
        revisedTitle,
        revisedHook,
        rationale: editorialRationale,
        confirm: true,
      }),
    });
    const stage06ApiApplied = await stage06ApiResponse.json();
    assert.equal(stage06ApiResponse.status, 201);
    assert.equal(stage06ApiApplied.accepted, true);
    assert.equal(stage06ApiApplied.replayed, false);
    assert.equal(stage06ApiApplied.currentStep, "STAGE_07A_READY");
    assert.equal(stage06ApiApplied.stageState, "FROZEN");
    assert.equal(stage06ApiApplied.decisionType, "D2");
    assert.equal(stage06ApiApplied.providerDispatch, "OFF");

    const stage06Applied = await client.callTool({
      name: "apply_track_g_video_1_stage_06_editorial_decision",
      arguments: {
        decisionType: "D2",
        revisedTitle,
        revisedHook,
        rationale: editorialRationale,
        confirm: true,
        ownerApprovalText: "APPLY STAGE 06 EDITORIAL DECISION",
      },
    });
    assert.equal(stage06Applied.isError, undefined, JSON.stringify(stage06Applied));
    assert.equal(stage06Applied.structuredContent.replayed, true);
    assert.equal(stage06Applied.structuredContent.currentStep, "STAGE_07A_READY");
    assert.equal(stage06Applied.structuredContent.artifactType, "SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL");
    assert.equal(stage06Applied.structuredContent.artifactState, "SEALED");
    assert.equal(stage06Applied.structuredContent.finalTitle, revisedTitle);
    assert.equal(stage06Applied.structuredContent.finalHook, revisedHook);
    assert.equal(stage06Applied.structuredContent.artifactSha256, stage06ApiApplied.artifactSha256);

    const stage06InstanceFrozen = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '06'").first();
    const stage06Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage06InstanceFrozen.id).first();
    const stage06Decision = await d1.prepare("SELECT * FROM human_decision WHERE artifact_after_id = ?")
      .bind(stage06Artifact.id).first();
    const allHumanDecisions = await d1.prepare("SELECT * FROM human_decision ORDER BY created_at").all();
    assert.equal(stage06InstanceFrozen.control_state, "FROZEN");
    assert.equal(stage06Artifact.artifact_type, "SCRIPT_NUMBER_AUDIT_EDITORIAL_SEAL");
    assert.equal(stage06Decision.decision_type, "D2");
    assert.equal(stage06Decision.rationale_text, editorialRationale);
    assert.equal(allHumanDecisions.results.length, 2);
    const finalStage06Evidence = await bucket.get(stage06Artifact.r2_key);
    const stage06DecisionEvidence = await bucket.get(stage06Decision.diff_r2_key);
    assert.ok(finalStage06Evidence);
    assert.ok(stage06DecisionEvidence);
    const finalStage06Json = JSON.parse(Buffer.from(await finalStage06Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(finalStage06Json.finalScript.title, revisedTitle);
    assert.equal(finalStage06Json.finalScript.hook, revisedHook);
    assert.equal(finalStage06Json.editorialDecision.decisionType, "D2");

    const directStage07ABlocked = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: {
        stageCode: "07A",
        objective: "Verify that Stage 07A cannot bypass its required HP-02 D5 tone selection command path.",
        confirm: true,
        ownerApprovalText: "ADVANCE TRACK G VIDEO 1",
      },
    });
    assert.equal(directStage07ABlocked.isError, true);
    assert.match(directStage07ABlocked.content[0].text, /TRACK_G_STAGE_07A_HUMAN_GATE_COMMAND_REQUIRED/u);

    const stage07APrepareResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT",
        confirm: true }),
    });
    const stage07APreparedApi = await stage07APrepareResponse.json();
    assert.equal(stage07APrepareResponse.status, 201, JSON.stringify(stage07APreparedApi));
    assert.equal(stage07APreparedApi.currentStep, "STAGE_07A_READY");
    assert.equal(stage07APreparedApi.stageState, "RUNNING");
    assert.equal(stage07APreparedApi.candidateCount, 2);

    const stage07APrepared = await client.callTool({
      name: "prepare_track_g_video_1_stage_07a_voice_tournament",
      arguments: { objective: "Prepare two qualified voice routes and stop for the owner D5 tone decision.",
        confirm: true, ownerApprovalText: "PREPARE STAGE 07A VOICE TOURNAMENT" },
    });
    assert.equal(stage07APrepared.isError, undefined, JSON.stringify(stage07APrepared));
    assert.equal(stage07APrepared.structuredContent.replayed, true);
    assert.equal(stage07APrepared.structuredContent.candidates.length, 2);
    assert.equal(stage07APrepared.structuredContent.segmentCount, 6);
    assert.deepEqual(stage07APrepared.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_SEGMENTATION_BOUNDARY", "PASS"],
      ["M1_VOICE_SETTINGS_HASH", "PASS"],
    ]);
    const stage07AWorkbench = await (await mf.dispatchFetch("http://localhost/api/operator",
      { headers: ownerHeaders })).json();
    assert.equal(stage07AWorkbench.trackGWorkbench.stage07A.reviewState, "AWAITING_HUMAN");
    assert.equal(stage07AWorkbench.trackGWorkbench.stage07A.candidates.length, 2);
    assert.deepEqual(stage07AWorkbench.trackGWorkbench.allowedActions,
      ["SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE"]);

    const toneCandidate = stage07APrepared.structuredContent.candidates[0];
    const toneRationale = "Use controlled urgency because this audience needs the danger and the stop action to be unmistakable without sounding alarmist.";
    const stage07ASelectResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE",
        candidateId: toneCandidate.candidateId, rationale: toneRationale, confirm: true }),
    });
    const stage07ASelectedApi = await stage07ASelectResponse.json();
    assert.equal(stage07ASelectResponse.status, 201, JSON.stringify(stage07ASelectedApi));
    assert.equal(stage07ASelectedApi.currentStep, "STAGE_07B_READY");
    assert.equal(stage07ASelectedApi.stageState, "FROZEN");
    assert.equal(stage07ASelectedApi.decisionType, "D5");

    const stage07ASelected = await client.callTool({
      name: "select_track_g_video_1_stage_07a_tone",
      arguments: { candidateId: toneCandidate.candidateId, rationale: toneRationale,
        confirm: true, ownerApprovalText: "SELECT STAGE 07A TONE" },
    });
    assert.equal(stage07ASelected.isError, undefined, JSON.stringify(stage07ASelected));
    assert.equal(stage07ASelected.structuredContent.replayed, true);
    assert.equal(stage07ASelected.structuredContent.currentStep, "STAGE_07B_READY");
    assert.equal(stage07ASelected.structuredContent.artifactType, "VOICE_DESIGN_TTS_SEGMENTATION_SEAL");
    assert.equal(stage07ASelected.structuredContent.preservedCandidateCount, 2);
    const stage07AInstance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '07A'").first();
    const stage07AArtifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage07AInstance.id).first();
    const stage07ADecision = await d1.prepare("SELECT * FROM human_decision WHERE artifact_after_id = ?")
      .bind(stage07AArtifact.id).first();
    assert.equal(stage07AInstance.control_state, "FROZEN");
    assert.equal(stage07ADecision.decision_type, "D5");
    assert.ok(await bucket.get(stage07AArtifact.r2_key));
    assert.ok(await bucket.get(stage07ADecision.diff_r2_key));

    const stage07BWorkbench = await (await mf.dispatchFetch("http://localhost/api/operator",
      { headers: ownerHeaders })).json();
    assert.deepEqual(stage07BWorkbench.trackGWorkbench.allowedActions,
      ["ADVANCE_TRACK_G_VIDEO_1_STAGE_07B"]);
    assert.equal(stage07BWorkbench.trackGWorkbench.stage07B.controlState, "READY");
    assert.equal(stage07BWorkbench.trackGWorkbench.stage07B.assignments.length, 6);
    assert.deepEqual(stage07BWorkbench.trackGWorkbench.stage07B.distribution.map((entry) => entry.count),
      [2, 2, 2]);

    const stage07BResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "ADVANCE_TRACK_G_VIDEO_1_STAGE_07B", confirm: true }),
    });
    const stage07BApi = await stage07BResponse.json();
    assert.equal(stage07BResponse.status, 201, JSON.stringify(stage07BApi));
    assert.equal(stage07BApi.currentStep, "STAGE_08_READY");
    assert.equal(stage07BApi.stageState, "FROZEN");
    assert.equal(stage07BApi.gateResults.length, 2);

    const stage07BReplay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: { stageCode: "07B", objective: "Compile the sealed visual grammar and deterministic routing for all six beats.",
        confirm: true, ownerApprovalText: "ADVANCE TRACK G VIDEO 1" },
    });
    assert.equal(stage07BReplay.isError, undefined, JSON.stringify(stage07BReplay));
    assert.equal(stage07BReplay.structuredContent.replayed, true);
    assert.equal(stage07BReplay.structuredContent.currentStep, "STAGE_08_READY");
    assert.equal(stage07BReplay.structuredContent.artifactType, "VISUAL_GRAMMAR_ROUTING");
    assert.deepEqual(stage07BReplay.structuredContent.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_MOTION_CLASS_TOTAL", "PASS"],
      ["M1_ROUTE_DISTRIBUTION", "PASS"],
    ]);
    const stage07BInstance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '07B'").first();
    const stage07BArtifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage07BInstance.id).first();
    assert.equal(stage07BInstance.control_state, "FROZEN");
    assert.equal(stage07BArtifact.artifact_type, "VISUAL_GRAMMAR_ROUTING");
    assert.ok(await bucket.get(stage07BArtifact.r2_key));

    const stage08Workbench = await (await mf.dispatchFetch("http://localhost/api/operator",
      { headers: ownerHeaders })).json();
    assert.deepEqual(stage08Workbench.trackGWorkbench.allowedActions,
      ["ADVANCE_TRACK_G_VIDEO_1_STAGE_08"]);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.controlState, "READY");
    const compiledShotCount = stage08Workbench.trackGWorkbench.stage08.shots.length;
    assert.ok(compiledShotCount > 0);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.assertionCount, compiledShotCount * 3);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.targetFrames, 15300);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.shots[0].startFrame, 0);
    assert.equal(stage08Workbench.trackGWorkbench.stage08.shots.at(-1).endFrame, 15300);
    assert.ok(stage08Workbench.trackGWorkbench.stage08.shots.every((shot) => shot.assertions.length === 3));

    const stage08Response = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "ADVANCE_TRACK_G_VIDEO_1_STAGE_08", confirm: true }),
    });
    const stage08Api = await stage08Response.json();
    assert.equal(stage08Response.status, 201, JSON.stringify(stage08Api));
    assert.equal(stage08Api.currentStep, "STAGE_09_READY");
    assert.equal(stage08Api.stageState, "FROZEN");
    assert.equal(stage08Api.shotCount, compiledShotCount);
    assert.equal(stage08Api.assertionCount, compiledShotCount * 3);
    assert.deepEqual(stage08Api.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M1_TIMELINE_LINT", "PASS"],
      ["M1_DURATION_MATCH", "PASS"],
    ]);

    const stage08Replay = await client.callTool({
      name: "advance_track_g_video_1_stage",
      arguments: { stageCode: "08", objective: "Compile the frame-exact ShotCueProgram with three assertions per adaptive shot.",
        confirm: true, ownerApprovalText: "ADVANCE TRACK G VIDEO 1" },
    });
    assert.equal(stage08Replay.isError, undefined, JSON.stringify(stage08Replay));
    assert.equal(stage08Replay.structuredContent.replayed, true);
    assert.equal(stage08Replay.structuredContent.currentStep, "STAGE_09_READY");
    assert.equal(stage08Replay.structuredContent.artifactType, "SHOT_CUE_PROGRAM");
    const stage08Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '08'").first();
    const stage08Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage08Instance.id).first();
    assert.equal(stage08Instance.control_state, "FROZEN");
    assert.equal(stage08Artifact.artifact_type, "SHOT_CUE_PROGRAM");
    const stage08Evidence = await bucket.get(stage08Artifact.r2_key);
    assert.ok(stage08Evidence);
    const stage08EvidenceJson = JSON.parse(Buffer.from(await stage08Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage08EvidenceJson.shotCueProgram.shots.length, compiledShotCount);
    assert.ok(stage08EvidenceJson.shotCueProgram.shots.every((shot) => shot.assertions.length === 3));

    const stage09BeforeResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      headers: ownerHeaders,
    });
    const stage09Before = await stage09BeforeResponse.json();
    assert.equal(stage09Before.trackGWorkbench.stage09.reviewState, "NOT_PREPARED");
    assert.deepEqual(stage09Before.trackGWorkbench.allowedActions,
      ["PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW"]);

    const stage09PrepareResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW", confirm: true }),
    });
    const stage09Prepare = await stage09PrepareResponse.json();
    assert.equal(stage09PrepareResponse.status, 201, JSON.stringify(stage09Prepare));
    assert.equal(stage09Prepare.currentStep, "STAGE_09_READY");
    assert.equal(stage09Prepare.stageState, "RUNNING");
    assert.equal(stage09Prepare.reviewState, "AWAITING_HUMAN");
    assert.equal(stage09Prepare.assetCount, compiledShotCount);
    assert.equal(stage09Prepare.candidateCount, 2);
    assert.deepEqual(stage09Prepare.gateResults.map((gate) => [gate.gate, gate.state]), [
      ["M0_RIGHTS_LINEAGE", "PASS"],
      ["M1_SEMANTIC_FIT", "PASS"],
      ["M1_DUPLICATE_RATE", "PASS"],
    ]);

    const stage09WorkbenchResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      headers: ownerHeaders,
    });
    const stage09Workbench = await stage09WorkbenchResponse.json();
    const stage09Model = stage09Workbench.trackGWorkbench.stage09;
    assert.equal(stage09Model.reviewState, "AWAITING_HUMAN");
    assert.equal(stage09Model.assetCount, compiledShotCount);
    assert.equal(stage09Model.sourceCandidatesPerShot, 6);
    assert.equal(stage09Model.compositionsPerShot, 1);
    assert.equal(stage09Model.duplicateRate, 0);
    assert.ok(stage09Model.assets.every((asset) => asset.rightsLineage.state === "PASS"));
    assert.ok(stage09Model.assets.every((asset) => asset.semanticFit.state === "PASS"));
    assert.equal(new Set(stage09Model.assets.map((asset) => asset.visualFingerprint)).size,
      compiledShotCount);
    const selectedThumbnail = stage09Model.candidates.find((candidate) => candidate.machineRecommended);
    const thumbnailRationale = "This direct warning exposes the trust trap immediately while preserving a clear protective action.";
    const revisedThumbnailText = "THE WARNING IS THE TRAP";
    const stage09SelectResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ commandType: "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL",
        confirm: true, candidateId: selectedThumbnail.candidateId,
        revisedThumbnailText, rationale: thumbnailRationale }),
    });
    const stage09Select = await stage09SelectResponse.json();
    assert.equal(stage09SelectResponse.status, 201, JSON.stringify(stage09Select));
    assert.equal(stage09Select.currentStep, "STAGE_10_READY");
    assert.equal(stage09Select.stageState, "FROZEN");
    assert.equal(stage09Select.decisionType, "D3");
    assert.equal(stage09Select.revisedThumbnailText, revisedThumbnailText);

    const stage09Replay = await client.callTool({
      name: "select_track_g_video_1_stage_09_thumbnail",
      arguments: { candidateId: selectedThumbnail.candidateId, revisedThumbnailText,
        rationale: thumbnailRationale, confirm: true,
        ownerApprovalText: "SELECT STAGE 09 THUMBNAIL" },
    });
    assert.equal(stage09Replay.isError, undefined, JSON.stringify(stage09Replay));
    assert.equal(stage09Replay.structuredContent.replayed, true);
    assert.equal(stage09Replay.structuredContent.currentStep, "STAGE_10_READY");
    assert.equal(stage09Replay.structuredContent.artifactType,
      "VISUAL_ACQUISITION_COMPOSITION_SEAL");
    const stage09Instance = await d1.prepare("SELECT * FROM stage_instance WHERE stage_code = '09'").first();
    const stage09Artifact = await d1.prepare("SELECT * FROM stage_artifact WHERE stage_instance_id = ?")
      .bind(stage09Instance.id).first();
    assert.equal(stage09Instance.control_state, "FROZEN");
    assert.equal(stage09Artifact.artifact_type, "VISUAL_ACQUISITION_COMPOSITION_SEAL");
    const stage09Evidence = await bucket.get(stage09Artifact.r2_key);
    assert.ok(stage09Evidence);
    const stage09EvidenceJson = JSON.parse(Buffer.from(await stage09Evidence.arrayBuffer()).toString("utf8"));
    assert.equal(stage09EvidenceJson.visualAcquisition.assets.length, compiledShotCount);
    assert.equal(stage09EvidenceJson.selectedThumbnail.thumbnailText, revisedThumbnailText);
    assert.equal(stage09EvidenceJson.controls.humanGate,
      "SATISFIED:HP-02_D3_THUMBNAIL_SELECTION");

    const stage10WorkbenchResponse = await mf.dispatchFetch("http://localhost/api/operator", {
      headers: ownerHeaders,
    });
    const stage10Workbench = await stage10WorkbenchResponse.json();
    assert.deepEqual(stage10Workbench.trackGWorkbench.allowedActions,
      ["START_TRACK_G_VIDEO_1_STAGE_10"]);

    const unavailableStage10 = await client.callTool({
      name: "start_track_g_video_1_stage_10",
      arguments: { objective: "Verify Stage 10 remains fail-closed without its signed calibrated media worker.",
        confirm: true, ownerApprovalText: "START STAGE 10" },
    });
    assert.equal(unavailableStage10.isError, true);
    assert.match(unavailableStage10.content[0].text, /MEDIA_WORKER_URL_UNAVAILABLE/u);
    const stage10Rows = await d1.prepare(
      "SELECT count(*) AS count FROM stage_instance WHERE stage_code = '10'",
    ).first();
    assert.equal(stage10Rows.count, 0);
    const stage10Jobs = await d1.prepare("SELECT count(*) AS count FROM stage10_media_job").first();
    assert.equal(stage10Jobs.count, 0);

    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.trackGVideo1Status, "RUNNING");
    assert.equal(state.structuredContent.trackGVideo1CurrentStep, "STAGE_10_READY");
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    assert.equal(state.structuredContent.autoPublish, "OFF");
    assert.deepEqual(state.structuredContent.activationBlockers, [
      "critic_qualification_and_real_calibration_evidence",
    ]);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("fails closed when Video #1 is opened without a qualified voice", async () => {
  const { mf } = await createFactoryFixture("g02i1c-track-g-precondition-test");
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: ownerHeaders },
    fetch: (input, init) => mf.dispatchFetch(input, init),
  });
  const client = new Client({ name: "factory-track-g-precondition-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await client.callTool({
      name: "prepare_approved_channel",
      arguments: {
        objective: "Prepare the approved channel before verifying the Video #1 precondition gate.",
        confirm: true,
      },
    });
    const blocked = await client.callTool({
      name: "start_track_g_video_1_qualification",
      arguments: {
        objective: "Attempt to open Video #1 without the required qualified voice evidence.",
        confirm: true,
        ownerApprovalText: "START VIDEO 1 QUALIFICATION",
      },
    });
    assert.equal(blocked.isError, true);
    assert.match(blocked.content[0].text, /TRACK_G_VOICE_NOT_QUALIFIED/u);
  } finally {
    await client.close().catch(() => {});
    await mf.dispose();
  }
});

test("accepts only the callback-bound Codex CIMD client and loopback redirect", async () => {
  const { mf } = await createFactoryFixture("g01a-codex-oauth-test");
  const productionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
  const resource = `${productionOrigin}/api/mcp`;
  const callbackId = "taI8_cm2QJRi";
  const clientId = `https://chatgpt.com/oauth/codex/${callbackId}/client.json`;
  const redirectUri = `http://127.0.0.1:38311/callback/${callbackId}`;
  const verifier = "codex-owner-pkce-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  function authorizationUrl(candidateClientId = clientId, candidateRedirectUri = redirectUri) {
    const url = new URL(`${productionOrigin}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", candidateClientId);
    url.searchParams.set("redirect_uri", candidateRedirectUri);
    url.searchParams.set("state", "codex-oauth-state");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", resource);
    url.searchParams.set("scope", "factory.read factory.prepare");
    return url;
  }

  try {
    const consentResponse = await mf.dispatchFetch(authorizationUrl(), { headers: ownerHeaders });
    const consentHtml = await consentResponse.text();
    assert.equal(consentResponse.status, 200);
    const nonce = consentHtml.match(/name="nonce" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);

    const mismatchedCallback = await mf.dispatchFetch(
      authorizationUrl(clientId, "http://127.0.0.1:38311/callback/not-the-client"),
      { headers: ownerHeaders },
    );
    assert.match(await mismatchedCallback.text(), /OAUTH_REDIRECT_URI_NOT_ALLOWED/);

    const lookalikeClient = await mf.dispatchFetch(
      authorizationUrl(`https://chatgpt.com.evil.example/oauth/codex/${callbackId}/client.json`, redirectUri),
      { headers: ownerHeaders },
    );
    assert.match(await lookalikeClient.text(), /OAUTH_CLIENT_NOT_ALLOWED/);

    const approvalResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/authorize/approve`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nonce }),
      redirect: "manual",
    });
    assert.equal(approvalResponse.status, 303);
    const callback = new URL(approvalResponse.headers.get("location"));
    assert.equal(callback.origin + callback.pathname, redirectUri);
    assert.equal(callback.searchParams.get("iss"), productionOrigin);
    const code = callback.searchParams.get("code");
    assert.ok(code);

    const tokenResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    const token = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.ok(token.access_token);

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
      fetch: (input, init) => mf.dispatchFetch(input, init),
    });
    const client = new Client({ name: "factory-codex-oauth-test", version: "1.0.0" });
    await client.connect(transport);
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});

test("accepts only the fixed Work OAuth client on the exact terminal callback", async () => {
  const { mf } = await createFactoryFixture("g01a-work-oauth-test");
  const productionOrigin = "https://youtube-ai-factory-v2.quach-hung.chatgpt.site";
  const resource = `${productionOrigin}/api/mcp`;
  const clientId = "youtube-ai-factory-v2-work";
  const redirectUri = "http://terminal.local:44401/callback/taI8_cm2QJRi";
  const verifier = "work-owner-pkce-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  function authorizationUrl(candidateClientId = clientId, candidateRedirectUri = redirectUri) {
    const url = new URL(`${productionOrigin}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", candidateClientId);
    url.searchParams.set("redirect_uri", candidateRedirectUri);
    url.searchParams.set("state", "work-oauth-state");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", resource);
    url.searchParams.set("scope", "factory.read factory.prepare");
    return url;
  }

  try {
    const consentResponse = await mf.dispatchFetch(authorizationUrl(), { headers: ownerHeaders });
    const consentHtml = await consentResponse.text();
    assert.equal(consentResponse.status, 200);
    const nonce = consentHtml.match(/name="nonce" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);

    for (const rejectedRedirect of [
      "http://terminal.local:44402/callback/taI8_cm2QJRi",
      "http://terminal.local:44401/callback/not-the-server",
      "http://terminal.local.evil.example:44401/callback/taI8_cm2QJRi",
      "http://terminal.local:44401/callback/taI8_cm2QJRi?next=evil",
    ]) {
      const rejected = await mf.dispatchFetch(authorizationUrl(clientId, rejectedRedirect), { headers: ownerHeaders });
      assert.match(await rejected.text(), /OAUTH_REDIRECT_URI_NOT_ALLOWED/);
    }

    const unknownClient = await mf.dispatchFetch(authorizationUrl("youtube-ai-factory-v2-work-copy", redirectUri), {
      headers: ownerHeaders,
    });
    assert.match(await unknownClient.text(), /OAUTH_CLIENT_NOT_ALLOWED/);

    const approvalResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/authorize/approve`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nonce }),
      redirect: "manual",
    });
    assert.equal(approvalResponse.status, 303);
    const callback = new URL(approvalResponse.headers.get("location"));
    assert.equal(callback.origin + callback.pathname, redirectUri);
    const code = callback.searchParams.get("code");
    assert.ok(code);

    const tokenResponse = await mf.dispatchFetch(`${productionOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    });
    const token = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.ok(token.access_token);

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
      fetch: (input, init) => mf.dispatchFetch(input, init),
    });
    const client = new Client({ name: "factory-work-oauth-test", version: "1.0.0" });
    await client.connect(transport);
    const state = await client.callTool({ name: "get_factory_state", arguments: {} });
    assert.equal(state.structuredContent.ownerAuthorized, true);
    assert.equal(state.structuredContent.providerDispatch, "OFF");
    await client.close();
  } finally {
    await mf.dispose();
  }
});
