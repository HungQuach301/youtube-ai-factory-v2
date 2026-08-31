# EVOLUTION QUEUE

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
