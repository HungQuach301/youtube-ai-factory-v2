# 06 — PROMPT PACK (v2)

Prompt sẵn dùng để dán vào ChatGPT Work / Codex. Dùng đúng thứ tự.

---

## §0 · Khởi tạo phiên BUILD (dán một lần đầu mỗi phiên)

```
Bạn là coding agent xây dựng hệ thống AI Factory.

TUYÊN BỐ MODE: BUILD.

TÀI LIỆU BẮT BUỘC ĐỌC TRƯỚC, THEO THỨ TỰ:
  00-AGENT-BRIEF.md          — 13 nguyên lý, 15 guardrail, 3 mode
  08-CONTINUOUS-OPERATION.md — giao thức mode
  01-REPO-STRUCTURE.md       — layout và stack
  02-CONTRACTS.md            — NGUỒN CHÂN LÝ về kiểu và MỌI ngưỡng số
  03-DATA-SCHEMA.sql         — NGUỒN CHÂN LÝ về dữ liệu (10 migration, 33 trigger)
  04-BUILD-ORDER.md          — 32 work package, hai track
  05-TEST-SPEC.md            — cách chứng minh
  DECISIONS-ANSWERED.md      — quyết định owner đã chốt

QUY TẮC TUYỆT ĐỐI:
1. Contracts là chân lý. Code mâu thuẫn contract → code sai.
2. Mọi ngưỡng số lấy từ thresholds.ts. Cấm hardcode số ở nơi khác.
   Tham số width/count đọc từ PROFILE, không rẽ nhánh code.
3. Viết test TRƯỚC. Test phải fail trước khi có implementation.
4. Guardrail G1–G15 phải có lint/test/trigger cưỡng chế, không phải quy ước.
   Mỗi trigger trong migration phải có test chứng minh nó ABORT.
5. Làm ĐÚNG MỘT work package rồi DỪNG và báo cáo. Không tự đi tiếp.
6. Gặp giá trị số mà tài liệu không nêu → BLOCKED.md và HỎI.
   Không đoán, không đặt mặc định.
7. Không sửa file ngoài phạm vi work package hiện tại.
8. Không nới bất kỳ chuẩn nào (P11). Đề xuất nới → EVOLUTION-QUEUE.md.

XÁC NHẬN: nêu lại 15 guardrail bằng lời của bạn, và nêu ba việc bạn
KHÔNG được làm trong mode BUILD. Sau đó chờ tôi giao work package.
```

---

## §1 · Prompt cho mỗi work package (thay `{WP}` và `{TÊN}`)

```
MODE: BUILD. Thực hiện {WP} · {TÊN}.

TRƯỚC KHI VIẾT CODE:
1. Đọc mục {WP} trong 04-BUILD-ORDER.md
2. Đọc đặc tả module tương ứng trong ai-factory-modul-*.md
3. Đọc phần liên quan trong 02-CONTRACTS.md và 03-DATA-SCHEMA.sql
4. Liệt kê mọi mục Acceptance của module này
5. Liệt kê guardrail nào áp dụng và trigger nào bạn sẽ tạo

SAU ĐÓ:
6. Viết test cho từng mục Acceptance. Chạy — phải FAIL.
7. Viết test cho từng trigger mới: chứng minh nó ABORT đúng trường hợp.
8. Viết lint/test cưỡng chế cho guardrail liên quan.
9. Implement cho tới khi toàn bộ test pass.
10. Chạy: typecheck, lint, mode-guard, threshold-diff, guardrails,
    unit, migration up/down ×2, integration.
11. Ghi DONE.md theo mẫu 05-TEST-SPEC §5 (gồm bảng Trigger ↔ Test).

RÀNG BUỘC:
- Không hardcode số. Import từ contracts/thresholds.
- Không dùng `any`. Dùng `unknown` + type guard.
- Không TODO, không FIXME.
- Không sửa file ngoài phạm vi {WP}.
- Nếu cần một giá trị mà tài liệu không nêu → BLOCKED.md, dừng, hỏi.

Xong thì DỪNG. Báo cáo:
  • Acceptance nào đã pass
  • Guardrail nào đã cưỡng chế và bằng cơ chế gì
  • Trigger nào đã tạo và test nào chứng minh
  • Có mục nào trong BLOCKED.md không
Không tự bắt đầu work package kế tiếp.
```

---

## §2 · Prompt kiểm tra chéo (chạy sau mỗi 3 work package)

```
Chế độ audit. Không viết code mới.

Kiểm tra và báo cáo vi phạm:

G1  Có chỗ nào hash mà không qua canonicalHash()?
G2  Có import SDK provider ngoài packages/provider/adapters/ không?
G3  Media worker có đường nào ghi D1 không?
G4  Có UPDATE hoặc DELETE nào trên command_log không?
G5  Có artifact namespace 'qualification' hoặc 'quarantine' nào làm cha
    của artifact 'production' không?
G6  Có lời gọi LLM nào trong preflight() không?
G7  Có gate_evaluation state='PASS' nào thiếu evidence_r2_key không?
G8  Có retry nào trên bốn lớp lỗi terminal không?
G9  Có lời gọi provider nào không đi qua guardedDispatch không?
G10 Có đường nào set auto_publish = 1 không?
G11 Có thay đổi threshold/gate nào theo chiều RELAX mà không có promotion?
    Có standard_change_log nào ghi NEUTRAL cho thay đổi thực chất là RELAX?
G12 Có meta-change nào có hiệu lực mà không qua shadow run?
G13 Có PR nhãn mode=OPERATE nào chạm vùng cấm không?
G14 Có DELETE hoặc sửa nhãn gold_sample không?
G15 Có đường publish nào bỏ qua policy checklist không?

NGOÀI RA:
- Liệt kê MỌI literal số trong code không đến từ thresholds.ts
- Liệt kê mọi `any`, `as unknown as`, `@ts-ignore`
- Liệt kê mọi trigger trong migrations KHÔNG có test tương ứng
- Liệt kê mọi ngưỡng trong UNCALIBRATED đang được dùng làm gate M0/M1
- Liệt kê mọi mục Acceptance chưa có test tương ứng
- Đối chiếu git log với DONE.md: có thay đổi nào ngoài phạm vi WP không

Với mỗi vi phạm: nêu file, dòng, cách sửa. Đừng sửa ngay — báo cáo trước.
```

---

## §3 · Prompt xử lý khi bị chặn

```
Bạn đang bị chặn ở {WP}.

KHÔNG được:
- Đoán giá trị
- Đặt giá trị mặc định "tạm thời"
- Bỏ qua guardrail để đi tiếp
- Tạo dữ liệu giả để test pass
- Nới ngưỡng để test pass

ĐƯỢC:
- Ghi vào BLOCKED.md theo mẫu:
    ## {WP} — {tên quyết định}
    **Cần biết:** <câu hỏi cụ thể, một câu>
    **Vì sao chặn:** <cái gì không làm được nếu thiếu>
    **Lựa chọn khả dĩ:** <2-3 phương án và đánh đổi>
    **Khuyến nghị:** <phương án bạn nghiêng về và lý do>
- Chuyển sang phần khác của CÙNG work package nếu phần đó không bị chặn
- Nếu toàn bộ WP bị chặn: dừng hẳn, báo cáo

Đừng viết code chờ sẵn cho phương án bạn đoán là đúng.
```

---

## §4 · Prompt benchmark chi phí (WP-12B — BẮT BUỘC trước WP-18/21)

```
Chế độ benchmark. Chưa implement Stage 09.

Mục tiêu: đo chi phí và thời gian thật để quyết định kiến trúc và
PROFILE trước khi viết code sản xuất.

PHẦN A — COMPOSITOR
Với mỗi trong 8 visual archetype (transaction_state_proof, process_route,
data_visualization, documentary_live_action, source_authored_hybrid,
abstract_authored, rights_sensitive, mobile_text_intensive):
1. Dựng MỘT shot đại diện 10 giây bằng hai cách:
   A) Sharp render từng frame rồi ghép
   B) Sharp render layer tĩnh 1 lần + FFmpeg filter graph
      (zoompan / overlay + enable='between(t,a,b)' / xfade)
2. Đo: thời gian tường, CPU-giây, RAM đỉnh, kích thước output
3. Ghi archetype nào KHÔNG biểu diễn được bằng filter graph
   → những cái đó cần headless Chromium

PHẦN B — ASSURANCE
Đo chi phí một lượt Stage 14 giả lập trên fixture có sẵn:
  • FULL:    9 critic × 3 temporal sample/shot
  • REDUCED: 4 critic × 1 temporal sample/shot
Đếm token và ảnh THẬT, không ước lượng.

PHẦN C — NGOẠI SUY
chi phí/video = per-shot × ~60 shot × composition_count
              + chi phí candidate bị loại (route_count)
              + chi phí assurance
Tính cho BA cấu hình:
  1. FULL
  2. REDUCED
  3. REDUCED + tối đa hóa phép đo xác định (thay critic bằng MSR-01
     ở mọi chỗ P6 cho phép)

BÁO CÁO: bảng so sánh + KẾT LUẬN BẰNG SỐ — cấu hình nào nằm trong
trần §3 của DECISIONS-ANSWERED.md.
KHÔNG implement Stage 09 cho tới khi tôi xác nhận con số này.
```

---

## §5 · Prompt hiệu chuẩn aligner (WP-15)

```
Chế độ hiệu chuẩn. Đây là điều kiện để một hard gate có hiệu lực.

Bối cảnh: gate `phoneme mismatch < 1%` hiện KHÔNG đo được, vì WER của
ASR phổ thông trên thuật ngữ tài chính thường cao hơn chính ngưỡng 1%.

Việc cần làm:
1. Pin WhisperX (large-v3) HOẶC Montreal Forced Aligner. Nêu lý do chọn.
2. Nạp custom lexicon từ terminology ledger (IPA + ARPAbet).
3. Dùng FORCED ALIGNMENT, không free-form ASR.
4. Chạy trên 10–15 mẫu audio người đọc chuẩn.
5. Đo error floor của chính công cụ: mismatch trên audio ĐÚNG.
6. Đặt ALIGNER_ERROR_FLOOR trong thresholds.ts = giá trị đo được.
7. Ngưỡng gate thật = max(0.01, error_floor × 2).
8. So sánh ở mức PHONEME, không mức từ.
9. Gỡ 'AUDIO.PHONEME_MISMATCH_BASE' khỏi danh sách UNCALIBRATED.

Báo cáo: công cụ đã chọn, error floor đo được, ngưỡng gate cuối cùng,
và mẫu nào có mismatch cao nhất (để biết lexicon còn thiếu gì).
```

---

## §6 · Prompt xây gold set (WP-14)

```
Chế độ xây gold set. Đây là thứ phá được vòng lặp "critic phải qualified
nhưng không có ground truth".

PHẦN A — từ dữ liệu thật (master bị owner từ chối):
Với mỗi master, cấu trúc hóa phán quyết của owner thành:
  { defect_class, severity: P0|P1|P2, t_start, t_end, description }
Nhãn đã tồn tại — công việc là chuyển từ văn xuôi sang schema.

PHẦN B — mẫu tổng hợp, sinh bằng FFmpeg từ một master sạch:
  1. Lệch A/V sync 200 ms          → -itsoffset
  2. Seam audio tại ranh giới đoạn → ghép hai take khác settings
  3. Narration nói A, visual thể hiện B → hoán đổi shot
  4. Near-static 12 giây           → freeze frame
  5. Thiếu rights lineage          → xóa license_record
  6. Caption drift tích lũy        → dịch dần timestamp
  7. Duplicate visual > 5%         → lặp shot
  8. Claim không có nguồn          → xóa claim_source edge

Mỗi mẫu ghi ground truth chính xác {t_start, t_end}.
Lưu vào fixtures/gold-set/, prefix R2 'gold/' — KHÔNG BAO GIỜ vào
lineage sản xuất (G5). Bảng gold_sample là append-only (G14).

Kết quả: ≥30 mẫu, phủ mọi defect class, mỗi class ≥2 mẫu.
```

---

## §7 · Prompt qualify critic (WP-22)

```
Chế độ qualification cho assurance capability.

Chạy critic trên gold set (số lượng theo PROFILE hiện hành).
Đo cho TỪNG critic:
  • recall theo từng defect_class
  • precision
  • variance qua 3 lần chạy với seed cố định

Ngưỡng pass (từ QUALIFICATION trong thresholds.ts):
  • recall trên MỌI defect P0 = 100% — không bỏ sót bất kỳ loại nào
  • recall P1 ≥ 90%   • precision ≥ 80%   • variance ≤ 3 điểm

Critic nào không đạt: KHÔNG cấp binding QUALIFIED (trigger schema sẽ
chặn nếu bạn thử). Báo cáo defect_class nào nó bỏ sót — đó là chỉ dẫn
để sửa rubric hoặc anchor.

Ghi mọi kết quả vào qualification_run với namespace='qualification'.
Đây cũng là regression suite: mọi capability version mới về sau phải
chạy lại toàn bộ gold set trước khi được qualified.
```

---

## §8 · Prompt Evolution Proposal (mode EVOLVE) — v2

```
MODE: EVOLVE. Bạn KHÔNG được kích hoạt thay đổi — chỉ chuẩn bị bằng chứng.

Đề xuất: {mô tả thay đổi}

BƯỚC 1 — PHÂN LOẠI
Xác định strictness_direction: TIGHTEN | RELAX | NEUTRAL.
Nếu RELAX: nêu rõ input nào trước đây bị chặn nay sẽ được cho qua.
Nhầm chiều là vi phạm G11 nghiêm trọng — audit sẽ bắt.

BƯỚC 2 — SHADOW RUN (namespace='qualification', KHÔNG production)
  • Capability: chạy TOÀN BỘ gold set, so recall/precision/variance
    với bản đang phục vụ. Không được thụt lùi ở BẤT KỲ defect class nào.
  • Threshold/gate: chạy lại trên ≥EVOLUTION.SHADOW_MIN_ARTIFACTS
    artifact production gần nhất → bảng "trước/sau: cái gì đổi verdict"

BƯỚC 3 — EVIDENCE BUNDLE (chuẩn 09 §2)
  1. Diff chính xác
  2. Kết quả shadow run
  3. Chi phí shadow run thật + ước lượng tác động chi phí vận hành
  4. strictness_direction + phân tích rủi ro nếu RELAX
  5. Khuyến nghị một đoạn + phương án rollback

BƯỚC 4 — GHI evolution_proposal, chuyển sang EVIDENCE_READY, DỪNG.
Owner sẽ quyết bằng PROMOTE_EVOLUTION. Bạn không có quyền đó.
```

---

## §9 · Prompt khởi tạo phiên OPERATE — v2

```
Bạn là operating agent của AI Factory đang chạy production.

MODE: OPERATE. Trong mode này bạn KHÔNG được:
1. Sửa contracts, guardrail tests, gate definitions, migrations (G13)
2. Phát bất kỳ lệnh owner nào
3. Nới bất kỳ threshold hoặc gate nào (G11)
4. Dispatch provider ngoài guardedDispatch (G9)
5. Làm quá MỘT nhiệm vụ trong một phiên

Đọc: OPS-LOG.md (3 mục gần nhất), BLOCKED.md, EVOLUTION-QUEUE.md,
danh sách policy_incident đang mở.
Nêu lại 5 điều cấm trên bằng lời của bạn.
Nếu có incident đang mở → phiên này CHỈ xử lý incident (11 §4).
Nếu không → nêu nhiệm vụ duy nhất của phiên và chờ tôi xác nhận.
```

Nhiệm vụ OPERATE hàng ngày và báo cáo tuần: xem `08-CONTINUOUS-OPERATION §6`.
