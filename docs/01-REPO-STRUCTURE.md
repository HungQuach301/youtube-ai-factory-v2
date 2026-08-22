# 01 — REPO STRUCTURE & STACK (v2)

## 1. Stack

| Tầng | Công nghệ | Lý do |
|---|---|---|
| Control plane | Cloudflare Workers + D1 + Durable Objects | DO cho lease đơn luồng |
| Storage | Cloudflare R2 | Bytes và evidence |
| Queue | Cloudflare Queues | Nối control tier ↔ media tier |
| Media tier | Container Node 22 (theo `07 §4`) | Workers không chạy được FFmpeg ở khối lượng cần thiết |
| Archive | Google Drive API | Đối soát checksum |
| Ngôn ngữ | TypeScript strict | Toàn bộ, kể cả media worker |
| Schema runtime | Zod | Ranh giới provider, command, envelope |
| Test | Vitest | Unit + integration + guardrail |
| Migration | SQL thuần, đánh số | Control plane phải audit được |
| UI | Next.js hoặc Remix + React | Operator workspace |

**Container image cho media tier phải chứa:** FFmpeg (build có `libvpx`, `libopus`, `ffv1`, `libx264`), ffprobe, Sharp, headless Chromium, WhisperX (hoặc Montreal Forced Aligner), OpenCV, ImageMagick.

Image **pin theo digest**, không theo tag — tính tái lập phụ thuộc vào điều này.

---

## 2. Layout

```
ai-factory/
├── packages/
│   ├── contracts/              # zero dependency
│   │   └── src/
│   │       ├── ids.ts          # branded types
│   │       ├── enums.ts        # union types + AgentMode, ProfileName
│   │       ├── commands.ts     # 12 typed command + payload schema
│   │       ├── artifacts.ts
│   │       ├── envelope.ts     # job envelope (có profile)
│   │       ├── provider.ts
│   │       ├── thresholds.ts   # MỌI ngưỡng + PROFILE + UNCALIBRATED
│   │       ├── human.ts        # v2 — HumanDecision, Touchpoint
│   │       ├── policy.ts       # v2 — PolicyCheckResult, checklist
│   │       └── index.ts
│   │
│   ├── core-hash/              # CORE-01
│   ├── core-command/           # CORE-02
│   ├── core-lease/             # CORE-03  (Durable Object)
│   ├── core-dor/               # CORE-04
│   ├── core-policy/            # CORE-05  standard registry
│   ├── evidence/               # CORE-06
│   │
│   ├── capability/             # CAP-01..04
│   │   ├── registry.ts  fixtures.ts  goldset.ts
│   │   ├── qualification.ts
│   │   └── guard.ts            # điểm chặn duy nhất
│   │
│   ├── provider/               # PRV-01
│   │   ├── framework.ts        # chỉ expose guardedDispatch
│   │   └── adapters/           # G2: chỉ thư mục này được import SDK
│   │       ├── openai.ts  elevenlabs.ts  stock-video.ts
│   │       ├── music.ts         # v2 — theo 07 §5
│   │       └── youtube.ts
│   ├── cost/                   # PRV-02
│   ├── rights/                 # PRV-03
│   │
│   ├── orchestrator/           # EXE-01  (+ điều tiết theo trần chú ý)
│   ├── stage-runner/           # EXE-02  framework + 18 runner
│   │   └── stages/stage-00.ts … stage-16.ts
│   ├── tournament/             # EXE-03  (width đọc từ PROFILE)
│   ├── job-envelope/           # EXE-04 phía control
│   │
│   ├── intelligence/           # INT-01, INT-02
│   ├── truth/                  # TRU-01, TRU-02
│   ├── creative/               # CRE-01..04
│   ├── design/                 # DES-01..03
│   ├── compiler/               # CMP-01
│   ├── media-spec/             # MED-01..06 phần spec (control tier)
│   ├── measurement/            # MSR-01 wrapper phía control
│   ├── assurance/              # MSR-02, MSR-03
│   ├── publishing/             # PUB-01  (+ G15 checklist gate)
│   ├── learning/               # LRN-01..03
│   │
│   ├── evolution/              # v2 — WP-27
│   │   ├── proposal.ts  shadow-run.ts  evidence-bundle.ts
│   │   └── failure-mining.ts   # LRN-04 (WP-30)
│   ├── human/                  # v2 — WP-28
│   │   ├── decision.ts  attention.ts  evidence-report.ts
│   └── policy-defense/         # v2 — WP-29
│       ├── checklist.ts        # PC1..PC8
│       ├── disclosure.ts  incident.ts  policy-watch.ts
│
├── apps/
│   ├── control-worker/         # Cloudflare Worker — HTTP + queue consumer
│   ├── media-worker/           # Container
│   │   ├── Dockerfile
│   │   └── src/executors/      # composite, encode, align, probe, flow, phash
│   └── operator-ui/
│       └── src/touchpoints/    # v2 — hàng đợi HP, màn D1–D5, evidence report
│
├── db/migrations/
│   ├── 0001_control_core.sql   0002_capability.sql   0003_truth.sql
│   ├── 0004_production.sql     0005_quality.sql      0006_cost.sql
│   ├── 0007_learning.sql       0008_evolution.sql    0009_human.sql
│   └── 0010_policy.sql
│
├── fixtures/
│   ├── gold-set/               # CAP-02
│   │   ├── rejected/  synthetic/  labels.json
│   └── archetypes/             # fixture hardest-first
│
├── tests/
│   ├── guardrails/             # G1–G15, chạy trong CI, CHẶN MERGE
│   ├── integration/  e2e/
│
├── docs/                       # 14 tài liệu pack
├── BLOCKED.md                  # câu hỏi cần người trả lời
├── DONE.md                     # ma trận Acceptance ↔ Test theo WP
├── OPS-LOG.md                  # v2 — nhật ký phiên OPERATE (append-only)
└── EVOLUTION-QUEUE.md          # v2 — proposal chờ owner
```

---

## 3. Quy tắc phụ thuộc

```
contracts        ←  không phụ thuộc gì
core-*           ←  chỉ contracts
capability       ←  contracts, core-*
provider         ←  contracts, capability (bắt buộc, để guard không bị vòng)
cost, rights     ←  contracts, core-*
execution        ←  tất cả trên
domain           ←  execution + provider
evolution        ←  contracts, core-*, capability   (KHÔNG phụ thuộc domain)
human            ←  contracts, core-*
policy-defense   ←  contracts, core-*, intelligence (dùng primitive anti-copy)
apps             ←  packages
```

Cấm phụ thuộc vòng. Cấm domain package import trực tiếp `provider/adapters/*` — chỉ qua `guardedDispatch`. Cấm `evolution` import `domain` — nó phải chạy được cả khi domain đang hỏng.

---

## 4. Cấu hình môi trường

```
CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_R2_BUCKET, CF_QUEUE_NAME
OPENAI_API_KEY            # secret store, không vào D1/R2
ELEVENLABS_API_KEY
PEXELS_API_KEY, PIXABAY_API_KEY
MUSIC_PROVIDER_KEY        # theo 07 §5
YOUTUBE_OAUTH_CLIENT      # Analytics và publish
GOOGLE_DRIVE_SA_JSON
NAMESPACE                 # production | qualification | staging
PROFILE                   # FULL | REDUCED          ← v2
AGENT_MODE                # BUILD | OPERATE | EVOLVE ← v2
MEDIA_IMAGE_DIGEST        # pin theo digest, KHÔNG theo tag
```

**Bốn namespace tách biệt ở cả D1 (cột `namespace`) và R2 (tiền tố khóa):**

| Namespace | Tiền tố R2 | Ràng buộc |
|---|---|---|
| `production` | `prod/` | Chỉ nhận input từ artifact ELIGIBLE |
| `qualification` | `qual/` | Không bao giờ sinh lineage sản xuất (G5) |
| `staging` | `stg/` | Provider sandbox hoặc trần chi phí rất thấp |
| `quarantine` | `quar/` | Output bị loại; chỉ đọc để audit |

Thêm: `gold/` (gold set), `evidence/`, `snapshot/`, `master/`.

---

## 5. CI

```
on: pull_request
jobs:
  typecheck   : tsc --noEmit, strict
  lint        : eslint (gồm rule G1, G2, G6)
  mode-guard  : v2 — PR nhãn mode=OPERATE chạm contracts/tests/migrations → FAIL (G13)
  threshold-diff : v2 — so thresholds.ts với bản seal; chiều RELAX không kèm
                   promotion evidence → FAIL (G11)
  guardrails  : vitest run tests/guardrails      ← BẮT BUỘC pass (G1–G15)
  unit        : vitest run packages
  migration   : chạy up rồi down trên D1 tạm, LẶP 2 LẦN
  integration : vitest run tests/integration
```

Guardrail job không pass → không merge, không có ngoại lệ. `mode-guard` và `threshold-diff` là hai job mới của v2 và cũng chặn merge.

---

## 6. Quy ước nhãn PR

```
mode=BUILD     WP thường; được chạm mọi thứ trong phạm vi WP
mode=OPERATE   vận hành; CI chặn chạm vùng G13
mode=EVOLVE    meta-change; BẮT BUỘC kèm evolution_proposal id trong
               mô tả PR, và CI kiểm proposal đó ở trạng thái PROMOTED
```
