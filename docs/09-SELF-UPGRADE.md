# 09 — SELF-UPGRADE GOVERNANCE

Năng lực tự nâng cấp của nhà máy, thiết kế như **ba flywheel có kỷ luật** — không phải "AI tự viết lại chính nó". Nguyên lý chi phối: P11 (hệ thống không tự nới chuẩn của chính nó).

```
Flywheel 1  GOLD SET LỚN DẦN      mọi thất bại → mẫu kiểm thử vĩnh viễn (LRN-04)
Flywheel 2  STANDARD TIẾN DẦN     learning có bằng chứng → Standard@v+1 (owner promote)
Flywheel 3  TRI THỨC XUYÊN KÊNH   learning cấp kênh → cấp portfolio khi tái lập ≥2 kênh
```

Cả ba chỉ quay MỘT chiều tự động: siết chuẩn, thêm mẫu, tích tri thức. Chiều ngược (nới, xóa, hạ cấp) luôn là owner command.

---

## 1. Guardrail G11–G14 — đặc tả cưỡng chế

### G11 · Cấm tự nới chuẩn
```
Định nghĩa "nới": bất kỳ thay đổi nào làm một input trước đây bị chặn
nay được cho qua. Gồm: tăng ngưỡng max / giảm ngưỡng min theo chiều
dễ dãi hơn; đổi gate tier M0→M1 hoặc M1→M2; thêm nhánh waiver;
xóa điều kiện DoR; thu hẹp phạm vi một lint.

Cưỡng chế:
• D1 trigger trên gate_definition & standard: mọi UPDATE phải kèm
  strictness_direction ∈ {TIGHTEN, RELAX}; RELAX đòi promotion_id
  hợp lệ (owner-signed), thiếu → RAISE(ABORT)
• thresholds.ts đổi giá trị → CI so sánh với bản seal gần nhất;
  chiều RELAX mà PR không kèm promotion evidence → CI fail
• Test guardrail: g11-no-self-relax.test.ts
```

### G12 · Meta-change phải qua shadow
```
Meta-change = thay đổi ảnh hưởng hành vi production: prompt/settings
của capability, code stage runner, threshold, gate definition,
model version, aligner/lexicon.

Đường duy nhất: EVOLUTION_PROPOSAL → shadow run (namespace
'qualification') đạt chuẩn → PROMOTE_EVOLUTION (owner) → hiệu lực.

Cưỡng chế: dispatch guard đối chiếu settings_hash với bản ACTIVE
trong registry (đã có, G9/CAP-04); registry chỉ nhận bản ACTIVE mới
qua promotion record. Không có đường UPDATE trực tiếp registry.
```

### G13 · Vùng bất khả xâm phạm trong OPERATE
```
Danh sách file/bảng agent OPERATE không được sửa:
  packages/contracts/**  ·  tests/guardrails/**  ·  db/migrations/**
  gate_definition  ·  standard (bản đã seal)  ·  capability registry

Cưỡng chế: CI chặn PR gắn nhãn mode=OPERATE chạm các đường dẫn trên;
review checklist; audit tuần đối chiếu git log với OPS-LOG.
```

### G14 · Gold set append-only
```
gold_sample: cấm DELETE; UPDATE chỉ được sửa metadata phi-nhãn.
Sửa nhãn (defect_class, severity, t_*) hoặc loại mẫu → lệnh owner
RETIRE_GOLD_SAMPLE, giữ bản ghi lý do. Trigger RAISE(ABORT) như G4.
```

---

## 2. Evolution Pipeline

### Vòng đời
```
DETECTED → PROPOSED → SHADOW_RUNNING → EVIDENCE_READY
        → PROMOTED (owner) | REJECTED (owner) | EXPIRED
```

### Nguồn phát sinh proposal (ai được tạo)
| Nguồn | Ví dụ |
|---|---|
| LRN-04 | Defect lọt lưới → đề xuất lint rule / gold sample / siết ngưỡng |
| Learning loop | Learning READY đề xuất đổi Standard/Strategy |
| Provider watch | Model version mới → đề xuất shadow qualification |
| Policy watch (11 §3) | Chính sách YouTube đổi → đề xuất siết gate compliance |
| Owner/Operator | Trực tiếp |

Agent ở mọi mode **được tạo proposal**, không được kích hoạt.

### Chuẩn evidence để owner quyết
Mỗi proposal khi EVIDENCE_READY phải có đủ:
```
1. Diff chính xác (threshold cũ→mới / prompt cũ→mới / code diff)
2. Kết quả shadow run trên namespace qualification:
   • với capability: recall/precision/variance trên TOÀN BỘ gold set
     (regression suite) — không thụt lùi ở bất kỳ defect class nào
   • với threshold/gate: chạy lại trên ≥10 artifact production gần nhất
     → bảng "trước/sau: cái gì đổi verdict"
3. Chi phí shadow run thật + ước lượng tác động chi phí vận hành
4. strictness_direction + phân tích rủi ro chiều RELAX (nếu có)
5. Khuyến nghị của agent, một đoạn, kèm phương án rollback
```

### SCHEMA DELTA (merge vào 03)
```sql
evolution_proposal(
  id, kind,                -- THRESHOLD|GATE|CAPABILITY|PIPELINE_CODE|LEXICON|POLICY
  source,                  -- LRN04|LEARNING|PROVIDER_WATCH|POLICY_WATCH|HUMAN
  target_ref, diff_r2_key,
  strictness_direction,    -- TIGHTEN | RELAX | NEUTRAL
  shadow_run_id, evidence_r2_key,
  status, created_at, decided_at, decided_by, rollback_ref
)
-- Trigger: status='PROMOTED' đòi decided_by ∈ owner allowlist
--          + evidence_r2_key NOT NULL (tinh thần G7)
```

### CONTRACT DELTA — lệnh mới (merge vào 02 §4)
```ts
// Nối vào CommandType và OWNER_COMMANDS:
'PROMOTE_EVOLUTION'      // owner, identity-bound — kích hoạt meta-change
'RETIRE_GOLD_SAMPLE'     // owner, identity-bound — G14
'FREEZE_CHANNEL'         // owner HOẶC operator khẩn cấp — xem 11 §4
```

---

## 3. LRN-04 · Failure Mining *(module mới, khuôn chuẩn Tập 1/2)*

**Mục đích.** Biến mọi thất bại đã trả giá — master bị từ chối, defect lọt lưới, gate FAIL lặp, output cách ly — thành tài sản kiểm thử và luật mới. Đây là cơ chế tự nâng cấp rẻ nhất của toàn hệ thống vì tận dụng phán quyết con người đã có sẵn.

**Tính năng.**
- Thu hoạch bốn nguồn thất bại thành gold sample / lint rule candidate / fixture mới
- Phát hiện "escaped defect": lỗi người tìm thấy mà assurance panel đã cho qua
- Đề xuất Evolution Proposal tự động với evidence đính kèm
- Báo cáo mật độ thất bại theo defect class và theo stage nguồn gốc

**Quy trình.**
```
Chạy theo nhịp 14–28 ngày và ngay khi có rejection mới:

1. REJECTED MASTER (từ HP-04, phán quyết đã có nhãn cấu trúc)
   → tạo gold_sample(source='rejected_master') với ground truth
   → nếu defect_class chưa có trong gold set: cờ ĐỎ — panel đang mù
     loại lỗi này → proposal bổ sung critic rubric + mẫu synthetic

2. ESCAPED DEFECT (assurance PASS nhưng người/viewer/policy phát hiện lỗi)
   → mức nghiêm trọng cao nhất: gold sample + đề xuất một trong:
     (a) chuyển kiểm tra sang tầng xác định nếu đo được bằng máy (P6)
     (b) siết rubric/anchor của critic tương ứng
   → escaped defect P0 bất kỳ ⇒ đề xuất requalify critic liên quan

3. GATE FAIL LẶP (≥ OPS.GATE_FAIL_REPEAT_TO_LRN04 lần cùng nguyên nhân)
   → nguyên nhân đo được xác định ở stage sớm hơn không? Có → proposal
     lint mới ở stage nguồn (chặn sớm rẻ hơn chặn muộn)

4. QUARANTINE MINING (định kỳ, đọc-only)
   → phân cụm output cách ly theo defect class → class nào chiếm >20%
     mà chưa có lint xác định → proposal
```

**Công cụ & kỹ thuật.** Thuần đọc D1 + R2 evidence; FFmpeg cho synthetic sample (khuôn 06 §6 pack cũ); mọi output là `evolution_proposal` hoặc `gold_sample`, không ghi gì khác.

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| Mọi rejected master | → ≥1 gold sample trong ≤7 ngày |
| Escaped defect P0 | → proposal trong ≤48h, cờ requalify |
| Namespace | Mọi sample vào `gold/`, không bao giờ lineage sản xuất (G5) |
| Quyền ghi | Chỉ INSERT gold_sample và evolution_proposal (G14) |

**Giao diện & dữ liệu.**
```ts
mineRejection(masterId, verdictJson): GoldSampleId[]
detectEscapes(since: Date): EscapedDefect[]
mineRepeatedFailures(since: Date): EvolutionProposalId[]
failureDensityReport(window): Report
```

**Acceptance.** Rejected master mới → gold sample xuất hiện với ground truth đầy đủ; escaped P0 giả lập → proposal + cờ requalify trong cùng lần chạy; không có đường ghi nào ngoài hai bảng cho phép; toàn bộ chạy được ở zero provider cost.

---

## 4. Learning xuyên kênh

### Phạm vi learning — CONTRACT DELTA
```ts
export type LearningScope = 'CHANNEL' | 'PORTFOLIO'
// learning có thêm: scope, channel_id (nullable khi PORTFOLIO),
//                   replicated_channel_ids_json
```

### Luật promote theo phạm vi
```
CHANNEL scope:
  nhất quán ≥ LEARNING.MIN_CONSISTENT_VIDEOS trong CÙNG kênh
  → promote vào Standard/Strategy CỦA KÊNH ĐÓ

PORTFOLIO scope (nâng cấp từ CHANNEL):
  learning đã PROMOTED ở ≥2 kênh độc lập, cùng chiều tác động
  → được đề xuất nâng lên portfolio default cho kênh MỚI
  → kênh đang chạy không bị áp hồi tố; muốn áp → theo kênh, qua owner

CẤM: promote thẳng PORTFOLIO từ dữ liệu một kênh.
CẤM: learning chạm vào ChannelIdentityContract của kênh khác —
     identity là tài sản kênh (P8), tri thức xuyên kênh chỉ mang
     STRUCTURE (hook type hiệu quả, nhịp beat, packaging pattern),
     không mang VOICE.
```

### Vì sao tách
Kênh mới thừa hưởng portfolio default → không học lại từ đầu (đây là lợi thế scale thật của nhà máy, và là tài sản bán được nếu thương mại hóa). Nhưng trộn phạm vi sẽ đồng hóa các kênh — vi phạm chính differentiation mà anti-copy đang bảo vệ. Hai luật trên giữ được cả hai.

---

## 5. Giới hạn trung thực của "tự nâng cấp"

Ghi vào kỳ vọng, không giấu:

| Giới hạn | Con số |
|---|---|
| Băng thông học nội dung | ≤1–2 learning promoted / kênh / tháng (trễ analytics 14–28 ngày × MIN_CONSISTENT_VIDEOS) |
| Tự nâng cấp không cần người | Chỉ chiều SIẾT + thêm gold sample. Mọi thứ khác qua owner |
| Cái hệ thống không bao giờ tự làm | Nới chuẩn · đổi identity · publish · chấp nhận rủi ro chính sách |

Tốc độ tiến hóa của nhà máy = nhịp publish × kỷ luật ghi nhãn thất bại. Muốn nhanh hơn: tăng nhịp hoặc ghi nhãn tốt hơn — không phải nới quy trình.

### Evolution record: EVOLVE_STAGE12_QA_REMEDIATION

Đây là thay đổi pipeline code `NEUTRAL` về strictness: các threshold/gate giữ nguyên. Shadow evidence bắt buộc gồm migration tests, renderer scan dài hơn cửa sổ near-static, encoded-audio measurement và full CI. Owner promotion chỉ triển khai code; diagnostic scan Production sau đó là lệnh OPERATE tách biệt và không được tự khởi chạy generation.
