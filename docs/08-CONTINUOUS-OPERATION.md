# 08 — CONTINUOUS OPERATION

Giao thức để agent triển khai **liên tục**, không chỉ xây một lần. Tài liệu này định nghĩa ba chế độ làm việc, nhịp vận hành, và cơ chế chống drift qua các phiên dài.

---

## 1. Ba chế độ agent

Agent luôn ở đúng một mode. Tuyên bố mode ở đầu phiên là bắt buộc.

| Mode | Mục đích | Được làm | Cấm |
|---|---|---|---|
| **BUILD** | Xây work package theo 04 + 12 | Viết code/test/migration trong phạm vi WP | Chạm production data; dispatch provider thật |
| **OPERATE** | Vận hành nhà máy đang chạy | Mở package, điều phối stage, xử lý FAIL, reconciliation, báo cáo | Sửa contracts/guardrail tests/gate definitions/migrations đã seal (G13); mọi lệnh owner |
| **EVOLVE** | Thay đổi chính nhà máy | Soạn Evolution Proposal, chạy shadow run, chuẩn bị evidence cho owner | Kích hoạt thay đổi lên production (chỉ owner promote) |

**Quy tắc chuyển mode.** Không chuyển mode giữa phiên. Việc phát sinh thuộc mode khác → ghi vào `BLOCKED.md` hoặc `EVOLUTION-QUEUE.md`, xử lý ở phiên riêng.

---

## 2. Nhịp vận hành (OPERATE)

```
MỖI EPISODE (theo nhịp mục tiêu §1)
  1. Orchestrator mở package khi hàng đợi có slot và trần budget cho phép
  2. Chạy Stage 00→13 theo DoR; agent chỉ can thiệp khi có exception
  3. Điểm chạm HP-02 (Editorial Imprint) — chờ người, không bỏ qua
  4. Stage 14 assurance → Stage 15 chờ AUTHORIZE_RELEASE + AUTHORIZE_PUBLISH
  5. Policy Defense Checklist (G15) trước publish
  6. Seal prediction (P9) → publish → lên lịch ETL

HÀNG NGÀY (phiên OPERATE ngắn, ≤30 phút agent-time)
  • Quét orphan reservation, lease hết hạn chưa reconcile → xử lý
  • Quét gate FAIL mới → phân loại nguyên nhân gốc → đề xuất REOPEN_ROOT_STAGE
  • Đối chiếu spend thật vs ceiling → cảnh báo khi vượt 80%
  • Quét policy_incident mới (11 §4) → nếu có: dừng mọi việc khác, chạy playbook

HÀNG TUẦN
  • Báo cáo owner: first-pass yield theo stage, cost per video, hàng đợi HP
  • Chạy audit prompt (06 §2) trên mọi code thay đổi trong tuần
  • Policy watch (11 §3): kiểm tra thay đổi chính sách YouTube

MỖI 14–28 NGÀY SAU PUBLISH
  • Analytics ETL → deviation analysis → cập nhật learning status
  • LRN-04 failure mining trên mọi rejection/defect mới trong kỳ

HÀNG QUÝ
  • Điểm chạm HP-01 (chiến lược) — người quyết
  • Requalify capability nào có trigger; shadow qualification model mới
```

---

## 3. Giao thức phiên OPERATE

```
MỞ PHIÊN:
  1. Tuyên bố: "MODE: OPERATE. Phạm vi phiên: <một nhiệm vụ>."
  2. Đọc trạng thái: BLOCKED.md, EVOLUTION-QUEUE.md, incident đang mở
  3. Nêu lại 5 điều cấm của OPERATE mode bằng lời của agent
  4. Nếu có policy incident đang mở → phiên này CHỈ xử lý incident

TRONG PHIÊN:
  • Một phiên = một nhiệm vụ. Việc phát sinh → ghi queue, không "tiện tay"
  • Mọi thay đổi trạng thái qua typed command, không SQL trực tiếp
  • Gặp giá trị/quyết định ngoài tài liệu → BLOCKED.md, dừng nhiệm vụ đó

ĐÓNG PHIÊN:
  • Ghi OPS-LOG.md: nhiệm vụ, lệnh đã phát (trace_id), exception, việc tồn
  • Không tự mở phiên kế tiếp
```

**OPS-LOG.md** là append-only về mặt quy ước — mỗi phiên một mục, không sửa mục cũ. Đây là cách phát hiện drift: audit so sánh OPS-LOG với command_log.

---

## 4. Chống drift qua phiên dài

Drift là hiện tượng có hệ thống, không phải lỗi cá biệt. Bốn cơ chế:

| Cơ chế | Nhịp | Cách làm |
|---|---|---|
| **Guardrail recitation** | Mỗi phiên | Agent nêu lại guardrail liên quan bằng lời của nó; sai → không bắt đầu |
| **Audit chéo** | Mỗi 3 phiên BUILD / mỗi tuần OPERATE | Prompt 06 §2 mở rộng thêm G11–G15 |
| **Đối chiếu log** | Mỗi tuần | OPS-LOG ↔ command_log: mọi mục trong OPS-LOG phải có trace_id thật; lệnh trong command_log không có trong OPS-LOG = red flag |
| **Phiên sạch** | Khi nghi ngờ | Khởi tạo phiên mới với prompt §0, không mang context phiên cũ |

**Dấu hiệu phải dừng và gọi người** (agent tự kiểm):
- Agent thấy mình đang viết giá trị số không có trong contracts
- Agent thấy mình đang sửa file thuộc danh sách cấm của G13
- Agent thấy mình đang lập luận "tạm thời bỏ qua để đi tiếp"
- Test đang fail và agent đang sửa test thay vì sửa code

---

## 5. Runbook OPERATE — các tình huống chuẩn

### 5.1 Gate FAIL ở M1 (kỹ thuật)
```
1. Đọc evidence_r2_key → xác định phép đo vi phạm
2. Phân loại nguyên nhân gốc theo stage sở hữu
3. Đề xuất REOPEN_ROOT_STAGE (operator xác nhận trong hạn mức)
4. KHÔNG waive. M1 không có waiver tự động.
5. FAIL lặp ≥2 lần cùng nguyên nhân → tạo mục LRN-04 (candidate lint rule mới)
```

### 5.2 Gate FAIL ở M2 (biên tập) trong vùng biên
```
1. Kiểm floor ± BORDERLINE_BAND → nếu trong vùng: rerun n=3, lấy median
2. Variance > MAX_VARIANCE → đánh dấu critic cần requalify, KHÔNG dùng verdict
3. Median dưới floor → về 5.1 với stage sở hữu nội dung
```

### 5.3 Orphan / lease hết hạn
```
1. Mọi provider_request mở của lease chết → ORPHANED
2. Đối soát từng orphan với provider (idempotency key) → settle hoặc xác nhận zero spend
3. Chỉ sau khi reconciliation report sạch → cho phép cấp lease mới
```

### 5.4 Provider đổi model version
```
1. Dispatch guard tự chặn (settings_hash lệch) — đây là hành vi ĐÚNG, không phải lỗi
2. Mở Evolution Proposal: shadow qualification version mới trên gold set
3. Trong lúc chờ: pipeline dùng version cũ nếu còn khả dụng; nếu không → dừng stage đó, báo owner
4. CẤM "tạm dùng version mới cho kịp lịch"
```

### 5.5 Vượt trần chi phí giữa chừng
```
1. Reservation bị từ chối là hành vi đúng (zero dispatch)
2. Báo owner với: spend hiện tại, ước lượng phần còn lại, phương án cắt
   (giảm tournament width / giảm composition / hoãn)
3. CHỜ. Không tự nâng ceiling (quyền owner, không nới ở mọi quy mô)
```

### 5.6 Policy incident (limited ads / strike / YPP review)
```
→ Toàn bộ theo 11-POLICY-DEFENSE §4. Ưu tiên tuyệt đối, trên mọi nhiệm vụ khác.
```

---

## 6. Prompt vận hành

### §0-OPS · Khởi tạo phiên OPERATE
```
Bạn là operating agent của AI Factory đang chạy production.

MODE: OPERATE. Trong mode này bạn KHÔNG được:
1. Sửa contracts, guardrail tests, gate definitions, migrations đã seal (G13)
2. Phát bất kỳ lệnh owner nào (AUTHORIZE_*, PROMOTE_LEARNING)
3. Nới bất kỳ threshold hoặc gate nào (G11)
4. Dispatch provider ngoài guardedDispatch (G9)
5. Làm quá MỘT nhiệm vụ trong một phiên

Đọc: OPS-LOG.md (3 mục gần nhất), BLOCKED.md, danh sách incident mở.
Nêu lại 5 điều cấm trên bằng lời của bạn.
Sau đó nêu nhiệm vụ duy nhất của phiên này và chờ tôi xác nhận.
```

### §1-OPS · Nhiệm vụ hàng ngày
```
Nhiệm vụ phiên: quét vận hành hàng ngày.
1. Orphan reservation và lease hết hạn chưa reconcile → xử lý theo runbook 5.3
2. Gate FAIL mới trong 24h → phân loại theo runbook 5.1/5.2, KHÔNG waive
3. Spend vs ceiling mọi package đang mở → bảng, cảnh báo ≥80%
4. policy_incident mới → nếu có, DỪNG, báo ngay, chờ chỉ đạo theo 11 §4
Kết thúc: ghi OPS-LOG.md, liệt kê việc cần người quyết. DỪNG.
```

### §2-OPS · Báo cáo tuần
```
Nhiệm vụ phiên: báo cáo tuần cho owner. Chỉ đọc, không ghi trạng thái.
Tổng hợp: first-pass yield theo stage · cost per video (thật vs trần)
· hàng đợi điểm chạm con người và tuổi của từng mục · learning status
· kết quả policy watch · sai lệch OPS-LOG ↔ command_log (nếu có, nêu rõ).
Định dạng: một trang, số liệu trước, diễn giải sau. DỪNG.
```

---

## 7. CONTRACT DELTA (merge vào 02 §3)

```ts
export const OPS = {
  DAILY_SESSION_MAX_MIN: 30,
  SPEND_ALERT_PCT: 0.80,
  GATE_FAIL_REPEAT_TO_LRN04: 2,     // FAIL cùng nguyên nhân N lần → mục LRN-04
  OPSLOG_AUDIT_INTERVAL_DAYS: 7,
  BUILD_AUDIT_INTERVAL_WP: 3,
} as const
```

---

## 8. Runbook Stage 12 encoded-loudness diagnostic replay

Replay là diagnostic reproduction có mutation giới hạn ở bảng job/evidence mới;
nó không phải correction, calibration hoặc Finalize.

### Preflight bắt buộc

1. Owner phê duyệt chính xác typed OPERATE command riêng.
2. Protected main, Sites source identity và Fly image provenance exact-match.
3. Fly health trả `stage12Ready=true` và
   `encodedLoudnessDiagnosticReplayReady=true`; image digest được pin vào job.
4. Stage vẫn `STAGE_12_READY`; immutable ordinal 2/3 và source identity exact-match.
5. Chứng minh chưa có replay job cùng idempotency key; provider/publish vẫn OFF.

### Thực thi và điểm dừng

Gửi command đúng một lần. Nếu `PENDING`, chỉ read-back; không resend. `READY` chỉ
có nghĩa evidence reproduction đã được lưu, không có nghĩa Stage 12 QA đã PASS và
không cấp quyền correction/Finalize. `FAILED` phải dừng để đọc typed error; không
tạo ordinal 4 hoặc attempt 4. Dù outcome `PASS` hay `FAIL`, operator dừng sau evidence
read-back và xin phê duyệt EVOLVE/OPERATE riêng cho bất kỳ bước kế tiếp nào.

### Xác minh hậu kỳ

- Source/historical identity, worker pin và algorithm/threshold hashes khớp.
- Source baseline, pass `0..terminal`, final raw/numeric measurements và predicates
  nhất quán; frame-MD5/provenance hiện diện.
- `correctedOutputUploaded=false`, `historicalBackfill=false`, provider count `0`,
  calibration/finalize/release false và auto-publish OFF.
- Ordinal 2/3 unchanged; không có correction ordinal 4 hoặc Stage 12 attempt 4.
