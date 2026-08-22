# 15 — MODULE ADDENDUM (v2)

Bổ sung cho `ai-factory-modul-nen-tang.md` (19 module) và `ai-factory-modul-nghiep-vu.md` (25 module).

Hai file gốc **vẫn hiệu lực nguyên vẹn** — đặc tả 44 module không thay đổi. File này thêm bốn module mới (nâng tổng lên 48) và một bảng hiệu chỉnh những chỗ v2 làm thay đổi đặc tả cũ.

Khuôn mô tả giống hai tập gốc: **Mục đích · Tính năng · Quy trình · Công cụ & kỹ thuật · Tiêu chuẩn · Giao diện & dữ liệu · Acceptance**.

---

# NHÓM 12 — GOVERNANCE OF CHANGE *(mới)*

## EVO-01 · Evolution Pipeline

**Mục đích.** Là con đường duy nhất để thay đổi chính nhà máy. Mọi meta-change — ngưỡng, gate, capability, code pipeline, lexicon, chính sách — đi qua đây, có bằng chứng, và chỉ có hiệu lực khi owner promote. Module này làm cho "tự nâng cấp" trở thành năng lực có kiểm soát thay vì rủi ro.

**Tính năng.**
- Vòng đời proposal bảy trạng thái, một chiều
- Phân loại chiều nghiêm ngặt (TIGHTEN / RELAX / NEUTRAL) — cưỡng chế P11
- Shadow run trên namespace tách biệt, không chạm production
- Evidence bundle chuẩn hóa để owner quyết trong vài phút
- Rollback reference bắt buộc cho mọi promotion

**Quy trình.**
```
DETECTED → PROPOSED → SHADOW_RUNNING → EVIDENCE_READY
        → PROMOTED (owner) | REJECTED (owner) | EXPIRED

Nguồn phát sinh (ai được tạo proposal):
  LRN04          defect lọt lưới → lint/gold sample/siết ngưỡng
  LEARNING       learning READY đề xuất đổi Standard/Strategy
  PROVIDER_WATCH model version mới → shadow qualification
  POLICY_WATCH   chính sách nền tảng đổi → siết gate compliance
  INCIDENT       sự cố → siết cho MỌI kênh, không chỉ kênh dính
  HUMAN          owner/operator trực tiếp

Agent ở mọi mode ĐƯỢC tạo proposal, KHÔNG được kích hoạt.
```

**Shadow run — bắt buộc trước EVIDENCE_READY.**
```
Capability:   chạy TOÀN BỘ gold set, so recall/precision/variance với
              bản đang phục vụ. Không thụt lùi ở BẤT KỲ defect class nào.
Threshold/gate: chạy lại trên ≥EVOLUTION.SHADOW_MIN_ARTIFACTS artifact
              production gần nhất → bảng "trước/sau: cái gì đổi verdict"
Pipeline code: chạy toàn bộ guardrail + integration suite trên nhánh shadow
Namespace:    'qualification' — không bao giờ sinh lineage sản xuất (G5)
```

**Công cụ & kỹ thuật.** Diff lưu R2; evidence bundle sinh tự động từ shadow run; `strictness_direction` tính bằng so sánh có cấu trúc (khoảng cho phép rộng ra = RELAX), không do agent tự khai — agent khai sai chiều là vi phạm G11 và audit bắt được.

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| EVIDENCE_READY | Đòi `shadow_run_id` + `evidence_r2_key` (G12) |
| PROMOTED | Chỉ từ EVIDENCE_READY, chỉ bởi owner (P10) |
| RELAX | Bắt buộc promotion owner-signed (G11) |
| Hết hạn | `EVOLUTION.PROPOSAL_EXPIRY_DAYS` |
| Rollback | Mọi promotion phải có `rollback_ref` |

**Evidence bundle — năm mục bắt buộc.**
```
1. Diff chính xác (ngưỡng cũ→mới / prompt cũ→mới / code diff)
2. Kết quả shadow run theo chuẩn trên
3. Chi phí shadow run thật + ước lượng tác động chi phí vận hành
4. strictness_direction + phân tích rủi ro nếu RELAX
5. Khuyến nghị một đoạn + phương án rollback
```

**Giao diện & dữ liệu.**
```ts
createProposal(kind, source, targetRef, diff): ProposalId
runShadow(id): ShadowResult
buildEvidence(id): R2Key
// promote KHÔNG có API — chỉ qua lệnh PROMOTE_EVOLUTION
```
Sở hữu `evolution_proposal`, `standard_change_log`.

**Acceptance.** Proposal RELAX không sang PROMOTED được nếu thiếu owner identity; proposal thiếu shadow evidence không sang EVIDENCE_READY được; promote một threshold thử nghiệm → registry đổi đúng một chỗ và rollback đưa về nguyên trạng; khai sai chiều (RELAX ghi thành NEUTRAL) bị audit phát hiện.

---

## LRN-04 · Failure Mining

**Mục đích.** Biến mọi thất bại đã trả giá — master bị từ chối, defect lọt lưới, gate FAIL lặp, output cách ly — thành tài sản kiểm thử và luật mới. Đây là cơ chế tự nâng cấp rẻ nhất của hệ thống vì nó tận dụng phán quyết con người đã có sẵn thay vì mua thêm.

**Tính năng.**
- Thu hoạch bốn nguồn thất bại thành gold sample / lint rule candidate / fixture
- Phát hiện escaped defect: lỗi người tìm ra mà assurance panel đã cho qua
- Sinh Evolution Proposal tự động kèm evidence
- Báo cáo mật độ thất bại theo defect class và theo stage nguồn gốc

**Quy trình.**
```
Chạy theo nhịp analytics (14–28 ngày) và ngay khi có rejection mới:

1. REJECTED MASTER  (nhãn có sẵn từ HP-04)
   → gold_sample(source='rejected_master') với ground truth
   → defect_class chưa có trong gold set: CỜ ĐỎ — panel đang mù loại
     lỗi này → proposal bổ sung critic rubric + mẫu synthetic

2. ESCAPED DEFECT  (assurance PASS nhưng người/viewer/policy phát hiện)
   → mức nghiêm trọng cao nhất: gold sample + một trong:
     (a) chuyển kiểm tra sang tầng xác định nếu đo được bằng máy (P6)
     (b) siết rubric/anchor của critic tương ứng
   → escaped P0 bất kỳ ⇒ đề xuất requalify critic liên quan

3. GATE FAIL LẶP  (≥ OPS.GATE_FAIL_REPEAT_TO_LRN04 lần cùng nguyên nhân)
   → nguyên nhân có đo được xác định ở stage sớm hơn không?
     Có → proposal lint mới ở stage nguồn (chặn sớm rẻ hơn chặn muộn)

4. QUARANTINE MINING  (định kỳ, chỉ đọc)
   → phân cụm output cách ly theo defect class → class nào chiếm
     > EVOLUTION.QUARANTINE_CLUSTER_PROPOSAL_PCT mà chưa có lint
     xác định → proposal
```

**Công cụ & kỹ thuật.** Thuần đọc D1 + R2 evidence; FFmpeg cho mẫu synthetic (khuôn `06 §6`); mọi output là `evolution_proposal` hoặc `gold_sample`, không ghi gì khác. Chạy ở zero provider cost.

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| Mọi rejected master | → ≥1 gold sample trong ≤ `REJECTED_MASTER_TO_GOLD_SLA_DAYS` |
| Escaped defect P0 | → proposal trong ≤ `ESCAPED_P0_PROPOSAL_SLA_HOURS`, kèm cờ requalify |
| Namespace | Mọi sample vào `gold/`, không bao giờ lineage sản xuất (G5) |
| Quyền ghi | Chỉ INSERT `gold_sample` và `evolution_proposal` (G14) |

**Giao diện & dữ liệu.**
```ts
mineRejection(masterId, verdictJson): GoldSampleId[]
detectEscapes(since: Date): EscapedDefect[]
mineRepeatedFailures(since: Date): ProposalId[]
mineQuarantine(window): ProposalId[]
failureDensityReport(window): Report
```

**Acceptance.** Rejected master mới → gold sample xuất hiện với ground truth đầy đủ; escaped P0 giả lập → proposal + cờ requalify trong cùng lần chạy; không có đường ghi nào ngoài hai bảng cho phép; toàn bộ chạy ở zero provider cost.

---

# NHÓM 13 — HUMAN & POLICY *(mới)*

## HUM-01 · Human Touchpoints & Evidence

**Mục đích.** Quản lý bảy điểm chạm con người như một tài nguyên có ngân sách (P12), và biến mỗi quyết định của con người thành bằng chứng xuất trình được (P13). Module này là nơi hai nguyên lý mới của v2 trở thành cơ chế.

**Tính năng.**
- Hàng đợi điểm chạm hợp nhất, có tuổi và ước tính thời gian
- Gate `EDITORIAL_IMPRINT_PRESENT` (M0) — dấu ấn biên tập trong từng video
- Sổ ngân sách chú ý theo tuần, cưỡng chế lên orchestrator
- Human Evidence Report sinh tự động từ dữ liệu, không soạn tay
- Chính sách sampling có điều kiện kép

**Quy trình — Editorial Imprint.**
```
Mỗi video cần ≥ POLICY.MIN_HUMAN_DECISIONS quyết định, thuộc
≥ POLICY.MIN_DISTINCT_DECISION_TYPES loại khác nhau:

D1  CHỌN CHAMPION có lý do        (Stage 04)
D2  SỬA HOOK/TITLE bằng ngôn ngữ của người, diff được lưu  (Stage 06)
D3  CHỌN + CHỈNH THUMBNAIL        (Stage 09/11)
D4  PHỦ QUYẾT/ĐIỀU CHỈNH BEAT     (Stage 05/06)
D5  QUYẾT ĐỊNH GIỌNG ĐIỆU video   (Stage 07A)

Ràng buộc bổ sung: qua DECISION_TYPE_DIVERSITY_WINDOW video gần nhất
của cùng kênh, loại quyết định phải đa dạng — pattern lặp máy móc
chính là tín hiệu inauthentic mà gate này tồn tại để chặn.

Gate PASS ⇔ đủ số lượng ∧ đủ loại ∧ mỗi decision có actor người thật,
           rationale ≥ RATIONALE_MIN_CHARS, và artifact seal cuối cùng
           nằm SAU thời điểm quyết định (lineage chứng minh)
M0 ⇒ không waiver. Thiếu ⇒ chặn từ Stage 14.
```

**Quy trình — Evidence Report.**
```
generateEvidenceReport(channel, window):
  1. Mỗi video: human_decision (loại, thời điểm, diff tóm tắt)
  2. AUTHORIZE_RELEASE / AUTHORIZE_PUBLISH với identity + thời điểm
  3. Disclosure decision từng video
  4. Số liệu: % video có ≥N quyết định người; 0 video auto-publish
  5. Differentiation score từng video vs reference set
  6. Tỷ lệ claim có nguồn T1/T2
  → Xuất từ command_log + human_decision + gate_evaluation.
    CẤM soạn tay — báo cáo soạn tay không có giá trị bằng chứng.
```

**Tiêu chuẩn — điều tiết theo ngân sách chú ý.**
```
Orchestrator KHÔNG mở package mới nếu:
  tải điểm chạm dự kiến của tuần > ATTENTION.OWNER_WEEKLY_CEILING_MIN

Đây là ràng buộc sản xuất ngang với budget. Nhà máy chạy nhanh hơn
khả năng phán quyết của người ⇒ gate trôi thành phê duyệt hình thức.
```

**Tiêu chuẩn — sampling (điều kiện kép).**
```
Chuyển HP-03 từ 100% sang sampling đòi ĐỒNG THỜI:
  1. ≥ POLICY.SAMPLING_MIN_CLEAN_STREAK video liên tiếp sạch
  2. 0 policy incident trong INCIDENT_CLEAN_DAYS_FOR_SAMPLING
  3. 0 escaped defect P0 trong ESCAPED_P0_CLEAN_DAYS_FOR_SAMPLING
  4. Owner bật tường minh cho TỪNG kênh

KHÔNG BAO GIỜ sampling: HP-02 (điều kiện chính sách, không phải điều
kiện chất lượng) · AUTHORIZE_PUBLISH (P10) · HP-06 disclosure.
Một incident bất kỳ ⇒ kênh đó tự động về 100%.
```

**Giao diện & dữ liệu.**
```ts
recordDecision(d: HumanDecision): void          // actor phải là human_actor
imprintGate(pkg: PackageId): GateEvaluation
attentionLoad(weekStart: string): { used: number; ceiling: number }
generateEvidenceReport(channelId, window): R2Key
```
Sở hữu `human_actor`, `human_decision`, `attention_ledger`, `sampling_policy`.

**Acceptance.** Package thiếu quyết định → DoR chặn Stage 14; decision của service account → abort; decision có timestamp sau khi artifact đã seal → lineage check bắt được; evidence report tái lập 100% từ D1/R2 cho kênh và cửa sổ bất kỳ; orchestrator từ chối mở package khi vượt trần chú ý.

---

## POL-01 · Policy Defense

**Mục đích.** Phòng thủ chính sách nền tảng như một năng lực kiến trúc chứ không phải checklist dán sau. Rủi ro cần quản là quyết định demonetize/strike ở cấp kênh — xóa toàn bộ giá trị kênh trong một lần, và không kiểm soát được từ phía mình.

**Tính năng.**
- Checklist PC1–PC8 làm điểm chặn publish duy nhất (G15)
- Ma trận quyết định disclosure, mặc định BẬT
- Policy watch: snapshot + diff nguồn chính sách theo nhịp
- Incident playbook bốn mức với freeze kênh
- Kill criteria định trước cho danh mục

**Quy trình — Policy Defense Checklist.**
```
PC-1  EDITORIAL_IMPRINT_PRESENT = PASS                    (HUM-01)
PC-2  Differentiation score ≥ ngưỡng, đo lại trên bản FINAL
      (nội dung có thể hồi quy về template qua các stage sau)
PC-3  Anti-copy 4 phép đo PASS trên bản final              (INT-02)
PC-4  Disclosure decision đã ghi ∧ metadata upload khớp
PC-5  100% claim CRITICAL có nguồn T1/T2                   (TRU-01)
PC-6  Advice lint PASS                                     (TRU-02)
PC-7  Self-similarity: không trùng cấu trúc beat + voice settings
      + thumbnail pattern với SELF_SIMILARITY_WINDOW_VIDEOS video
      gần nhất CÙNG KÊNH  ← chống tự đồng hóa
PC-8  Không dùng chân dung/giọng người thật tổng hợp

Cả tám phải PASS. Trigger schema chặn publish nếu thiếu bất kỳ mục nào.
```

**Quy trình — Policy Watch.**
```
Nhịp POLICY_WATCH_INTERVAL_DAYS, trong phiên OPERATE tuần:
1. Fetch + snapshot nguồn chính thức → R2 qua CORE-06, hash nội dung
2. Diff với snapshot kỳ trước
3. Có diff → evolution_proposal(source='POLICY_WATCH') kèm phần thay
   đổi, gate/PC nào bị ảnh hưởng, khuyến nghị
4. KHÔNG tự đổi gate. Người quyết (HP-05). Diff thuộc nhóm SIẾT rõ
   ràng (danh mục cấm mở rộng) → đề xuất TIGHTEN fast-track.

Đây là ứng dụng đúng của CORE-06: chính sách cũng là "nguồn" cần
snapshot + provenance như mọi nguồn khác.
```

**Quy trình — Incident (I2 trở lên).**
```
0. GHI NHẬN  policy_incident(channel, level, platform_ref, evidence)
1. FREEZE    dừng mở package mới + dừng publish của kênh đó;
             package giữa chừng chạy đến trước Stage 15 rồi giữ.
             Operator được phát khẩn cấp; owner xác nhận trong cửa sổ đã định.
2. RCA       nội dung nào, vi phạm danh mục nào, PC-x nào lẽ ra phải bắt
             → escaped defect ⇒ LRN-04 mức nghiêm trọng cao nhất
3. HỒ SƠ     generateEvidenceReport(channel)                (HUM-01)
4. APPEAL    owner quyết; nội dung dựa hồ sơ thật, không soạn diễn giải
5. HỌC NGƯỢC proposal SIẾT cho MỌI KÊNH, không chỉ kênh dính
6. RÃ ĐÔNG   chỉ owner, và chỉ sau khi ≥1 proposal bước 5 được promote
```

**Tiêu chuẩn — phân mức.**

| Mức | Sự kiện | Phản ứng |
|---|---|---|
| I1 | Limited ads một video | RCA video đó; không bắt buộc freeze |
| I2 | Video bị gỡ / cảnh cáo | FREEZE_CHANNEL; RCA; appeal nếu có căn cứ |
| I3 | Strike / YPP treo hoặc review | FREEZE toàn bộ; ưu tiên trên mọi việc; owner trực tiếp |
| I4 | Terminate kênh | Kill flow danh mục; phân tích lan tỏa sang kênh khác |

**Giao diện & dữ liệu.**
```ts
policyDefenseChecklist(pkg: PackageId): Promise<PolicyCheckResult[]>
recordDisclosure(pkg, toggle, rationale, decidedBy): void
runPolicyWatch(): ProposalId[]
openIncident(channelId, level, ref): IncidentId
// freeze/unfreeze KHÔNG có API — qua lệnh FREEZE_CHANNEL / UNFREEZE_CHANNEL
```
Sở hữu `policy_check`, `disclosure_decision`, `policy_incident`, `channel_freeze`, `policy_snapshot`, `publish_record`.

**Acceptance.** Publish với <8 PC PASS → abort; toggle disclosure=0 thiếu rationale → abort; incident I2 mở mà kênh chưa freeze → cảnh báo cứng trong operator UI; unfreeze thiếu owner hoặc thiếu learning đã promote → abort; policy watch tạo proposal khi diff giả lập.

---

# HIỆU CHỈNH ĐẶC TẢ MODULE CŨ

Bảng dưới liệt kê **mọi chỗ** v2 làm thay đổi đặc tả trong hai file gốc. Ngoài các mục này, hai file gốc giữ nguyên hiệu lực.

| Module | Chỗ thay đổi | Nội dung mới |
|---|---|---|
| **CORE-02** | Số lệnh: 8 → **12** | Thêm `PROMOTE_EVOLUTION`, `RETIRE_GOLD_SAMPLE`, `FREEZE_CHANNEL`, `UNFREEZE_CHANNEL`. Owner commands: 3 → **5** |
| **CORE-04** | Điều kiện DoR: 9 → **11** | Thêm: kênh không bị freeze; đủ `MIN_HUMAN_DECISIONS` (chặn từ Stage 14) |
| **CORE-05** | Luật "chỉ siết, không nới" | Nâng lên cấp meta (P11): áp cho cả threshold, guardrail, gate definition — không chỉ standard kế thừa. Cưỡng chế bằng `standard_change_log` + trigger |
| **CAP-02** | Gold set | Thêm nguồn `escaped_defect` và `incident`. Bảng append-only (G14); retire cần lệnh owner. LRN-04 là nguồn cấp chính |
| **CAP-03** | Qualification Runner | Dùng chung harness với shadow run của EVO-01 — không viết hai lần |
| **EXE-01** | Orchestrator | Thêm điều tiết theo ngân sách chú ý: không mở package khi vượt `OWNER_WEEKLY_CEILING_MIN` |
| **EXE-02** | `PreflightContext` | Thêm trường `profile: ProfileName` |
| **EXE-03** | Tournament | `n`, số critic đọc từ `PROFILE`, không hardcode và không rẽ nhánh code |
| **EXE-04** | Job envelope | Thêm trường `profile` |
| **OPS-01** | Bộ chỉ số | Thêm: tải chú ý theo tuần, tuổi hàng đợi HP, số proposal theo trạng thái, mật độ thất bại theo defect class |
| **OPS-02** | Operator Workspace | Thêm 5 yêu cầu màn hình: hàng đợi HP hợp nhất; màn D1–D5 side-by-side + ô diff; form nhãn cấu trúc khi từ chối; nút Generate Evidence Report; đồng hồ ngân sách chú ý |
| **INT-02** | Anti-copy | Primitive pHash + beat-diff được POL-01 tái sử dụng cho PC-7 (self-similarity). Đóng gói để dùng lại, không copy code |
| **MSR-02** | Assurance Panel | Số critic đọc từ `PROFILE` (FULL=9, REDUCED=4). Trong Track G chưa có anchor: critic chạy **chế độ cảnh báo**, không làm gate M2 chặn (P5) |
| **MSR-03** | Gate Engine | Thêm tầng kiểm PC1–PC8 trước publish (G15) |
| **PUB-01** | Publishing | Thêm điều kiện publish: đủ 8 policy check, có disclosure decision, kênh không frozen |
| **LRN-03** | Learning Promotion | Thêm `scope` CHANNEL/PORTFOLIO. PORTFOLIO đòi tái lập ≥2 kênh độc lập. Learning mang STRUCTURE xuyên kênh, không mang VOICE (P8) |

---

# PHỤ LỤC — Ma trận module × stage (bổ sung)

Nối vào phụ lục của `ai-factory-modul-nghiep-vu.md`:

| Stage | Module chính | Module hỗ trợ (v2) |
|---|---|---|
| 04 | CRE-01, CRE-04 | **HUM-01 (D1)** |
| 05 | CRE-02, LRN-01 | **HUM-01 (D4)** |
| 06 | CRE-03 | TRU-02, **HUM-01 (D2/D4)** |
| 07A | DES-02 | **HUM-01 (D5)** |
| 09/11 | MED-01, MED-02, MED-05 | **HUM-01 (D3)** |
| 14 | MSR-02, MSR-03 | **HUM-01 (imprint gate)** |
| 15 | PUB-01 | **POL-01 (PC1–PC8)**, HUM-01 (HP-03/HP-06) |
| 16 | LRN-02, LRN-03 | **LRN-04**, **EVO-01** |
| xuyên suốt | — | **EVO-01** (mọi meta-change), **POL-01** (policy watch) |
