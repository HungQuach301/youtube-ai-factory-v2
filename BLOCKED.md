# BLOCKED

## B-001 · Thiếu tài liệu nguồn chuẩn — RESOLVED

Trạng thái: `CLOSED`
Phát hiện: 2026-08-22
Đóng: 2026-08-22

Các file được `docs/00-INDEX.md` hoặc tài liệu liên quan tuyên bố là bắt buộc nhưng chưa có trong bộ nguồn đã nhận:

- `docs/02-CONTRACTS.md` — nguồn chân lý về type và mọi ngưỡng số; chặn WP-00 trở đi.
- `docs/06-PROMPT-PACK.md` — prompt BUILD/OPS chuẩn.
- `docs/08-CONTINUOUS-OPERATION.md` — mode, runbook và nhịp vận hành liên tục.
- `docs/12-BUILD-ORDER-DELTA.md` — tài liệu giải thích; nội dung được nói là đã hợp nhất vào `04-BUILD-ORDER.md`, nên không chặn build nhưng cần để đủ pack.
- `docs/ai-factory-modul-nghiep-vu.md` — đặc tả 25 module nghiệp vụ.
- `DECISIONS-ANSWERED.md` — 11 quyết định owner; các quyết định chưa trả lời tiếp tục chặn các WP nêu trong `docs/07-DECISIONS-REQUIRED.md`.

Kết quả khôi phục:

- Đã khôi phục và kiểm tra provenance: `02-CONTRACTS.md`, `06-PROMPT-PACK.md`, `08-CONTINUOUS-OPERATION.md`, `ai-factory-modul-nghiep-vu.md`, `DECISIONS-ANSWERED.md`.
- `12-BUILD-ORDER-DELTA.md` không tồn tại như file độc lập; `00-INDEX.md` xác nhận nội dung đã được hợp nhất vào `04-BUILD-ORDER.md`, nên không chặn build.
- Không tạo placeholder và không suy diễn quyết định.

## B-002 · Chưa cấu hình bảo vệ branch trên GitHub

Trạng thái: `OPEN`

Sau khi repository GitHub được tạo cần bật branch protection cho `main`: PR bắt buộc, CI bắt buộc, không force-push, không xóa branch và yêu cầu CODEOWNER review cho vùng governance.

Kiểm tra ngày 2026-08-23 xác nhận `main` vẫn chưa được bảo vệ. Connector GitHub
hiện tại không expose thao tác branch-protection và Cloud Browser không có phiên
GitHub đã đăng nhập, nên agent không tuyên bố blocker đã đóng. Mọi thay đổi vẫn
tiếp tục đi qua draft PR + CI + squash merge trong lúc chờ cấu hình cấp repository.

## B-003 · Owner confirmations trong DECISIONS-ANSWERED

Trạng thái: `OPEN — budget confirmation CLOSED 2026-08-23; các mục còn lại giữ nguyên blocker theo WP`

- **CLOSED 2026-08-23:** owner đã xác nhận ngân sách thật `$30/video`, `$400 qualification`, `$350 Track G`; WP-08 và WP-12B được mở khóa với đúng các trần này.
- Thay placeholder `owner@<domain>` và `operator@<domain>` bằng identity người thật trước WP-28.
- **CLOSED 2026-08-23:** `OWNER_WEEKLY_CEILING_MIN = 300` đã được ghi vào runtime contract; còn cần cung cấp 10–15 mẫu audio chuẩn trước khi WP-15 calibration/Track G G-02 có thể PASS.
- Chọn nhà cung cấp production audio và xác nhận license hiện hành trước khi kích hoạt licensed-music của WP-19/WP-21. Framework WP-19 vẫn chạy fail-closed với `ambience_only`; trạng thái này không đóng blocker.

Ghi chú xung đột nội bộ đã được giải quyết bằng xác nhận owner ngày 2026-08-23. Không được tự nâng các trần đã xác nhận; mọi thay đổi sau này cần quyết định owner mới.

## B-004 · Fly production deployment credential/tool chưa hiện diện — RESOLVED

Trạng thái: `CLOSED`
Đóng: 2026-08-27

Fly production đã được xác thực và qualification trực tiếp đã PASS cho app
`youtube-ai-factory-v2-media-worker-prod` tại region `sin`.

- PR triển khai #93, sửa Dockerfile #94 và registry read-back #95 đã merge qua CI.
- Deployment run 33086046765 deploy exact image digest
  `sha256:03742f4b5a882fb9791ee49a5d2a384c318e40329c6bac221af23bc9f8fe07d7`.
- Machine `48ee742b377758` chạy 1/1 health check passing.
- Live `/health` xác nhận `ok=true`, đúng digest và
  `jobDispatchEnabled=false`.
- Live unauthenticated `POST /jobs` trả `503 JOB_DISPATCH_DISABLED`.
- Image qualification run 33085036691 chứng minh container không có D1 binding;
  unit test giữ DoD cùng envelope trên năm stateless worker cho cùng SHA-256.

Việc đóng blocker này chỉ xác nhận Media Runtime đã `QUALIFIED/READY`. Nó không
bật provider dispatch, job dispatch, auto-publish hoặc ghi dữ liệu Production.

## B-005 · WP-12B numeric checkpoint cần owner xác nhận sau phép đo

Trạng thái: `CLOSED — OWNER CONFIRMED 2026-08-23`

Benchmark đã đo đủ 16 case và kết luận trong phạm vi WP-12B:

- FULL: `$0.266674/video`;
- REDUCED: `$0.123168/video`;
- REDUCED + deterministic max: `$0.127076/video`.

Cả ba dưới trần `$30/video`, nhưng đây không phải all-in factory cost và pricing
fixture chưa phải capability `QUALIFIED`. `docs/04-BUILD-ORDER.md` yêu cầu owner
xác nhận con số **sau khi đo** trước WP-13. Standing authorization không thay thế
được quyết định evidence-specific này. Owner đã xác nhận cả bảng và chọn
`PROFILE=REDUCED`; WP-13 được mở khóa. Các caveat phạm vi đo, qualification và
cost reservation vẫn giữ nguyên.

## B-006 · WP-14/WP-15 calibration evidence chưa hiện diện

Trạng thái: `OPEN — harness tiếp tục, hard gate vẫn fail-closed`

- WP-14 đã có manager append-only, 16 synthetic recipes (8 defect class × 2)
  và phép đo precision/recall/variance. Definition of Done vẫn thiếu 15 rejected
  masters kèm owner judgment; synthetic fixture không được giả làm phán quyết thật.
- WP-15 có thể xây calibration harness, nhưng không được ghi
  `ALIGNER_ERROR_FLOOR` cho tới khi có 10–15 audio người đọc chuẩn cùng transcript.
- Trong khi blocker mở, `AUDIO.PHONEME_MISMATCH_BASE` tiếp tục thuộc
  `UNCALIBRATED`; measurement chỉ phát cảnh báo và tuyệt đối không chặn M0/M1.

## B-007 · WP-22 rubric anchors và critic qualification chưa hiện diện

Trạng thái: `OPEN — harness tiếp tục, M2 hard gate vẫn fail-closed`

- Mỗi dimension trong `ASSURANCE.FLOORS` còn thiếu ba ví dụ thật
  fail/borderline/pass do người thật chọn, tổng cộng 36 anchor có evidence.
- Gold set chưa đạt tối thiểu 30 mẫu với 15 rejected masters có owner judgment;
  vì vậy chưa critic nào được phép nhận trạng thái `QUALIFIED` cho Stage 14.
- Qualification cần chạy provider có chi phí và là điểm dừng bắt buộc của WP-22.
  Không dispatch provider hoặc ghi qualification giả khi hai lớp evidence trên
  chưa đủ.
- Trong lúc blocker mở, Assurance Panel chỉ có thể giữ
  `gateState=NOT_EVALUATED`; kết quả cảnh báo không được dùng để authorize release.

## B-008 · WP-24 chưa có YouTube Analytics production evidence

Trạng thái: `OPEN — ETL/analysis harness hoàn tất, learning activation fail-closed`

- Chưa có video production đã bind với distribution master thật và đủ cửa sổ
  YouTube Analytics 14–28 ngày; không được dùng fixture/simulated analytics để
  tạo `actual_performance` hoặc calibration evidence.
- Chưa có YouTube Analytics credential/transport đã xác thực trong phiên build;
  không gọi API, không tạo response hash/evidence R2 key hoặc video ID giả.
- Model `v0-flat` chỉ được hiệu chỉnh sau tối thiểu 6 video analytics hợp lệ.
  Learning còn thiếu `experiment.min_sample_size`, ít nhất hai video độc lập
  cùng chiều hoặc owner command thật phải giữ `INSUFFICIENT_EVIDENCE` và không
  được tạo promotion.


## B-009 · Track G G-01 Production command runtime; activation evidence còn thiếu

Trạng thái: `PARTIALLY RESOLVED — HP-01 PERSISTED/PREPARED; ACTIVATION FAIL-CLOSED`

Owner phê duyệt **AI-Era Money Defense** ngày 2026-08-25. Production read-back hiện
xác nhận owner được authorize, Channel Identity Contract đã `PERSISTED`, channel
ở `PREPARED`, pillar đầu tiên và đủ 10 episode đã được ghi qua typed
`PREPARE_CHANNEL` command.

Các blocker activation còn lại:

- chưa có qualified production voice + fingerprint evidence;
- chưa có real aligner calibration, gold-set/rubric anchors và critic
  qualification evidence theo B-006/B-007;
- Fly.io Media Worker đã `QUALIFIED/READY` theo B-004 và không còn là blocker
  hiện hành. Historical `blocker_json` của PREPARE_CHANNEL vẫn được giữ bất biến;
  current readiness đọc từ versioned Factory contract.

`PREPARED` không mở provider dispatch, spend, job dispatch, media execution hoặc
publishing. Provider dispatch và auto-publish tiếp tục `OFF` cho tới khi các
hard gate evidence còn lại PASS.

---

## B-010 · Qualified voice fingerprint Production evidence

Trạng thái: `CLOSED 2026-08-28 — G-02D PRODUCTION READ-BACK VERIFIED`

- Approved ElevenLabs voice `KXyrWqXTuK63FlJ9XZ33` với model
  `eleven_multilingual_v2` đã được qualify bằng GitHub Actions run
  `33129874420`; artifact `voice-qualification-33129874420` có digest
  `sha256:8b29e539c76d3cddc7f7e1fa69448aae5c3fd96abdadba0c03c7e94f97d0b796`.
- PR #105 cung cấp immutable R2/D1 registration path. Production command
  `register_qualified_voice` đã trả `accepted=true`, `replayed=false`,
  `runStatus=COMPLETED`, `voiceFingerprintState=QUALIFIED` và đủ 8/8 binding.
- Replay nguyên payload trả `accepted=true`, `replayed=true`; read-back độc
  lập giữ nguyên channel `PREPARED`, contract `PERSISTED`, 10 episode và
  8/8 voice binding. Blocker `qualified_voice_fingerprint` đã được gỡ.
- Provider dispatch và auto-publish tiếp tục `OFF`. Production command không
  gọi lại provider và không phát sinh spend mới. B-006/B-007 vẫn mở; không được
  suy diễn voice qualification là critic/calibration qualification.

### G-02E evidence delta — B-006/B-007 remain open (2026-08-28)

- Actions run [33187748930](https://github.com/HungQuach301/youtube-ai-factory-v2/actions/runs/33187748930) materialized and read-back verified 16 qualification-only synthetic MP4 samples (eight defect classes × two variants).
- Artifact `gold-set-g-02e-33187748930` ZIP SHA-256: `7c562dc8ace9fb029c855f3cb0a62790518c3bd456b525bd79ffcfd9e51d5974`.
- Idempotent replay PASS: both manifest bytes hash to `49fd4fa8989912318014795cdc977c23fe18cee12bafb0613cf6b078972ac418`.
- This does **not** satisfy WP-14 readiness: sample count remains 16, rejected-master count remains 0, and no owner judgment was synthesized.
- B-006 still requires at least 15 owner-labelled rejected masters. B-007 still requires 36 real fail/borderline/pass anchors across 12 assurance dimensions.
- Critic state remains `NOT_QUALIFIED`; M2 stays fail-closed.

