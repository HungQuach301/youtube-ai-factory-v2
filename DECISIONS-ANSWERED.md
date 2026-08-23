# DECISIONS-ANSWERED

Bản trả lời cho 11 quyết định trong `07-DECISIONS-REQUIRED.md`. Nạp file này cùng pack — agent đọc nó thay cho form trống.

**Trạng thái:** ĐÃ CHỐT (bản v1, do owner phê duyệt để khởi động).
Mọi thay đổi về sau đi qua Evolution pipeline như mọi meta-change khác.

**Nguyên tắc điền.** Các giá trị dưới đây được chọn để (a) nhất quán với nhau — nhịp §1 nằm trong trần chú ý §11, ngân sách §3 nằm trong cấu hình REDUCED của Track G; (b) thiên về thận trọng ở mọi chỗ rủi ro chính sách; (c) đủ cụ thể để agent không bị chặn. Ngân sách §3 được owner xác nhận ngày 2026-08-23; các xác nhận còn lại được liệt kê ở cuối.

## Ủy quyền triển khai thường trực ✅ **[OWNER CONFIRMED — 2026-08-23]**

Owner ủy quyền cho agent tiếp tục triển khai code, CI, ChatGPT Sites, môi trường
production và các provider/API trả phí cần thiết mà không phải xin lại phê duyệt
hội thoại cho từng thao tác, miễn là thao tác nằm trong phạm vi work package đã
được giao và trong các trần ngân sách §3.

Ủy quyền này **không** nới hoặc vô hiệu hóa bất kỳ control nào:

- mọi provider call vẫn phải đi qua guarded dispatch và Cost Reservation;
- vượt trần hoặc thiếu credential hợp lệ phải fail-closed với zero dispatch;
- hard gate, evidence, qualification và human editorial imprint vẫn bắt buộc;
- các typed owner command vẫn cần identity/signature/evidence theo P10;
- `auto_publish` vẫn cố định `OFF`; phát hành từng video vẫn cần hai lệnh owner
  tách biệt và các kiểm tra PC-1..PC-8/G15;
- không được tự suy diễn dữ liệu hiệu chuẩn, điều khoản license hoặc identity
  người thật đang còn thiếu.

Phạm vi triển khai đang được ủy quyền liên tục: củng cố SSOT; WP-12; WP-12B;
WP-13..WP-17; và mức tối thiểu WP-28/WP-29. Mỗi WP vẫn dùng branch/PR/CI/DONE
độc lập, GitHub `main` vẫn là nguồn chuẩn duy nhất.

## WP-12B numeric checkpoint ✅ **[OWNER CONFIRMED — 2026-08-23]**

Sau khi benchmark đã tạo evidence, owner xác nhận ba kết quả trong phạm vi đo:

- FULL: `$0.266674/video`;
- REDUCED: `$0.123168/video`;
- REDUCED + deterministic max: `$0.127076/video`.

Owner chọn `PROFILE=REDUCED` để triển khai WP-13 và các work package phía sau.
Quyết định này không biến số benchmark thành all-in production cost và không
qualify provider chưa chạy thật; cost reservation, qualification và mọi hard
gate tiếp tục fail-closed. `B-005` được đóng bằng xác nhận evidence-specific này.

---

## §1 · Nhịp mục tiêu ✅

```
Số kênh mục tiêu:                             3
Video mỗi kênh mỗi tuần:                      2
Thời điểm đạt nhịp đó:                        tháng thứ 6 kể từ WP-00
Số video chạy đồng thời tối đa toàn hệ thống: 4
```

**Lộ trình tăng nhịp** (orchestrator dùng để tính trần theo giai đoạn):

| Giai đoạn | Kênh | Video/tuần/kênh | Tổng/tuần | Ghi chú |
|---|---|---|---|---|
| Tháng 1–2 | 1 | 1 | 1 | Track G video #1–5, chạy chậm để quan sát |
| Tháng 3 | 1 | 2 | 2 | Track G video #6–10 |
| Tháng 4 | 2 | 2 | 4 | Sau GO; kênh #2 kế thừa portfolio default |
| Tháng 5–6 | 3 | 2 | 6 | Nhịp mục tiêu |

**Lý do 2 video/tuần/kênh thay vì 3.** Ba lý do độc lập cùng chỉ về con số này: nó giữ tải chú ý ở ~176 phút/tuần (§11 còn dư biên); nó tránh hồ sơ upload-tần-suất-cao vốn là tín hiệu enforcement; và nó cho mỗi video đủ thời gian có analytics trước khi video kế tiếp cùng kênh ra — điều kiện của vòng học.

```ts
TARGET_VIDEOS_PER_CHANNEL_PER_WEEK: 2
TARGET_CHANNELS: 3
MAX_CONCURRENT_PACKAGES: 4
```

---

## §2 · Cấp của identity ✅

```
[x] Cấp KÊNH — voice, visual grammar, từ vựng, nhạc là tài sản kênh;
               video kế thừa, không quyết định lại
[ ] Cấp VIDEO
```

**Lý do.** Với đa kênh, qualify ở cấp video làm chi phí tăng tuyến tính theo số video và giết kinh tế đơn vị. Quan trọng không kém: identity nhất quán ở cấp kênh là tín hiệu "kênh có chủ thể" — ngược với hồ sơ nội dung template hóa. Chuyên biệt hóa vẫn có ở cấp video, nhưng trong khuôn identity kênh (đúng P8).

```ts
IDENTITY_SCOPE: 'channel'
```

---

## §3 · Mô hình kinh tế ✅ **[OWNER CONFIRMED — 2026-08-23]**

```
Trần chi phí cho MỘT video ở chất lượng mục tiêu:   $30
Trần này là:  [x] cho cả video   [ ] cho một slice
Ngân sách qualification (tách riêng sản xuất):      $400
Chi phí chấp nhận được mỗi video khi đã scale:      $18
Ngân sách cho toàn bộ Track G (8–10 video):         $350
```

**Trần phân cấp** (PRV-02 dùng trực tiếp):
```ts
SPEND_CEILING_PER_VIDEO_USD: 30        // package level
SPEND_CEILING_PER_CHANNEL_WEEK_USD: 70 // 2 video + biên rework
SPEND_CEILING_PORTFOLIO_MONTH_USD: 900 // 3 kênh ở nhịp đầy đủ
QUALIFICATION_BUDGET_USD: 400          // namespace riêng, không trộn
TRACK_G_BUDGET_USD: 350
SCALED_TARGET_COST_PER_VIDEO_USD: 18
```

**Cơ sở của $30.** Đây là trần cho cấu hình REDUCED, đặt ở mức cao hơn ước lượng để reservation không chặn oan trong giai đoạn chưa có số thật. WP-12B sẽ thay ước lượng bằng đo đạc; nếu FULL vượt $30 thì theo đúng thiết kế, ta ở lại REDUCED và nâng từng phần theo `13 §6` — không nâng trần.

**Quy tắc khi vượt trần.** Reservation bị từ chối là hành vi đúng, zero dispatch. Agent báo owner với ba phương án cắt (giảm route_count, giảm composition, hoãn) và **chờ**. Nâng trần là quyền owner, không nới ở bất kỳ quy mô nào.

---

## §4 · Hạ tầng media tier ✅

```
[ ] Cloudflare Containers
[x] Fly.io Machines         — khởi động nhanh, tính tiền theo giây
[ ] Google Cloud Run Jobs
[ ] AWS Batch / Fargate
GPU?  [ ] Có   [x] Không (giai đoạn đầu)
```

**Lý do Fly.io.** Khối lượng media của nhịp §1 là burst ngắn và thưa (4 package đồng thời, mỗi package vài chục phút FFmpeg). Tính tiền theo giây và cold start nhanh khớp với hình dạng tải này tốt hơn job runner tính theo phút. Cloudflare Containers là lựa chọn thứ hai nếu muốn gom một hệ sinh thái; quyết định này được thiết kế để đảo ngược rẻ — media worker là stateless, nhận job envelope, ghi R2, nên đổi hạ tầng chỉ là đổi Dockerfile host.

**Không GPU giai đoạn đầu.** WhisperX trên CPU chậm hơn nhưng nằm trong deadline của nhịp 2 video/tuần. Xem xét lại khi nhịp vượt 8 video/tuần hoặc khi WP-12B cho thấy alignment là nút cổ chai.

```ts
MEDIA_INFRA: 'fly.io'
MEDIA_GPU: false
MEDIA_IMAGE_DIGEST: null   // agent điền sau khi build image đầu tiên
```

---

## §5 · Nhà cung cấp production audio ✅ (có điều kiện)

Tiêu chí bắt buộc — agent kiểm từng mục trước khi tích:
```
[ ] License cho phép monetization trên YouTube
[ ] Có cơ chế clear Content ID / whitelist kênh
[ ] Truy cập stem-level (tách nhạc cụ)
[ ] Thư viện đủ sâu cho 15+ video cùng identity
[ ] Metadata BPM/key/mood có cấu trúc
[ ] Điều khoản ổn định, không hồi tố
```

**Nhà cung cấp:** ứng viên đánh giá theo thứ tự — Epidemic Sound, Artlist, Musicbed.

**Đây là quyết định thương mại/pháp lý, không phải kỹ thuật.** Tôi không xác nhận điều khoản license của bên thứ ba; điều khoản thay đổi và phải đọc từ hợp đồng hiện hành. Việc của owner: chọn một nhà cung cấp và xác nhận sáu tiêu chí trên bằng văn bản hợp đồng, trước WP-19.

**Cách để không bị chặn trong lúc đó:** Track G video #1–5 chạy với cue nhạc ở mức tối giản (ambience + silence, không nhạc có bản quyền), gate `M0 music-license` vẫn PASS vì không có asset nào cần license. Điều này cho phép Track G khởi động trước khi §5 chốt. Ghi nhận: đây là hạn chế có ý thức, không phải bỏ qua gate.

```ts
PRODUCTION_AUDIO_PROVIDER: null   // BLOCKED cho WP-19; Track G chạy được không cần
TRACK_G_MUSIC_MODE: 'ambience_only'
```

---

## §6 · Rubric anchor ✅ (nguồn đã xác định)

```
Nguồn anchor: sinh ra từ Track G.
```

Không có 15 master bị từ chối để lấy anchor lúc này — nên anchor **đến từ chính Track G**:

```
Video #1–5 (G-03): mỗi lần owner từ chối hoặc chấp nhận, ghi nhãn cấu
trúc qua HP-04 → đây là anchor thật, không phải ví dụ tưởng tượng.
Sau video #5: đủ 5 điểm dữ liệu/dimension để đặt anchor FAIL/BORDERLINE/PASS.
Trước đó: critic chạy ở chế độ CẢNH BÁO, không làm gate M2 chặn.
```

**Vì sao chấp nhận được.** P5 cấm đặt ngưỡng lên phép đo chưa hiệu chuẩn — nên trong Track G, điểm critic được ghi vào evidence nhưng **không dùng làm gate chặn**; owner là gate (HP-03 review 100%). Khi có anchor thật, M2 mới được bật. Đây đúng tinh thần P5 chứ không phải lách nó.

```ts
RUBRIC_ANCHOR_SOURCE: 'track_g_hp04'
M2_GATE_ACTIVE: false        // bật sau khi có anchor ≥3 mẫu/dimension
```

---

## §7 · Dữ liệu hiệu chuẩn ✅ (nguồn đã xác định)

```
WP-14 Gold set:      sinh từ Track G (mỗi master bị từ chối → gold sample)
                     + 15 mẫu tổng hợp FFmpeg (agent tự sinh được ngay)
WP-15 Aligner:       10–15 mẫu audio người đọc chuẩn — [XÁC NHẬN — con số 3]
```

**WP-14 không bị chặn.** Phần B (mẫu tổng hợp) agent làm được ngay không cần dữ liệu owner: 8 loại defect gài bằng FFmpeg × 2 biến thể = 16 mẫu. Phần A tích lũy dần qua Track G. Ngưỡng ≥30 mẫu đạt được sau ~video #5.

**WP-15 cần owner cung cấp audio.** Không có cách thay thế: error floor phải đo trên giọng đọc chuẩn thật. Trong lúc chờ:
```ts
ALIGNER_ERROR_FLOOR: null
// AUDIO.PHONEME_MISMATCH_BASE nằm trong UNCALIBRATED
// → gate phoneme mismatch chạy ở mức CẢNH BÁO, không chặn (P5)
```
Nếu owner không có sẵn: thu 10 mẫu × 60 giây đọc script tài chính là công việc một buổi. Đây là đầu tư nhỏ nhất trong toàn pack cho một hard gate.

---

## §8 · Baseline retention curve ✅

```
[ ] Dữ liệu từ kênh hiện có
[ ] Ước lượng từ kênh tham chiếu
[x] Bắt đầu bằng đường phẳng, hiệu chỉnh sau 5–8 video
```

**Cấu hình khởi đầu:**
```ts
BASELINE_RETENTION_SOURCE: 'flat'
BASELINE_FLAT_CURVE: {
  // retention giả định tại mốc % thời lượng — cố ý thô
  0: 1.00, 5: 0.75, 10: 0.62, 25: 0.48, 50: 0.38, 75: 0.31, 100: 0.26
}
PREDICTION_MODEL_VERSION: 'v0-flat'
RECALIBRATE_AFTER_VIDEOS: 6
```

**Điểm mấu chốt không phải dự báo chính xác** — mà là **có một dự báo được seal** để so. Không có nó thì Stage 16 không có gì đối chiếu và vòng lặp học không tồn tại (P9). Đường phẳng thô vẫn thỏa P9; sau 6 video, hồi quy thay các trọng số `w₁..w₄`.

---

## §9 · Lập trường disclosure ✅

```
[x] BẬT synthetic disclosure cho MỌI video
```

**Câu công bố chuẩn** (đặt cuối mô tả video, mọi video, mọi kênh):

> Video này được sản xuất với sự hỗ trợ của công cụ AI cho phần dựng hình và lồng tiếng. Nội dung, nguồn dẫn và biên tập do con người quyết định và kiểm duyệt.

Bản tiếng Anh cho kênh EN:
> This video was produced with AI assistance for visuals and narration. Content, sourcing, and editorial decisions are made and reviewed by a human.

**Lý do BẬT mặc định.** Mọi video của nhà máy dùng TTS nên thuộc phạm vi disclosure. Không nhánh nào trong hệ thống được lợi từ việc tắt: chi phí RPM của disclosure với nội dung chất lượng gần bằng 0, chi phí bị phát hiện không disclosure là strike. Câu công bố cố ý nêu cả phần con người — nó vừa là disclosure vừa là tuyên bố human input.

**Nguồn chính sách để policy watch theo dõi.** Agent phải tự resolve URL hiện hành ở lần chạy đầu (URL đổi theo thời gian) và snapshot qua CORE-06. Bốn trang bắt buộc theo dõi:
```
1. YouTube Partner Program — chính sách monetization tổng
2. Inauthentic content policy  (trang enforcement chính cho nội dung AI)
3. Altered or synthetic content disclosure  (yêu cầu công bố)
4. Advertiser-friendly content guidelines
```
```ts
DISCLOSURE_DEFAULT: true
POLICY_SNAPSHOT_SOURCES: ['ypp_monetization','inauthentic_content',
                          'synthetic_disclosure','advertiser_friendly']
// agent resolve URL thật ở lần chạy đầu, ghi vào policy_snapshot
```

---

## §10 · Thẩm quyền sự cố & vận hành ✅

```
Operator được phát FREEZE_CHANNEL khẩn cấp không chờ owner?  [x] Có
Cửa sổ owner xác nhận freeze:  24 giờ

Danh sách human_actor (allowlist):
  identity: owner@<domain>      vai trò: OWNER      [XÁC NHẬN — con số 2]
  identity: operator@<domain>   vai trò: OPERATOR
  (thêm dần; mọi identity phải là người thật, is_service = 0)

SAMPLING_MIN_CLEAN_STREAK:      15
KILL_CRITERIA_VIDEO_COUNT:      12
```

**Lý do cho operator freeze khẩn cấp.** Thiệt hại của một freeze thừa là vài giờ chậm; thiệt hại của việc chờ owner khi kênh đang bị enforcement là không đảo ngược được. Bất đối xứng đó quyết định. Rã đông thì ngược lại — owner-only, và còn đòi ≥1 learning đã promote (trigger schema cưỡng chế).

**Sampling ở 15 video liên tiếp sạch**, cộng ba điều kiện kép trong `10 §5`. Lưu ý: sampling chỉ áp cho phần review nội dung của HP-03. HP-02 (Editorial Imprint), AUTHORIZE_PUBLISH, và disclosure **không bao giờ** lấy mẫu.

**Kill criteria 12 video.** Đủ để phân biệt tín hiệu khỏi nhiễu ở nhịp 2 video/tuần (6 tuần), chưa đủ lâu để chôn vốn vào một ngách hỏng.

```ts
OPERATOR_EMERGENCY_FREEZE: true
FREEZE_OWNER_CONFIRM_HOURS: 24
SAMPLING_MIN_CLEAN_STREAK: 15
KILL_CRITERIA_VIDEO_COUNT: 12
```

---

## §11 · Trần chú ý owner ✅ **[XÁC NHẬN — con số 3]**

```
OWNER_WEEKLY_CEILING_MIN = 300 phút/tuần
```

**Kiểm tra chéo với §1** — ở nhịp mục tiêu 3 kênh × 2 video/tuần = 6 video/tuần:

| Điểm chạm | Tính toán | Phút/tuần |
|---|---|---|
| HP-02 Editorial Imprint | 6 video × 15 phút | 90 |
| HP-03 Release + Publish | 6 video × 7 phút | 42 |
| HP-04 Từ chối có nhãn | ~1,5 lần × 12 phút | 18 |
| HP-05 Promote learning | nhịp tuần | 20 |
| HP-06 Disclosure | 6 × 1 phút (mặc định BẬT nên nhanh) | 6 |
| **Tổng** | | **176** |

Còn ~124 phút biên cho HP-07 (sự cố), HP-01 (nhịp quý), và rework. Trần 300 là bền vững cho một người.

**Cưỡng chế.** Orchestrator không mở package mới nếu tải điểm chạm dự kiến của tuần vượt trần. Đây là ràng buộc sản xuất ngang với budget — nếu nhà máy chạy nhanh hơn khả năng phán quyết của người, gate sẽ trôi thành phê duyệt hình thức, và đó là chính xác cách mất monetization.

```ts
OWNER_WEEKLY_CEILING_MIN: 300
QUEUE_AGE_ALERT_HOURS: 48
```

---

## Các xác nhận owner

Agent chạy được ngay với giá trị trên. Ba mục dưới đây là cam kết thật của owner — nếu lệch, sửa và báo agent:

| # | Mục | Giá trị đang đặt | Vì sao chỉ owner biết |
|---|---|---|---|
| 1 | `SPEND_CEILING_PER_VIDEO_USD` và các trần §3 | **CONFIRMED 2026-08-23** — $30 / video · $400 qualification · $350 Track G | Owner đã xác nhận; WP-08 và WP-12B được mở khóa với các trần này |
| 2 | `human_actor` allowlist §10 | placeholder `owner@<domain>` | Cần identity thật (email/key) để trigger P10 hoạt động; không có thì mọi lệnh owner bị abort |
| 3 | `OWNER_WEEKLY_CEILING_MIN` §11 + audio mẫu §7 | 300 phút/tuần; audio chưa có | Thời gian thật owner dành được mỗi tuần, và việc thu 10 mẫu audio (một buổi) |

Mục 1 đã đóng. Mục 2 chặn WP-28; mục 3 chặn WP-15 và Track G G-02.

---

## Tóm tắt cho agent

```
✅ ĐÃ CHỐT, chạy được ngay: §1 §2 §4 §6 §8 §9 §10 §11
⚠️  CHỐT CÓ ĐIỀU KIỆN:       §5 (Track G không cần)
🔶 SINH RA TỪ TRACK G:        §6 anchor · §7 gold set
🔴 CẦN OWNER CUNG CẤP:        §7 audio mẫu (chặn WP-15)

BẮT ĐẦU NGAY: WP-00 → WP-11 không bị chặn bởi bất kỳ mục nào ở trên.
```
