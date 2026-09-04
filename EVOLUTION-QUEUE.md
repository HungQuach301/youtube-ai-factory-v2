# EVOLUTION QUEUE

## EVOLVE_STAGE12_CODEC_SAFE_LRA_CONVERGENCE_GUARD

- Status: `LOCAL_EVIDENCE_READY_REMOTE_CI_PENDING`; branch riêng, chưa merge/deploy và chưa
  chạy Production LRA guard shadow replay.
- Kind: `PIPELINE_CODE`; strictness direction: `SHADOW_ONLY_CODEC_SAFETY`.
- Source: immutable parent shadow evidence
  `41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb`
  có pass 1 true-peak-safe/LRA-low và pass 3 overshoot/LRA-high.
- Diff: deterministic anchor reproduction, bounded LRA bracket/bisection,
  nearest-boundary LUFS trim, regression rollback, typed shadow command/route,
  migration 0032 append-only job/evidence và pinned render/runtime provenance.
- Boundary: thresholds không đổi; ordinal 2/3, diagnostic replay và parent shadow
  history immutable; không ordinal/attempt 4, output upload, provider, calibration,
  Finalize, release, Production activation hoặc publish.
- Local evidence: full root CI PASS; 15 focused controller/migration/guardrail tests
  PASS; real FFmpeg zero-write smoke PASS; canonical/Sites worker mirrors exact-match;
  source manifests và Sites source-lock PASS.
- Activation: PR/CI không cấp quyền Production replay. Invocation cần owner OPERATE
  approval riêng sau merge/deploy/exact-tree/health PASS.

## EVOLVE_STAGE12_CODEC_SAFE_TRUE_PEAK_CONVERGENCE

- Status: `LOCAL_EVIDENCE_READY_REMOTE_CI_PENDING`; branch riêng, chưa merge/deploy
  và chưa chạy Production shadow replay.
- Kind: `PIPELINE_CODE`; strictness direction: `SHADOW_ONLY_CODEC_SAFETY`.
- Source: append-only diagnostic replay chứng minh strategy v3 giữ LUFS/LRA nhưng
  true peak hậu Opus tăng vì candidate sau tái encode candidate Opus trước.
- Diff: canonical lossless ordinal-2 decode, deterministic post-Opus feedback,
  typed shadow command/route, migration 0031 append-only job/evidence, pinned
  source/replay/image/runtime/algorithm/threshold provenance.
- Boundary: thresholds không đổi; ordinal 2/3 và replay history immutable; không
  ordinal/attempt 4, output upload, provider, calibration, Finalize, release,
  Production activation hoặc publish.
- Activation: PR/CI không cấp quyền Production shadow. Invocation và mọi promotion
  sau shadow evidence đều cần owner approval tách biệt.

## EVOLVE_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY

- Status: `IMPLEMENTED_CI_PENDING`; local root/Sites evidence PASS, remote required
  CI đang chờ PR; chưa merge/deploy và chưa chạy Production replay.
- Kind: `PIPELINE_CODE`; strictness direction: `STRICTER_REPRODUCTION_EVIDENCE`.
- Source: terminal ordinal 3 giữ typed
  `STAGE12_ENCODED_LOUDNESS_UNRESOLVED`, nhưng failure trước migration 0029 không có
  exact per-pass/final measurements để xác định predicate và pass không hội tụ.
- Diff: typed replay command, authenticated read-only ordinal-2 source route,
  migration 0030 append-only job/evidence, exact raw/numeric measurements,
  frame-MD5, failed predicates và pinned worker/runtime/algorithm provenance.
- Boundary: không backfill/sửa ordinal 2/3; không ordinal 4/attempt 4; không corrected
  output upload, provider, calibration, Finalize, release hoặc publish.
- Acceptance evidence: worker/control-plane fingerprint parity; runtime and migration
  unit tests; real FFmpeg zero-write smoke; Sites Miniflare E2E; source-integrity,
  root CI, Sites build/test và media-worker image CI.
- Activation: PR/CI không cấp quyền Production replay. Sau merge/deploy cần
  exact-tree/health read-back và phê duyệt OPERATE riêng.

## EVO-STAGE12-CALLBACK-EVIDENCE-RECOVERY

- Status: `EVIDENCE_READY`; local and remote shadow evidence PASS; awaiting explicit
  owner `PROMOTE_EVOLUTION` in a later session before merge or Production activation.
- Kind: `PIPELINE_CODE`; strictness direction: `STRICTER_FAILURE_EVIDENCE`.
- Source: the existing immutable Stage 12 attempt 3 recovery command reached the
  Production callback, but `POST /api/media-worker/stage12` returned `422` and the
  durable job retained only `STAGE12_CALLBACK_FAILED:422` instead of the exact
  deterministic QA or storage failure.
- Production evidence: Cloudflare request
  `90bde8a7faebfb07e448020f7c930037`, trace
  `8f1cf1c8978134ee79545a627354df50`, wall time `20313 ms`; D1 attempt 3 remains
  `FAILED`, receipt fields remain null, `stage12_pre_master_qa` remains empty, and
  the sole immutable pre-master remains SHA-256
  `8f3e76527bc219b8f85db7adefe6abdcd18ef59617e6016aaf838f5c4ea5fd42`.
- Proposed bounded diff: preserve a sanitized exact Stage 12 callback failure code;
  add regression coverage for multi-gate QA errors; permit one audited exact
  callback-evidence recovery replay against the same attempt-3 pre-master and no
  render; retain stable `start_track_g_video_1_stage_12` routing so routine recovery
  does not require MCP metadata refresh.
- Boundary: no attempt 4, no render, no migration, no contract/threshold/gate
  relaxation, no provider call, no spend, no release and no publish. `FINALIZE`
  remains forbidden unless the durable job and immutable receipt both read back
  `READY` after every deterministic gate passes.
- Required shadow evidence: callback failure normalization vectors; exact replay
  concurrency/idempotency test; full repository CI; media-worker image smoke; Sites
  Production health; read-back proving the same pre-master hash and zero provider,
  spend and publish deltas.
- Local shadow evidence: full ten-gate normalization vector PASS; atomic legacy-422
  replay source contract PASS; `pnpm run ci` PASS; Sites build and 18/18 tests PASS;
  renderer smoke PASS; Sites source fingerprint
  `6435cfc7de58e952142e148345544ddf96ad49cd3e449d464eabc7465485e004`.
- Remote shadow evidence on PR #172, tree
  `b4966bdcb796e3b4237b6abcc68ad5c14bbc5ecb`: root build run `33516242307`
  PASS; source-integrity run `33516213997` PASS; Sites control-plane run
  `33516213956` PASS; media-worker image run `33516214291` PASS, including
  immutable image build, non-root Python proof, health and default-disabled dispatch.
- Rollback: revert the candidate code/mirror commit; no new migration and no
  Production data mutation. Shadow cost is USD 0.

## EVO-STAGE10-COMMAND-CONTRACT

- Status: `EVIDENCE_READY`; chờ owner `PROMOTE_EVOLUTION`.
- Kind: `PIPELINE_CODE`; strictness direction: `NEUTRAL`.
- Source: Production fail-closed receipt `COMMAND_CONTRACT_VIOLATION` khi owner gọi
  `START_TRACK_G_VIDEO_1_STAGE_10` tại `STAGE_10_READY`.
- Diff: migration append-only `0014_stage10_command_contract` công nhận chính xác
  hai typed transitions START và FINALIZE; không thay đổi threshold, budget, quality
  gate, provider binding, release hoặc publish policy.
- Evidence: regression test chấp nhận đúng hai transition, từ chối transition sai,
  từ chối command chưa đăng ký, bảo toàn command cũ và chứng minh migration replay.
- Rollback: migration kế tiếp khôi phục trigger trước đó; không sửa migration đã seal.

## EVO-STAGE10-NLTK-RUNTIME

- Status: `OWNER_PROMOTION_APPROVED`; deploy correction only, replay explicitly excluded.
- Kind: `PIPELINE_CODE`; strictness direction: `STRICTER_RUNTIME_PROOF`.
- Source: Production Stage 10 terminal receipt `MEDIA_TOOL_FAILED` after PR #147.
- Root cause: the image downloaded NLTK taggers/cmudict under build-time root home,
  then executed the observer as `node`; calibration CI did not reproduce this user boundary.
- Diff: shared immutable NLTK data path, non-root Python/G2P preflight, live health
  proof bit and phase-specific sanitized subprocess error codes.
- Evidence: package regression test, full CI, image build/preflight and Fly live-health read-back.
- Boundary: no threshold, provider width, spend ceiling, schema, release, publish or replay change.

## EVO-STAGE10-FAILED-RETRY

- Status: `OWNER_PROMOTION_APPROVED`; Production deploy and exactly one replay authorized after CI and health PASS.
- Kind: `PIPELINE_CODE`; strictness direction: `STRICTER_EXECUTION_LINEAGE`.
- Source: Production attempt 1 remained terminal `FAILED:MEDIA_TOOL_FAILED`; the previous START idempotency path returned that row instead of creating a corrected execution.
- Diff: append-only migration `0015_stage10_failed_retry`, attempt-specific provider keys, latest-attempt read-back and an explicit owner-only retry action.
- Retry boundary: only attempt 1 → attempt 2; only allowlisted runtime/infrastructure errors; terminal quality, rights, policy, content and budget errors remain non-retryable.
- Evidence: migration tests preserve attempt 1 and reject duplicates, gaps, attempt 3, cross-run lineage and terminal failures; CI and Production health must PASS before replay.
- Operations: replay START exactly once for Track G Video #1; do not auto-finalize Stage 10 and do not auto-publish.

## EVO-STAGE10-FINALIZE-CONTRACT

- Status: `OWNER_PROMOTION_APPROVED`; deploy correction and replay FINALIZE exactly once after CI and health PASS.
- Kind: `PIPELINE_CODE`; strictness direction: `CONTRACT_ALIGNMENT`.
- Source: Production FINALIZE failed closed with `COMMAND_CONTRACT_VIOLATION` while attempt 2 remained `READY`.
- Root cause: application emitted legacy `TRACK_G_VIDEO_1_STAGE_10_RECEIPT_READY`; sealed D1 contract requires canonical `TRACK_G_VIDEO_1_STAGE_10_READY`.
- Diff: one application state literal plus regression evidence; no migration, provider, threshold, budget or media-worker change.
- Operations: no START replay, no provider call, no new media job and no publish; FINALIZE advances only to `STAGE_11_READY`.

## EVO-STAGE11-AMBIENCE-ONLY

- Status: `OWNER_PROMOTION_APPROVED`; build, deploy and exactly one Stage 11 execution authorized after CI and health PASS.
- Kind: `PIPELINE_CODE`; strictness direction: `STRICTER_RIGHTS_AND_DISPATCH_CONTROL`.
- Source: Production is sealed at `STAGE_11_READY`; Track G contract selects `ambience_only` with no production audio provider.
- Diff: deterministic procedural ambience recipe, M0 rights gate, M1 two-pass loudness/ducking plan, append-only D1 persistence, Operator action and generic MCP executor.
- Boundary: no MUSIC cue, no paid provider, no spend, no measured-master claim, no release and no publish.
- Operations: advance exactly once from Stage 11 to `STAGE_12_READY`; read back the sealed artifact and stop.
