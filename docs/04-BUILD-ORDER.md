# 04 — BUILD ORDER (v2)

32 work package theo thứ tự phụ thuộc, chia hai track. Agent làm tuần tự trong track, dừng sau mỗi WP để báo cáo.

Ký hiệu: 🔴 chặn bởi quyết định của người dùng · 🟡 cần dữ liệu thật · 🟢 agent tự làm được hoàn toàn

---

## 0. Hai track

```
TRACK P — PLATFORM   xây nhà máy đầy đủ, profile FULL
TRACK G — GOLDEN     ra 8–10 video thật sớm, profile REDUCED (13-TRACK-G-CONFIG)

Track G KHÔNG phải nhánh code riêng: cùng codebase, khác PROFILE trong
contracts. Điều này giữ mọi thứ Track G học được đều áp thẳng cho Track P.
```

Trình tự thời gian:
```
WP-00 ──────────── WP-09        [nền tảng, không cần quyết định]
   │
WP-12 ─ WP-12B  ← ĐIỂM QUYẾT ĐỊNH KINH TẾ (kết luận cấu hình khả thi)
   │
   ├─ WP-16, 17 (truth + intelligence)
   ├─ WP-28, 29 mức tối thiểu (human imprint + policy defense)
   │
   └──▶ TRACK G khởi động ─── video #1 ─── video #8–10 ─── GO/NO-GO
                │
   TRACK P chạy song song: WP-10,11,13,14,15,18..27,30,31
```

---

## GIAI ĐOẠN 1 — NỀN TẢNG (WP-00 → WP-09)

### 🟢 WP-00 · Scaffold & Contracts
**Phạm vi.** Monorepo theo `01`; `packages/contracts` đầy đủ theo `02` v2 (gồm PROFILE, UNCALIBRATED, OPS, ATTENTION, POLICY, EVOLUTION); TS strict; Vitest; ESLint rule G1, G2, G6; CI pipeline.
**DoD.** `tsc --noEmit` sạch; ba ESLint rule có test chứng minh bắt được vi phạm; CI chạy được.
**Test then chốt.** File cố ý vi phạm G1 → lint fail.

### 🟢 WP-01 · CORE-01 Canonical Hashing & Lineage
**Phạm vi.** `canonicalHash()` RFC 8785 + NFC; `streamHash()`; lineage recursive CTE; quarantine check. Migration `0001`.
**DoD.** 1.000 permutation cùng kết quả; NFC/NFD round-trip; CTE đúng ở độ sâu 10; migration up/down.
**Bẫy.** Số thực serialize theo ECMAScript `Number::toString`, không phải `toFixed`.

### 🟢 WP-02 · CORE-02 Typed Command & State Machine
**Phạm vi.** 12 lệnh (gồm 5 owner + FREEZE/UNFREEZE_CHANNEL); transaction 6 bước bất biến; trigger append-only; trigger owner identity.
**DoD.** 100 lệnh trùng idempotency đồng thời → đúng 1 có hiệu lực; `UPDATE command_log` abort; lệnh owner thiếu chữ ký abort.

### 🟢 WP-03 · CORE-03 Lease & Fencing
**Phạm vi.** Durable Object; fencing token đơn điệu; heartbeat; reconciliation.
**DoD.** GC pause 120s → writer cũ bị từ chối; sau expire không cấp lease mới trước khi reconcile xong.

### 🟢 WP-04 · CORE-04 DoR Resolver
**Phạm vi.** 11 điều kiện DoR (9 gốc + channel-frozen + human-decision-count).
**DoD.** **Test hồi quy bắt buộc:** gate M0 `NOT_EVALUATED` → `ready=false`; kênh frozen → `ready=false`. p95 ≤200 ms.

### 🟢 WP-05 · CORE-05 Standard & Policy Registry
**Phạm vi.** Kế thừa 4 cấp; luật "chỉ siết, không nới"; 4 trạng thái gate; `STANDARD_DRIFT`. Migration `0005`.
**DoD.** Episode standard nới gate của channel → từ chối; `WAIVE` gate M0 → từ chối.

### 🟢 WP-06 · CORE-06 Evidence Store
**Phạm vi.** Snapshot nguồn web; snapshot provider hai chiều; phân vùng namespace R2.
**DoD.** Xóa URL nguồn → vẫn tái lập từ snapshot; mọi provider call có snapshot hai chiều.

### 🟢 WP-07 · PRV-01 Provider Adapter Framework
**Phạm vi.** `ProviderAdapter`; `ErrorClass` normalization; retry policy; đếm token thật.
**DoD.** `SCHEMA_VIOLATION` không bao giờ retry (test từng lớp lỗi); adapter không export `dispatch`.

### 🟢 WP-08 · PRV-02 Cost Reservation & Ledger
**Phạm vi.** Reservation 2 pha; trần phân cấp; orphan reconciliation; kinh tế đơn vị. Migration `0006`.
**DoD.** 50 dispatch song song với trần đủ 10 → đúng 10 qua, 40 từ chối với zero spend.

### 🟢 WP-09 · CAP-01 + CAP-04 Registry & Dispatch Guard
**Phạm vi.** Capability registry; binding; settings hash; 9 bước dispatch guard; block log. Migration `0002`.
**DoD.** Đổi 1 ký tự system prompt → settings hash đổi → dispatch bị chặn; lint tĩnh chứng minh không có đường gọi provider ngoài guard.

**⛔ ĐIỂM DỪNG.** Nền tảng xong — xác nhận với owner trước khi xây lên trên.

---

## GIAI ĐOẠN 2 — THỰC THI, ĐO LƯỜNG, KINH TẾ (WP-10 → WP-15)

### 🟢 WP-10 · EXE-02 Stage Runner Framework
**Phạm vi.** Abstract class; lifecycle 9 bước; `PreflightContext` không expose provider client (G6); đọc PROFILE.
**DoD.** Không thể gọi LLM trong `preflight()` — chứng minh bằng type system.

### 🟢 WP-11 · EXE-03 Tournament Engine
**Phạm vi.** Eligibility filter; sinh/chấm tách biệt; blind; rubric anchoring; bảo tồn rejected; width theo PROFILE.
**DoD.** Cùng seed → cùng champion 3 lần; judge input không chứa metadata nguồn gốc.

### 🔴 WP-12 · EXE-04 Media Worker Runtime
**Chặn bởi.** §4 (hạ tầng container).
**Phạm vi.** Dockerfile pin digest; queue consumer; executor: composite, encode, align, probe, flow, phash; envelope validation.
**DoD.** Cùng envelope trên 5 worker → 5 output cùng sha256; container không có D1 binding (test negative).

### 🔴 WP-12B · Cost Benchmark ★ ĐIỂM QUYẾT ĐỊNH
**Chặn bởi.** §3, §4.
**Phạm vi.** 8 visual archetype × 2 kiến trúc render (Sharp-per-frame vs render-once + FFmpeg filter graph); đo thời gian tường, CPU-giây, RAM đỉnh, output size; ghi archetype nào cần headless Chromium. Cộng: đo chi phí một lượt Stage 14 giả lập trên fixture (critic × sample thật).
**DoD.** Bảng cost/video cho **ba cấu hình**: FULL · REDUCED · REDUCED + tối đa hóa phép đo xác định. Đối chiếu với trần §3. **KẾT LUẬN BẰNG SỐ: cấu hình nào nằm trong trần.**
**Vì sao ở đây.** Nếu trần thật không nuôi được FULL, mọi WP sau phải xây theo cấu hình khác — biết sau WP-21 là quá muộn.

**⛔ ĐIỂM DỪNG BẮT BUỘC.** Không đi tiếp cho tới khi owner xác nhận con số.

### 🟢 WP-13 · MSR-01 Deterministic Measurement
**Phạm vi.** 15 phép đo bảng MSR-01; wrapper phía control.
**DoD.** Mỗi phép đo có test với input đã biết kết quả. **Chưa** đặt ngưỡng phoneme mismatch — chờ WP-15.

### 🟡 WP-14 · CAP-02 Gold Set Manager
**Cần từ người dùng.** 15 master bị từ chối + phán quyết owner (§7).
**Phạm vi.** Cấu trúc hóa nhãn; sinh 15 mẫu tổng hợp bằng FFmpeg; đo recall/precision/variance.
**DoD.** ≥30 mẫu phủ mọi defect class; ground truth `{defect_class, severity, t_start, t_end}`.

### 🟡 WP-15 · Hiệu chuẩn Forced Aligner
**Cần từ người dùng.** 10–15 mẫu audio người đọc chuẩn có transcript đúng (§7).
**Phạm vi.** Pin WhisperX/MFA; nạp custom lexicon; đo error floor; ngưỡng = `max(0.01, floor × 2)`.
**DoD.** `ALIGNER_ERROR_FLOOR` có giá trị **đo được**, không phải giả định. So sánh ở mức phoneme.

**⛔ ĐIỂM DỪNG.** Error floor quyết định một hard gate.

---

## GIAI ĐOẠN 3 — MIỀN NGHIỆP VỤ (WP-16 → WP-21)

### 🟢 WP-16 · Truth Layer (TRU-01, TRU-02) + Stage 03
**Phạm vi.** Source tier ladder; claim typing; numeric parser xác định; terminology + IPA/ARPAbet; advice lint. Migration `0003`.
**DoD.** Advice lint bắt 100% mẫu trong bộ đối kháng (agent tự viết ≥30 mẫu); parser số không dùng LLM.

### 🟢 WP-17 · Intelligence Layer (INT-01, INT-02) + Stage 01, 02
**Phạm vi.** Freshness window; audience job lint; anti-copy 4 phép đo; differentiation score. **v2:** xuất primitive pHash/beat-diff dùng lại cho PC-7.
**DoD.** Audience job chứa tên chủ đề → lint fail; anti-copy bắt 7-gram trùng.

### 🔴 WP-18 · Creative Layer (CRE-01..04) + Stage 04, 05, 06
**Chặn bởi.** §8 (baseline curve).
**Phạm vi.** Taxonomy đóng + lint đa dạng; critic theo PROFILE; packaging contract; beat state assertion; prediction engine; script lint theo âm tiết; number audit.
**DoD.** 4 route trùng cặp `hook × device` → lint fail; beat có `knowledge_after = knowledge_before` → lint fail; mọi số trace về claim.

### 🔴 WP-19 · Design Layer (DES-01..03) + Stage 07A, 07B
**Chặn bởi.** §2 (cấp identity), §5 (nhà cung cấp nhạc).
**Phạm vi.** ChannelIdentityContract; voice settings hash + fingerprint; TTS segmentation theo ranh giới ngữ nghĩa; routing xác định; motion class classifier.
**DoD.** Cắt đoạn không rơi giữa entity/số/mệnh đề nhân quả; motion class là hàm toàn phần, 3 nhóm rời nhau.

### 🟢 WP-20 · CMP-01 ShotCueProgram Compiler + Stage 08
**Phạm vi.** Interval tree lint; adaptive validation; 3 assertion mỗi shot. Migration `0004`.
**DoD.** Zero gap/overlap; **không tồn tại ràng buộc 90–180 shots trong code**; tổng thời lượng khớp ±1 frame.

### 🔴 WP-21 · Media Layer (MED-01..06) + Stage 09..13
**Chặn bởi.** WP-12B (kết luận), §5.
**Phạm vi.** Eligibility filter; kiến trúc lai render-once-animate-by-filter; request stitching; loudnorm 2 pass; OTIO EDL; caption từ alignment; master 2 lớp.
**DoD.** Chỉ implement cấu hình đã được WP-12B chứng minh nằm trong ngân sách; distribution master không insert được nếu thiếu archival cha.

**⛔ ĐIỂM DỪNG.** Kinh tế đơn vị của cả dự án.

---

## GIAI ĐOẠN 4 — BẢO ĐẢM, PHÁT HÀNH, HỌC (WP-22 → WP-25)

### 🟡 WP-22 · MSR-02, MSR-03 Assurance Panel + Stage 12, 14
**Cần từ người dùng.** Rubric anchor: 3 ví dụ fail/borderline/pass mỗi dimension (§6).
**Phạm vi.** Critic blind theo PROFILE; vùng biên n=3 median; gate evaluation engine; thứ tự M0→M1→M2.
**DoD.** Critic qualified trên gold set trước khi dùng (trigger schema cưỡng chế); M2 không chạy được khi M1 còn FAIL.

**⛔ ĐIỂM DỪNG.** Critic qualification tốn chi phí provider đáng kể.

### 🟢 WP-23 · PUB-01 Publishing + Stage 15
**Phạm vi.** Hai lệnh owner tách biệt; đối soát cuối; auto-publish OFF cứng; **v2:** tích hợp G15 checklist.
**DoD.** Không đường code nào set `auto_publish=1`; `AUTHORIZE_PUBLISH` không chạy được nếu thiếu `predicted_performance` (P9) hoặc thiếu PC1..PC8.

### 🟢 WP-24 · LRN-01..03 Learning + Stage 16
**Phạm vi.** Prediction engine + hiệu chỉnh; YouTube Analytics ETL; MAE và beat-level error; experiment registry; `PROMOTE_LEARNING`. Migration `0007`.
**DoD.** Learning chưa đạt cỡ mẫu → không promote được; Standard Registry không có đường ghi từ Learning ngoài lệnh owner.

### 🟢 WP-25 · OPS-01, OPS-02 Observability & Operator UI
**Phạm vi.** Tracing; bộ chỉ số tối thiểu; cảnh báo; operator workspace theo 5 tiêu chuẩn hiển thị.
**DoD.** Với một `trace_id` bất kỳ, tái dựng toàn bộ chuỗi sự kiện; `NOT_EVALUATED` hiển thị tách khỏi `FAIL`; fixture mang nhãn `NOT A RELEASE CANDIDATE`.

---

## GIAI ĐOẠN 5 — VẬN HÀNH & TIẾN HÓA (WP-26 → WP-31)

### 🟢 WP-26 · G11–G15 Enforcement
**Phạm vi.** Migration `0008` phần trigger strictness; CI so sánh thresholds với bản seal; CI chặn PR mode=OPERATE chạm vùng G13; gold_sample append-only; G15 chặn publish.
**DoD.** Test guardrail g11–g15 chạy CI như G1–G10: RELAX threshold không kèm promotion → CI fail; DELETE gold_sample → abort; publish thiếu PC-4 → chặn.

### 🟢 WP-27 · Evolution Pipeline
**Phạm vi.** `evolution_proposal` + trigger; lệnh `PROMOTE_EVOLUTION`, `RETIRE_GOLD_SAMPLE`; shadow-run harness trên namespace qualification; evidence bundle generator (09 §2); rollback ref.
**DoD.** Proposal RELAX không sang PROMOTED thiếu owner; thiếu shadow evidence không sang EVIDENCE_READY; promote một threshold thử → registry đổi đúng một chỗ, có rollback.

### 🟡 WP-28 · Human Touchpoints & Evidence
**Cần từ người dùng.** Human allowlist (§10); trần chú ý (§11).
**Phạm vi.** Migration `0009`; gate `EDITORIAL_IMPRINT_PRESENT` (M0); lint đa dạng loại quyết định; hàng đợi HP + đồng hồ chú ý trong operator UI; `generateEvidenceReport`.
**DoD.** Package thiếu MIN_HUMAN_DECISIONS → DoR chặn Stage 14; decision của service account → abort; evidence report tái lập 100% từ D1/R2 cho kênh + cửa sổ bất kỳ.

### 🔴 WP-29 · Policy Defense
**Chặn bởi.** §9 (disclosure), §10 (thẩm quyền sự cố).
**Phạm vi.** Migration `0010`; PC-1..8; self-similarity (PC-7) dùng lại primitive WP-17; disclosure/incident/freeze; `FREEZE_CHANNEL`; policy watch job qua CORE-06.
**DoD.** Toggle disclosure=0 thiếu rationale → abort; incident I2 mở mà kênh chưa freeze → cảnh báo cứng; unfreeze thiếu owner hoặc thiếu learning promoted → abort; policy watch tạo proposal khi diff giả lập.

### 🟢 WP-30 · LRN-04 Failure Mining + Learning Scope
**Phạm vi.** Module LRN-04 đầy đủ (09 §3); `scope`/`replicated_channel_ids` trên learning; luật promote CHANNEL/PORTFOLIO; escaped-defect detector.
**DoD.** Rejected master giả lập → gold sample cùng lần chạy; escaped P0 giả lập → proposal + cờ requalify; promote PORTFOLIO từ 1 kênh → từ chối; LRN-04 không có đường ghi ngoài 2 bảng cho phép.

### 🟢 WP-31 · OPERATE Mode Harness
**Phạm vi.** OPS-LOG convention; job quét hàng ngày (orphan, FAIL, spend, incident); audit OPS-LOG ↔ command_log; ba prompt §0-OPS/§1-OPS/§2-OPS kiểm thử trên hệ thật.
**DoD.** Quét hàng ngày trên fixture có orphan + FAIL → báo cáo đúng, xử lý đúng runbook; lệnh trong command_log không có trong OPS-LOG → audit bắt được.

---

## TRACK G — GOLDEN PATH

**Điều kiện khởi động:** WP-12B kết luận + WP-16, 17 + WP-28, 29 mức tối thiểu + quyết định §1–§5, §9–§11.
**Cấu hình:** `PROFILE = REDUCED`. Chi tiết vận hành: `13-TRACK-G-CONFIG.md`.

```
G-01  Kênh #1: chọn ngách, ChannelIdentityContract v1, pillar đầu tiên
G-02  Video #1 end-to-end → ⛔ DỪNG, review đầy đủ với owner
G-03  Video #2–5: đo cost thật, thu nhãn từ chối → gold set (flywheel 1)
G-04  Video #6–10: bật prediction seal (P9), thu baseline retention (§8)
G-05  ⛔ GO/NO-GO: kênh sống qua YPP review? cost/video trong trần?
      → GO: nâng PROFILE=FULL từng phần theo WP-18..22 + mở kênh #2
      → NO-GO: quay lại 11 §5 kill criteria
```

**Không cắt trong REDUCED** (đây là phòng thủ chính sách, không phải tính năng):
truth layer, anti-copy, ChannelIdentityContract, advice lint, HP-02 Editorial Imprint, disclosure, G15 checklist, prediction seal.

---

## Đồ thị phụ thuộc

```
WP-00 ─┬─ WP-01 ─┬─ WP-02 ─┬─ WP-03 ─── WP-04 ─┬─ WP-05
       │         │         │                   │
       └─ WP-06  └─ WP-07  └─ WP-08 ─── WP-09 ─┘
                                │
       ┌────────────────────────┴─────────────────────────┐
    WP-10 ── WP-11        WP-12 ── WP-12B ★        WP-13
       │                     │                       │
       │                     └── WP-14 ── WP-15 ─────┤
       │                                             │
    WP-16 ── WP-17 ──┬── WP-18 ── WP-19 ── WP-20 ── WP-21
                     │                                │
                     ├── WP-28 ── WP-29 ──┐        WP-22 ── WP-23 ── WP-24
                     │                    │           │
                     └──▶ TRACK G ◀───────┘        WP-25 ── WP-26 ── WP-27
                                                       │        │
                                                    WP-31 ◀── WP-30
```

## Điểm dừng bắt buộc

| Sau | Vì sao |
|---|---|
| WP-09 | Nền tảng xong |
| WP-12B | **Kết luận kinh tế quyết định cấu hình mọi WP sau** |
| WP-15 | Error floor quyết định một hard gate |
| Track G video #1 | Toàn bộ giả định gặp thực tế lần đầu |
| WP-21 | Kinh tế đơn vị |
| WP-22 | Critic qualification tốn chi phí |
| Track G video #8–10 | GO/NO-GO nâng FULL + mở kênh #2 |
| Trước mọi lệnh owner | P10 |
| Trước mọi UNFREEZE | 11 §4 |

## Bảng "muốn bắt đầu → cần gì"

| Muốn | Cần trả lời trước |
|---|---|
| WP-00 → WP-07, WP-10, 11, 13, 16, 17, 20 | Không cần gì — bắt đầu ngay |
| WP-08, WP-09 | §1, §3 |
| WP-12, WP-12B | §3, §4 |
| WP-14, WP-15 | §7 |
| WP-18 | §8 |
| WP-19 | §2, §5 |
| WP-21 | §3, §5 + kết quả WP-12B |
| WP-22 | §6 |
| WP-23 → WP-27, WP-30, WP-31 | Không cần gì |
| WP-28 | §11 + allowlist |
| WP-29 | §9, §10 |
| Track G | §1–§5, §9–§11 + WP-12B |

### 🟢 WP-33 · EVOLVE_STAGE12_QA_REMEDIATION

**Phạm vi.** Immutable failed-QA receipt; một typed diagnostic scan cho failed attempt 3; renderer overlay evaluate theo frame; loudness correction sau encode.

**DoD.** QA fail vẫn trả 422 sau khi evidence R2/D1 read-back; diagnostic không đổi job gốc, không generation/provider/publish; renderer và encoded-audio smoke PASS; `thresholds.ts` không đổi.

### 🟢 WP-34 · EVOLVE_STAGE12_DIAGNOSTIC_CALLBACK

**Phạm vi.** Loại bỏ callback timeout do hydrate pipeline/băm lại pre-master; typed transport error; immutable lineage cho đúng một diagnostic callback retry.

**DoD.** Callback dùng duration đã lưu và pointer/hash/size R2, receipt vẫn immutable/read-back; numeric DOMException code không lọt vào D1; failed diagnostic cũ không sửa/xóa; retry ordinal 2 chỉ nhận callback timeout typed; không tự chạy retry scan, generation, provider, finalize hoặc publish; mọi threshold giữ nguyên.

### 🟢 WP-35 · EVOLVE_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY

**Phạm vi.** Typed reproduction job riêng đọc immutable corrected pre-master ordinal
2, tái chạy strategy v3 chỉ để đo exact source/per-pass/final encoded loudness và
ghi append-only evidence với pinned worker/runtime provenance.

**DoD.** Migration 0030 không sửa/backfill ordinal 2/3; source route không có upload;
real FFmpeg smoke và root/Sites tests PASS; per-pass raw/numeric LUFS, true peak,
LRA, predicates, frame-MD5 và provenance nhất quán; không ordinal/attempt 4,
provider, calibration, corrected output, Finalize, release hoặc publish. Build/PR
không tự chạy Production replay.

### 🟢 WP-36 · EVOLVE_STAGE12_CODEC_SAFE_TRUE_PEAK_CONVERGENCE

**Phạm vi.** Shadow-only engine giải mã immutable ordinal 2 đúng một lần thành
canonical `pcm_f32le`, tạo mọi Opus candidate từ cùng lossless reference và dùng
post-Opus LUFS/true-peak/LRA làm feedback deterministic. Typed command riêng và
migration 0031 chỉ ghi append-only job/evidence với exact diagnostic-replay lineage.

**DoD.** Unit/controller, migration, guardrail, real FFmpeg zero-write smoke và
root/Sites CI PASS; mọi candidate khóa cùng lossless SHA/frame-MD5, image/runtime/
algorithm/threshold provenance; threshold giữ nguyên. PR không tự chạy Production
shadow replay, không tạo ordinal/attempt 4, output, provider, calibration, Finalize,
release hoặc publish; shadow PASS không tự kích hoạt correction algorithm.

### 🟡 WP-37 · EVOLVE_STAGE12_CODEC_SAFE_LRA_CONVERGENCE_GUARD

**Phạm vi.** Shadow-only controller tái tạo candidate pass 1 làm safe anchor,
tách LRA bracket/bisection khỏi LUFS trim và limiter feedback, rollback mọi
true-peak/codec regression. Typed command riêng và migration 0032 chỉ ghi
append-only job/evidence trên exact parent shadow lineage.

**DoD.** Anchor reproduction drift phải fail-closed; LRA search nằm trong bracket
pass 1/pass 3 và tối đa 8 candidates; LUFS trim hướng tới biên trong gần nhất với
bước tối đa 0.25 LU; overshoot regression >0.25 dB bị reject và rollback. Unit,
migration, guardrail, real FFmpeg zero-write smoke, root/Sites CI PASS. Threshold
không đổi; không Production replay, ordinal/attempt 4, output, provider,
calibration, Finalize, release, activation hoặc publish.
