# 16 — ARCHITECTURE ADDENDUM (v2)

Bổ sung cho `ai-factory-kien-truc.md`. File gốc **vẫn hiệu lực nguyên vẹn** — 10 nguyên lý, 7 miền năng lực, 4 value stream, 9 bounded context, kiến trúc dữ liệu và thực thi không thay đổi.

File này thêm những gì v2 làm thay đổi ở tầng kiến trúc, theo đúng thứ tự mục của bản gốc (A1, A2, …, B10).

---

## A1 · Nguyên lý — thêm ba (P11 → P13)

| # | Nguyên lý | Hệ quả thiết kế |
|---|---|---|
| **P11** | **Hệ thống không tự nới chuẩn của chính nó** | Mọi thay đổi meta chỉ đi một chiều tự động: siết. Nới cần owner promote. Cưỡng chế ở tầng DB, không phải quy ước |
| **P12** | **Chú ý con người là tài nguyên khan hiếm nhất** | Mỗi điểm chạm phải đồng thời kiểm soát và sinh dữ liệu hiệu chuẩn. Tải chú ý là ràng buộc sản xuất ngang với budget |
| **P13** | **Bằng chứng human input là tài sản phòng thủ chính sách** | Quyết định biên tập của con người được ghi có cấu trúc và xuất trình được. Không có bằng chứng = không có phòng thủ |

Quy tắc xung đột giữ nguyên: nguyên lý số nhỏ hơn thắng.

**Vì sao ba nguyên lý này không nằm trong bản gốc.** P11 xuất hiện khi hệ thống có năng lực tự sửa mình — bản gốc thiết kế cho việc xây, chưa cho việc tiến hóa. P12 và P13 xuất hiện khi nhìn con người không phải là "cổng phê duyệt" mà là (a) tài nguyên có ngân sách và (b) input bắt buộc của chính sách nền tảng. Cả ba đều là hệ quả của việc chuyển từ *xây một lần* sang *vận hành liên tục*.

---

## A2 · Năng lực — thêm năng lực xuyên suốt thứ năm

Bốn năng lực xuyên suốt cũ (X1 Capability Qualification, X2 Rights & Compliance, X3 Cost & Resource Control, X4 Evidence & Lineage) giữ nguyên. Thêm:

**X5 — Change Governance**: quản trị mọi thay đổi với chính hệ thống — proposal, shadow validation, phân loại chiều nghiêm ngặt, promotion có chữ ký, rollback. Đây là năng lực làm cho "nhà máy tự nâng cấp" khác với "nhà máy tự trôi".

Ngoài ra **X2 được mở rộng đáng kể**: từ chỗ chủ yếu lo license lineage, giờ bao gồm phòng thủ chính sách nền tảng như một năng lực chủ động — policy watch, disclosure governance, incident response, kill criteria. Trong môi trường hiện tại, đây là năng lực quyết định sự tồn tại của mô hình, không phải một mục tuân thủ hình thức.

---

## A3 · Value streams — thêm VS4

```
VS4 — SYSTEM EVOLUTION                    nhịp: liên tục, quyết định theo tuần
  Phát hiện (LRN-04 / policy watch / provider watch / learning)
  → proposal → shadow run trên namespace tách
  → evidence bundle → owner promote → version mới có lineage

  Đây là luồng NỀN TẢNG thứ hai, ngang hàng VS0. Nó không tạo giá trị
  trực tiếp cho người xem, nhưng quyết định nhà máy tốt lên hay trôi đi.
```

Quan hệ giữa năm luồng:
```
        VS0 (qualification)          VS4 (evolution)
              │                            │
              │ cấp quyền dispatch         │ promote chuẩn mới
              ▼                            ▼
   VS1 ──▶ VS2 (production) ──publish──▶ VS3 (learning)
  chiến lược      ▲                            │
                  └──── standard/strategy ─────┘
                            (qua VS4)
```

**Điểm mấu chốt:** VS3 (learning) **không được ghi trực tiếp** vào standard — nó đi qua VS4. Bản gốc đã nêu ràng buộc này ở B2; v2 làm nó thành một luồng có tên, có vòng đời, có bằng chứng, thay vì một mũi tên trong sơ đồ.

---

## A4 · Mô hình vận hành — ba bổ sung

**Vai trò mới.**

| Vai trò | Bản chất | Trách nhiệm |
|---|---|---|
| **Editor** | Con người | Thực hiện Editorial Imprint (D1–D5). Có thể trùng Owner ở quy mô nhỏ, nhưng phải là identity người thật |
| **Evolution Agent** | Hệ thống | Soạn proposal, chạy shadow, dựng evidence. **Không có quyền kích hoạt** |
| **Policy Watcher** | Hệ thống | Snapshot + diff nguồn chính sách, sinh proposal khi có thay đổi |

**Quyền quyết định — bảng bổ sung.**

| Quyết định | Pilot | Scale | Ghi chú |
|---|---|---|---|
| Promote evolution (mọi meta-change) | Owner | **Owner** | Không nới ở bất kỳ quy mô nào |
| Retire gold sample | Owner | **Owner** | Không nới |
| Freeze kênh khẩn cấp | Operator | Operator | Owner xác nhận trong cửa sổ đã định |
| Unfreeze kênh | Owner | **Owner** | Thêm điều kiện: ≥1 learning đã promote |
| Editorial Imprint | Editor | Editor | **Không bao giờ sampling** — điều kiện chính sách |
| Chấp nhận master | Owner 100% | Sampling khi thỏa **điều kiện kép** | Chất lượng **và** không có incident 90 ngày |

**Ngân sách chú ý — từ ghi chú thành cơ chế.** Bản gốc nêu ngân sách chú ý là "ràng buộc thiết kế, không phải chi tiết vận hành" nhưng chưa có cơ chế. v2 làm nó thành cơ chế: `attention_ledger` ghi thời gian thật, và orchestrator từ chối mở package khi tải tuần vượt trần. Nếu không có ràng buộc này, mọi gate sẽ trôi thành phê duyệt hình thức — đúng như bản gốc cảnh báo.

---

## A5 · Đối tượng nghiệp vụ — thêm ba nhánh

```
ChangeRegistry                              ← mới
 ├─ EvolutionProposal ──── ShadowRun, EvidenceBundle
 ├─ StandardChangeLog ──── strictness_direction
 └─ Promotion ──── rollback_ref

HumanRecord                                 ← mới
 ├─ HumanActor
 ├─ HumanDecision (D1–D5) ──── artifact_before/after, diff
 ├─ AttentionLedger
 └─ SamplingPolicy (theo kênh)

PolicyRecord                                ← mới
 ├─ PolicyCheck (PC1–PC8) ──── evidence
 ├─ DisclosureDecision
 ├─ PolicyIncident ──── RCA, appeal, learned proposals
 ├─ ChannelFreeze
 └─ PolicySnapshot ──── diff theo kỳ
```

Cả ba là **thay đổi schema, không phải capability** — rẻ nếu làm trước khi vận hành, đắt nếu bổ sung sau khi đã có nhiều video.

---

## A6 · Khung kiểm soát — M0 mở rộng

Ba tầng gate giữ nguyên. M0 được bổ sung hai nhóm kiểm mới:

| Tầng | Nhóm cũ | Nhóm mới (v2) |
|---|---|---|
| **M0** | Advice lint, rights lineage, platform compliance | **Editorial Imprint** (PC-1) · **Policy Defense Checklist PC1–PC8** |
| M1 | Không đổi | — |
| M2 | Không đổi | Trong Track G chưa có anchor: chạy chế độ cảnh báo, không chặn (P5) |

Quy tắc M0/M1 trước M2 giữ nguyên. Bổ sung: **PC1–PC8 là điểm chặn publish duy nhất** — kể cả khi mọi gate khác PASS (G15).

---

## A7 · Cây chỉ số — thêm hai nhánh

```
Giá trị danh mục
├─ Hiệu quả nội dung          (không đổi)
├─ Năng suất                   (không đổi)
├─ Kinh tế đơn vị              (không đổi)
├─ Rủi ro
│   ├─ P0 escape rate
│   ├─ Rights/compliance incident
│   ├─ Capability qualification drift
│   ├─ Policy incident theo mức I1–I4        ◀── mới
│   └─ Escaped defect density theo class     ◀── mới
├─ Tiến hóa                                   ◀── nhánh mới
│   ├─ Proposal theo trạng thái và nguồn
│   ├─ Thời gian DETECTED → PROMOTED
│   ├─ Kích thước gold set theo defect class
│   └─ Tỷ lệ learning PROMOTED / READY
└─ Tải con người                              ◀── nhánh mới
    ├─ Phút chú ý/tuần theo điểm chạm
    ├─ Tuổi hàng đợi HP
    └─ Tỷ lệ video có ≥N quyết định biên tập
```

---

## B1 · Phân tầng — thêm Evolution Plane

```
┌───────────────────────────────────────────────────────────────┐
│  PRESENTATION PLANE   + hàng đợi HP, evidence report, đồng hồ  │
│                         ngân sách chú ý                        │
└───────────────────────────┬───────────────────────────────────┘
┌───────────────────────────▼───────────────────────────────────┐
│  CONTROL PLANE        + policy checklist gate, channel freeze  │
└───┬──────────┬──────────┬──────────┬──────────┬───────────────┘
    │          │          │          │          │
┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌──▼─────┐ ┌──▼──────────────┐
│CAPABIL.│ │EXECUT. │ │MEASURE.│ │LEARNING│ │ EVOLUTION       │◀ mới
│ PLANE  │ │ PLANE  │ │ PLANE  │ │ PLANE  │ │ PLANE           │
│        │ │        │ │        │ │        │ │ Proposal        │
│        │ │        │ │        │ │+LRN-04 │ │ Shadow runner   │
│        │ │        │ │        │ │        │ │ Evidence bundle │
│        │ │        │ │        │ │        │ │ Policy watch    │
└───┬────┘ └───┬────┘ └───┬────┘ └──┬─────┘ └──┬──────────────┘
    └──────────┴──────────┴─────────┴──────────┘
                         │
              PROVIDER PLANE · STORAGE PLANE   (không đổi)
```

**Ràng buộc kiến trúc quan trọng:** Evolution Plane **không phụ thuộc domain packages**. Nó phải chạy được cả khi domain đang hỏng — vì một trong những lúc cần nó nhất là khi có sự cố.

---

## B2 · Bounded contexts — thêm ba

| Context | Sở hữu | Không được chạm vào |
|---|---|---|
| **Change Governance** | Proposal, shadow run, change log, promotion | Nội dung artifact; production lineage |
| **Human Record** | Human actor, decision, attention, sampling policy | Nội dung quyết định (chỉ ghi nhận, không đánh giá) |
| **Policy Defense** | Policy check, disclosure, incident, freeze, snapshot | Cách sửa nội dung |

Ràng buộc bổ sung, ngang hàng với hai ràng buộc gốc ("Assurance không được biết cách sửa lỗi, Learning không được ghi trực tiếp vào Standard"):

> **Change Governance không được tự kích hoạt thay đổi của chính nó.**
> Proposal đi qua owner command, kể cả proposal về chính Evolution Pipeline.

---

## B6 · Capability — hai bổ sung

**Shadow qualification dùng chung harness với EVO-01.** Bản gốc mô tả shadow qualification cho trường hợp provider bump version; v2 tổng quát hóa: mọi meta-change đều dùng cùng cơ chế shadow. Không viết hai lần.

**Gold set là tài sản tích lũy, không phải bộ cố định.** Bản gốc mô tả gold set như một bộ 30 mẫu dựng một lần. v2: đây là bộ **lớn dần vĩnh viễn** qua LRN-04 — mọi rejection, mọi escaped defect, mọi incident đều bổ sung vào. Bảng append-only (G14) là hệ quả trực tiếp: gold set nhỏ đi nghĩa là năng lực phát hiện lỗi giảm đi.

---

## B8 · Kiến trúc học — thêm phạm vi

```
Learning scope:
  CHANNEL    nhất quán ≥ MIN_CONSISTENT_VIDEOS trong CÙNG kênh
             → promote vào standard/strategy CỦA KÊNH ĐÓ

  PORTFOLIO  đã PROMOTED ở ≥ PORTFOLIO_MIN_CHANNELS kênh độc lập,
             cùng chiều tác động
             → thành portfolio default cho kênh MỚI
             → kênh đang chạy KHÔNG bị áp hồi tố

CẤM: promote thẳng PORTFOLIO từ dữ liệu một kênh.
CẤM: learning chạm ChannelIdentityContract của kênh khác.
      Tri thức xuyên kênh mang STRUCTURE (hook type, nhịp beat,
      packaging pattern), KHÔNG mang VOICE (P8).
```

**Vì sao tách.** Kênh mới thừa hưởng portfolio default → không học lại từ đầu. Đây là lợi thế scale thật của nhà máy và là tài sản thương mại nếu bán năng lực. Nhưng trộn phạm vi sẽ đồng hóa các kênh — vi phạm chính differentiation mà anti-copy đang bảo vệ, và tạo ra đúng hồ sơ "nhiều kênh một khuôn" mà nền tảng nhắm tới. Hai luật trên giữ được cả hai.

**Giới hạn trung thực của tốc độ học.** Băng thông = nhịp publish × độ trễ analytics × số video cần nhất quán. Ở nhịp 2 video/kênh/tuần với cửa sổ 14–28 ngày và yêu cầu ≥2 video: **~1–2 learning promoted/kênh/tháng**. Không có kiến trúc nào vượt được ràng buộc này; muốn nhanh hơn thì tăng nhịp hoặc ghi nhãn thất bại tốt hơn, không phải nới quy trình.

---

## B9 · Bảo mật & môi trường — bổ sung

**Identity.** Bản gốc nêu SIWC/allowlist cho owner command. v2 tách hai bảng: `owner_identity` (quyền lệnh P10) và `human_actor` (ai được ghi Editorial Imprint). Một service account **không bao giờ** được xuất hiện ở bảng thứ hai — cưỡng chế bằng `CHECK (is_service = 0)`.

**Namespace.** Thêm prefix `gold/` cho gold set, ngang hàng `qual/` về ràng buộc: không bao giờ xuất hiện trong lineage sản xuất.

**Evidence.** Thêm `policy_snapshot` — chính sách nền tảng được đối xử như mọi nguồn khác: snapshot, hash, provenance, diff theo kỳ.

---

## B10 · Ánh xạ kiến trúc sang lộ trình — bảng thay thế

Bảng FP trong bản gốc được thay bằng ánh xạ theo work package của `04-BUILD-ORDER v2`:

| Thành phần kiến trúc | WP | Điều kiện tiên quyết |
|---|---|---|
| Canonical hashing, fencing, cost reservation | 01, 03, 08 | — |
| Tách immutability/eligibility | 01, 04 | Canonical hashing |
| Tách namespace qualification/production | 00, 04 | — |
| Media tier (container workers) | 12 | Job envelope contract, §4 |
| **Benchmark kinh tế 3 cấu hình** | **12B** | Media tier, §3 |
| Gold set + regression suite | 14 | Namespace tách |
| Qualify assurance capability | 22 | Gold set, rubric anchor |
| Forced alignment pin + calibrate | 15 | Terminology ledger |
| ChannelIdentityContract | 19 | §2 |
| PackagingContract | 18 | — |
| PredictedPerformance | 18 | Beat state assertion |
| **G11–G15 enforcement** | **26** | Standard registry, command log |
| **Evolution pipeline** | **27** | WP-26, registry |
| **Human touchpoints + evidence** | **28** | DoR, operator UI, §11 |
| **Policy defense** | **29** | Evidence store, anti-copy primitives, §9 §10 |
| **LRN-04 + learning scope** | **30** | Gold set, learning, evolution |
| **OPERATE harness** | **31** | Operator UI, policy defense |
| Learning plane + experiment registry | 24 | PredictedPerformance, publish đầu tiên |
| Portfolio & concurrency | 25, 28 | Nhịp mục tiêu §1, trần chú ý §11 |

---

## B11 · Quyết định phải chốt — từ 3 lên 11

Bản gốc nêu ba quyết định nền (nhịp, identity, kinh tế). v2 mở rộng thành mười một, đầy đủ trong `07-DECISIONS-REQUIRED` và đã điền trong `DECISIONS-ANSWERED`.

Tám quyết định thêm: hạ tầng media (§4), nhà cung cấp audio (§5), rubric anchor (§6), dữ liệu hiệu chuẩn (§7), baseline curve (§8), lập trường disclosure (§9), thẩm quyền sự cố (§10), trần chú ý (§11).

Ba trong số đó (§9, §10, §11) không tồn tại trong bản gốc vì chúng là hệ quả của P12 và P13 — chúng chỉ xuất hiện khi coi con người và chính sách nền tảng là thành phần kiến trúc chứ không phải bối cảnh bên ngoài.

---

## Ghi chú về hai track

`04-BUILD-ORDER v2` chia thành Track P (platform) và Track G (golden path). Về mặt kiến trúc, đây **không phải hai hệ thống** — cùng codebase, khác `PROFILE`. Điều này quan trọng: mọi thứ Track G học được (gold set, anchor, baseline, cost thật, hiệu chuẩn ngưỡng) áp thẳng vào Track P mà không cần port.

Đây cũng là lý do kiến trúc: nếu Track G là một prototype riêng, nó sẽ sinh ra dữ liệu không dùng lại được, và ta sẽ phải học hai lần.
