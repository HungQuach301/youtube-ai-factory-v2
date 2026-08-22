# 10 — HUMAN TOUCHPOINTS

Bảy điểm chạm con người, thiết kế theo P12 (mỗi phút chú ý làm hai việc: kiểm soát + sinh dữ liệu hiệu chuẩn) và P13 (bằng chứng human input là tài sản phòng thủ chính sách).

Bối cảnh chính sách: từ 07/2026 YouTube loại khỏi monetization nội dung "inauthentic" — generic, lặp lại, template hóa, thiếu human input thực chất; phát hiện tự động chạy ở **cấp kênh**. Điểm chạm con người vì vậy không phải chi phí cần tối thiểu hóa, mà là **điều kiện tồn tại thương mại** cần thiết kế chủ động và chứng minh được.

---

## 1. Bảng bảy điểm chạm

| ID | Điểm chạm | Nhịp | Người | Thời gian | Kiểm soát | Dữ liệu sinh ra |
|---|---|---|---|---|---|---|
| HP-01 | Chiến lược ngách / kênh / pillar | Quý | Owner | 2–4h | Nhà máy làm gì | Channel strategy version |
| HP-02 | **Editorial Imprint** — dấu ấn biên tập trong từng video | Mỗi video | Owner/Operator | 10–20 phút | Human input thực chất (chính sách) | human_decision records; tín hiệu taste cho rubric |
| HP-03 | Release + Publish (P10) | Mỗi video | Owner | 5–10 phút | Cổng cuối | AUTHORIZE_* records; verdict chấp nhận |
| HP-04 | Phán quyết từ chối có nhãn | Khi từ chối | Owner | 10–15 phút | Chuẩn chất lượng | Gold sample (flywheel 1) |
| HP-05 | Promote learning / evolution | Tuần–tháng | Owner | 15–30 phút/tuần | Chuẩn tiến hóa một chiều | Promotion records |
| HP-06 | Rights exception + quyết định disclosure AI | Mỗi video / khi phát sinh | Owner | 2–5 phút | Pháp lý & chính sách | disclosure_decision records |
| HP-07 | Ứng phó sự cố chính sách | Khi có | Owner | Theo sự cố | Sống còn của kênh | Incident RCA → LRN-04 |

---

## 2. HP-02 · Editorial Imprint — đặc tả

Đây là điểm chạm quan trọng nhất về chính sách và là phần pack cũ thiếu. Nguyên tắc: **click "approve" không phải human input theo nghĩa YouTube dùng** — cần quyết định biên tập thực sự, được ghi nhận, để lại dấu vết trong sản phẩm.

### Yêu cầu tối thiểu mỗi video
Mỗi video phải có **≥ POLICY.MIN_HUMAN_DECISIONS quyết định biên tập** thuộc các loại sau, do con người thực hiện (không ủy quyền cho model):

```
D1  CHỌN CHAMPION có lý do — trong tournament Stage 04, người xem
    top-2/3 route và chọn (hoặc xác nhận khác lựa chọn máy), ghi lý do ≥1 câu
D2  SỬA HOOK/TITLE — chỉnh ít nhất câu mở hoặc title bằng ngôn ngữ
    của người (diff được lưu)
D3  CHỌN THUMBNAIL + một chỉnh sửa — chọn giữa các biến thể và yêu cầu
    ≥1 thay đổi cụ thể
D4  PHỦ QUYẾT/ĐIỀU CHỈNH BEAT — cắt, đổi thứ tự, hoặc yêu cầu viết lại
    một beat cụ thể
D5  QUYẾT ĐỊNH GIỌNG ĐIỆU riêng cho video (trong khuôn identity kênh)
```

Ràng buộc: qua các video của cùng kênh, loại quyết định phải **đa dạng** (không phải video nào cũng chỉ D3) — lint kiểm phân bố, vì pattern lặp máy móc chính là tín hiệu inauthentic.

### Gate mới — M0
```
GATE: EDITORIAL_IMPRINT_PRESENT   tier: M0
PASS ⇔ count(human_decision của package) ≥ POLICY.MIN_HUMAN_DECISIONS
     ∧ mỗi decision có actor thuộc human allowlist, timestamp,
       diff/lý do không rỗng, và artifact_ref chịu tác động
     ∧ decision được phản ánh vào artifact SAU thời điểm quyết định
       (lineage chứng minh: bản seal cuối cùng hậu-quyết-định)
M0 ⇒ không waiver. Thiếu ⇒ chặn Stage 14 trở đi.
```

### SCHEMA DELTA
```sql
human_decision(
  id, package_id, decision_type,     -- D1..D5
  actor_identity,                    -- human allowlist, không phải service
  artifact_before_id, artifact_after_id,
  diff_r2_key, rationale_text,
  created_at
)
-- Trigger: actor_identity phải thuộc bảng human_actor (không cấp cho
-- service account); rationale_text NOT NULL và length ≥ 20
```

---

## 3. Human Evidence Log — hồ sơ xuất trình được

Mục đích: khi kênh bị YouTube review, có ngay hồ sơ chứng minh human involvement — dựng từ dữ liệu đã có, không tạo thêm việc.

```
generateEvidenceReport(channel, window):
  1. Mỗi video: danh sách human_decision (loại, thời điểm, diff tóm tắt)
  2. AUTHORIZE_RELEASE / AUTHORIZE_PUBLISH với identity + thời điểm
  3. Disclosure decision từng video
  4. Số liệu độc quyền phán quyết: 100% video có ≥N quyết định người,
     0 video auto-publish (G10)
  5. Differentiation score từng video vs reference set (chống "template")
  6. Nguồn gốc claim: tỷ lệ claim có nguồn T1/T2
  → Xuất PDF/HTML từ command_log + human_decision + gate_evaluation.
    KHÔNG được soạn tay — báo cáo soạn tay không có giá trị bằng chứng.
```

Acceptance: report tái lập được 100% từ D1/R2; mọi mục có trace về record gốc; chạy được cho bất kỳ cửa sổ thời gian nào.

---

## 4. Ngân sách chú ý — CONTRACT DELTA

```ts
export const ATTENTION = {
  // phút / đơn vị, dùng để orchestrator tính tải trước khi mở package
  HP02_MIN_PER_VIDEO: { min: 10, max: 20 },
  HP03_MIN_PER_VIDEO: { min: 5,  max: 10 },
  HP04_MIN_PER_REJECT: { min: 10, max: 15 },
  HP05_MIN_PER_WEEK:  { min: 15, max: 30 },
  OWNER_WEEKLY_CEILING_MIN: null,   // → 12 §11: owner phải khai
  QUEUE_AGE_ALERT_HOURS: 48,        // mục chờ người quá 48h → cảnh báo
} as const
```

**Luật điều tiết.** Orchestrator không mở package mới nếu tải điểm chạm dự kiến của tuần vượt `OWNER_WEEKLY_CEILING_MIN`. Hàng đợi người chờ là ràng buộc sản xuất ngang với budget — nhà máy chạy nhanh hơn khả năng phán quyết của người thì gate trôi thành hình thức (đúng cảnh báo A4 pack cũ).

---

## 5. Chính sách sampling — điều kiện kép

Pack cũ để `SAMPLING_THRESHOLD_N = null` và chỉ xét chất lượng. Delta siết: chuyển từ review 100% sang sampling phải thỏa **đồng thời**:

```
1. ≥ N video liên tiếp sạch (N do owner khai, khuyến nghị ≥ 15)
2. 0 policy incident trên kênh trong 90 ngày gần nhất
3. 0 escaped defect P0 trong 90 ngày gần nhất
4. Owner bật tường minh cho TỪNG kênh (không có default bật)

VÀ sampling chỉ áp cho HP-03 phần review nội dung.
KHÔNG BAO GIỜ sampling: HP-02 (mỗi video vẫn cần human decision —
điều kiện chính sách, không phải điều kiện chất lượng),
AUTHORIZE_PUBLISH (P10), HP-06 disclosure.
Một policy incident bất kỳ ⇒ kênh đó tự động về 100% review.
```

Lý do giữ HP-02 ở 100%: chi phí một strike cấp kênh lớn hơn nhiều tổng chi phí review; và human decision là input chính sách bắt buộc chứ không phải kiểm tra có thể lấy mẫu.

---

## 6. Yêu cầu Operator UI cho điểm chạm (bổ sung WP-25)

| Yêu cầu | Lý do |
|---|---|
| Hàng đợi HP hợp nhất, sắp theo tuổi, hiện thời gian ước tính từng mục | Người xử lý theo lô, không bị kéo vào công cụ cả ngày |
| Màn HP-02: side-by-side top routes/variants + ô diff + lý do | 10–20 phút/video chỉ khả thi nếu UI làm sẵn so sánh |
| Màn HP-04: form nhãn cấu trúc {defect_class, severity, t_start, t_end} bắt buộc | Từ chối không nhãn = mất một gold sample (flywheel 1) |
| Nút "Generate Evidence Report" theo kênh + cửa sổ | HP-07 cần hồ sơ trong giờ, không phải ngày |
| Đồng hồ ngân sách chú ý tuần (đã dùng / trần) | P12 — tải người là ràng buộc hiển thị được |
