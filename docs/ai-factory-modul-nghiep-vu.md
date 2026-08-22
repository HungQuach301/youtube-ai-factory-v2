# AI Factory — Đặc tả module: Nghiệp vụ & Sản xuất

Tập 2/2. Bao gồm 25 module thuộc sáu nhóm: Intelligence & Truth, Creative Design, Production Design, Compilation & Media, Measurement & Assurance, Publishing & Learning.

Khuôn mô tả giống Tập 1: **Mục đích · Tính năng · Quy trình · Công cụ & kỹ thuật · Tiêu chuẩn · Giao diện & dữ liệu · Acceptance**.

---

# NHÓM 6 — INTELLIGENCE & TRUTH

## INT-01 · Market & Audience Intelligence *(Stage 01)*

**Mục đích.** Xác định video này phục vụ ai, giải quyết nhu cầu gì, và phải vượt qua benchmark nào — bằng bằng chứng có thể tái lập.

**Tính năng.**
- Thu thập tín hiệu cầu có cửa sổ tươi mới
- Chuẩn hóa audience job về format kiểm được bằng máy
- Snapshot nội dung nguồn thật, không chỉ URL
- Ghi nhận rủi ro thị trường và độ bất định

**Quy trình.**
```
1. đọc Channel Strategy đang hiệu lực (version cụ thể)
2. thu thập demand signals → snapshot vào R2 qua CORE-06
3. chuẩn hóa audience job:
   "Khi [tình huống], tôi muốn [động cơ], để tôi có thể [kết quả]"
4. xác định pain point / curiosity / knowledge gap
5. xác định episode opportunity + differentiated viewer promise
6. ghi market risk và uncertainty
7. bind vào đúng episode — cấm sao chép research của tập khác
```

**Công cụ & kỹ thuật.** Web/search/retrieval adapter với nguồn được pin; structured output JSON Schema strict mode, `additionalProperties: false`, `required` đầy đủ.

**Tiêu chuẩn — cửa sổ tươi mới.**

| Loại tín hiệu | Cửa sổ tối đa |
|---|---|
| Demand signal (trend, search volume) | 90 ngày |
| Competitive landscape | 180 ngày |
| Dữ liệu định lượng ngành | 12 tháng, bắt buộc as-of date |
| Quy định / chính sách | Không giới hạn, nhưng phải kiểm hiệu lực hiện hành |

**Lint audience job:** cả ba thành phần phải có; mỗi thành phần ≥5 từ; **không được chứa tên chủ đề video** — quy tắc này chặn việc mô tả nội dung thay vì mô tả nhu cầu.

**Acceptance.** Xóa URL nguồn khỏi internet → dossier vẫn tái lập được; audience job pass lint; mọi assertion quan trọng có nguồn hoặc qualifier.

---

## INT-02 · Reference Intelligence & Anti-copy *(Stage 02)*

**Mục đích.** Học pattern thành công mà không sao chép biểu đạt được bảo hộ, và đo được mức khác biệt thay vì chỉ khai báo.

**Tính năng.**
- Phân nhóm reference: proven / recent / outlier
- Parity matrix và gap matrix đối xứng
- Anti-copy thành phép đo, không phải khai báo
- Differentiation score chống đồng hóa

**Tiêu chuẩn — anti-copy đo được.**

| Kiểm tra | Kỹ thuật | Ngưỡng |
|---|---|---|
| Trùng văn bản | n-gram shingling script ↔ transcript reference | Không có 7-gram trùng; Jaccard trên 5-gram ≤0.15 |
| Trùng cấu trúc | Levenshtein trên chuỗi beat type | ≥40% khác biệt |
| Trùng thumbnail | pHash 64-bit | Hamming distance ≥20 bit |
| Trùng title | Embedding cosine similarity | ≤0.85 với mọi title trong reference set |

**Differentiation score.** Nhúng vector `(hook_type, narrative_device, visual_identity, claim_angle)` của champion route; tính khoảng cách tới **centroid** của reference set. Route quá gần trung tâm nghĩa là tuân thủ tốt nhưng không có lý do để được xem. Ngưỡng tối thiểu bắt buộc, kiểm ở Stage 04 và tái kiểm ở Stage 14.

**Acceptance.** Mọi reference có provenance và ngày truy cập; parity/gap analysis đối xứng; differentiation score vượt ngưỡng trước khi champion được seal.

---

## TRU-01 · Claim Graph *(Stage 03)*

**Mục đích.** Tạo tầng sự thật cho toàn bộ script và visuals. Là module nền tảng nhất về mặt nội dung — mọi narration, diagram và motion phải diễn đạt cùng một mệnh đề.

**Tính năng.**
- Phân tầng chất lượng nguồn
- Phân loại claim theo type với luật qualifier riêng
- Schema cưỡng chế cho claim định lượng
- Ledger mâu thuẫn có trạng thái giải quyết
- Claim ID bất biến dùng xuyên Stage 05–09

**Tiêu chuẩn — thang chất lượng nguồn.**

| Tier | Loại nguồn | Quyền |
|---|---|---|
| T1 | Văn bản pháp quy, ngân hàng trung ương, cơ quan thống kê, tài liệu gốc của tổ chức | Nguồn cuối cho mọi claim |
| T2 | Peer-reviewed, báo cáo chính thức có phương pháp công bố | Nguồn cuối |
| T3 | Báo chí chất lượng có dẫn nguồn gốc | Nguồn cuối cho claim không critical |
| T4 | Blog, forum, nội dung tổng hợp | **Chỉ để định vị T1/T2**, không được là nguồn cuối |

Gate: 100% claim `CRITICAL` phải có ≥1 nguồn T1 hoặc T2.

**Tiêu chuẩn — phân loại claim.**

| Type | Luật bắt buộc |
|---|---|
| `FACT` | Nguồn T1/T2 + as-of date |
| `ESTIMATE` | Nêu khoảng, phương pháp, nguồn |
| `MECHANISM` | Nguồn mô tả cơ chế; cấm suy diễn nhân quả không nguồn |
| `INTERPRETATION` | Bắt buộc ngôn ngữ đánh dấu ("có thể hiểu là") |
| `PREDICTION` | Bắt buộc qualifier; **cấm dùng ở Stage 09 làm visual assertion** |

**Schema claim định lượng.**
```
numeric_claim {
  value, unit, magnitude_scale,
  as_of_date,        // bắt buộc
  jurisdiction,      // bắt buộc
  variability_note,  // bắt buộc nếu giá trị đổi theo thời gian
  source_ids[]       // ≥1; tier ≥2 nếu critical
}
```
Kiểm bằng **parser xác định**: đơn vị thuộc từ điển đóng; magnitude hợp lệ với đơn vị; as_of_date trong quá khứ. Cấm dùng LLM để kiểm số.

**Acceptance.** Không còn unsupported critical claim; claim ID ổn định qua mọi stage downstream; contradiction ledger có trạng thái giải quyết cho mọi mục.

---

## TRU-02 · Terminology & Safety Lint *(Stage 03/06)*

**Mục đích.** Quản lý từ vựng chuyên ngành với phát âm, và cưỡng chế an toàn nội dung bằng kiểm tra xác định thay vì chờ critic ở Stage 14.

**Tính năng.**
- Ledger thuật ngữ: term / plain meaning / institutional role
- Sinh phiên âm IPA và ARPAbet cho mọi thuật ngữ, tên riêng, viết tắt
- Xuất lexicon cho TTS và cho forced aligner
- Advice lint xác định

**Liên kết quan trọng.** Ledger này là **đầu vào của forced alignment ở MSR-01**. Không có custom lexicon, aligner sẽ báo mismatch trên thuật ngữ chuyên ngành và gate `<1%` trở nên vô nghĩa.

```
terminology_entry → { ipa, arpabet }
                 ├──▶ TTS pronunciation dictionary (MED-03)
                 └──▶ Forced aligner custom lexicon (MSR-01)
```

**Advice lint — kỹ thuật xác định.**
```
Chặn ở mức P0 khi phát hiện:
  • từ điển mẫu câu mệnh lệnh ngôi hai + hành động tài chính
    ("bạn nên mua", "hãy chuyển sang", "đây là lúc để đầu tư")
  • đại từ ngôi hai + động từ giao dịch trong cùng mệnh đề
  • câu điều kiện hứa hẹn kết quả tài chính
```
Chạy ở cả Stage 03 (claim) và Stage 06 (narration). Không phải cảnh báo — chặn.

**Acceptance.** Mọi thuật ngữ có phiên âm; lexicon xuất được cho cả hai đích; advice lint bắt được 100% mẫu trong bộ test đối kháng.

---

# NHÓM 7 — CREATIVE DESIGN

## CRE-01 · Creative Route Tournament *(Stage 04)*

**Mục đích.** Chọn hướng sáng tạo tốt nhất từ nhiều phương án thật sự khác biệt, với cơ chế chống tự sinh tự duyệt.

**Tính năng.**
- Cưỡng chế đa dạng bằng taxonomy đóng
- Bảy critic độc lập, blind, rubric anchored
- Bảo tồn route bị loại làm bằng chứng
- Chốt packaging contract cùng route

**Tiêu chuẩn — taxonomy đóng.**
```
hook_type ∈ { cold_open_anomaly, direct_question, stakes_statement,
              in_medias_res, counterintuitive_claim, visual_reveal }

narrative_device ∈ { chronological, mystery_reveal, comparison,
                     case_study, mechanism_teardown, counterfactual }
```
Ràng buộc: bốn route phải khác nhau **trên cả hai trục** — không hai route nào trùng cặp `hook_type × narrative_device`. Lint xác định chạy trước khi cho phép chấm.

**Ngưỡng.** Champion **≥95**, không phải 92. Lý do: release floor ở Stage 14 là 92; giai đoạn concept phải có headroom cho hao hụt thực thi.

**Chống tự sinh tự duyệt.** Xem EXE-03. Sinh ở temperature cao, chấm ở temperature 0, khác system prompt, blind, bảy call độc lập.

**Packaging contract chốt tại đây.** Title và thumbnail concept phải được quyết cùng creative route — để video giao đúng lời hứa, thay vì đóng gói lời hứa quanh video đã hoàn thành. Đây là thay đổi contract: rẻ khi làm bây giờ, breaking change nếu làm sau.

**Acceptance.** Bốn route pass lint đa dạng; champion ≥95; rejected routes có lý do loại được lưu; packaging contract seal cùng creative contract.

---

## CRE-02 · Story Architecture & Prediction *(Stage 05)*

**Mục đích.** Thiết kế trải nghiệm hiểu và cảm nhận của người xem, và sinh dự báo hiệu suất — module này là nơi vòng lặp học bắt đầu.

**Tính năng.**
- Story clock với beat có state assertion tường minh
- Curiosity loop có ID, mở–đóng kiểm được
- Claim-beat mapping
- Sinh `PredictedPerformanceArtifact`

**Cấu trúc beat.**
```
beat {
  id, t_start, t_end, beat_type,
  knowledge_before[],     // mệnh đề người xem đã biết
  knowledge_after[],      // PHẢI khác knowledge_before
  expectation_delta,
  claim_ids[],
  loop_opened: loop_id?,
  loop_closed: loop_id?,
  visual_intent,          // để Stage 08 kiểm semantic alignment
  prosody_intent          // để Stage 07A/10 kiểm audio direction
}
```

**Lint xác định.**

| Kiểm tra | Ngưỡng |
|---|---|
| `knowledge_after` ≠ `knowledge_before` | Mọi beat — bắt được beat rỗng, exposition lặp, ending chỉ tóm tắt |
| Loop mở phải có loop đóng | 100%; khoảng cách ≤40% tổng thời lượng |
| Entity mới trong cửa sổ trượt 15s | ≤2 nếu không có recap beat |
| Hook beat kết thúc | ≤15 s |
| Promise beat | ≤30 s |
| Midpoint re-hook | Trong [40%, 60%] |
| Payoff bắt đầu | Trong 20% cuối |
| Tổng thời lượng | 480–720 s |

**Mô hình dự báo.**
```
risk(t) = w₁·(thời gian kể từ state-change gần nhất)
        + w₂·(mật độ entity mới trong cửa sổ 15s)
        + w₃·(khoảng cách tới curiosity loop đang mở)
        + w₄·(độ dài đoạn không đổi archetype)

retention_pred(t) = baseline(channel, pillar, length) − Σ risk
```
`w` khởi tạo bằng phán đoán; sau 5–8 video hiệu chỉnh bằng hồi quy trên dữ liệu Stage 16. **Phải seal ngay từ video #1 kể cả khi mô hình còn thô** — không có prediction thì Stage 16 không có gì để so và vòng lặp học không tồn tại.

**Acceptance.** Mọi beat pass state-change lint; mọi loop đóng; `PredictedPerformanceArtifact` được seal với canonical hash.

---

## CRE-03 · Script Development *(Stage 06)*

**Mục đích.** Tạo narration tự nhiên, chính xác và sẵn sàng biểu diễn, với mọi số liệu truy được về claim.

**Tính năng.**
- Viết theo story architecture, bind từng đoạn với claim ID
- Number audit xác định
- Performance layer: energy, pace, emphasis, pause, pronunciation
- Tính thời lượng bằng âm tiết

**Tiêu chuẩn — nhịp nói.**

| Đoạn | WPM | Quy đổi syllables/s (EN) |
|---|---|---|
| Tổng thể | 140–160 | 3.3–3.8 |
| Hook / escalation | 150–170 | 3.5–4.0 |
| Dense mechanism | 125–150 | 2.9–3.5 |
| Payoff | 135–155 | 3.2–3.6 |

**Đo bằng âm tiết, không bằng từ.** Word count sai lệch lớn khi mật độ từ đa âm tiết cao — đúng trường hợp nội dung tài chính ("authorization", "settlement", "reconciliation"). Dùng syllable/phoneme count từ lexicon của TRU-02.

**Tiêu chuẩn — cấu trúc câu.**

| Chỉ số | Giá trị |
|---|---|
| Median sentence | 10–18 từ; review nếu >24 |
| Breath group | 5–12 từ hoặc 2.5–5 giây |
| Entity mới | ≤2 trong 10–15 giây nếu không có recap/map |

**Number audit — xác định, không dùng LLM.** Mọi token số phải: (a) trace về một `claim_id` có `numeric_claim`; (b) khớp value/unit/magnitude sau chuẩn hóa cách đọc; (c) có as-of date được nói ra hoặc hiển thị trên màn hình (bind vào ShotCue).

**Đồng bộ chuẩn lên V281.** Đây là module gánh phần lớn việc đóng khoảng cách version. Bổ sung tiêu chí tương ứng với từng critic Stage 14 vào bước lint của stage này — nếu bỏ qua, revision mới lặp lại thất bại của 15 master trước.

**Acceptance.** 100% số liệu trace được; script pass toàn bộ lint nhịp và cấu trúc; advice lint sạch; checksum narration được seal.

---

## CRE-04 · Packaging Contract *(Stage 04 → 11)*

**Mục đích.** Quản lý title, thumbnail và lời hứa với người xem như một hợp đồng có lineage — thành phần quyết định CTR mà kiến trúc hiện tại bỏ trắng.

**Tính năng.**
- Chốt title và thumbnail concept ở Stage 04
- Thumbnail tournament sau Stage 06
- Metadata artifact sau Stage 11 (có timing thật)
- Kiểm nhất quán lời hứa ↔ nội dung

**Quy trình.**
```
Stage 04:  packaging_contract { title_candidates[], thumbnail_concept,
                                viewer_promise }  ← seal cùng creative contract
Stage 06+: thumbnail tournament (cùng cơ chế EXE-03)
           → rights lineage đầy đủ, mobile legibility gate
Stage 11:  metadata { description, tags, chapters, playlist, end_screen }
           chapters DERIVE từ story clock, không viết tay
Stage 14:  critic thứ 9 — Packaging/CTR, có floor riêng
```

**Tiêu chuẩn.**

| Kiểm tra | Ngưỡng |
|---|---|
| Thumbnail mobile legibility | Text x-height ≥10 px ở 25% scale; contrast ≥4.5:1 |
| Thumbnail rights | Cùng chuẩn với asset video (PRV-03) |
| Title ↔ nội dung | Semantic consistency check với `viewer_promise` |
| Chapter | Derive từ beat boundary, không lệch >2 s |
| Anti-copy title | Cosine ≤0.85 với reference set (INT-02) |

**Acceptance.** Packaging contract seal trước script; thumbnail pass rights và legibility gate; chapters khớp story clock; critic thứ 9 có verdict riêng.

---

# NHÓM 8 — PRODUCTION DESIGN

## DES-01 · Channel Identity Contract

**Mục đích.** Quản lý giọng, hệ hình ảnh, từ vựng và nhạc như **tài sản cấp kênh**, được video kế thừa chứ không quyết định lại. Đây là điều kiện để vận hành đa kênh.

**Cấu trúc.**
```
ChannelIdentityContract@v {
  voice:  { voice_id, model, settings_hash, pronunciation_lexicon_ref,
            voice_fingerprint_r2_key }
  visual: { palette, type_scale, motion_language, layout_grid,
            lower_third_spec, safe_zone_spec }
  music:  { genre_range, instrumentation, tempo_range, cue_library_ref }
  terminology: { ledger_ref }
  packaging:   { thumbnail_style_spec, title_pattern_constraints }
}
```

**Tác động lên phạm vi qualification.** Nếu identity ở cấp kênh, archetype được qualify **một lần dùng cho N video**; nếu ở cấp video, phải qualify lại mỗi lần. Quyết định này phải chốt **trước FP4/FP5** vì nó đổi bản chất của việc cần qualify.

**Voice fingerprint.** Lưu mẫu chuẩn 30 giây + embedding giọng. Nếu provider deprecate voice, đây là cơ sở tìm giọng thay thế gần nhất và đo độ lệch — bảo hiểm tài sản thương hiệu cho kênh nhiều video.

**Acceptance.** Stage 07A/07B chuyển từ "thiết kế" sang "chuyên biệt hóa trong ràng buộc kế thừa"; thử đổi voice ID ở cấp video → bị từ chối trừ khi có exception của owner.

---

## DES-02 · Voice & Sound Design *(Stage 07A)*

**Mục đích.** Thiết kế soundscape contract: một narrator identity, chiến lược phân đoạn TTS, thiết kế nhạc/SFX/ambience/silence và ducking. Đây là design stage — chưa tổng hợp audio đầy đủ.

**Tính năng.**
- Kế thừa voice identity từ DES-01
- Thiết kế phân đoạn TTS theo ranh giới ngữ nghĩa
- Pronunciation dictionary từ TRU-02
- Đặt chức năng cho từng music cue

**Tiêu chuẩn — pause taxonomy.**

| Loại pause | Thời lượng |
|---|---|
| Micro-emphasis | 80–200 ms |
| Clause | 150–300 ms |
| Sentence | 250–500 ms |
| Beat reset | 500–900 ms |
| Dramatic | ≤1.2 s |

Provider speed: 0.95–1.08. Một narrator cho toàn video.

**Chức năng music cue.** Mỗi cue phải khai báo đúng một chức năng: `curiosity | orientation | mechanism | escalation | reveal | consequence | payoff | silence`. Cue không có chức năng bị từ chối — đây là cách chặn nhạc nền vô nghĩa.

**Tiêu chí chọn `TBD_PRODUCTION_AUDIO`.**

| Tiêu chí | Lý do bắt buộc |
|---|---|
| License cho phép monetization YouTube | Không có thì không dùng được |
| Cơ chế clear Content ID / whitelist kênh | Tránh claim tự động mất doanh thu |
| Truy cập **stem-level** | Cần cho arrangement theo beat và ducking chính xác |
| Thư viện đủ sâu cho 15+ video cùng identity | Kênh cần nhất quán âm nhạc |
| Metadata BPM/key/mood có cấu trúc | Cần cho cue placement tự động |
| Điều khoản ổn định, không hồi tố | Rủi ro pháp lý về sau |

Quyết định này là thương mại, không phải kỹ thuật — tách khỏi FP5 và chạy song song ngay.

**Acceptance.** Soundscape contract seal với `voice_settings_hash`; mọi cue có chức năng; segmentation plan pass ràng buộc ranh giới ngữ nghĩa.

---

## DES-03 · Visual Grammar & Source Routing *(Stage 07B)*

**Mục đích.** Quyết định từng đoạn dùng footage thật, đồ họa tự dựng hay kết hợp, và đóng băng ngữ pháp hình ảnh cho toàn video.

**Tính năng.**
- Luật định tuyến xác định dẫn trước, LLM xử lý phần còn lại
- Quy tắc phân loại motion class rời nhau
- Layer stack và motion function cho từng layer
- Ràng buộc text và mobile

**Luật định tuyến — xác định.**
```
if claim_type ∈ {MECHANISM, PROCESS} và không có observable referent
    → MAKE
elif claim cần bằng chứng quan sát được (địa điểm, vật thể, hành vi thật)
    → SOURCE
elif cần cả bằng chứng quan sát và lớp giải thích
    → HYBRID
```

**Quy tắc phân loại motion class — ba nhóm rời nhau.** Đây là chỗ bịt kẽ hở khiến bộ tỷ lệ 35/45/20 bị bẻ.

| Nhóm | Định nghĩa | Cách đo |
|---|---|---|
| `CAMERA_ONLY` | Thông tin không đổi theo thời gian; chỉ pan/zoom | Optical flow gần thuần global; entropy nội dung theo thời gian thấp |
| `LAYERED_SEMANTIC` | Thông tin đổi do layer authored | Scene graph có event thay đổi trạng thái |
| `SOURCE_SEMANTIC` | Chuyển động mang nghĩa nằm trong source video | Optical flow có thành phần local đáng kể sau khi trừ global |

Shot có cả camera motion và layer animation → phân vào `LAYERED_SEMANTIC` (nguồn nghĩa là layer). Quy tắc này viết vào standard, không để phán đoán từng lần.

**Tám visual archetype.** Transaction state proof · Process route · Data visualization · Documentary live action · Source-authored hybrid · Abstract authored · Rights-sensitive · Mobile text-intensive.

**Chiến lược qualification.** Qualify **theo thứ tự phụ thuộc**, đúng những archetype ShotCueProgram của video #1 thực sự dùng — không big-bang cả tám.

**Acceptance.** Mọi shot có route và motion class xác định; route không đổi được ở Stage 09; visual grammar seal với hash.

---

# NHÓM 9 — COMPILATION & MEDIA

## CMP-01 · ShotCueProgram Compiler *(Stage 08)*

**Mục đích.** Biến script, sound design và visual grammar thành chỉ dẫn thực thi được, với acceptance test sinh tự động.

**Tính năng.**
- Resolve Standard Registry cho từng clause
- Bind narration clause và claim ID
- Sinh acceptance test cho ba temporal state
- Lint timeline bằng interval tree

**Tiêu chuẩn — adaptive validation (thay cho hard limit 90–180).**

| Ràng buộc | Giá trị |
|---|---|
| Thời lượng mỗi shot | 3–20 s |
| Median shot duration | 6–12 s |
| Shot liên tiếp cùng archetype | Tối đa 2 |
| Mỗi claim CRITICAL | ≥1 shot bind |
| Khoảng không đổi archetype | ≤25 s |
| Tổng thời lượng vs canonical | ±1 frame |

Hard limit 90–180 shots **phải bỏ**: fixture cho 80,252 s / 8 shots ≈ 10,0 s/shot; ngoại suy 480–720 s ra 48–72 shots, dưới floor 90 ở cả hai đầu.

**Acceptance test sinh tự động.**
```
ENTRY    t=t0     : element_set = E0, state = S0
MIDPOINT t=t0+Δ/2 : element_set ⊇ E0, ∃e: state(e) ≠ S0(e)   // phải có thay đổi
EXIT     t=t1     : element_set = E1, |E1 △ E0| ≥ 1          // phải khác entry
```
Đây là thứ biến "semantic motion" từ nhận định thành phép đo — và là điều Stage 09 phải chứng minh.

**Công cụ & kỹ thuật.** Interval tree cho lint gap/overlap (`O(n log n)`, xác định); schema lint; rights lint; fallback lint.

**Acceptance.** Zero gap, zero overlap, zero schema gap; mọi shot có ba assertion; tổng thời lượng khớp ±1 frame.

---

## MED-01 · Source Acquisition *(Stage 09)*

**Mục đích.** Thu nhận bytes thật từ nhà cung cấp stock với lineage rights đầy đủ và chi phí được kiểm soát.

**Tính năng.**
- Eligibility filter trước khi tải bytes
- Source tournament trên pixel thật
- Rights lineage đầy đủ theo PRV-03
- Perceptual dedup

**Eligibility filter — chạy trước khi tốn chi phí.**
```
lọc theo: duration ≥ shot_duration + biên
        · resolution ≥ 1920×1080
        · fps ∈ {24,25,30,50,60}
        · aspect ratio phù hợp
        · license_type tương thích mục đích
        · không watermark (kiểm metadata)
        · có thông tin provenance
→ chỉ tải bytes cho candidate qua được filter
```

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| Candidate mỗi shot cần source | 6–12 |
| Duplicate visual content | ≤2% (pHash 64-bit, Hamming ≤10, lấy mẫu 1 fps) |
| Cấm | Generic office/card/hand filler; meaningless generated image |
| Rights | 100% asset có `license_record` đầy đủ |

**Frame rate normalization.**
- Ưu tiên source 30/60 fps → decimate đơn giản
- 24/25 fps → `fps=30`, duplicate frame gây judder nhẹ, chấp nhận cho B-roll ngắn
- `minterpolate` chỉ cho shot dài có chuyển động mượt — rất đắt, có artifact trên cạnh phức tạp
- Ghi `source_fps` và `conversion_method` vào lineage để MSR-01 truy được nguyên nhân judder

**Acceptance.** Mọi asset có checksum, license và provenance; duplicate ≤2%; không tải bytes cho candidate bị filter loại.

---

## MED-02 · Layered Compositor *(Stage 09/11)*

**Mục đích.** Dựng hình ảnh nhiều lớp có chuyển động mang nghĩa. Đây là module có rủi ro throughput cao nhất toàn hệ thống.

**Vấn đề cần tránh.** Render từng frame bằng Sharp không khả thi ở quy mô: 10 s × 30 fps × 3 composition × ~60 shot ≈ **54.000 lần render frame** cho một video, chưa tính candidate bị loại.

**Kiến trúc lai — nguyên tắc: render pixel một lần, hoạt hóa bằng filter graph.**

| Loại chuyển động | Kỹ thuật | Chi phí |
|---|---|---|
| Layer tĩnh, pan/zoom | Sharp render **1 lần** → FFmpeg `zoompan` | Rất thấp |
| Fade, wipe, chuyển cảnh | FFmpeg `xfade`, `overlay` với biểu thức theo `t` | Rất thấp |
| Element xuất hiện/biến mất | `overlay` + `enable='between(t,a,b)'` | Thấp |
| Đường đi, chart động, morph | Headless Chromium + CSS/SVG animation, capture frame | Cao — chỉ khi cần |
| Composite nhiều layer | Một `filter_complex` graph duy nhất | Trung bình |

Chỉ rơi xuống render-per-frame khi filter graph không biểu diễn được.

**Tiêu chuẩn.**

| Chỉ số | Ngưỡng |
|---|---|
| Camera-only coverage | ≤35% |
| Layered semantic animation | ≥45% |
| Source video / B-roll | ≥20% |
| Treatments | Tối thiểu 3; mục tiêu 5–7 |
| Composition mỗi critical unit | ≥3 finished |
| Critical factual semantic fit | ≥94 |
| Normal semantic fit | ≥90 |
| Supporting dimensions | ≥86 |

**Benchmark bắt buộc trước FP4.** Đo thời gian và chi phí thật cho một shot đại diện của **mỗi trong 8 archetype**, ngoại suy full video. Nếu vượt ngân sách hoặc thời gian chấp nhận được, đổi kiến trúc trước, không phải sau.

**Acceptance.** Benchmark 8 archetype hoàn tất; tỷ lệ motion class đạt ngưỡng; mọi composition có checksum và scene graph.

---

## MED-03 · Narration Synthesis *(Stage 10)*

**Mục đích.** Tổng hợp narration dài không có seam, đúng phát âm, đúng nhịp.

**Kỹ thuật quan trọng nhất — request stitching.** ElevenLabs hỗ trợ truyền ngữ cảnh trước/sau (`previous_text` / `next_text`, hoặc `previous_request_ids`). Không dùng thì mỗi đoạn được tổng hợp như một câu độc lập và ranh giới đoạn sẽ có gãy prosody — nghe rõ trên nội dung dài.

**Quy tắc cắt đoạn.**
```
• cắt CHỈ ở ranh giới câu, xác định bằng parser câu, không đếm ký tự
• không cắt giữa: entity nhiều từ · chuỗi số · mệnh đề nhân quả
• mỗi đoạn 300–800 ký tự SAU KHI thỏa hai điều kiện trên
  (không thỏa → mở rộng đoạn, không cắt)
• luôn truyền 200–300 ký tự ngữ cảnh mỗi phía
```

**Tournament cho passage khó.** Sinh nhiều take cho: hook · number-heavy · dense mechanism · authorization/clearing/settlement · payoff. Chọn champion theo transcript match, pronunciation, prosody, naturalness.

**Tiêu chuẩn.** Chỉ regenerate section đã fail, không regenerate toàn bộ. Settings envelope hash bất biến trong toàn video.

**Acceptance.** Zero audible seam qua kiểm MSR-01; phoneme mismatch dưới ngưỡng đã hiệu chuẩn; voice identity nhất quán toàn video.

---

## MED-04 · Audio Mix & Mastering *(Stage 10)*

**Mục đích.** Đặt cue, trộn, và chuẩn hóa loudness đạt chuẩn phân phối.

**Tiêu chuẩn — đã đúng chuẩn nghề, giữ nguyên.**

| Chỉ số | Giá trị |
|---|---|
| Integrated loudness | −14 ±1 LUFS-I |
| True peak | ≤−1 dBTP |
| Loudness range | 4–8 LU |
| Narration trên music | Tối thiểu 10 LU, mục tiêu 12–16 LU |
| Music duck | 6–12 dB |
| Duck attack / release | 80–250 ms / 300–800 ms |
| Sample rate phân phối | 48 kHz |

**Ducking.** FFmpeg `sidechaincompress` với threshold/ratio/attack/release khớp bảng trên.

**Loudness normalization phải 2 pass.**
```
Pass 1: ffmpeg -af loudnorm=I=-14:TP=-1:LRA=7:print_format=json   → đo
Pass 2: ffmpeg -af loudnorm=I=-14:TP=-1:LRA=7:measured_I=…:linear=true
```
Một pass dùng chế độ động, gây pumping và không đạt chính xác target. Hai pass cho linear gain, chính xác và không biến dạng.

**A/V sync theo archetype** — thay cho ngưỡng chung 120 ms:

| Archetype | Dung sai |
|---|---|
| Documentary live action (có lip movement) | ≤45 ms |
| Source-authored hybrid | ≤80 ms |
| Đồ họa authored | ≤120 ms |

**Cấm.** Procedural tone hoặc diagnostic beep làm production audio.

**Acceptance.** Đo BS.1770 đạt mọi ngưỡng; A/V sync đạt theo archetype; cue sheet đầy đủ; stems seal.

---

## MED-05 · Edit & Composition *(Stage 11)*

**Mục đích.** Tạo bản dựng hoàn chỉnh hướng khán giả từ các package đủ điều kiện.

**Tính năng.**
- EDL bất biến theo định dạng chuẩn
- Caption sinh từ forced alignment
- Kiểm near-static, duplicate, safe zone
- Picture lock và mix freeze

**Dùng OpenTimelineIO (OTIO) thay cho EDL schema riêng.** Lợi ích: mở đường cho công cụ dựng ngoài khi cần can thiệp thủ công, audit bằng công cụ chuẩn, không phải tự bảo trì định dạng timeline.

**Caption sinh từ forced alignment, không từ script.** Caption sinh từ script sẽ lệch khi TTS đọc nhanh/chậm khác dự tính. Dùng word-level timestamp từ aligner (MSR-01) → caption khớp audio thật.

**Cảnh báo về ràng buộc caption ≤5 từ.** 600 s ở 150 WPM ≈ 1.500 từ ≈ **300 caption event**; mỗi event là một điểm có thể lệch sync. Cân nhắc nới lên 7 từ cho đoạn tốc độ cao, hoặc chuyển sang đơn vị theo breath group thay vì đếm từ cứng. Đo tác động trước khi khóa.

**Near-static detection.**
```
Lấy mẫu frame mỗi 500 ms
SSIM(frame[i], frame[i−1]) > 0.98 liên tục > 7 s → vi phạm
Trừ shot được khai báo static có chủ đích ở Stage 08
```

**Safe zone kiểm bằng bbox, không bằng vision model.** Compositor biết chính xác vị trí mọi text element — kiểm hình học, kết quả xác định và miễn phí. Chỉ dùng vision model cho occlusion do vật thể trong footage che.

**Acceptance.** Full canonical-duration coverage; duplicate ≤2%; không near-static vi phạm; không debug ID / bounding box / watermark / template residue.

---

## MED-06 · Master Render & Archive *(Stage 13)*

**Mục đích.** Tạo master bất biến hai lớp và đối soát lưu trữ.

**Kiến trúc hai lớp — sửa lỗi dùng codec phân phối làm codec master.**

| Lớp | Định dạng | Mục đích |
|---|---|---|
| **Archival master** | FFV1 trong MKV (lossless, mã nguồn mở) hoặc ProRes 422 HQ; audio PCM 48 kHz | Nguồn chân lý, tái sử dụng, xuất lại 4K/re-frame về sau |
| **Distribution render** | VP9 hoặc AV1 + Opus, 1080p30, Rec.709 | Bản giao YouTube |

Cả hai đều checksum, đều lưu R2 + Drive; lineage ghi rõ distribution derive từ archival.

**Profile distribution.** 16:9 · 1920×1080 · 30 fps progressive · Rec.709 · 48 kHz · A/V duration trong ±1 frame.

**Checksum hai mức.**
```
File-level:   sha256 toàn file       → lỗi truyền/lưu trữ
Stream-level: ffmpeg -f framemd5     → lỗi nội dung, độc lập với container
```
Chỉ hash file không phân biệt được "container khác" với "nội dung khác" — quan trọng khi đối soát R2 ↔ Drive vì Drive có thể đổi metadata container.

**Đối soát R2 ↔ Drive.** Drive dùng MD5 cho file nhỏ nhưng multipart cho file lớn — không so trực tiếp với sha256. Cần tải về và hash lại, hoặc lưu sẵn cả hai giá trị trong ledger.

**Acceptance.** Archival và distribution đều seal; framemd5 khớp giữa R2 và Drive; probe xác nhận đúng profile.

---

# NHÓM 10 — MEASUREMENT & ASSURANCE

## MSR-01 · Deterministic Measurement *(Stage 09/10/11/12)*

**Mục đích.** Mọi phép đo có thể tính chính xác. Nguyên lý P6: không dùng LLM ở nơi công cụ xác định đo chính xác hơn.

**Bộ phép đo.**

| Phép đo | Công cụ / lệnh |
|---|---|
| Black frame | `blackdetect=d=0.1:pix_th=0.10` |
| Freeze frame | `freezedetect=n=0.001:d=2` |
| Silence | `silencedetect=n=-50dB:d=0.5` |
| Clipping | `astats=metadata=1` → `Peak_level`, `Flat_factor` |
| Loudness | `ebur128` / `loudnorm` 2-pass |
| Drop frame | `ffprobe -count_frames` vs `duration × fps` |
| Stream profile | `ffprobe -show_streams` → codec, profile, pix_fmt, color primaries |
| Forced alignment | WhisperX (large-v3) hoặc MFA + custom lexicon từ TRU-02 |
| Seam | Cross-correlation 100 ms + MFCC distance + F0 continuity (bước >2 semitone → gãy) |
| Semantic motion | Global motion estimation → dense optical flow (Farnebäck) → residual energy |
| Duplicate | pHash 64-bit, Hamming ≤10, lấy mẫu 1 fps |
| Near-static | SSIM giữa frame cách 500 ms |
| Mobile legibility | x-height pixel ở 25% scale + contrast ratio WCAG |
| Safe zone | Hình học bbox từ compositor metadata |
| Timeline lint | Interval tree |

**Hiệu chuẩn bắt buộc — gate `transcript mismatch <1%`.**
```
1. Pin công cụ: WhisperX (large-v3) hoặc MFA
2. Nạp custom lexicon từ terminology ledger
3. Dùng FORCED ALIGNMENT, không free-form ASR
   — aligner biết trước text đúng, chỉ tìm timing → bài toán dễ hơn nhiều
4. CALIBRATE: chạy trên 10–15 mẫu audio người đọc chuẩn → đo error floor
5. Ngưỡng thật = max(1%, error_floor × 2)
6. So sánh ở mức PHONEME, không mức từ
   → tách "TTS đọc sai âm" khỏi "aligner nghe nhầm"
```
Không có bước 4, gate không phân biệt được lỗi TTS với lỗi của chính công cụ đo — WER của ASR phổ thông trên thuật ngữ tài chính thường **cao hơn** chính ngưỡng 1%.

**Mobile QA 25% scale — đo được thay vì cảm quan.** Downscale về 480×270; x-height ≥10 px; contrast ≥4.5:1 (text thường) hoặc ≥3:1 (text lớn).

**Acceptance.** Mọi ngưỡng có error floor đã đo; zero black/drop/freeze/clipping defect; caption và safe-zone PASS.

---

## MSR-02 · Perceptual Assurance Panel *(Stage 14)*

**Mục đích.** Bảo đảm độc lập bằng chín critic mù chéo trên cùng một master checksum. Chỉ chạy sau khi M0 và M1 sạch.

**Chín critic.** Executive Producer · Story & Retention · Visual Direction · Semantic Alignment · Audio Direction · Audience Simulation · Competitive Editor · Truth & Brand Safety · **Packaging/CTR (mới)**.

**Quy trình.**
```
1. mọi critic nhận cùng MỘT master checksum
2. full uninterrupted playback
3. ba temporal sample mỗi editorial shot
4. visual và audio critic chạy độc lập
5. không critic nào thấy kết quả critic khác
6. lưu từng verdict riêng
7. chỉ aggregate sau khi đủ chín
8. CẤM dùng QA findings để lặp prompt sửa cosmetic
```

**Release floor.**

| Dimension | Floor |
|---|---|
| Factual safety | ≥94 |
| Semantic narration–visual alignment | ≥94 |
| Voice intelligibility / consistency | ≥94 |
| Story / payoff | ≥90 |
| Visual direction | ≥90 |
| Music / sound design | ≥90 |
| Retention | ≥90 |
| Mobile legibility | ≥90 |
| Packaging / CTR *(mới)* | ≥90 |
| Executive Producer *(floor riêng, mới)* | ≥90 |
| Competitive Editor *(floor riêng, mới)* | ≥90 |
| Overall | ≥92 |
| P0 / Critical P1 | 0 / 0 |

**Độ tin cậy.** `temperature=0`, seed cố định. Khi điểm rơi vào `floor ± 3` → chạy lại n=3, lấy median, ghi variance. Critic có variance vượt ngưỡng phải requalify. Vùng biên là nơi sai số ngẫu nhiên quyết định pass/fail.

**Blind thật sự.** Ẩn khỏi input mọi metadata sản xuất: route nào thắng, capability nào dùng, đã revision lần thứ mấy.

**Rubric anchoring.** Mỗi dimension kèm 3 ví dụ mẫu (fail / borderline / pass). Không có anchor, thang 0–100 không ổn định và ngưỡng 92/94 mất ý nghĩa.

**Acceptance.** Critic đã qualified trên gold set (CAP-02); variance dưới ngưỡng; chín verdict độc lập được lưu riêng trước khi aggregate.

---

## MSR-03 · Gate Evaluation Engine *(xuyên suốt)*

**Mục đích.** Đánh giá và ghi nhận trạng thái mọi hard gate, cưỡng chế thứ tự M0 → M1 → M2.

**Tính năng.**
- Bốn trạng thái gate, không phải hai
- Thứ tự tầng bắt buộc
- Định tuyến gate về stage sở hữu
- Waiver có kiểm soát

**Tiêu chuẩn.**

| Trạng thái | Ý nghĩa | Xử lý ở DoR |
|---|---|---|
| `PASS` | Đã đo, đạt | Cho qua |
| `FAIL` | Đã đo, không đạt | Chặn |
| `NOT_EVALUATED` | Chưa đo | **Chặn** ở M0/M1 |
| `WAIVED` | Owner miễn có thời hạn | Cho qua; **cấm ở M0** |

Luật thứ tự: M2 chỉ chạy sau khi toàn bộ M0 và M1 ở trạng thái `PASS`. Chi phí M2 cao nhất và giá trị bằng không nếu M0/M1 chưa sạch.

**Báo cáo.** `NOT_EVALUATED` phải hiển thị tách khỏi `FAIL` — hai hồ sơ rủi ro khác nhau, không gộp vào một con số.

**Acceptance.** Gate M0 ở `NOT_EVALUATED` chặn được DoR; thử `WAIVE` gate M0 → từ chối bất kể actor; M2 không chạy được khi M1 còn `FAIL`.

---

# NHÓM 11 — PUBLISHING & LEARNING

## PUB-01 · Publishing *(Stage 15/16)*

**Mục đích.** Quản lý phát hành với quyền thuộc owner, tách rời khỏi việc chấp nhận master.

**Tính năng.**
- Hai lệnh riêng: `AUTHORIZE_RELEASE` và `AUTHORIZE_PUBLISH`
- Đối soát cuối trước khi mở cổng owner
- Bind YouTube video ID với master checksum
- Auto-publish luôn OFF

**Quy trình Stage 15.**
```
✓ Stage 00–14 eligible/frozen
✓ active provider requests = 0
✓ open exceptions = 0
✓ rights đối soát xong
✓ provider requests và costs đối soát xong
✓ mọi hash đối soát xong
✓ Stage 14 verdict bind với đúng master checksum
→ owner phát hành identity-bound AUTHORIZE_RELEASE
→ ghi append-only owner-ready assessment
```
`AUTHORIZE_PUBLISH` là lệnh **riêng biệt** — chấp nhận master và cho phép phát hành là hai quyết định khác nhau.

**Ngân sách chú ý.**

| Quyết định | Pilot | Scale |
|---|---|---|
| Publish | Owner 100% | **Owner 100% — không nới** |
| Promote learning | Owner 100% | **Owner 100% — không nới** |
| Rights exception | Owner 100% | **Owner 100% — không nới** |
| Stage 15 release gate | Owner toàn bộ | Sampling sau N video liên tiếp sạch |

**Acceptance.** Auto-publish OFF ở mọi package; master checksum duy nhất; owner identity và evidence hash được lưu.

---

## LRN-01 · Prediction Engine

**Mục đích.** Sinh và duy trì mô hình dự báo hiệu suất — thành phần khiến hệ thống có khả năng học.

**Tính năng.**
- Sinh `PredictedPerformanceArtifact` ở Stage 05, cập nhật ở Stage 11 với timing thật
- Hiệu chỉnh trọng số bằng dữ liệu thực
- Versioning mô hình dự báo

**Cấu trúc artifact.**
```
predicted_performance {
  model_version,
  retention_curve[],        // lưới 5% của thời lượng
  beat_risk[],              // risk score theo từng beat
  ctr_estimate,             // theo packaging contract
  canonical_hash, sealed_at
}
```

**Hiệu chỉnh.** `w` khởi tạo bằng phán đoán; `baseline_curve` lấy từ dữ liệu kênh tham chiếu. Sau 5–8 video, hồi quy trên dữ liệu thật. Mỗi lần hiệu chỉnh tạo `model_version` mới có lineage.

**Acceptance.** Mọi video có prediction seal trước publish; mô hình có version và lineage.

---

## LRN-02 · Analytics ETL & Deviation Analysis *(Stage 16)*

**Mục đích.** Nạp dữ liệu thật, so với dự báo, và chỉ ra **cấu trúc** nào dự báo sai.

**Metric cần lấy.**
- `audienceWatchRatio` theo `elapsedVideoTimeRatio` — đường cong retention tương đối
- `relativeRetentionPerformance` — so với video cùng độ dài trên nền tảng
- `impressions`, `impressionClickThroughRate` — hiệu quả packaging
- `averageViewDuration`, `averageViewPercentage`
- Traffic source breakdown — phân biệt hiệu ứng thuật toán với hiệu ứng nội dung

**Phân tích sai lệch.**
```
MAE = mean|retention_actual(t) − retention_predicted(t)|  trên lưới 5%
Beat-level error tại mỗi beat boundary   ◀── giá trị học cao nhất
CTR delta = actual − predicted, phân tách theo thumbnail variant
```
Sai số theo beat chỉ ra **cấu trúc** nào dự báo sai, không chỉ tổng thể — đây là thứ có giá trị học tập cao nhất.

**Tiêu chuẩn.** Chỉ dùng analytics thật; cấm simulated analytics. Cửa sổ nạp: 14–28 ngày sau publish. Bind `youtube_video_id` với đúng master checksum.

**Acceptance.** Baseline lưu theo strategy/content/capability version; MAE và beat-level error tính được cho mọi video đã publish.

---

## LRN-03 · Experiment Registry & Learning Promotion

**Mục đích.** Đảm bảo learning dựa trên bằng chứng đủ mạnh, và cung cấp đường đóng vòng có kiểm soát.

**Vì sao bắt buộc.** Với n=15 video, chênh lệch retention sẽ bị chi phối bởi nhiễu chủ đề và thumbnail chứ không bởi biến muốn học. Không có kỷ luật thực nghiệm, hệ thống sẽ **học sai — tệ hơn không học**.

**Cấu trúc.**
```
experiment {
  hypothesis,
  variable_tested,           // đúng MỘT biến
  variables_held_constant[], // bắt buộc liệt kê
  min_sample_size,
  decision_criterion,        // ngưỡng và hướng
  status: RUNNING | INSUFFICIENT_EVIDENCE | CONCLUDED
}
```

**Luật promote.** Learning chỉ được `PROMOTE` khi:
1. đạt cỡ mẫu tối thiểu;
2. kết quả nhất quán qua **≥2 video độc lập**;
3. owner phê duyệt bằng `PROMOTE_LEARNING` identity-bound.

Không đạt → `INSUFFICIENT_EVIDENCE`: giữ lại nhưng không tác động.

**Đóng vòng.**
```
PROMOTE_LEARNING(learning_id,
                 target: CHANNEL_STRATEGY | PRODUCTION_STANDARD,
                 owner_identity, evidence_hash)
→ tạo version MỚI có lineage, không sửa tại chỗ
```

**Ràng buộc kiến trúc.** Learning context **không được ghi trực tiếp** vào Standard Registry — mọi thay đổi đi qua owner command. Đây là ranh giới bounded context bắt buộc.

**Acceptance.** Không learning nào promote được khi chưa đạt cỡ mẫu; mọi promotion tạo version mới có lineage; Standard Registry không có đường ghi nào từ Learning plane ngoài `PROMOTE_LEARNING`.

---

# PHỤ LỤC — Ma trận module × stage

| Stage | Module chính | Module hỗ trợ |
|---|---|---|
| 00 | CORE-01, CORE-02, CORE-03 | CORE-05, PRV-02 |
| 01 | INT-01 | CORE-06, PRV-01 |
| 02 | INT-02 | CORE-06 |
| 03 | TRU-01, TRU-02 | CORE-06 |
| 04 | CRE-01, CRE-04 | EXE-03, INT-02 |
| 05 | CRE-02, LRN-01 | — |
| 06 | CRE-03 | TRU-02 |
| 07A | DES-02 | DES-01, EXE-03 |
| 07B | DES-03 | DES-01 |
| 08 | CMP-01 | CORE-05 |
| 09 | MED-01, MED-02 | EXE-03, EXE-04, MSR-01, PRV-03 |
| 10 | MED-03, MED-04 | EXE-03, EXE-04, MSR-01 |
| 11 | MED-05, CRE-04 | EXE-04, MSR-01 |
| 12 | MSR-01 | MSR-03 |
| 13 | MED-06 | EXE-04, CORE-01 |
| 14 | MSR-02 | CAP-02, MSR-03 |
| 15 | PUB-01 | MSR-03, PRV-02, PRV-03 |
| 16 | LRN-02, LRN-03 | LRN-01 |

Module xuyên suốt mọi stage: CORE-02, CORE-04, CAP-04, PRV-01, PRV-02, EXE-01, EXE-02, OPS-01, OPS-02.
