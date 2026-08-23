# 11 — POLICY DEFENSE

Phòng thủ chính sách YouTube như một năng lực kiến trúc, không phải checklist dán sau. Rủi ro cần quản: quyết định demonetize/strike ở **cấp kênh**, do hệ thống tự động của nền tảng, xóa toàn bộ NPV kênh trong một lần — đây là rủi ro tồn tại lớn nhất của mô hình, lớn hơn mọi rủi ro kỹ thuật.

Ba tuyến phòng thủ:
```
Tuyến 1  KHÔNG GIỐNG MỤC TIÊU     differentiation + human imprint + nguồn thật
Tuyến 2  CHỨNG MINH ĐƯỢC          evidence log xuất trình được (10 §3)
Tuyến 3  PHẢN ỨNG CÓ KỶ LUẬT      incident playbook, học ngược vào lint
```

---

## 1. Gate PLATFORM_COMPLIANCE (M0) — đặc tả chi tiết

Mở rộng gate M0 hiện có thành bộ kiểm cụ thể. PASS đòi **tất cả**:

```
PC-1  EDITORIAL_IMPRINT_PRESENT = PASS            (10 §2)
PC-2  Differentiation score ≥ ngưỡng, đo lại trên bản final
      (không chỉ ở Stage 04 — nội dung có thể hồi quy về template
      qua các stage sau)
PC-3  Anti-copy 4 phép đo PASS trên bản final (02 ANTICOPY)
PC-4  Disclosure decision đã ghi (PC ma trận §2) và metadata
      upload khớp quyết định
PC-5  100% claim CRITICAL có nguồn T1/T2 (TRU-01) — nội dung
      "news-style AI không fact-check" là mẫu enforcement điển hình
PC-6  Advice lint PASS (TRU-02) — nội dung tài chính khuyến nghị
      trực tiếp là rủi ro kép: chính sách nền tảng + pháp lý
PC-7  Voice/visual template check: video không trùng cấu trúc
      beat + voice settings + thumbnail pattern với >K video gần
      nhất CÙNG KÊNH vượt ngưỡng nội bộ (chống tự đồng hóa —
      hệ nhiều video một khuôn là hồ sơ enforcement điển hình)
PC-8  Không dùng chân dung/giọng người thật tổng hợp; nếu có
      nhân vật AI → thuộc phạm vi disclosure bắt buộc
```

**PC-7 — CONTRACT DELTA:**
```ts
export const POLICY = {
  MIN_HUMAN_DECISIONS: 2,              // /video, ≥2 loại khác nhau (10 §2)
  SELF_SIMILARITY_WINDOW_VIDEOS: 10,   // so với 10 video gần nhất cùng kênh
  SELF_BEAT_SEQUENCE_DIFF_MIN: 0.30,   // Levenshtein trên beat type
  SELF_THUMBNAIL_PHASH_HAMMING_MIN: 16,
  INCIDENT_CLEAN_DAYS_FOR_SAMPLING: 90,
  POLICY_WATCH_INTERVAL_DAYS: 7,
  POLICY_SNAPSHOT_SOURCES: ['ypp_monetization','inauthentic_content',
                            'synthetic_disclosure','advertiser_friendly'],
} as const
```
Ghi chú P5: các ngưỡng self-similarity trên là khởi điểm chưa hiệu chuẩn — đánh dấu `UNCALIBRATED`, hiệu chỉnh sau 10–15 video bằng phân phối thực tế, mọi thay đổi qua Evolution (G11/G12).

---

## 2. Ma trận disclosure — HP-06

Quyết định mỗi video, người quyết, ghi `disclosure_decision`:

| Nội dung video có... | Toggle "altered/synthetic" | Ghi chú |
|---|---|---|
| Voice AI đọc narration | **BẬT** | Mặc định của nhà máy — mọi video dùng TTS |
| Cảnh/diagram do AI sinh mô tả sự vật thật | BẬT | |
| Nhân vật/người dẫn AI | BẬT + nêu trong mô tả | |
| Mô phỏng người thật nói/làm điều họ không làm | **CẤM TUYỆT ĐỐI** | Không có ngoại lệ, không cần cân nhắc |
| Chỉ AI hỗ trợ script/editing, giọng người thật | Tùy chọn, khuyến nghị bật | Hiếm với mô hình này |

Nguyên tắc mặc định: **khi phân vân → bật disclosure.** Chi phí RPM của disclosure ≈ 0 với nội dung chất lượng; chi phí của việc bị phát hiện không disclosure là strike. Không có nhánh nào trong hệ thống được lợi từ việc tắt disclosure — vì vậy default trong schema là BẬT, tắt cần lý do ghi lại.

```sql
disclosure_decision(
  id, package_id, synthetic_toggle BOOLEAN DEFAULT 1,
  rationale_text,                 -- NOT NULL khi toggle = 0
  decided_by, decided_at
)
```

---

## 3. Policy Watch — theo dõi thay đổi chính sách

```
Nhịp: POLICY_WATCH_INTERVAL_DAYS (7 ngày), trong phiên OPERATE tuần.

1. Fetch + snapshot các nguồn CHÍNH THỨC trong POLICY_SNAPSHOT_SOURCES
   (YPP policies, inauthentic content, AI disclosure, advertiser-friendly)
   → lưu R2 qua CORE-06, hash nội dung
2. Diff với snapshot kỳ trước
3. Có diff → tạo evolution_proposal(source='POLICY_WATCH') kèm:
   phần thay đổi, gate/PC nào có thể bị ảnh hưởng, khuyến nghị
4. KHÔNG tự đổi gate. Người quyết (HP-05). Nhưng diff thuộc nhóm
   SIẾT rõ ràng (danh mục cấm mở rộng) → agent được đề xuất
   TIGHTEN khẩn cấp, owner duyệt fast-track.

Đây là ứng dụng đúng của CORE-06: chính sách cũng là "nguồn" cần
snapshot + provenance như mọi nguồn khác.
```

---

## 4. Incident Playbook — ưu tiên tuyệt đối

### Phân mức
| Mức | Sự kiện | Phản ứng bắt buộc |
|---|---|---|
| I1 | Limited ads một video | RCA video đó; không bắt buộc dừng kênh |
| I2 | Video bị gỡ / cảnh cáo chính sách | FREEZE_CHANNEL; RCA; appeal nếu có căn cứ |
| I3 | Strike kênh / YPP bị treo hoặc review | FREEZE_CHANNEL toàn bộ; ưu tiên trên mọi việc; owner trực tiếp |
| I4 | Terminate kênh | Kill flow danh mục (§5); phân tích lan tỏa sang kênh khác |

### Quy trình chuẩn (I2 trở lên)
```
0. GHI NHẬN  policy_incident(channel, level, platform_ref, evidence)
1. FREEZE    FREEZE_CHANNEL: dừng mở package mới + dừng publish
             mọi package đang chờ CỦA KÊNH ĐÓ; package giữa chừng
             chạy nốt đến trước Stage 15 rồi giữ.
             Operator được phát khẩn cấp; owner xác nhận trong 24h.
2. RCA       Nội dung nào? Vi phạm danh mục nào? Tín hiệu nào của
             mình đã bỏ lọt (PC-x nào lẽ ra phải bắt)?
             → escaped defect ⇒ LRN-04 mức nghiêm trọng cao nhất
3. HỒ SƠ     generateEvidenceReport(channel) (10 §3) — human
             decisions, disclosure, nguồn, differentiation
4. APPEAL    Owner quyết có appeal không; nội dung appeal dựa hồ sơ
             thật, không soạn diễn giải
5. HỌC NGƯỢC evolution_proposal SIẾT cho MỌI KÊNH (không chỉ kênh
             dính): PC nào thêm/siết, lint nào thêm ở stage sớm
6. RÃ ĐÔNG   Chỉ owner UNFREEZE, sau khi ≥1 proposal từ bước 5
             được promote. Không rã đông "vì đã yên".
```

### SCHEMA DELTA
```sql
policy_incident(
  id, channel_id, level,            -- I1..I4
  platform_ref, detected_at, source, -- 'PLATFORM_NOTICE'|'INTERNAL'|'VIEWER'
  rca_r2_key, appeal_state, resolved_at,
  learned_proposal_ids_json
)
channel_freeze(
  channel_id, frozen_at, frozen_by, incident_id,
  unfrozen_at, unfrozen_by          -- unfreeze đòi owner identity
)
-- Trigger: unfrozen_by ∈ owner allowlist; incident I2+ đang mở
-- mà channel không freeze → cảnh báo cứng trong operator UI
```

---

## 5. Kill criteria — kỷ luật danh mục

Định trước, để quyết định dừng là thi hành chứ không phải tranh luận lúc đau:

```
DỪNG MỘT KÊNH khi bất kỳ:
  • I3 lặp lại sau khi đã siết (hệ thống không phòng thủ được ngách đó)
  • Sau M video (owner khai, khuyến nghị 12–15): doanh thu vận hành
    < chi phí biến đổi và không có xu hướng cải thiện qua learning
  • Ngách bị nền tảng siết đến mức nội dung hợp lệ không còn khả thi

DỪNG / TÁI KIẾN TRÚC NHÀ MÁY khi:
  • ≥2 kênh chết vì I3/I4 với nguyên nhân gốc là MÔ HÌNH SẢN XUẤT
    (không phải ngách) — nghĩa là tuyến phòng thủ 1 thất bại có hệ thống
  • Cost per video sau tối ưu vẫn > trần kinh tế (§3 pack cũ) ở 2 chu kỳ
    benchmark liên tiếp
```

Kênh bị dừng: archive master + evidence (đối soát Drive), giữ learning, giải phóng lease/budget. Không xóa — dữ liệu thất bại là input LRN-04.

---

## 6. Ánh xạ trách nhiệm

| Việc | Người | Hệ thống | Agent |
|---|---|---|---|
| Gate PC-1..8 mỗi video | — | Cưỡng chế (G15) | Xây + vận hành |
| Disclosure | Quyết (HP-06) | Ghi + áp metadata | Chuẩn bị đề xuất |
| Policy watch | Duyệt proposal | Snapshot + diff | Chạy + soạn proposal |
| Freeze khẩn cấp | Xác nhận ≤24h | Thi hành lệnh | Phát hiện + đề xuất |
| Appeal | Quyết + ký | Sinh hồ sơ | Soạn nháp từ hồ sơ |
| Kill kênh | Quyết | Thi hành archive | Chuẩn bị số liệu |
