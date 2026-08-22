# AI Factory — Kiến trúc nghiệp vụ & Kiến trúc kỹ thuật

Tài liệu thiết kế cho một hệ thống vận hành đa kênh YouTube tự động hóa vòng lặp end-to-end: nghiên cứu → chiến lược → sản xuất → phát hành → đo lường → cải thiện.

---

# PHẦN A — KIẾN TRÚC NGHIỆP VỤ

## A1. Nguyên lý kiến trúc

Mười nguyên lý ràng buộc mọi quyết định thiết kế phía sau. Khi hai yêu cầu xung đột, nguyên lý ở trên thắng.

| # | Nguyên lý | Hệ quả thiết kế |
|---|---|---|
| P1 | **Bằng chứng trên khai báo** | Output chỉ tồn tại khi bytes đã read-back và checksum khớp. Provider response, URL, DB row không phải output. |
| P2 | **Fail-closed mặc định** | Thiếu bằng chứng = chặn, không phải cảnh báo. `NOT_EVALUATED` được xử lý như `FAIL` ở gate M0/M1. |
| P3 | **Control plane là nguồn quyền duy nhất** | Storage không tự cấp quyền downstream. Không có đường dispatch nào bỏ qua control plane. |
| P4 | **Bất biến ≠ đủ điều kiện** | Hai trường trạng thái độc lập. Một artifact có thể `SEALED` mà `INELIGIBLE`. |
| P5 | **Không đặt ngưỡng lên phép đo chưa hiệu chuẩn** | Mọi gate phải có error floor đã đo. Chưa hiệu chuẩn thì chưa được làm gate. |
| P6 | **Xác định trước, mô hình sau** | LLM chỉ dùng khi không thể tính toán xác định. Cấm dùng LLM ở nơi FFmpeg/parser đo chính xác hơn. |
| P7 | **Độc lập phải là kiến trúc, không phải quy ước** | Cơ chế sinh và cơ chế phán xử phải khác model family hoặc khác bản chất. |
| P8 | **Identity ở cấp kênh, chuyên biệt hóa ở cấp video** | Giọng, hệ hình ảnh, từ vựng là tài sản kênh; video kế thừa chứ không quyết định lại. |
| P9 | **Không dự báo thì không học** | Mọi video phải seal prediction trước khi phát hành, nếu không vòng lặp học bị hở. |
| P10 | **Có những quyền không được ủy quyền** | Publish, promote learning, rights exception luôn thuộc con người ở mọi quy mô. |

---

## A2. Mô hình năng lực nghiệp vụ

Bảy miền L1, cộng bốn năng lực xuyên suốt.

### Miền chính

**C1 — Portfolio & Channel Governance**
- C1.1 Quản trị danh mục kênh
- C1.2 Ủy quyền và phân bổ hạn mức sản xuất
- C1.3 Quản lý Channel Identity Contract (giọng, hệ hình ảnh, từ vựng, nhạc)
- C1.4 Quản lý lease và tính đồng thời
- C1.5 Quyền phát hành và ngân sách chú ý của owner

**C2 — Market & Audience Intelligence**
- C2.1 Khám phá và định giá ngách
- C2.2 Phân tích nhu cầu và tín hiệu cầu
- C2.3 Định nghĩa audience job-to-be-done
- C2.4 Phân tích cạnh tranh và thiết lập benchmark
- C2.5 Quản lý kho bằng chứng thị trường (snapshot, provenance, freshness)

**C3 — Content Strategy & Planning**
- C3.1 Thiết kế pillar và series
- C3.2 Lập kế hoạch tập và hàng đợi
- C3.3 Quản lý differentiation (chống đồng hóa với reference set)
- C3.4 Thiết kế thực nghiệm nội dung (biến thử, biến giữ cố định)
- C3.5 Packaging contract (title, thumbnail concept, viewer promise)

**C4 — Truth & Research**
- C4.1 Thu thập và phân tầng nguồn
- C4.2 Xây dựng claim graph và qualifier ledger
- C4.3 Quản lý mâu thuẫn và độ bất định
- C4.4 Quản lý từ vựng và phát âm
- C4.5 Kiểm soát an toàn nội dung (advice lint, brand safety)

**C5 — Production Engineering**
- C5.1 Thiết kế kiến trúc câu chuyện và kịch bản
- C5.2 Thiết kế ngữ pháp hình ảnh và định tuyến nguồn
- C5.3 Biên dịch hợp đồng shot/cue có thể thực thi
- C5.4 Thu nhận và dựng hình ảnh
- C5.5 Sản xuất giọng, nhạc, ambience, SFX
- C5.6 Dựng phim, master và lưu trữ

**C6 — Assurance & Release**
- C6.1 Kiểm chứng xác định (timeline, kỹ thuật)
- C6.2 Bảo đảm độc lập (perceptual, đa critic)
- C6.3 Quản lý gold set và regression suite
- C6.4 Quản lý ngoại lệ và định tuyến nguyên nhân gốc
- C6.5 Cổng owner-ready và ủy quyền phát hành

**C7 — Performance Learning**
- C7.1 Dự báo hiệu suất
- C7.2 Thu thập và chuẩn hóa analytics thực tế
- C7.3 Phân tích sai lệch dự báo–thực tế
- C7.4 Quản lý thực nghiệm và kết luận
- C7.5 Đóng vòng: promote learning thành standard/strategy version

### Năng lực xuyên suốt

**X1 — Capability Qualification**: đăng ký cơ chế, thiết kế fixture, chạy qualification, cưỡng chế dispatch guard, quản lý hiệu lực theo version.

**X2 — Rights & Compliance**: license lineage, chính sách nền tảng, công bố nội dung AI, rủi ro Content ID, ngưỡng reused content.

**X3 — Cost & Resource Control**: ước lượng, giữ chỗ, đối soát, trần chi phí theo cấp, kinh tế đơn vị.

**X4 — Evidence & Lineage**: canonical hashing, đồ thị lineage, kho bằng chứng bất biến, audit trail.

---

## A3. Value streams

Bốn luồng giá trị với nhịp khác nhau. Sai lầm phổ biến là gộp chúng thành một; chúng có chu kỳ, chủ sở hữu và tiêu chí thành công khác nhau.

```
VS0 — CAPABILITY QUALIFICATION            nhịp: theo đợt, khi có cơ chế/version mới
  Đăng ký cơ chế → thiết kế fixture hardest-first → chạy qualification
  → đo trên gold set → cấp/thu hồi quyền dispatch
  Đây chính là FP1–FP7. Là luồng NỀN TẢNG, không phải giai đoạn của sản xuất.

VS1 — CHANNEL DISCOVERY & STRATEGY        nhịp: quý
  Khám phá ngách → định giá → Channel Identity Contract → pillar/series
  → hàng đợi tập → thiết kế thực nghiệm

VS2 — EPISODE PRODUCTION                  nhịp: theo nhịp mục tiêu
  Brief → truth → creative → script → design → shot contract
  → media → edit → master → assurance → packaging → publish

VS3 — PERFORMANCE LEARNING                nhịp: 14–28 ngày sau publish
  Analytics thực → so với prediction → phân tích sai lệch theo beat
  → kết luận thực nghiệm → promote thành standard/strategy version
```

**Điểm mấu chốt về quan hệ giữa VS0 và VS2:** VS0 là luồng nền tảng (platform), VS2 là luồng tạo giá trị (stream-aligned). Hiện tại hai luồng đang bị trộn — Stage 07A–10 vừa là bước sản xuất video #1 vừa là bước qualify capability. Điều này khiến không thể phân biệt "video #1 chậm vì capability chưa có" với "video #1 chậm vì nội dung khó".

Tách ra: VS0 chạy trên **fixture namespace riêng**, không sinh lineage sản xuất. VS2 chỉ khởi động khi capability đã qualified.

```
        VS0 (nền tảng)
   ┌─────────────────────┐
   │ qualification       │──── cấp quyền dispatch ───┐
   │ namespace riêng     │                           ▼
   └─────────────────────┘                    ┌──────────────┐
                                              │ VS2 sản xuất │
   VS1 (chiến lược) ──── brief, identity ────▶│              │
        ▲                                     └──────┬───────┘
        │                                            │ publish
        └──── promote learning ──── VS3 ◀────────────┘
```

---

## A4. Mô hình vận hành và quyền quyết định

### Vai trò

| Vai trò | Bản chất | Trách nhiệm |
|---|---|---|
| **Owner** | Con người | Quyền không ủy quyền được (P10): publish, promote learning, rights exception, chấp nhận rủi ro kiến trúc |
| **Operator** | Con người | Vận hành hàng ngày, xử lý ngoại lệ, phê duyệt trong hạn mức |
| **Orchestrator** | Hệ thống | Điều phối stage, cưỡng chế DoR, quản lý lease và hàng đợi |
| **Stage Runner** | Hệ thống | Thực thi một stage: sinh candidate, tournament, preflight, seal |
| **Capability Guard** | Hệ thống | Chặn dispatch khi chưa qualified; kiểm settings hash |
| **Assurance Panel** | Hệ thống (đã qualified) | 9 critic độc lập, mù chéo |
| **Cost Controller** | Hệ thống | Reservation, settle, trần theo cấp |

### Quyền quyết định

| Quyết định | Pilot | Scale | Ghi chú |
|---|---|---|---|
| Publish một video | Owner | **Owner** | Không nới ở bất kỳ quy mô nào |
| Promote learning → strategy | Owner | **Owner** | Không nới |
| Rights exception | Owner | **Owner** | Không nới |
| Chấp nhận master (Stage 15) | Owner 100% | Sampling sau N video liên tiếp sạch | Ngưỡng N định nghĩa trong policy |
| Chọn creative champion | Owner xem | Tự động | Owner xem mẫu |
| Mở production package | Operator | Tự động theo hàng đợi | Trong hạn mức |
| Requalify capability | Operator | Tự động theo trigger | Shadow qualification trước |
| Vượt trần chi phí | Owner | Owner | Không nới |

**Ngân sách chú ý** là ràng buộc thiết kế, không phải chi tiết vận hành. Với nhịp 3 video/tuần trên 3 kênh, owner có khoảng 9 quyết định publish/tuần — thiết kế phải giữ tổng thời gian owner dưới ngưỡng bền vững, nếu không mọi gate sẽ trôi thành phê duyệt hình thức.

---

## A5. Đối tượng nghiệp vụ

```
Portfolio
 └─ Channel ──── ChannelIdentityContract@v
     └─ Pillar
         └─ Series
             └─ Episode ──── ContentBrief ──── PackagingContract
                 └─ ProductionPackage (1:1 với video, giữ Lease)
                     ├─ StageInstance × 18
                     │   └─ Artifact ──── Lineage edges
                     ├─ ClaimGraph (Claim, Source, Contradiction)
                     ├─ ShotCueProgram ──── Shot ──── ShotAssertion
                     ├─ VisualAssetPackage ──── Asset ──── RightsRecord
                     ├─ AudioStemPackage ──── AudioSection, Cue
                     ├─ ArchivalMaster + DistributionRender
                     ├─ AssuranceRun ──── CriticVerdict × 9
                     ├─ PredictedPerformance
                     └─ CostLedger, RequestLedger

CapabilityRegistry
 ├─ Capability@version ──── ProviderBinding, SettingsHash
 ├─ Archetype
 ├─ Fixture (hardest-first)
 ├─ CapabilityArchetypeBinding ──── QualificationResult
 └─ GoldSet ──── GoldSample ──── DefectLabel

StandardRegistry
 └─ Standard@version ──── GateDefinition ──── GateEvaluation

LearningRegistry
 ├─ Experiment ──── Hypothesis, Variables, SampleSize
 ├─ ActualPerformance
 ├─ Learning ──── Evidence
 └─ Promotion ──── target StandardVersion | StrategyVersion
```

**Ba đối tượng mới so với thiết kế hiện tại:** `ChannelIdentityContract`, `PackagingContract`, `PredictedPerformance`. Cả ba là thay đổi schema, không phải capability — rẻ nếu làm trước khi viết lại Stage 09–11.

---

## A6. Khung kiểm soát

Ba tầng gate, phân biệt rõ mục đích:

| Tầng | Tên | Bản chất | Ví dụ |
|---|---|---|---|
| **M0** | Safety & Rights | Không được vi phạm ở bất kỳ hoàn cảnh nào | Advice lint, rights lineage, platform compliance |
| **M1** | Technical Integrity | Đo xác định, không tranh cãi | Checksum, A/V sync, loudness, black/freeze, schema |
| **M2** | Editorial Quality | Đánh giá cảm nhận, cần capability đã qualified | Story, retention, semantic alignment, packaging |

Quy tắc: **M0 và M1 phải PASS trước khi M2 được phép chạy.** Chi phí M2 cao nhất và giá trị của nó bằng không nếu M0/M1 chưa sạch.

Trạng thái gate có bốn giá trị, không phải hai: `PASS` | `FAIL` | `NOT_EVALUATED` | `WAIVED`. `WAIVED` chỉ owner cấp được, có thời hạn, và bị cấm ở M0.

---

## A7. Cây chỉ số nghiệp vụ

```
Giá trị danh mục
├─ Hiệu quả nội dung
│   ├─ CTR (impressions → clicks)          ◀── PackagingContract
│   ├─ Retention curve                     ◀── Story architecture
│   └─ Sai lệch dự báo (MAE)               ◀── Learning loop
├─ Năng suất
│   ├─ Video/kênh/tuần
│   ├─ Lead time brief → publish
│   └─ First-pass yield theo stage
├─ Kinh tế đơn vị
│   ├─ Cost per sealed artifact
│   ├─ Cost per published video
│   └─ Tỷ trọng chi phí tournament / tổng
└─ Rủi ro
    ├─ P0 escape rate
    ├─ Rights/compliance incident
    └─ Capability qualification drift
```

Chỉ số cần bổ sung so với hiện tại: toàn bộ nhánh kinh tế đơn vị và nhánh sai lệch dự báo.

---

# PHẦN B — KIẾN TRÚC KỸ THUẬT

## B1. Tổng quan phân tầng

```
┌───────────────────────────────────────────────────────────────┐
│  PRESENTATION PLANE                                            │
│  Operator workspace · Owner console · Portfolio dashboard      │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│  CONTROL PLANE                          (Cloudflare Workers+D1)│
│  Typed commands · State machine · DoR resolver · Lease+fencing │
│  Policy engine · Standard registry · Lineage graph             │
└───┬─────────────┬──────────────┬──────────────┬───────────────┘
    │             │              │              │
┌───▼──────┐ ┌────▼─────────┐ ┌──▼──────────┐ ┌─▼──────────────┐
│CAPABILITY│ │  EXECUTION   │ │ MEASUREMENT │ │   LEARNING     │
│  PLANE   │ │    PLANE     │ │    PLANE    │ │    PLANE       │
│          │ │              │ │             │ │                │
│Registry  │ │Orchestrator  │ │Deterministic│ │Prediction model│
│Fixtures  │ │Stage runners │ │  (FFmpeg,   │ │Analytics ETL   │
│Gold set  │ │Media workers │ │   parsers)  │ │Experiment reg. │
│Dispatch  │ │Tournament    │ │Perceptual   │ │Deviation calc  │
│  guard   │ │  engine      │ │  (critics)  │ │                │
└───┬──────┘ └────┬─────────┘ └──┬──────────┘ └─┬──────────────┘
    │             │              │              │
┌───▼─────────────▼──────────────▼──────────────▼───────────────┐
│  PROVIDER PLANE                                                │
│  Adapter interface · Reservation · Idempotency · Retry         │
│  Evidence snapshot · Error normalization · Version pinning     │
└───┬────────────────────────────────────────────────────────────┘
    │
┌───▼────────────────────────────────────────────────────────────┐
│  STORAGE PLANE          R2 (bytes) · D1 (state) · Drive (archive)│
└────────────────────────────────────────────────────────────────┘
```

---

## B2. Bounded contexts

Chín context, mỗi context sở hữu dữ liệu của mình và giao tiếp qua sự kiện hoặc lệnh có kiểu.

| Context | Sở hữu | Không được chạm vào |
|---|---|---|
| **Governance & Lineage** | Package, stage, artifact, lineage, command log, lease | Nội dung artifact |
| **Capability Qualification** | Capability, archetype, fixture, gold set, qualification result | Lineage sản xuất |
| **Intelligence & Truth** | Source, claim, contradiction, terminology | Media bytes |
| **Creative Design** | Route, story, script, packaging contract | Provider dispatch |
| **Media Production** | Asset, composition, audio section, master | Claim graph (chỉ đọc) |
| **Assurance** | Gate evaluation, assurance run, critic verdict | Cách sửa lỗi |
| **Packaging & Publishing** | Title, thumbnail, metadata, schedule | Nội dung video |
| **Learning** | Prediction, actual, experiment, promotion | Ghi trực tiếp vào standard |
| **Cost & Rights** | Reservation, ledger, license record | Quyết định nội dung |

Ràng buộc quan trọng: **Assurance không được biết cách sửa lỗi, Learning không được ghi trực tiếp vào Standard.** Cả hai đi qua owner command.

---

## B3. Kiến trúc dữ liệu

### D1 — lược đồ cốt lõi

```sql
-- ===== GOVERNANCE =====
channel(id, name, status, created_at)
channel_identity_contract(id, channel_id, version, payload_json,
                          canonical_hash, sealed_at, superseded_by)
pillar(id, channel_id, name, version)
episode(id, pillar_id, sequence, status)
content_brief(id, episode_id, version, payload_json, canonical_hash)

production_package(id, episode_id, channel_id,
                   brief_hash, identity_contract_id,
                   lease_holder, lease_token INTEGER,   -- fencing token
                   lease_expires_at,
                   request_ceiling, spend_ceiling,
                   auto_dispatch BOOLEAN DEFAULT 0,
                   auto_publish  BOOLEAN DEFAULT 0,
                   status)

stage_instance(id, package_id, stage_code,
               control_state,        -- NOT_STARTED|RUNNING|PRODUCED|VERIFIED|FROZEN|REOPENED
               standard_version,
               attempt_ordinal,
               started_at, frozen_at)

artifact(id, stage_instance_id, artifact_type,
         immutability_state,   -- DRAFT | SEALED | SUPERSEDED
         eligibility_state,    -- INELIGIBLE | ELIGIBLE_FOR_STAGE | ELIGIBLE_FOR_RELEASE
         eligibility_reason_json,
         canonical_hash,
         r2_key, byte_size, content_sha256, stream_hash,
         standard_version,
         capability_bindings_json,
         created_at)

artifact_lineage(parent_artifact_id, child_artifact_id, relation)

command_log(id, package_id, command_type, payload_json,
            idempotency_key UNIQUE, fencing_token,
            actor_identity, prev_state, next_state, created_at)
-- append-only, không UPDATE, không DELETE

-- ===== CAPABILITY =====
capability(id, code, kind, version, provider, model_snapshot,
           settings_hash, status)          -- ACTIVE | SUPERSEDED | REVOKED
archetype(id, code, domain, criticality, min_first_pass_yield)
fixture(id, archetype_id, spec_json, is_hardest BOOLEAN)
capability_archetype_binding(capability_id, archetype_id,
                             qualification_state, qualified_at,
                             qualification_run_id)
qualification_run(id, capability_id, archetype_id, fixture_id,
                  namespace,              -- 'qualification' — KHÔNG BAO GIỜ 'production'
                  recall, precision, first_pass_yield,
                  evidence_r2_key, verdict)

gold_sample(id, defect_class, severity, source,   -- 'rejected_master' | 'synthetic'
            r2_key, ground_truth_json)

-- ===== TRUTH =====
source(id, package_id, url, tier, fetched_at,
       snapshot_r2_key, content_hash)
claim(id, package_id, claim_type, text, criticality,
      numeric_json, as_of_date, jurisdiction)
claim_source(claim_id, source_id, role)
contradiction(id, claim_a, claim_b, resolution_state)
terminology(id, package_id, term, plain_meaning,
            institutional_role, ipa, arpabet)

-- ===== PRODUCTION =====
shot_cue_program(id, package_id, canonical_duration_ms,
                 shot_count, canonical_hash, sealed_at)
shot(id, program_id, seq, t_start_ms, t_end_ms,
     route, archetype_id, motion_class,   -- CAMERA_ONLY|LAYERED_SEMANTIC|SOURCE_SEMANTIC
     claim_ids_json, layers_json, source_query_json)
shot_assertion(id, shot_id, temporal_state, assertion_json)

asset(id, package_id, provider, provider_asset_id,
      r2_key, content_sha256, source_fps, resolution,
      license_type, license_url, territory, duration_rights,
      editorial_only BOOLEAN, phash)
composition(id, shot_id, variant, r2_key, content_sha256,
            tournament_score, is_champion)

audio_section(id, package_id, seq, char_start, char_end,
              text, prev_context, next_context)
audio_take(id, section_id, r2_key, alignment_score,
           phoneme_mismatch_rate, seam_score, is_champion)
cue(id, package_id, kind, t_ms, function, asset_id)

-- ===== MASTER =====
master(id, package_id, tier,          -- ARCHIVAL | DISTRIBUTION
       derived_from_master_id,
       r2_key, drive_file_id,
       file_sha256, stream_framemd5,
       codec, duration_ms, fps, probe_json, sealed_at)

-- ===== QUALITY =====
gate_definition(id, code, tier, owner_stages_json, standard_version)
gate_evaluation(id, package_id, gate_id, state,   -- PASS|FAIL|NOT_EVALUATED|WAIVED
                evidence_r2_key, waiver_owner, waiver_expires_at, evaluated_at)
assurance_run(id, master_id, standard_version, aggregate_json, verdict)
critic_verdict(id, assurance_run_id, critic_code,
               score, p0_count, p1_count, variance,
               sample_count, evidence_r2_key)

-- ===== COST =====
spend_reservation(id, package_id, stage_instance_id, capability_id,
                  estimated_cost, state,  -- HELD|SETTLED|EXPIRED|ORPHANED
                  expires_at)
provider_request(id, reservation_id, idempotency_key UNIQUE,
                 request_r2_key, response_r2_key,
                 actual_cost, latency_ms, error_class, state)

-- ===== LEARNING =====
predicted_performance(id, package_id, model_version,
                      retention_curve_json, ctr_estimate,
                      beat_risk_json, canonical_hash, sealed_at)
actual_performance(id, package_id, youtube_video_id,
                   master_id, ingested_at, metrics_json)
experiment(id, channel_id, hypothesis, variable_tested,
           held_constant_json, min_sample_size,
           decision_criterion, status)
learning(id, experiment_id, finding, evidence_json,
         status)                         -- INSUFFICIENT_EVIDENCE|READY|PROMOTED|REJECTED
promotion(id, learning_id, target_kind, target_version_before,
          target_version_after, owner_identity, evidence_hash, created_at)
```

### R2 — quy ước khóa

```
prod/{channel}/{episode}/{stage}/{artifact_type}/{content_sha256}
qual/{capability}@{version}/{archetype}/{run_id}/{artifact}
gold/{defect_class}/{sample_id}
evidence/{package}/{trace_id}/{span_id}/{request|response}.json
snapshot/{package}/sources/{content_hash}.html
master/{channel}/{episode}/archival/{sha256}.mkv
master/{channel}/{episode}/distribution/{sha256}.webm
```

**Ràng buộc cứng:** khóa dưới `qual/` và `gold/` **không bao giờ** được xuất hiện trong lineage sản xuất. Đây là cơ chế kiến trúc ngăn một fixture leo thành release evidence — vấn đề đang tồn tại với nhãn "MASTER QA READY" trên fixture 80 giây.

### Canonical hashing

Hàm duy nhất trong toàn hệ thống:

```
canonicalHash(obj) =
    sha256(
      JCS(RFC 8785).serialize(
        unicodeNFC(
          stripVolatile(obj)      // bỏ timestamp, request_id, latency
        )
      )
    )
```

Cấm gọi `JSON.stringify` trước khi hash ở bất kỳ đâu. Test bắt buộc: hash 1.000 permutation thứ tự khóa → cùng một giá trị.

---

## B4. Máy trạng thái và lệnh có kiểu

### Tám lệnh (mở rộng từ năm)

| Lệnh | Actor | Tác dụng |
|---|---|---|
| `START_STAGE` | Orchestrator | Mở stage sau khi DoR pass |
| `PRODUCE_ARTIFACT` | Stage Runner | Ghi bytes + metadata sau tournament và preflight |
| `VERIFY_ARTIFACT` | Stage Runner | Read-back, checksum, rights, quality verification |
| `FREEZE_STAGE` | Orchestrator | Đóng stage, cho phép stage kế |
| `REOPEN_ROOT_STAGE` | Operator | Mở lại stage gốc sau phân loại nguyên nhân |
| `AUTHORIZE_RELEASE` | **Owner** | Chấp nhận master ở Stage 15 |
| `AUTHORIZE_PUBLISH` | **Owner** | Cấp quyền phát hành, tách khỏi release |
| `PROMOTE_LEARNING` | **Owner** | Chuyển learning thành standard/strategy version mới |

Ba lệnh cuối bắt buộc identity-bound và không bao giờ tự động hóa (P10).

### Bất biến của mọi lệnh

```
1. fencing_token >= current_lease_token          → chống writer cũ
2. idempotency_key chưa tồn tại                  → chống ghi lặp
3. prev_state khớp trạng thái hiện tại           → optimistic concurrency
4. mọi ghi vào command_log là append-only
5. thất bại ở bất kỳ bước nào → zero side effect, zero spend
```

### Definition of Ready — resolver

DoR không đọc cờ đã lưu; nó **tính lại từ bằng chứng** mỗi lần:

```
resolveDoR(stage) :=
   lease_valid(package)                          ∧
   ∀ parent ∈ parents(stage):
        parent.immutability_state = SEALED       ∧
        parent.eligibility_state ≥ ELIGIBLE_FOR_STAGE ∧
        parent.standard_version  ≥ required_standard(stage)
   ∧ ∀ gate ∈ gates_owned_by(parents(stage)) where tier ∈ {M0, M1}:
        gate.state = PASS                        -- NOT_EVALUATED bị từ chối
   ∧ ∀ cap ∈ required_capabilities(stage):
        qualified(cap, archetypes_used(stage))   ∧
        cap.settings_hash = registry.settings_hash
   ∧ active_provider_requests(package) = 0
   ∧ expired_leases_unreconciled(package) = 0
   ∧ available_budget(package) ≥ estimated_cost(stage)
   ∧ ¬ references_quarantined_hash(inputs(stage))
```

Thất bại → dừng ở zero spend, **không tính là production attempt**.

---

## B5. Kiến trúc thực thi

### Vấn đề: control plane và media plane có ràng buộc tính toán khác nhau

Cloudflare Workers không chạy được FFmpeg/Sharp ở khối lượng cần thiết (giới hạn CPU time và bộ nhớ). Đây là thành phần **chưa có trong kiến trúc hiện tại** và phải thiết kế tường minh.

```
┌──────────────────────────────────────────────────────────────┐
│ CONTROL TIER          Cloudflare Workers + D1 + Durable Object│
│ • Typed commands, DoR resolver, policy                        │
│ • Lease qua Durable Object (single-threaded, đảm bảo tuần tự) │
│ • Điều phối, không tính toán nặng                            │
└──────────────────────┬───────────────────────────────────────┘
                       │ Cloudflare Queues (job envelope)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ MEDIA TIER            Container workers (long-running)         │
│ • FFmpeg / ffprobe / Sharp / headless Chromium                │
│ • WhisperX hoặc MFA cho forced alignment                      │
│ • Optical flow, pHash, SSIM                                   │
│ • Stateless: nhận job envelope, ghi R2, báo cáo qua command   │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ INTELLIGENCE TIER     Provider adapters (Workers)              │
│ • OpenAI, ElevenLabs, stock providers, YouTube API            │
└──────────────────────────────────────────────────────────────┘
```

**Job envelope** — hợp đồng giữa hai tier:

```json
{
  "trace_id": "...", "package_id": "...", "stage_instance_id": "...",
  "fencing_token": 42,
  "capability_id": "COMPOSITOR@1.2.0",
  "settings_hash": "...",
  "reservation_id": "...",
  "inputs":  [{"r2_key": "...", "sha256": "..."}],
  "spec":    { /* deterministic, đủ để tái lập */ },
  "outputs": {"r2_prefix": "...", "expected_artifacts": [...]},
  "deadline_at": "..."
}
```

Media worker **không có quyền ghi D1 trực tiếp** — nó ghi R2 rồi phát lệnh `PRODUCE_ARTIFACT` qua control plane. Điều này giữ nguyên P3.

### Tournament engine

Mẫu chung cho Stage 04, 07A, 09, 10:

```
candidates ← generate(n, temperature_high, spec)
         │
         ▼
eligibility_filter(candidates)        ← lọc TRƯỚC khi tốn chi phí nặng
         │
         ▼
score ← judge(candidate, temperature=0, blind=true, rubric_anchored=true)
         │  (call độc lập cho từng critic, không chia sẻ context)
         ▼
champion ← argmax(score) where score ≥ threshold
         │
         ▼
production_preflight(champion)        ← deterministic, phải PASS
         │
         ▼
seal(champion) + preserve(rejected as evidence)
```

Bất biến: **sinh và chấm phải khác temperature, khác system prompt, và chấm phải blind** (P7).

---

## B6. Kiến trúc capability và dispatch guard

```
dispatch(capability, archetype, request):
   1. binding ← registry.lookup(capability, archetype)
      binding.state ≠ QUALIFIED                    → REJECT (fail-closed)
   2. capability.settings_hash ≠ request.settings_hash → REJECT
   3. lease.fencing_token < request.token          → REJECT
   4. reservation ← cost.reserve(estimate(request))
      reservation = null                           → REJECT (zero dispatch)
   5. snapshot request → R2
   6. response ← provider.call(request, idempotency_key)
   7. snapshot response → R2
   8. cost.settle(reservation, actual_cost)
   9. return response
```

Mọi lỗi ở bước 1–4 đều là **zero spend, không tính production attempt**.

### Vòng đời qualification

```
REGISTERED → FIXTURE_DESIGNED → QUALIFICATION_RUNNING
   → QUALIFIED (dispatch mở)
   → SUPERSEDED (version mới) | REVOKED (fixture fail sau đó)

Trigger requalify: model version đổi · settings_hash đổi
                 · rights rule đổi · standard version đổi
                 · gold set phát hiện regression
```

**Shadow qualification** khi provider bump version: chạy version mới trên gold set song song với version cũ đang phục vụ; chỉ chuyển đổi khi pass toàn bộ. Tránh việc mỗi lần model update là một lần pipeline dừng đột ngột.

### Qualify chính assurance capability

Vòng lặp "critic phải qualified nhưng không có ground truth" được phá bằng gold set:

```
gold_set = 15 mẫu từ master đã bị owner từ chối (nhãn đã tồn tại)
         + 15 mẫu tổng hợp gài defect đã biết:
             sync lệch 200ms · seam audio · narration↔visual mismatch
             · near-static 12s · thiếu rights lineage · caption drift

qualify(critic) := recall(critic, gold_set) ≥ ngưỡng trên MỌI defect P0
                 ∧ precision ≥ ngưỡng
                 ∧ variance(3 lần chạy) ≤ ngưỡng
```

Gold set đồng thời là **regression suite vĩnh viễn**: mọi capability version mới phải chứng minh nó bắt được các lỗi đã từng lọt.

---

## B7. Kiến trúc đo lường

Hai tầng, và quy tắc phân định là nguyên lý P6.

### Tầng xác định (bắt buộc chạy trước)

| Phép đo | Công cụ | Đầu ra |
|---|---|---|
| Black / freeze / silence | `blackdetect`, `freezedetect`, `silencedetect` | Danh sách khoảng vi phạm |
| Clipping, loudness | `astats`, `loudnorm` 2-pass, `ebur128` | LUFS-I, TP, LRA |
| Drop frame | `ffprobe -count_frames` vs `duration × fps` | Số frame lệch |
| Forced alignment | WhisperX / MFA + custom lexicon | Phoneme mismatch rate |
| Seam | Cross-correlation + MFCC distance + F0 continuity | Điểm seam |
| Semantic motion | Global motion estimation → dense optical flow → residual | `motion_class` |
| Duplicate | pHash 64-bit, Hamming ≤10 | Tỷ lệ trùng |
| Near-static | SSIM giữa frame cách 500 ms > 0.98 kéo dài > 7s | Khoảng vi phạm |
| Mobile legibility | x-height pixel ở 25% scale + contrast ratio WCAG | PASS/FAIL |
| Safe zone | Hình học bbox từ compositor metadata | PASS/FAIL |
| Timeline lint | Interval tree, O(n log n) | Gap/overlap |

### Tầng cảm nhận (chỉ chạy sau khi tầng xác định sạch)

9 critic, mỗi critic một call độc lập, `temperature=0`, seed cố định, blind, rubric có anchor 3 mức.

**Xử lý vùng biên:** khi điểm rơi vào `floor ± 3`, chạy lại n=3 và lấy median; ghi variance vào evidence. Critic có variance vượt ngưỡng phải requalify.

**Hiệu chuẩn (P5):** mọi ngưỡng phải kèm error floor đã đo trên gold set. Ví dụ ngưỡng phoneme mismatch thật = `max(1%, error_floor × 2)`.

---

## B8. Kiến trúc học

```
Stage 05 ──▶ PredictedPerformance (sealed, canonical hash)
                    │
Stage 11 ──▶ (cập nhật với timing thật)
                    │
              publish + 14–28 ngày
                    │
                    ▼
         YouTube Analytics ETL
         ├─ audienceWatchRatio × elapsedVideoTimeRatio
         ├─ relativeRetentionPerformance
         ├─ impressions, impressionClickThroughRate
         └─ traffic source breakdown
                    │
                    ▼
         Deviation analysis
         ├─ MAE trên lưới 5% của retention curve
         ├─ Beat-level error tại mỗi beat boundary  ◀── giá trị học cao nhất
         └─ CTR delta phân tách theo thumbnail variant
                    │
                    ▼
         Experiment evaluation
         ├─ đủ cỡ mẫu?          không → INSUFFICIENT_EVIDENCE
         ├─ nhất quán ≥2 video? không → INSUFFICIENT_EVIDENCE
         └─ đạt → READY
                    │
                    ▼
         PROMOTE_LEARNING (owner) ──▶ Standard@v+1 | Strategy@v+1
```

**Mô hình dự báo khởi đầu** (hiệu chỉnh dần):

```
risk(t) = w₁·(thời gian kể từ state-change gần nhất)
        + w₂·(mật độ entity mới trong cửa sổ 15s)
        + w₃·(khoảng cách tới curiosity loop đang mở)
        + w₄·(độ dài đoạn không đổi archetype)

retention_pred(t) = baseline(channel, pillar, length) − Σ risk
```

`w` khởi tạo bằng phán đoán; sau 5–8 video hiệu chỉnh bằng hồi quy. Điểm mấu chốt: **phải seal ngay từ video #1 kể cả khi mô hình còn thô** — không có prediction thì vòng lặp học không tồn tại.

---

## B9. Chi phí, bảo mật, môi trường

### Chi phí — mô hình giữ chỗ hai pha

```
RESERVE  → nếu (đã dùng + đang giữ + ước lượng) > ceiling → từ chối, zero dispatch
DISPATCH → gọi provider với idempotency key
SETTLE   → ghi chi phí thật, giải phóng phần dư
TIMEOUT  → giữ chỗ hết hạn → orphan ledger → bắt buộc đối soát
```

Trần chi phí phân cấp: `portfolio > channel > package > stage`. Ước lượng token đếm trước bằng tokenizer, không đoán.

### Bảo mật

- Provider key trong secret store, rotation có lịch, không bao giờ vào D1/R2.
- Media worker nhận **presigned URL** phạm vi hẹp, không nhận credential R2.
- Command có identity binding: SIWC/allowlist cho owner command.
- `command_log` append-only là audit trail; cấm UPDATE/DELETE ở tầng schema.
- Evidence snapshot có thể chứa nội dung có bản quyền → phân vùng lưu trữ riêng, không public.

### Môi trường

| Namespace | Mục đích | Ràng buộc |
|---|---|---|
| `qualification` | Chạy fixture, gold set | **Không bao giờ** sinh lineage sản xuất |
| `staging` | Thử nghiệm tích hợp | Provider sandbox hoặc trần chi phí rất thấp |
| `production` | Sản xuất thật | Chỉ nhận input từ artifact `ELIGIBLE_FOR_*` |
| `quarantine` | 595 output bị loại | Đọc để audit; hash bị chặn khỏi candidate search |

Tách namespace ở cả D1 (cột `namespace`) và R2 (tiền tố khóa). Đây là cơ chế ngăn fixture leo thành release evidence.

---

## B10. Ánh xạ kiến trúc sang lộ trình

| Thành phần kiến trúc | Gói | Điều kiện tiên quyết |
|---|---|---|
| Canonical hashing, fencing token, cost reservation | **FP3.1** | Không |
| Tách `immutability_state` / `eligibility_state` | **FP3.1** | Canonical hashing |
| Tách namespace qualification/production | **FP3.1** | Không |
| Media tier (container workers) | **FP3.5 (mới)** | Job envelope contract |
| Gold set + regression suite | **FP3.6 (mới)** | Namespace tách |
| Qualify assurance capability | **FP3.6** | Gold set |
| Forced alignment pin + calibrate | **FP3.6** | Terminology ledger schema |
| `ChannelIdentityContract` | **FP3.7 (mới)** | Quyết định cấp identity |
| `PackagingContract` vào Stage 04 | **FP3.7** | Không |
| `PredictedPerformance` schema | **FP3.7** | Beat state assertion |
| Compositor benchmark 8 archetype | **FP4** | Media tier |
| Visual capability qualification | **FP4** | FP3.5, FP3.6 |
| Audio capability qualification | **FP5** | Quyết định `TBD_PRODUCTION_AUDIO` |
| Archival/distribution master tách | **FP6** | Không |
| Animatic gate | **FP6** | ShotCueProgram, TTS nháp |
| Golden r10 | **FP6** | FP4, FP5 |
| Stage 11–15 full video | **FP7** | FP6 |
| Learning plane + experiment registry | **FP8 (mới)** | PredictedPerformance, publish đầu tiên |
| Portfolio & concurrency | **FP9 (mới)** | Nhịp mục tiêu đã chốt |

Bốn gói mới (FP3.5, FP3.6, FP3.7, FP8) đều nằm **trước hoặc song song** với FP4 và không có gói nào xuất hiện trong lộ trình hiện tại.

---

## B11. Ba quyết định phải chốt trước khi triển khai

1. **Nhịp mục tiêu** — bao nhiêu video/kênh/tuần, bao nhiêu kênh. Mọi thông số concurrency, kinh tế đơn vị và ngân sách chú ý đều derive từ con số này.

2. **Cấp của identity** — kênh hay video. Quyết định này đổi phạm vi qualification: qualify archetype ở cấp kênh (tái dùng cho N video) khác hoàn toàn qualify ở cấp video.

3. **Mô hình kinh tế** — trần chi phí thật cho một video ở chất lượng mục tiêu, dựng từ benchmark chứ không từ giả định. Nếu con số này không khả thi, phải đổi kiến trúc compositor và chiến lược tournament trước, không phải sau.

Ba quyết định này là input của kiến trúc, không phải output. Triển khai trước khi chốt chúng sẽ tạo ra công việc phải làm lại.
