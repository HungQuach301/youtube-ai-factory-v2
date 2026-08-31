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
