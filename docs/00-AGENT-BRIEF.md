# 00 — AGENT BRIEF (v2)

Chỉ dẫn vận hành cho coding agent xây và vận hành AI Factory. Đọc trước mọi tài liệu khác. Mọi quy tắc ở đây là ràng buộc cứng, không phải gợi ý.

---

## 1. Nhiệm vụ

Xây và vận hành liên tục một hệ thống đa kênh YouTube tự động hóa vòng lặp: nghiên cứu → chiến lược → sản xuất → phát hành → đo lường → cải thiện.

44 module, 18 stage sản xuất, control plane fail-closed, và ba flywheel tự nâng cấp có kiểm soát. Agent xây theo `04-BUILD-ORDER.md`, không nhảy cóc.

---

## 2. Tuyên bố chế độ — BẮT BUỘC ĐẦU MỖI PHIÊN

Agent luôn ở đúng một mode. **Không tuyên bố mode = không được bắt đầu.**

| Mode | Mục đích | Cấm |
|---|---|---|
| **BUILD** | Xây work package | Chạm production data; dispatch provider thật |
| **OPERATE** | Vận hành nhà máy đang chạy | Sửa contracts/guardrail tests/migrations/gate definitions (G13); mọi lệnh owner |
| **EVOLVE** | Thay đổi chính nhà máy | Kích hoạt thay đổi lên production (chỉ owner promote) |

Không chuyển mode giữa phiên. Việc phát sinh thuộc mode khác → ghi `BLOCKED.md` hoặc `EVOLUTION-QUEUE.md`. Chi tiết: `08-CONTINUOUS-OPERATION.md`.

---

## 3. Mười ba nguyên lý — ràng buộc cứng

Xung đột → nguyên lý số nhỏ hơn thắng.

| # | Nguyên lý | Kiểm chứng bằng |
|---|---|---|
| P1 | Output chỉ tồn tại khi bytes đã read-back và checksum khớp | Trigger `trg_sealed_requires_bytes` |
| P2 | Fail-closed. Thiếu bằng chứng = chặn | Test: `NOT_EVALUATED` chặn DoR |
| P3 | Control plane là nguồn quyền duy nhất | Test: media worker không có credential D1 |
| P4 | Bất biến ≠ đủ điều kiện | Hai cột riêng trong schema |
| P5 | Không đặt ngưỡng lên phép đo chưa hiệu chuẩn | Danh sách `UNCALIBRATED` + lint |
| P6 | Xác định trước, mô hình sau | Lint: cấm gọi LLM trong `preflight()` |
| P7 | Độc lập là kiến trúc, không phải quy ước | Test: sinh và chấm khác temperature, blind |
| P8 | Identity ở cấp kênh | Schema: `channel_identity_contract` |
| P9 | Không dự báo thì không học | Trigger: publish chặn nếu thiếu prediction |
| P10 | Có những quyền không được ủy quyền | Trigger: 5 lệnh owner cần chữ ký identity |
| P11 | **Hệ thống không tự nới chuẩn của chính nó** | Trigger `trg_relax_requires_promotion` |
| P12 | **Chú ý con người là tài nguyên khan hiếm nhất** | `attention_ledger` + trần tuần cưỡng chế |
| P13 | **Bằng chứng human input là tài sản phòng thủ** | `human_decision` + evidence report |

---

## 4. Mười lăm guardrail — tuyệt đối không vi phạm

Mỗi mục phải có test hoặc lint cưỡng chế. Agent tự viết như một phần của work package.

```
G1   CẤM JSON.stringify trước khi hash. Chỉ canonicalHash().
     → ESLint no-restricted-syntax
G2   CẤM import SDK provider ngoài packages/provider/adapters/.
     → ESLint no-restricted-imports
G3   CẤM media worker ghi D1. Chỉ R2 + phát command.
     → Container không nhận D1 binding; test negative
G4   CẤM UPDATE/DELETE trên command_log.
     → SQL trigger RAISE(ABORT)
G5   CẤM artifact namespace 'qualification' trong lineage 'production'.
     → Trigger trg_namespace_isolation + test quét toàn bộ
G6   CẤM gọi LLM trong preflight().
     → Type system: PreflightContext không expose provider client
G7   CẤM gate = PASS mà không có evidence_r2_key.
     → Trigger trg_gate_pass_requires_evidence
G8   CẤM retry SCHEMA_VIOLATION | RIGHTS_DENIED | BUDGET_DENIED | CONTENT_FILTERED.
     → Trigger trg_no_retry_terminal_errors + test từng lớp
G9   CẤM dispatch provider không qua guardedDispatch.
     → Adapter framework chỉ expose guardedDispatch()
G10  CẤM auto_publish = true.
     → CHECK (auto_publish = 0)
G11  CẤM tự nới chuẩn — threshold, gate, guardrail chỉ siết tự động.
     → Trigger trg_gate_no_silent_relax + CI so sánh thresholds
G12  CẤM meta-change có hiệu lực production mà không qua shadow run.
     → Trigger trg_evolution_evidence_required
G13  Trong OPERATE: CẤM sửa contracts, guardrail tests, migrations,
     gate definitions.
     → CI chặn PR gắn nhãn mode=OPERATE chạm các đường dẫn đó
G14  gold_sample append-only; sửa nhãn cần lệnh owner.
     → Trigger trg_gold_no_delete, trg_gold_label_immutable
G15  CẤM publish khi thiếu bất kỳ mục nào trong Policy Defense Checklist.
     → Trigger trg_publish_requires_policy_checklist
```

Mười một trong mười lăm được cưỡng chế ở tầng database hoặc type system. Agent vẫn phải viết test chứng minh từng trigger ABORT đúng trường hợp — **trigger không có test coi như chưa tồn tại**.

---

## 5. Việc agent KHÔNG được tự quyết

Gặp → **dừng work package, ghi `BLOCKED.md`, hỏi**. Không đoán, không đặt mặc định rồi đi tiếp.

| Loại | Ví dụ |
|---|---|
| 11 quyết định trong `07` | Nhịp, identity, trần chi phí, hạ tầng, disclosure, trần chú ý |
| Chọn nhà cung cấp | `TBD_PRODUCTION_AUDIO`; hạ tầng container |
| Ngưỡng chất lượng | Mọi thay đổi với `02-CONTRACTS`; đặt ngưỡng mới khi thiếu |
| Quyền owner | `AUTHORIZE_RELEASE/PUBLISH`, `PROMOTE_LEARNING/EVOLUTION`, `RETIRE_GOLD_SAMPLE` |
| Editorial Imprint | Quyết định biên tập D1–D5 — điều kiện chính sách, không ủy quyền cho model |
| Rights & compliance | Diễn giải license; chính sách công bố nội dung AI |
| Nới guardrail | Mọi đề xuất "tạm bỏ qua G-x để đi tiếp" |

**Quy tắc vàng:** nếu agent thấy mình đang viết một giá trị số vào code mà tài liệu không nêu, đó là dấu hiệu phải hỏi, không phải dấu hiệu phải sáng tạo.

---

## 6. Giao thức làm việc (BUILD)

```
Với mỗi work package:

1. TUYÊN BỐ MODE — "MODE: BUILD. WP-XX." Nêu lại guardrail liên quan.

2. ĐỌC   — 02-CONTRACTS.md và 03-DATA-SCHEMA.sql trước tiên.
           Contracts là nguồn chân lý. Code mâu thuẫn contract → code sai.

3. VIẾT TEST TRƯỚC
           Mỗi mục Acceptance = ít nhất một test. Test phải FAIL trước
           khi có implementation.

4. IMPLEMENT
           Chỉ trong phạm vi WP. Không "tiện tay" sửa package khác.

5. LINT GUARDRAIL
           Chạy toàn bộ G1–G15. Không pass thì không đi tiếp.

6. CHỨNG MINH
           DONE.md: từng mục Acceptance ↔ test nào chứng minh.
           Không có test tương ứng = WP chưa xong.

7. DỪNG
           Không tự khởi động WP kế tiếp. Báo cáo và chờ.
```

---

## 7. Định nghĩa Hoàn thành

Một WP chỉ xong khi **tất cả** đúng:

- [ ] Mọi mục Acceptance có test tương ứng, test pass
- [ ] Guardrail liên quan có lint/test/trigger cưỡng chế
- [ ] Mọi trigger mới trong migration có test chứng minh ABORT đúng trường hợp
- [ ] Không có `TODO`, `FIXME`, `any`, hoặc số hardcode ngoài `thresholds.ts`
- [ ] Migration chạy được cả `up` và `down`, lặp 2 lần
- [ ] `DONE.md` ghi ma trận Acceptance ↔ Test
- [ ] Không có thay đổi ngoài phạm vi WP
- [ ] `BLOCKED.md` trống, hoặc mọi mục đã được người dùng trả lời

---

## 8. Quy ước kỹ thuật

**Ngôn ngữ.** TypeScript strict. `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Cấm `any`; dùng `unknown` + type guard.

**Schema runtime.** Zod cho mọi ranh giới (input provider, job envelope, command payload). Type suy ra từ Zod schema, không định nghĩa hai lần.

**Test.** Vitest. Đặt cạnh file được test. Test tích hợp trong `/tests`.

**SQL.** Migration đánh số tăng dần, có `up` và `down`. Không dùng ORM che giấu SQL cho bảng control plane — viết SQL tường minh để audit được.

**Lỗi.** Không throw string. Mọi lỗi là class có `code` thuộc union trong contracts.

**Log.** Structured JSON, bắt buộc `trace_id`. Cấm `console.log` ngoài development.

**Commit.** Một WP = một nhánh. Message: `WP-XX: <mô tả>`. PR phải gắn nhãn mode (`mode=BUILD|OPERATE|EVOLVE`) — CI dùng nhãn này để cưỡng chế G13.

**Số.** Mọi ngưỡng import từ `contracts/thresholds`. Tham số phụ thuộc cấu hình (width, count) đọc từ `PROFILE`, không hardcode và không rẽ nhánh code.

---

## 9. Thứ tự đọc tài liệu

```
00-AGENT-BRIEF.md          ← đang đọc
08-CONTINUOUS-OPERATION.md ← ngay sau: xác định mode
01-REPO-STRUCTURE.md       ← layout và stack
02-CONTRACTS.md            ← NGUỒN CHÂN LÝ về kiểu và ngưỡng
03-DATA-SCHEMA.sql         ← NGUỒN CHÂN LÝ về dữ liệu
04-BUILD-ORDER.md          ← làm gì, theo thứ tự nào
05-TEST-SPEC.md            ← chứng minh thế nào
06-PROMPT-PACK.md          ← prompt cho từng tình huống
07-DECISIONS-REQUIRED.md   ← + DECISIONS-ANSWERED.md (đã điền)
09, 10, 11                 ← trước WP-26 trở đi, hoặc trước OPERATE
13, 14                     ← khi khởi động Track G

Tham chiếu (đọc khi cần chi tiết một module):
  ai-factory-kien-truc.md · ai-factory-modul-nen-tang.md
  ai-factory-modul-nghiep-vu.md
```

---

## 10. Giới hạn của tự động hóa

Agent xây được: toàn bộ control plane, capability plane, provider framework, execution framework, measurement plane xác định, schema và migration, evolution pipeline, test suite, operator UI.

Agent **không** làm được nếu không có con người:

| Hạng mục | Vì sao |
|---|---|
| Hiệu chuẩn error floor của forced aligner | Cần mẫu audio người đọc chuẩn |
| Gold set gốc | Nhãn đến từ phán quyết của owner |
| Rubric anchoring | Cần ví dụ fail/borderline/pass do người chọn |
| Qualify capability | Cần chạy thật, tốn tiền thật |
| Editorial Imprint D1–D5 | Điều kiện chính sách — model tự làm thì không còn là human input |
| 11 quyết định trong `07` | Là input của kiến trúc |
| Mọi lệnh identity-bound | Theo thiết kế |
| Nới bất kỳ chuẩn nào | P11 |

Agent phải nhận diện đúng ranh giới này và **dừng**, thay vì tạo giá trị giả để test pass. Đây là thứ đầu tiên cần kiểm khi agent báo "đã xong".
