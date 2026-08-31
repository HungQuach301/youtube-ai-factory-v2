import { createHash } from "node:crypto";
import { AUDIO } from "../packages/contracts/src/thresholds";

export type Stage11AudioCue = {
  id: string;
  kind: "AMBIENCE" | "SILENCE";
  assetId: string | null;
  function: string;
  monetizationAllowed: boolean;
  licenseEvidenceHash: string | null;
  startSec: number;
  endSec: number;
};

type Stage11CandidateCue = Omit<Stage11AudioCue, "kind"> & {
  kind: "MUSIC" | Stage11AudioCue["kind"];
};

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("STAGE_11_NON_FINITE_NUMBER");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value !== "object") throw new Error("STAGE_11_NON_JSON_VALUE");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key.normalize("NFC"))}:${canonicalize(record[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function buildTrackGVideoOneStage11AudioPlan(
  durationSec: number,
  narrationSha256: string,
) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error("TRACK_G_STAGE_11_DURATION_INVALID");
  }
  if (!/^[0-9a-f]{64}$/u.test(narrationSha256)) {
    throw new Error("TRACK_G_STAGE_11_NARRATION_HASH_INVALID");
  }
  const proceduralRecipe = {
    schemaVersion: 1,
    generator: "factory-procedural-neutral-room-tone-v1",
    seed: hash({ narrationSha256, purpose: "track-g-video-1-ambience" }),
    ownership: "FACTORY_ORIGINAL_PROCEDURAL",
    musicContent: false,
    providerRequired: false,
  };
  const rightsEvidenceSha256 = hash(proceduralRecipe);
  const candidateCues: Stage11CandidateCue[] = [{
    id: "ambience_track_g_video_1_neutral_room_tone_v1",
    kind: "AMBIENCE",
    assetId: `procedural://${proceduralRecipe.generator}/${proceduralRecipe.seed}`,
    function: "neutral-room-tone-under-narration",
    monetizationAllowed: true,
    licenseEvidenceHash: rightsEvidenceSha256,
    startSec: 0,
    endSec: durationSec,
  }];
  if (candidateCues.some((cue) => cue.kind === "MUSIC")) {
    throw new Error("TRACK_G_STAGE_11_MUSIC_FORBIDDEN");
  }
  const cues = candidateCues as Stage11AudioCue[];
  if (cues.some((cue) => cue.kind !== "SILENCE"
    && (!cue.assetId || !cue.monetizationAllowed || !cue.licenseEvidenceHash))) {
    throw new Error("TRACK_G_STAGE_11_RIGHTS_EVIDENCE_INCOMPLETE");
  }
  const loudnessTarget = {
    integratedLufs: AUDIO.LUFS_I.target,
    toleranceLufs: AUDIO.LUFS_I.tolerance,
    truePeakMaxDbtp: AUDIO.TRUE_PEAK_MAX_DBTP,
    lraMin: AUDIO.LRA.min,
    lraMax: AUDIO.LRA.max,
    sampleRateHz: AUDIO.SAMPLE_RATE_HZ,
  };
  const loudnormTarget = `I=${AUDIO.LUFS_I.target}:TP=${AUDIO.TRUE_PEAK_MAX_DBTP}:LRA=${AUDIO.LRA.max - 1}`;
  const loudnormPlan = [
    { pass: 1 as const, args: [`loudnorm=${loudnormTarget}:print_format=json`] },
    { pass: 2 as const, args: [`loudnorm=${loudnormTarget}:measured_I={PASS1_I}:measured_TP={PASS1_TP}:measured_LRA={PASS1_LRA}:measured_thresh={PASS1_THRESHOLD}:offset={PASS1_OFFSET}:linear=true`] },
  ];
  const ducking = {
    duckDb: AUDIO.DUCK_DB.min,
    attackMs: AUDIO.DUCK_ATTACK_MS.min,
    releaseMs: AUDIO.DUCK_RELEASE_MS.min,
    filter: `sidechaincompress=threshold=-${AUDIO.DUCK_DB.min}dB:attack=${AUDIO.DUCK_ATTACK_MS.min}:release=${AUDIO.DUCK_RELEASE_MS.min}`,
  };
  const gateResults = [
    {
      gate: "M0_MUSIC_LICENSE",
      state: "PASS" as const,
      evidence: `No MUSIC cue exists; the only non-silent cue is Factory-original procedural ambience with rights evidence ${rightsEvidenceSha256}.`,
    },
    {
      gate: "M1_LOUDNESS_BALANCE_PLAN",
      state: "PASS" as const,
      evidence: `Two-pass loudnorm and bounded narration ducking target ${AUDIO.LUFS_I.target} LUFS-I, ${AUDIO.TRUE_PEAK_MAX_DBTP} dBTP and ${AUDIO.SAMPLE_RATE_HZ} Hz for Stage 12 render-time measurement.`,
    },
  ];
  return {
    mode: "ambience_only" as const,
    durationSec,
    narrationSha256,
    proceduralRecipe,
    rightsEvidenceSha256,
    cues,
    loudnessTarget,
    loudnormPlan,
    ducking,
    gateResults,
    providerDispatch: "OFF" as const,
    providerCallCount: 0,
    reservedUsd: 0,
    actualUsd: 0,
  };
}
