# 07 — QUYẾT ĐỊNH CẦN TRẢ LỜI (v2)

Mười một quyết định agent không được tự làm. Đây là **input của kiến trúc**, không phải output — trả lời sau sẽ tạo ra công việc phải làm lại.

Cách dùng: điền vào form, lưu thành `DECISIONS-ANSWERED.md`, nạp cùng pack. Ước tính: một buổi làm việc cho §1–§5 và §9–§11; §6–§8 cần dữ liệu nên trả lời dần.

---

## §1 · Nhịp mục tiêu 🔴 *chặn: WP-08, WP-21, WP-25, Track G*

```
Số kênh mục tiêu:                            ______
Video mỗi kênh mỗi tuần:                     ______
Thời điểm đạt nhịp đó:                       ______
Số video chạy đồng thời tối đa toàn hệ thống: ______
```
**Vì sao chặn.** Trần chi phí phân cấp (`portfolio > channel > package > stage`) không tính được nếu không biết mẫu số. Ngân sách chú ý cũng vậy — và §11 sẽ kiểm tra chéo con số này: nếu nhịp vượt khả năng phán quyết của người, orchestrator sẽ không mở package.

---

## §2 · Cấp của identity 🔴 *chặn: WP-19*

```
[ ] Cấp KÊNH   — voice, visual grammar, từ vựng, nhạc là tài sản kênh
[ ] Cấp VIDEO  — mỗi video tự thiết kế identity
```

| | Cấp kênh | Cấp video |
|---|---|---|
| Qualification | Một lần, dùng cho N video | Mỗi video một lần |
| Chi phí khi scale | Thấp hơn nhiều | Cao, tuyến tính |
| Nhất quán thương hiệu | Mạnh | Yếu |
| Linh hoạt sáng tạo | Bị ràng buộc | Tự do |

**Khuyến nghị: cấp kênh.** Với đa kênh đây gần như là điều kiện cần. **Lưu ý v2:** identity nhất quán cấp kênh cũng là tín hiệu "kênh có chủ thể", ngược với hồ sơ nội dung template hóa mà nền tảng đang nhắm.

---

## §3 · Mô hình kinh tế 🔴 *chặn: WP-08, WP-12B, WP-21*

```
Trần chi phí cho MỘT video ở chất lượng mục tiêu:      $______
Trần này là:  [ ] cho cả video   [ ] cho một slice
Ngân sách qualification (tách riêng khỏi sản xuất):    $______
Chi phí chấp nhận được mỗi video khi đã scale:         $______
Ngân sách cho toàn bộ Track G (8–10 video):            $______
```
**Bối cảnh.** Stage 14 ở cấu hình FULL (9 critic × full playback + ~180 ảnh mỗi critic) nhiều khả năng vượt $20 một mình. Nếu con số thật thấp hơn nhu cầu, **phải đổi kiến trúc trước, không phải sau**: giảm tournament width, giảm composition, hoặc chuyển một phần critic sang phép đo xác định. WP-12B tồn tại để trả lời câu này bằng số.

---

## §4 · Hạ tầng media tier 🔴 *chặn: WP-12*

```
[ ] Cloudflare Containers   — cùng hệ sinh thái, ít cấu hình
[ ] Fly.io Machines         — khởi động nhanh, giá theo giây
[ ] Google Cloud Run Jobs   — tích hợp sẵn với Drive
[ ] AWS Batch / Fargate     — mạnh nhất cho khối lượng lớn
[ ] Khác: ______

GPU?  [ ] Có (alignment + optical flow nhanh hơn nhiều)  [ ] Không
```

---

## §5 · Nhà cung cấp production audio 🟡 *chặn: WP-19, WP-21*

Thay `TBD_PRODUCTION_AUDIO`. Quyết định thương mại/pháp lý — chạy song song ngay.

```
[ ] License cho phép monetization trên YouTube
[ ] Có cơ chế clear Content ID / whitelist kênh
[ ] Truy cập stem-level — cần cho ducking và arrangement
[ ] Thư viện đủ sâu cho 15+ video cùng identity
[ ] Metadata BPM/key/mood có cấu trúc
[ ] Điều khoản ổn định, không hồi tố

Nhà cung cấp đã chọn: ______
```

---

## §6 · Rubric anchor 🟡 *chặn: WP-22*

Mỗi dimension trong `ASSURANCE.FLOORS` cần ba ví dụ. Không có anchor, thang 0–100 trôi giữa các phiên và ngưỡng 92/94 mất ý nghĩa.
```
Mỗi dimension: 1 ví dụ FAIL · 1 BORDERLINE · 1 PASS
Nguồn tốt nhất: 15 master đã bị từ chối + vài video tham chiếu đạt chuẩn
```

---

## §7 · Dữ liệu hiệu chuẩn 🟡 *chặn: WP-14, WP-15*

```
WP-14 — Gold set:
  [ ] 15 master bị từ chối + phán quyết owner dạng văn bản (cái gì sai, đoạn nào)

WP-15 — Hiệu chuẩn aligner:
  [ ] 10–15 mẫu audio người đọc chuẩn, có transcript đúng
      Nên gồm đoạn dày thuật ngữ tài chính
```
**Nếu chưa có:** Track G sẽ sinh ra chúng — mỗi video bị từ chối là một gold sample (flywheel 1). Đây là lý do thứ hai để chạy Track G sớm.

---

## §8 · Baseline retention curve 🟡 *chặn: WP-18*

```
[ ] Dữ liệu từ kênh hiện có:              ______
[ ] Ước lượng từ kênh tham chiếu:         ______
[ ] Bắt đầu bằng đường phẳng, hiệu chỉnh sau 5–8 video
```
**Phương án thứ ba là chấp nhận được.** Điểm mấu chốt không phải dự báo chính xác ngay, mà là **có một dự báo được seal** để so — không có nó thì Stage 16 không có gì đối chiếu và vòng lặp học không tồn tại.

---

## §9 · Lập trường disclosure 🔴 *chặn: WP-29, Track G video #1*

```
Mặc định của nhà máy:
[ ] BẬT synthetic disclosure cho MỌI video  (KHUYẾN NGHỊ)
[ ] Khác: ______

Câu công bố chuẩn dùng trong mô tả video (một câu, dùng toàn nhà máy):
______________________________________________

Nguồn chính sách để policy watch theo dõi (URL, ≥3):
1. ______  2. ______  3. ______
```
**Khuyến nghị BẬT mặc định.** Mọi video của nhà máy dùng TTS nên thuộc phạm vi disclosure. Chi phí RPM của disclosure với nội dung chất lượng gần bằng 0; chi phí bị phát hiện không disclosure là strike. Không nhánh nào trong hệ thống được lợi từ việc tắt.

---

## §10 · Thẩm quyền sự cố & vận hành 🔴 *chặn: WP-28, WP-29*

```
Operator được phát FREEZE_CHANNEL khẩn cấp không chờ owner?
  [ ] Có (KHUYẾN NGHỊ)   [ ] Không
Cửa sổ owner xác nhận freeze:  ______ giờ  (khuyến nghị 24)

Danh sách human_actor (allowlist):
  identity ____________  vai trò [OWNER/OPERATOR/EDITOR]
  identity ____________  vai trò [OWNER/OPERATOR/EDITOR]
  identity ____________  vai trò [OWNER/OPERATOR/EDITOR]

SAMPLING_MIN_CLEAN_STREAK (số video sạch liên tiếp trước khi được
bật sampling HP-03):  ______  (khuyến nghị ≥15)

KILL_CRITERIA_VIDEO_COUNT (số video trước khi đánh giá dừng kênh):
  ______  (khuyến nghị 12–15)
```

---

## §11 · Trần chú ý owner 🔴 *chặn: WP-28, kiểm tra chéo §1*

```
OWNER_WEEKLY_CEILING_MIN = ______ phút/tuần cho toàn bộ điểm chạm
```
**Tham chiếu tính toán.** Với nhịp 3 kênh × 3 video/tuần:
```
HP-02 Editorial Imprint   9 video × 10–20 phút  = 90–180 phút
HP-03 Release + Publish   9 video × 5–10 phút   = 45–90 phút
HP-04 Từ chối có nhãn     ~2 lần × 10–15 phút   = 20–30 phút
HP-05 Promote learning    nhịp tuần             = 15–30 phút
                                          TỔNG  = 170–330 phút/tuần
```
**Nếu trần khai < nhu cầu của nhịp §1**, phải giảm nhịp §1 hoặc thêm operator. Orchestrator cưỡng chế: không mở package mới khi tải điểm chạm dự kiến của tuần vượt trần. Đây là ràng buộc sản xuất ngang với budget — nhà máy chạy nhanh hơn khả năng phán quyết của người thì gate trôi thành phê duyệt hình thức.

---

## Tóm tắt: cần gì để bắt đầu

| Muốn agent bắt đầu | Cần trả lời trước |
|---|---|
| WP-00 → WP-07 | **Không cần gì — bắt đầu ngay hôm nay** |
| WP-08, WP-09 | §1, §3 |
| WP-10, 11, 13, 16, 17, 20 | Không cần gì |
| WP-12, WP-12B | §3, §4 |
| WP-14, WP-15 | §7 (hoặc chờ Track G sinh ra) |
| WP-18 | §8 |
| WP-19 | §2, §5 |
| WP-21 | §3, §5 + kết quả WP-12B |
| WP-22 | §6 |
| WP-23 → WP-27, 30, 31 | Không cần gì |
| WP-28 | §11 + allowlist §10 |
| WP-29 | §9, §10 |
| **Track G — video thật đầu tiên** | §1–§5, §9–§11 |

**Đường găng ngắn nhất đến video đầu tiên:** trả lời §1–§5 và §9–§11 (một buổi) → agent chạy WP-00..09 → WP-12, 12B → WP-16, 17 → WP-28, 29 tối thiểu → Track G. §6–§8 trả lời song song, không chặn Track G.
