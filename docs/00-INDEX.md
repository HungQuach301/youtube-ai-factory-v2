# AI FACTORY — MASTER PACK

Bộ tài liệu đầy đủ để một coding agent (ChatGPT Work / Codex) xây và **vận hành liên tục** hệ thống AI Factory: nghiên cứu → chiến lược → sản xuất → phát hành → đo lường → cải thiện, đa kênh YouTube.

Đây là index. Đọc file này trước, rồi theo thứ tự ở §4.

---

## 1. Bản đồ tài liệu

### Lõi — nguồn chân lý (không được mâu thuẫn)
| File | Vai trò | Trạng thái |
|---|---|---|
| `02-CONTRACTS.md` | **Nguồn chân lý về kiểu và MỌI ngưỡng số** | v2 — đã hợp nhất toàn bộ delta |
| `03-DATA-SCHEMA.sql` | **Nguồn chân lý về dữ liệu** — 10 migration, trigger cưỡng chế | v1 |

### Chỉ dẫn agent
| File | Vai trò |
|---|---|
| `00-AGENT-BRIEF.md` | 10 nguyên lý gốc, guardrail, giới hạn tự động hóa |
| `01-REPO-STRUCTURE.md` | Layout monorepo, stack, namespace, CI |
| `04-BUILD-ORDER.md` | **v2** — 32 work package, hai track, điểm dừng bắt buộc |
| `05-TEST-SPEC.md` | Ma trận Acceptance ↔ Test, quy tắc chống test giả |
| `06-PROMPT-PACK.md` | Prompt sẵn dùng cho từng tình huống BUILD |
| `07-DECISIONS-REQUIRED.md` | **v2** — 11 quyết định agent không được tự làm + form trả lời |

### Vận hành & tiến hóa
| File | Vai trò |
|---|---|
| `08-CONTINUOUS-OPERATION.md` | Ba mode agent, nhịp vận hành, chống drift, runbook, prompt OPS |
| `09-SELF-UPGRADE.md` | P11, G11–G14, Evolution pipeline, LRN-04, learning xuyên kênh |
| `10-HUMAN-TOUCHPOINTS.md` | 7 điểm chạm, Editorial Imprint gate, Human Evidence Log |
| `11-POLICY-DEFENSE.md` | Gate compliance, disclosure, policy watch, incident playbook, kill criteria |
| `12-BUILD-ORDER-DELTA.md` | Lý giải WP mới (đã hợp nhất vào 04 v2; giữ để tra ngữ cảnh) |
| `13-TRACK-G-CONFIG.md` | Cấu hình reduced để ra 8–10 video thật sớm |
| `14-STAGE-INDEX.md` | Ánh xạ 18 stage ↔ module ↔ gate ↔ capability |
| `15-MODULE-ADDENDUM.md` | 4 module mới (EVO-01, LRN-04, HUM-01, POL-01) + bảng hiệu chỉnh 44 module cũ |
| `16-ARCHITECTURE-ADDENDUM.md` | Cập nhật kiến trúc: P11–P13, X5, VS4, Evolution Plane, 3 bounded context mới |
| `17-STAGE12-QA-REMEDIATION.md` | Evolution Stage 12: immutable failed-QA evidence, typed attempt-3 scan và renderer/audio remediation |

### Tham chiếu (nạp cùng, đọc khi cần chi tiết module)
```
ai-factory-kien-truc.md         bức tranh tổng thể, bounded context, luồng giá trị
                                → đọc kèm 16-ARCHITECTURE-ADDENDUM.md
ai-factory-modul-nen-tang.md    19 module nền tảng
ai-factory-modul-nghiep-vu.md   25 module nghiệp vụ
                                → cả hai đọc kèm 15-MODULE-ADDENDUM.md
```

Ba file tham chiếu giữ nguyên hiệu lực; hai file addendum nêu đầy đủ mọi
chỗ v2 làm thay đổi. Khi mâu thuẫn: addendum thắng.

---

## 2. Mười lăm guardrail — bảng tra nhanh

```
G1   Cấm JSON.stringify trước khi hash — chỉ canonicalHash()
G2   Cấm import SDK provider ngoài packages/provider/adapters/
G3   Media worker cấm ghi D1
G4   command_log append-only
G5   Cấm artifact 'qualification' làm cha của artifact 'production'
G6   Cấm gọi LLM trong preflight()
G7   Gate PASS bắt buộc có evidence_r2_key
G8   Cấm retry SCHEMA_VIOLATION | RIGHTS_DENIED | BUDGET_DENIED | CONTENT_FILTERED
G9   Cấm dispatch provider không qua guardedDispatch
G10  auto_publish luôn = false
G11  Cấm tự nới chuẩn (threshold/gate/guardrail) — chỉ siết tự động
G12  Meta-change phải qua shadow run trước khi có hiệu lực production
G13  OPERATE mode cấm sửa contracts / guardrail tests / migrations / gate definitions
G14  gold_sample append-only
G15  Cấm publish khi thiếu bất kỳ mục nào trong Policy Defense Checklist
```

Mười một trong mười lăm được cưỡng chế ở tầng database hoặc type system — không dựa vào kỷ luật người viết code. Số còn lại cưỡng chế bằng ESLint + test guardrail chạy trong CI, chặn merge.

## 3. Mười ba nguyên lý

```
P1  Bằng chứng trên khai báo          P8   Identity ở cấp kênh
P2  Fail-closed mặc định              P9   Không dự báo thì không học
P3  Control plane là nguồn quyền      P10  Có những quyền không được ủy quyền
P4  Bất biến ≠ đủ điều kiện           P11  Hệ thống không tự nới chuẩn của mình
P5  Không đặt ngưỡng lên phép đo      P12  Chú ý con người là tài nguyên khan hiếm nhất
    chưa hiệu chuẩn                   P13  Bằng chứng human input là tài sản
P6  Xác định trước, mô hình sau             phòng thủ chính sách
P7  Độc lập là kiến trúc
```
Xung đột → nguyên lý số nhỏ hơn thắng.

---

## 4. Quy trình sử dụng

**Bước 1 — Owner trả lời quyết định.** Mở `07-DECISIONS-REQUIRED.md`, điền form §1–§11. Đây là input của kiến trúc, không phải output; trả lời sau sẽ tạo việc làm lại. Ước tính: một buổi làm việc.

**Bước 2 — Nạp workspace.** Toàn bộ 14 file + 3 tài liệu tham chiếu + file quyết định đã điền.

**Bước 3 — Khởi tạo phiên.** Dán `06-PROMPT-PACK §0`. Yêu cầu agent nêu lại 15 guardrail bằng lời của nó và tuyên bố mode. Nêu sai → không cho bắt đầu.

**Bước 4 — Chạy từng work package** bằng prompt `06 §1`. Một WP một nhánh. Dừng sau mỗi WP, đọc `DONE.md`.

**Bước 5 — Audit mỗi 3 WP** bằng prompt `06 §2` (mở rộng cho G11–G15).

**Bước 6 — Khi Track G khởi động**, chuyển sang nhịp `08-CONTINUOUS-OPERATION`: phiên OPERATE hàng ngày, báo cáo tuần, LRN-04 theo chu kỳ analytics.

### Thứ tự đọc cho agent
```
00-AGENT-BRIEF  →  08-CONTINUOUS-OPERATION (xác định mode)
   →  01-REPO-STRUCTURE  →  02-CONTRACTS  →  03-DATA-SCHEMA.sql
   →  04-BUILD-ORDER  →  05-TEST-SPEC
   →  09, 10, 11 (trước bất kỳ WP nào từ WP-26, hoặc trước OPERATE)
   →  15, 16 (khi cần đặc tả module hoặc lý do kiến trúc)
   →  13, 14 khi khởi động Track G
```

---

## 5. Ranh giới — điều agent không làm được

Không phải hạn chế của agent, mà là thiết kế của hệ thống:

| Hạng mục | Vì sao |
|---|---|
| 11 quyết định trong `07` | Là input của kiến trúc |
| Hiệu chuẩn error floor aligner | Cần mẫu audio người đọc chuẩn |
| Gold set gốc, rubric anchor | Nhãn đến từ phán quyết của owner |
| Qualify capability | Chạy thật, tốn tiền thật |
| Editorial Imprint mỗi video | Điều kiện chính sách — không ủy quyền được cho model |
| `AUTHORIZE_RELEASE`, `AUTHORIZE_PUBLISH`, `PROMOTE_LEARNING`, `PROMOTE_EVOLUTION`, `RETIRE_GOLD_SAMPLE` | P10 |
| Nới bất kỳ chuẩn nào | P11 |

Agent phải nhận diện ranh giới và **dừng**, thay vì tạo giá trị giả để test pass. Đây là thứ đầu tiên cần kiểm khi agent báo "đã xong".

---

## 6. Bắt đầu ngay

`WP-00 → WP-07` không cần quyết định nào: scaffold + contracts, canonical hashing, typed command, lease, DoR resolver, standard registry, evidence store, provider adapter framework. Chạy phần đó trong lúc owner trả lời `07`.

**Đường găng đến video thật đầu tiên:** quyết định §1–§5 và §9–§11 → WP-00..09 → WP-12, WP-12B (benchmark chi phí) → WP-16, 17 → WP-28, 29 mức tối thiểu → Track G. Mọi WP còn lại nâng cấp dần quanh pipeline đang chạy.
