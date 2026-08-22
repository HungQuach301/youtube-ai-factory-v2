# 14 — STAGE INDEX

Ánh xạ 18 stage sản xuất ↔ module ↔ gate ↔ capability ↔ work package. Dùng để tra nhanh khi làm một stage: đọc gì, gate nào chặn, cần capability nào đã qualified.

Chi tiết đặc tả từng module: `ai-factory-modul-nen-tang.md` (19 module nền tảng) và `ai-factory-modul-nghiep-vu.md` (25 module nghiệp vụ).

---

## Bảng tra 18 stage

| Stage | Tên | Module | WP | Gate M0/M1 sở hữu | Capability cần |
|---|---|---|---|---|---|
| 00 | Package Open & Brief bind | CORE-02, CORE-04 | 02, 04 | DoR gates | — |
| 01 | Market & Audience Intelligence | INT-01 | 17 | M0 source-provenance · M1 audience-job-lint | search/retrieval |
| 02 | Reference & Anti-copy | INT-02 | 17 | M1 anti-copy (4 phép đo) · M1 differentiation | embedding, phash |
| 03 | Truth: Claim Graph + Terminology | TRU-01, TRU-02 | 16 | **M0 advice-lint** · M0 critical-claim-tier · M1 numeric-schema | LLM research (guarded) |
| 04 | Creative Route Tournament + Packaging | CRE-01, CRE-02 | 18 | M1 route-diversity · M1 packaging-contract | LLM generate + judge |
| 05 | Story Architecture + Prediction seal | CRE-03 | 18 | **M1 prediction-sealed (P9)** · M1 beat-state-assertion | LLM |
| 06 | Script + Number Audit | CRE-04 | 18 | **M0 advice-lint (lần 2)** · M1 script-lint · M1 number-trace | LLM |
| 07A | Voice Design & TTS Segmentation | DES-01, DES-02 | 19 | M1 segmentation-boundary · M1 voice-settings-hash | TTS |
| 07B | Visual Grammar & Routing | DES-03 | 19 | M1 motion-class-total · M1 route-distribution | — (xác định) |
| 08 | ShotCueProgram Compile | CMP-01 | 20 | M1 timeline-lint (zero gap/overlap) · M1 duration-match | — (xác định) |
| 09 | Visual Acquisition & Composition | MED-01, MED-02 | 21 | M0 rights-lineage · M1 semantic-fit · M1 duplicate-rate | stock, compositor |
| 10 | Audio Production (narration) | MED-03 | 21 | M1 phoneme-mismatch · M1 seam-score | TTS, aligner |
| 11 | Music, SFX, Ambience | MED-04 | 21 | M0 music-license · M1 loudness-balance | music provider |
| 12 | Edit & Assembly + Deterministic QA | MED-05, MSR-01 | 21, 22 | M1 av-sync · M1 black/freeze/silence · M1 near-static | media worker |
| 13 | Master (Archival + Distribution) | MED-06 | 21 | M1 checksum-readback · M1 archival-parent | media worker |
| 14 | Assurance Panel (perceptual) | MSR-02, MSR-03 | 22 | M2 toàn bộ ASSURANCE.FLOORS | 9 critic (qualified) |
| 15 | Owner Release + Publish | PUB-01 | 23 | **M0 PC1..PC8 (G15)** · owner commands | YouTube API |
| 16 | Analytics ETL & Learning | LRN-01..04 | 24, 30 | — (đo, không chặn) | YouTube Analytics |

---

## Quy tắc thứ tự gate (A6)

```
M0 và M1 phải PASS trước khi M2 được phép chạy.
Lý do: chi phí M2 cao nhất và giá trị của nó bằng 0 nếu M0/M1 chưa sạch.
Cưỡng chế: DoR resolver (WP-04) + trigger schema (0005).
```

Bốn trạng thái gate: `PASS | FAIL | NOT_EVALUATED | WAIVED`.
`NOT_EVALUATED` **bị xử lý như FAIL** ở M0/M1 (P2). `WAIVED` chỉ owner cấp, có thời hạn, **cấm ở M0**.

---

## Điểm chạm con người trong dòng stage

```
Stage 00  ─────────────────────────────────  [HP-01 quý: chiến lược]
Stage 04  ◀── HP-02 D1: chọn champion có lý do
Stage 06  ◀── HP-02 D2/D4: sửa hook/title, điều chỉnh beat
Stage 09  ◀── HP-02 D3: chọn + chỉnh thumbnail
Stage 07A ◀── HP-02 D5: quyết định giọng điệu video
Stage 14  ─── gate EDITORIAL_IMPRINT_PRESENT kiểm: đủ ≥2 quyết định chưa?
Stage 15  ◀── HP-03 AUTHORIZE_RELEASE + AUTHORIZE_PUBLISH (P10)
          ◀── HP-06 disclosure decision
          ◀── HP-04 nếu từ chối: phán quyết có nhãn → gold sample
Stage 16  ◀── HP-05 PROMOTE_LEARNING (nhịp tuần/tháng)
```

Điểm chạm không phải phê duyệt xong rồi thôi — mỗi cái sinh dữ liệu (P12) và để lại bằng chứng human input (P13).

---

## Tournament ở đâu

Bốn stage dùng tournament engine (EXE-03): **04, 07A, 09, 10**.
Mẫu chung: `generate(n, temp cao)` → `eligibility_filter` → `judge(temp=0, blind, rubric anchored)` → `champion` → `preflight xác định` → `seal + preserve rejected`.
Bất biến P7: sinh và chấm phải khác temperature, khác system prompt, và chấm phải blind.
`n` đọc từ `PROFILE` (02 §3), không hardcode.

---

## Ranh giới control tier / media tier

```
CONTROL TIER (Workers + D1)   stage 00–08, 14–16 + phần spec của 09–13
MEDIA TIER (container)        phần thực thi nặng của 09–13:
                              composite, encode, align, probe, flow, phash
```
Media worker **không có D1 binding** (G3): ghi R2 rồi phát `PRODUCE_ARTIFACT` qua control plane. Giao tiếp qua job envelope (02 §6).

---

## Namespace theo stage

Mọi stage chạy trong đúng một namespace, ghi vào cột `namespace`:

| Namespace | Khi nào | Ràng buộc |
|---|---|---|
| `production` | Track P/G sản xuất thật | Chỉ nhận input từ artifact ELIGIBLE |
| `qualification` | VS0: qualify capability, shadow run | **Không bao giờ** sinh lineage sản xuất (G5) |
| `staging` | Thử tích hợp | Provider sandbox hoặc trần rất thấp |
| `quarantine` | Output bị loại | Chỉ đọc để audit; hash bị chặn khỏi candidate search |

R2 prefix tương ứng: `prod/` · `qual/` · `stg/` · `quar/` · cộng `gold/` cho gold set và `evidence/`, `snapshot/`, `master/`.
