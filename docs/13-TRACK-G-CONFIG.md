# 13 — TRACK G CONFIG (Golden Path)

Cấu hình để ra 8–10 video thật sớm, trả lời hai câu hỏi mà không lượng code nào trả lời được: **kênh có sống qua YPP review không** và **cost/video thật là bao nhiêu**.

Nguyên tắc: Track G **không phải nhánh code riêng**. Cùng codebase, khác `PROFILE` trong contracts. Mọi thứ Track G học được áp thẳng cho Track P.

---

## 1. Cái gì cắt, cái gì không

### CẮT (giảm width, không giảm kỷ luật)
| Tham số | FULL | REDUCED | Tiết kiệm |
|---|---|---|---|
| `routeCount` (Stage 04) | 4 | 2 | ~50% chi phí creative |
| `compositionsPerCriticalUnit` | 3 | 1 | ~66% chi phí visual |
| `criticCountStage04` | 7 | 3 | ~57% |
| `criticCountAssurance` (Stage 14) | 9 | 4 | ~55% — khoản lớn nhất |
| `temporalSamplesPerShot` | 3 | 1 | ~66% chi phí ảnh critic |
| `sourceCandidates` | 8 | 6 | ~25% |

4 critic của REDUCED phải phủ đủ bốn trục không thay thế được bằng phép đo xác định:
```
TRUTH_BRAND_SAFETY · SEMANTIC_ALIGNMENT · STORY_RETENTION · PACKAGING_CTR
```
Năm critic còn lại (VISUAL_DIRECTION, AUDIO_DIRECTION, MOBILE_LEGIBILITY, EXECUTIVE_PRODUCER, COMPETITIVE_EDITOR) tạm thay bằng phép đo xác định của MSR-01 ở mức cảnh báo — đúng tinh thần P6, và là lý do WP-12B đo cả phương án "tối đa hóa phép đo xác định".

### KHÔNG CẮT — đây là phòng thủ, không phải tính năng
```
✓ Truth layer đầy đủ        claim graph, source tier, số có nguồn
✓ Advice lint               rủi ro kép: chính sách + pháp lý
✓ Anti-copy 4 phép đo       PC-3
✓ ChannelIdentityContract   identity nhất quán = tín hiệu kênh có chủ thể
✓ HP-02 Editorial Imprint   điều kiện chính sách, không lấy mẫu được
✓ Disclosure decision       PC-4
✓ G15 checklist PC1..PC8    cổng publish
✓ Prediction seal (P9)      không có thì không có vòng học — mà vòng học
                            chính là thứ Track G tồn tại để khởi động
✓ Archival + distribution master, evidence store, command log
```

Lý do đơn giản: cắt width làm video **kém hơn một chút**; cắt phòng thủ làm kênh **chết**. Hai thứ không cùng hạng rủi ro.

---

## 2. Ngưỡng trong REDUCED

Ngưỡng chất lượng **giữ nguyên** — chỉ số lượng candidate giảm. Nghĩa là first-pass yield sẽ thấp hơn và một số video cần chạy lại; đó là đánh đổi có ý thức và là dữ liệu hữu ích (tỷ lệ rework ở REDUCED cho biết width bao nhiêu là đủ).

Hai điều chỉnh duy nhất được phép, và phải ghi `standard_change_log` chiều NEUTRAL:
```
ASSURANCE.FLOORS.OVERALL      giữ 92 — KHÔNG hạ
ASSURANCE.CRITIC_COUNT        9 → 4 (qua PROFILE, không sửa threshold)
ASSURANCE.MAX_VARIANCE        giữ 3 — với 4 critic thì variance quan trọng hơn
```
**Cấm hạ floor để video đi qua.** Nếu video REDUCED không đạt floor, đó là thông tin: hoặc nội dung chưa đủ, hoặc width 2 là quá hẹp cho ngách này. Cả hai đều đáng biết trước khi scale. Hạ floor sẽ vi phạm G11 và bị CI chặn.

---

## 3. Trình tự Track G

```
G-01 · CHUẨN BỊ KÊNH                                   [1–2 ngày]
  • Chọn ngách theo HP-01. Tiêu chí bổ sung v2: tránh ngách mà
    nội dung AI đang bị soi mạnh (tin tức thời sự, y tế cá nhân,
    tài chính khuyến nghị). Ngách giải thích cơ chế/hệ thống an toàn hơn.
  • ChannelIdentityContract v1 (§2 = cấp kênh)
  • Pillar đầu tiên + 10 episode trong hàng đợi
  • Bật sampling = OFF, freeze = OFF, disclosure default = ON

G-02 · VIDEO #1 — end-to-end                           [chạy chậm, quan sát]
  • Chạy đủ Stage 00→16 ở PROFILE=REDUCED
  • Ghi mọi thứ: cost từng stage, thời gian owner từng điểm chạm,
    stage nào FAIL, phép đo nào vô nghĩa
  ⛔ DỪNG. Review đầy đủ với owner. Đây là lần đầu mọi giả định gặp
     thực tế — kỳ vọng nhiều thứ sai, và đó là mục đích.

G-03 · VIDEO #2–5 — hiệu chuẩn                         [~2–3 tuần]
  • Mỗi video bị từ chối → gold sample có nhãn (HP-04, flywheel 1)
  • Sau video #3: đủ dữ liệu hiệu chuẩn UNCALIBRATED thresholds
    (differentiation, self-similarity) — chạy qua Evolution pipeline
  • Sau video #5: cost/video thật ổn định → đối chiếu §3

G-04 · VIDEO #6–10 — vòng học                          [~3–4 tuần]
  • Prediction seal từ video #1 giờ có analytics đối chiếu
  • Baseline retention curve thật (§8) thay đường phẳng
  • LRN-04 chạy lần đầu trên dữ liệu thật

G-05 · ⛔ GO / NO-GO
```

---

## 4. Tiêu chí GO / NO-GO

Quyết định bằng số, định trước, không tranh luận lúc đau:

```
GO — nâng PROFILE lên FULL từng phần + mở kênh #2, khi TẤT CẢ:
  ✓ Kênh không có policy incident mức I2+ trong toàn bộ Track G
  ✓ ≥8/10 video được owner chấp nhận (AUTHORIZE_RELEASE) ở lần 1 hoặc 2
  ✓ Cost/video thật ≤ trần §3 (ở REDUCED — và ước lượng FULL cũng
    trong trần, dùng hệ số từ WP-12B)
  ✓ Thời gian owner thật ≤ OWNER_WEEKLY_CEILING_MIN (§11)
  ✓ Có tín hiệu retention: ≥1 learning đạt READY

ĐIỀU CHỈNH — ở lại REDUCED, sửa, chạy tiếp 5 video:
  • Cost vượt trần nhưng nguyên nhân xác định được và sửa được
  • Rework rate cao do width 2 quá hẹp → tăng riêng routeCount lên 3
  • Thời gian owner vượt trần → cải thiện operator UI trước khi scale

NO-GO — quay lại 11 §5 kill criteria:
  • Policy incident I3+ (hệ thống không phòng thủ được ngách này)
  • Cost/video ở REDUCED đã vượt trần và không có đường giảm
  • Retention thấp hơn baseline ở ≥7/10 video (vấn đề nội dung,
    không phải vấn đề nhà máy — scale sẽ nhân lỗi lên)
```

**Nguyên tắc quan trọng:** NO-GO ở Track G là kết quả **rẻ**. Nó tốn 8–10 video thay vì toàn bộ 32 work package cộng nhiều kênh. Đó chính là giá trị của việc chạy nó sớm.

---

## 5. Việc Track G sinh ra cho Track P

Đây không phải chạy thử bỏ đi — nó sản xuất năm tài sản mà Track P đang chờ:

| Tài sản | Track P đang chờ ở |
|---|---|
| Gold set từ master bị từ chối | WP-14 (§7 chặn) |
| Rubric anchor từ phán quyết thật | WP-22 (§6 chặn) |
| Baseline retention curve | WP-18 (§8 chặn) |
| Cost/video thật theo stage | WP-21, và hiệu chỉnh §3 |
| Hiệu chuẩn UNCALIBRATED thresholds | ANTICOPY, POLICY (P5) |

Nói cách khác: ba trong bốn quyết định 🟡 đang chặn Track P (§6, §7, §8) được Track G trả lời bằng dữ liệu thật thay vì phán đoán. Đây là lý do mạnh nhất để chạy hai track song song thay vì tuần tự.

---

## 6. Nâng cấp REDUCED → FULL

Không nâng một lần. Nâng theo thứ tự đòn bẩy giảm dần, mỗi bước 3–5 video để đo tác động:

```
1. criticCountAssurance  4 → 9    (chất lượng đảm bảo, đắt nhất)
2. routeCount            2 → 4    (chất lượng sáng tạo)
3. compositionsPerUnit   1 → 3    (chất lượng hình ảnh)
4. temporalSamples       1 → 3    (độ phủ kiểm tra)
5. criticCountStage04    3 → 7
```
Mỗi bước là một `evolution_proposal` chiều NEUTRAL (đổi PROFILE, không đổi threshold) kèm bằng chứng: chất lượng tăng bao nhiêu, chi phí tăng bao nhiêu. Bước nào không chứng minh được giá trị thì **không nâng** — có thể REDUCED đã đủ cho ngách đó, và đó là phát hiện đáng giá cho kinh tế đơn vị khi scale.
