# AI Factory — Đặc tả module: Nền tảng & Điều khiển

Tập 1/2. Bao gồm 19 module thuộc năm nhóm: Control Core, Capability, Provider, Execution, Operations.

Mỗi module theo cùng một khuôn: **Mục đích · Tính năng · Quy trình · Công cụ & kỹ thuật · Tiêu chuẩn · Giao diện & dữ liệu · Acceptance**.

---

# NHÓM 1 — CONTROL CORE

## CORE-01 · Canonical Hashing & Lineage

**Mục đích.** Cung cấp một định danh nội dung ổn định, tái lập được cho mọi đối tượng trong hệ thống, và duy trì đồ thị lineage giữa chúng. Toàn bộ tính toàn vẹn của hệ thống dựa trên module này.

**Tính năng.**
- Hàm hash chuẩn hóa duy nhất cho toàn bộ codebase
- Hash hai mức cho media: file-level và stream-level
- Đồ thị lineage có hướng, không chu trình, truy vấn ngược/xuôi
- Phát hiện và chặn hash thuộc vùng cách ly

**Quy trình.**
```
canonicalHash(obj):
  1. stripVolatile(obj)        // bỏ timestamp, request_id, latency, nonce
  2. unicodeNFC(mọi trường chuỗi)
  3. JCS serialize (RFC 8785)  // khóa sắp theo UTF-16 code unit,
                               // số theo ECMAScript Number::toString,
                               // không khoảng trắng
  4. sha256(bytes)
```
Với media: thêm `streamHash = ffmpeg -f framemd5` để tách lỗi container khỏi lỗi nội dung.

**Công cụ & kỹ thuật.** RFC 8785 JCS; Unicode NFC; SHA-256; FFmpeg `framemd5`; cấu trúc lineage lưu dạng edge list trong D1, truy vấn bằng recursive CTE.

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| Ổn định hash | 1.000 permutation thứ tự khóa → cùng một giá trị |
| Cấm | Gọi `JSON.stringify` trước khi hash ở bất kỳ đâu |
| Media | Bắt buộc cả `file_sha256` và `stream_framemd5` |
| Lineage | Không cho phép chu trình; kiểm ở thời điểm ghi edge |

**Giao diện & dữ liệu.**
```ts
canonicalHash(obj: unknown): Hex64
streamHash(r2Key: string): Promise<Hex64>
addLineage(parent: ArtifactId, child: ArtifactId, relation: string): void
ancestors(id: ArtifactId, depth?: number): ArtifactId[]
isQuarantined(hash: Hex64): boolean
```
Sở hữu bảng: `artifact_lineage`, `quarantine_hash`.

**Acceptance.** Test permutation pass; test round-trip Unicode (NFC/NFD) pass; recursive CTE trả đúng tổ tiên ở độ sâu 10; mọi hash trong `quarantine_hash` bị từ chối khi dùng làm input.

---

## CORE-02 · Typed Command & State Machine

**Mục đích.** Là con đường duy nhất để thay đổi trạng thái hệ thống. Mọi thay đổi phải đi qua một trong tám lệnh có kiểu, với bất biến được cưỡng chế ở tầng dữ liệu.

**Tính năng.**
- Tám lệnh có kiểu, ba trong đó bắt buộc identity-bound
- Optimistic concurrency qua `prev_state`
- Idempotency qua khóa duy nhất
- Fencing token chống writer cũ
- Command log append-only làm audit trail

**Quy trình.**
```
execute(command):
  BEGIN TRANSACTION
    1. command.fencing_token ≥ package.lease_token       else REJECT_STALE_WRITER
    2. INSERT command_log(idempotency_key)               else REJECT_DUPLICATE
    3. current_state = read(target)
       current_state = command.prev_state                else REJECT_CONFLICT
    4. nếu command ∈ {AUTHORIZE_*, PROMOTE_LEARNING}:
         verify identity signature                       else REJECT_UNAUTHORIZED
    5. apply(command) → next_state
    6. append command_log(prev_state, next_state, actor)
  COMMIT
  → thất bại bất kỳ bước nào: zero side effect, zero spend
```

**Công cụ & kỹ thuật.** D1 transaction; `UNIQUE` constraint trên `idempotency_key`; trigger chặn `UPDATE`/`DELETE` trên `command_log`; SIWC/allowlist cho identity binding.

**Tiêu chuẩn.**

| Lệnh | Actor | Identity-bound |
|---|---|---|
| `START_STAGE` | Orchestrator | Không |
| `PRODUCE_ARTIFACT` | Stage Runner | Không |
| `VERIFY_ARTIFACT` | Stage Runner | Không |
| `FREEZE_STAGE` | Orchestrator | Không |
| `REOPEN_ROOT_STAGE` | Operator | Không |
| `AUTHORIZE_RELEASE` | Owner | **Có** |
| `AUTHORIZE_PUBLISH` | Owner | **Có** |
| `PROMOTE_LEARNING` | Owner | **Có** |

`idempotency_key = sha256(stage_id ‖ input_hash ‖ attempt_ordinal)`.

**Giao diện & dữ liệu.** Sở hữu `command_log`, `stage_instance.control_state`. Không module nào khác được `UPDATE` trực tiếp hai bảng này.

**Acceptance.** Gửi cùng một lệnh 100 lần đồng thời → đúng một lần có hiệu lực; writer với token cũ bị từ chối; `UPDATE` trên `command_log` bị trigger chặn.

---

## CORE-03 · Lease & Concurrency Control

**Mục đích.** Đảm bảo mỗi production package có đúng một writer tại một thời điểm, kể cả khi tiến trình bị treo hoặc phân vùng mạng.

**Tính năng.**
- Cấp lease độc quyền với fencing token đơn điệu
- Heartbeat và TTL
- Reconciliation tự động khi lease hết hạn
- Lease theo kênh (chuẩn bị cho đa kênh), không phải theo toàn hệ thống

**Quy trình.**
```
acquire(package, holder):
   nếu lease đang hợp lệ và khác holder → REJECT
   token = increment(package.lease_token)        // đơn điệu, không tái sử dụng
   ghi lease_holder, lease_token, expires_at = now + TTL
   → trả token cho holder

heartbeat(package, holder, token) mỗi 30s → gia hạn expires_at

expire(package):
   đánh dấu mọi provider_request đang mở → ORPHANED
   đánh dấu mọi spend_reservation HELD → EXPIRED
   chặn cấp lease mới cho tới khi reconciliation hoàn tất
```

**Công cụ & kỹ thuật.** Cloudflare Durable Object cho tính tuần tự đơn luồng; fencing token theo Kleppmann; TTL = 3 × chu kỳ heartbeat.

**Tiêu chuẩn.**

| Tham số | Giá trị |
|---|---|
| Chu kỳ heartbeat | 30 s |
| TTL lease | 90 s |
| Phạm vi lease | Theo `(channel_id, package_id)` |
| Token | Số nguyên đơn điệu, không bao giờ tái sử dụng |

**Giao diện & dữ liệu.**
```ts
acquireLease(packageId, holderId): { token: number } | Rejected
heartbeat(packageId, holderId, token): boolean
releaseLease(packageId, holderId, token): void
reconcileExpired(packageId): ReconciliationReport
```

**Acceptance.** Mô phỏng GC pause 120 s ở holder A trong khi B nhận lease → mọi ghi từ A sau đó bị từ chối; sau expire, không cấp được lease mới trước khi reconciliation xong.

---

## CORE-04 · Definition of Ready Resolver

**Mục đích.** Quyết định một stage có được phép chạy hay không, bằng cách **tính lại từ bằng chứng** thay vì đọc cờ đã lưu.

**Tính năng.**
- Đánh giá đầy đủ chín điều kiện DoR
- Phân biệt `NOT_EVALUATED` với `PASS` ở gate M0/M1
- Trả về lý do từ chối có cấu trúc, không chỉ boolean
- Dừng ở zero spend, không tính là production attempt

**Quy trình.**
```
resolveDoR(stage):
  ✓ lease hợp lệ
  ✓ ∀ parent: immutability = SEALED
              ∧ eligibility ≥ ELIGIBLE_FOR_STAGE
              ∧ standard_version ≥ required(stage)
  ✓ ∀ gate ∈ gates_owned_by(parents), tier ∈ {M0,M1}: state = PASS
       (NOT_EVALUATED bị từ chối — đây là điều kiện đóng lỗ hổng an toàn)
  ✓ ∀ cap ∈ required(stage): qualified(cap, archetypes(stage))
                            ∧ settings_hash khớp registry
  ✓ active_provider_requests = 0
  ✓ expired_leases_unreconciled = 0
  ✓ available_budget ≥ estimated_cost(stage)
  ✓ ¬ references_quarantined_hash(inputs)
  ✓ không có provider request xung đột
```

**Công cụ & kỹ thuật.** Thuần truy vấn D1; không gọi provider; kết quả có cache ngắn (≤10 s) với invalidation theo command log.

**Tiêu chuẩn.** Thời gian đánh giá p95 ≤200 ms. Mọi từ chối trả về `{condition, expected, actual, remediation}`.

**Giao diện & dữ liệu.**
```ts
resolveDoR(stageInstanceId): { ready: true } | { ready: false, failures: Failure[] }
```
Không sở hữu bảng; chỉ đọc.

**Acceptance.** Với gate M0 ở trạng thái `NOT_EVALUATED`, DoR phải trả `false` — đây là test hồi quy bắt buộc cho lỗ hổng `VQ-M0-SAFETY-SCOPE`.

---

## CORE-05 · Standard & Policy Registry

**Mục đích.** Quản lý các phiên bản tiêu chuẩn và chính sách, giải quyết kế thừa Channel → Pillar → Series → Episode, và ngăn cấp dưới làm yếu gate của cấp trên.

**Tính năng.**
- Tiêu chuẩn có version, kế thừa bốn cấp
- Ba tầng gate M0/M1/M2 với luật thứ tự
- Bốn trạng thái gate, `WAIVED` bị cấm ở M0
- Phát hiện lệch version giữa các nhóm stage

**Quy trình.**
```
resolveStandard(episode):
  channel_std → pillar_std → series_std → episode_std
  hợp nhất theo luật: cấp dưới CHỈ được siết, không được nới
  nếu cấp dưới đặt ngưỡng thấp hơn cấp trên → REJECT tại thời điểm ghi
```
Kiểm lệch version: nếu `max(standard_version) − min(standard_version)` trong một package vượt ngưỡng → cảnh báo `STANDARD_DRIFT`, chặn freeze.

**Công cụ & kỹ thuật.** Bảng version có lineage; giải quyết kế thừa bằng recursive CTE; policy biểu diễn dạng JSON có schema.

**Tiêu chuẩn.**

| Tầng | Nội dung | Quy tắc |
|---|---|---|
| M0 | Safety & Rights | Không được `WAIVED` trong mọi hoàn cảnh |
| M1 | Technical Integrity | `WAIVED` cần owner + thời hạn |
| M2 | Editorial Quality | Chỉ chạy sau khi M0+M1 sạch |

**Giao diện & dữ liệu.** Sở hữu `standard_registry`, `gate_definition`, `policy`.

**Acceptance.** Thử ghi một episode standard nới lỏng gate của channel → bị từ chối; thử `WAIVE` một gate M0 → bị từ chối bất kể actor.

---

## CORE-06 · Evidence Store

**Mục đích.** Lưu trữ bất biến mọi bằng chứng: snapshot nguồn web, request/response provider, output đo lường, verdict critic. Bằng chứng phải tái lập được sau nhiều tháng.

**Tính năng.**
- Snapshot nội dung web thật (HTML + text + hash), không chỉ URL
- Snapshot đầy đủ request/response mọi provider call
- Phân vùng lưu trữ theo namespace
- Chính sách lưu giữ và phân loại nhạy cảm bản quyền

**Quy trình.**
```
snapshotSource(url):
   fetch → lưu HTML gốc + text đã trích + fetched_at + content_hash
   → R2: snapshot/{package}/sources/{content_hash}.html
   → evidence registry trỏ vào R2 object, KHÔNG trỏ URL sống

snapshotProviderCall(trace_id, span_id, request, response):
   → R2: evidence/{package}/{trace_id}/{span_id}/{request|response}.json
   → bind vào provider_request ledger
```

**Công cụ & kỹ thuật.** R2 với tiền tố khóa theo namespace; nén gzip cho JSON; presigned URL phạm vi hẹp khi cần chia sẻ.

**Tiêu chuẩn.**

| Loại bằng chứng | Lưu giữ | Ghi chú |
|---|---|---|
| Source snapshot | Vĩnh viễn | Có thể chứa nội dung bản quyền → phân vùng riêng, không public |
| Provider request/response | ≥12 tháng | Cần cho điều tra và đối soát chi phí |
| Measurement output | Vĩnh viễn | Là cơ sở của gate evaluation |
| Rejected candidate | Vĩnh viễn | Bằng chứng tournament |

**Giao diện & dữ liệu.**
```ts
putEvidence(namespace, path, bytes, meta): { r2Key, sha256 }
getEvidence(r2Key): bytes
```

**Acceptance.** Xóa một URL nguồn khỏi internet → hệ thống vẫn tái lập được bằng chứng từ snapshot; mọi provider call có snapshot đầy đủ hai chiều.

---

# NHÓM 2 — CAPABILITY

## CAP-01 · Capability Registry

**Mục đích.** Đăng ký mọi cơ chế có thể tạo ra output, gắn với version, provider, model snapshot và settings hash. Là nguồn quyền cho phép dispatch.

**Tính năng.**
- Đăng ký capability có version
- Binding capability × archetype với trạng thái qualification
- Pin model snapshot cụ thể, cấm alias trỏ latest
- Trigger requalification tự động khi bất kỳ yếu tố nào đổi
- Shadow qualification khi provider bump version

**Quy trình.**
```
Vòng đời:
REGISTERED → FIXTURE_DESIGNED → QUALIFICATION_RUNNING
   → QUALIFIED (dispatch mở)
   → SUPERSEDED (có version mới) | REVOKED (fail regression sau đó)

Trigger requalify:
   model_snapshot đổi · settings_hash đổi · rights rule đổi
   · standard_version đổi · gold set phát hiện regression
```

**Công cụ & kỹ thuật.** `settings_hash = canonicalHash({model_snapshot, temperature, top_p, seed, system_prompt_hash, response_format})`.

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| Model version | Snapshot cụ thể, ví dụ `gpt-5.6-2026-xx-xx` |
| Cấm | Alias `latest`, `default` |
| Cửa sổ chuyển đổi | Version cũ và mới cùng hợp lệ N ngày |
| Coverage tối thiểu | Mọi archetype mà stage sử dụng phải qualified |

**Giao diện & dữ liệu.** Sở hữu `capability`, `capability_archetype_binding`.

**Acceptance.** Đổi một ký tự trong system prompt → `settings_hash` đổi → dispatch bị chặn tự động; shadow qualification chạy được song song mà không đóng dispatch version cũ.

---

## CAP-02 · Fixture & Gold Set Manager

**Mục đích.** Quản lý bộ fixture hardest-first để qualify capability, và gold set có nhãn để qualify chính cơ chế phán xử. Đây là module phá được vòng lặp "critic phải qualified nhưng không có ground truth".

**Tính năng.**
- Thiết kế fixture theo nguyên tắc hardest-first
- Gold set có nhãn defect, hai nguồn: master đã bị từ chối và mẫu tổng hợp
- Regression suite vĩnh viễn từ failure corpus
- Đo recall/precision/variance của critic

**Quy trình xây gold set.**
```
1. Trích 15 mẫu từ 595 output bị loại và 15 master owner đã từ chối
   → nhãn ĐÃ TỒN TẠI (owner đã phán quyết), chỉ cần cấu trúc hóa
2. Sinh 15 mẫu tổng hợp gài defect đã biết:
      • lệch A/V sync 200 ms
      • seam audio tại một ranh giới đoạn
      • narration nói A trong khi visual thể hiện B
      • near-static 12 giây
      • footage thiếu rights lineage
      • caption drift tích lũy
      • duplicate visual >5%
      • claim không có nguồn
3. Ghi ground truth có cấu trúc: {defect_class, severity, t_start, t_end}
4. Lưu vào namespace `gold/`, KHÔNG BAO GIỜ vào lineage sản xuất
```

**Công cụ & kỹ thuật.** FFmpeg để tạo mẫu tổng hợp (offset audio, chèn freeze, thay footage); schema ground truth có kiểu.

**Tiêu chuẩn.**

| Chỉ số | Ngưỡng qualification |
|---|---|
| Recall trên defect P0 | 100% — không được bỏ sót bất kỳ loại nào |
| Recall trên defect P1 | ≥90% |
| Precision | ≥80% (báo nhầm quá nhiều làm gate mất tin cậy) |
| Variance qua 3 lần chạy | ≤3 điểm trên thang 100 |
| Cỡ gold set tối thiểu | 30 mẫu, phủ mọi defect class |

**Giao diện & dữ liệu.** Sở hữu `fixture`, `gold_sample`, `defect_label`.

**Acceptance.** Chạy 9 critic trên gold set → báo cáo recall theo từng defect class; thêm một capability version mới → bắt buộc chạy lại toàn bộ gold set trước khi qualified.

---

## CAP-03 · Qualification Runner

**Mục đích.** Thực thi qualification cho một cặp capability × archetype trên fixture, trong namespace tách biệt hoàn toàn khỏi sản xuất.

**Tính năng.**
- Chạy fixture hardest-first
- Đo first-pass yield thật, không phải yield sau retry
- Ghi bằng chứng đầy đủ
- Cấp hoặc từ chối binding

**Quy trình.**
```
run(capability, archetype, fixture):
  1. namespace = 'qualification'    ← ràng buộc cứng, không thể ghi đè
  2. thực thi fixture n lần (n ≥ 10 cho archetype CRITICAL)
  3. đo first_pass_yield = (số lần pass ngay lần đầu) / n
  4. so với archetype.min_first_pass_yield
  5. lưu evidence vào qual/{capability}@{version}/{archetype}/{run_id}/
  6. pass → cấp binding QUALIFIED
     fail → giữ QUALIFICATION_REQUIRED, ghi nguyên nhân phân loại
```

**Công cụ & kỹ thuật.** Cùng stage runner với sản xuất nhưng khác namespace và khác nguồn ngân sách; ngân sách qualification tách riêng khỏi ngân sách sản xuất.

**Tiêu chuẩn.**

| Loại archetype | Số lần chạy tối thiểu | First-pass yield |
|---|---|---|
| CRITICAL | 10 | 100% (assurance) / 97% (audio) / 95% (visual) |
| HIGH | 8 | 95% |

**Giao diện & dữ liệu.** Sở hữu `qualification_run`, `qualification_result`.

**Acceptance.** Không có bất kỳ artifact nào từ namespace `qualification` xuất hiện được trong lineage sản xuất — kiểm bằng test tự động quét toàn bộ `artifact_lineage`.

---

## CAP-04 · Dispatch Guard

**Mục đích.** Điểm chặn duy nhất trước mọi lời gọi provider. Fail-closed: thiếu bằng chứng qualification thì chặn.

**Tính năng.**
- Kiểm binding qualification
- Kiểm settings hash khớp registry
- Kiểm fencing token
- Kiểm và giữ chỗ ngân sách trước khi dispatch
- Audit mọi lần chặn

**Quy trình.**
```
dispatch(capability, archetype, request):
  1. binding.state ≠ QUALIFIED                    → REJECT  [zero spend]
  2. capability.settings_hash ≠ request hash      → REJECT  [zero spend]
  3. lease.fencing_token < request.token          → REJECT  [zero spend]
  4. reservation = cost.reserve(estimate(request))
     reservation = null                           → REJECT  [zero spend]
  5. snapshot request → R2
  6. response = provider.call(request, idempotency_key)
  7. snapshot response → R2
  8. cost.settle(reservation, actual_cost)
  9. return response
```

**Công cụ & kỹ thuật.** Middleware bắt buộc trong provider adapter framework; không có đường vòng — mọi adapter phải đi qua guard theo thiết kế kiểu.

**Tiêu chuẩn.** Mọi từ chối ở bước 1–4 là zero spend và **không tính là production attempt**. Mọi lần chặn ghi vào audit log với lý do phân loại.

**Giao diện & dữ liệu.**
```ts
guardedDispatch<Req, Res>(
  capability: CapabilityRef,
  archetype: ArchetypeRef,
  request: Req,
  context: { fencingToken, packageId, stageInstanceId }
): Promise<Res>
```

**Acceptance.** Không tồn tại đường code nào gọi provider mà không qua guard — kiểm bằng lint tĩnh cấm import trực tiếp SDK provider ngoài thư mục adapter.

---

# NHÓM 3 — PROVIDER & CHI PHÍ

## PRV-01 · Provider Adapter Framework

**Mục đích.** Chuẩn hóa mọi tương tác với nhà cung cấp bên ngoài sau một giao diện duy nhất, để capability guard, cost control và evidence store áp dụng đồng nhất.

**Tính năng.**
- Giao diện adapter chung
- Chuẩn hóa lỗi thành lớp có nghĩa
- Retry có phân biệt loại lỗi
- Ước lượng chi phí trước khi gọi

**Giao diện.**
```ts
interface ProviderAdapter<Req, Res> {
  capabilityId: string
  version: string
  settingsHash: Hex64
  estimateCost(req: Req): CostEstimate      // đếm token thật, không đoán
  dispatch(req: Req, idem: string): Promise<Res>
  normalizeError(e: unknown): ErrorClass
}

type ErrorClass =
  | 'TRANSIENT'        // retry được
  | 'RATE_LIMIT'       // retry với backoff
  | 'SCHEMA_VIOLATION' // KHÔNG retry — lỗi thiết kế prompt/schema
  | 'RIGHTS_DENIED'    // KHÔNG retry — escalate
  | 'BUDGET_DENIED'    // KHÔNG retry
  | 'CONTENT_FILTERED' // KHÔNG retry — escalate
  | 'PROVIDER_ERROR'
```

**Quy trình retry.** Chỉ `TRANSIENT` và `RATE_LIMIT` được retry, tối đa 3 lần, exponential backoff có jitter. `SCHEMA_VIOLATION` phải escalate — retry một lỗi schema chỉ đốt tiền.

**Công cụ & kỹ thuật.** Tokenizer đếm trước cho ước lượng OpenAI; `max_tokens` làm cận trên chi phí đầu ra; structured output với JSON Schema strict mode và `additionalProperties: false`.

**Tiêu chuẩn.** Phân loại 7 request failed hiện có theo `ErrorClass` là điều kiện tiên quyết để mở FP4 — nếu phần lớn là `SCHEMA_VIOLATION`, tỷ lệ lỗi sẽ nhân lên ở giai đoạn media.

**Acceptance.** Mọi adapter implement đủ giao diện; test: `SCHEMA_VIOLATION` không bao giờ được retry.

---

## PRV-02 · Cost Reservation & Ledger

**Mục đích.** Chuyển kiểm soát chi phí từ hậu kiểm sang tiền kiểm, đảm bảo không bao giờ vượt trần kể cả khi dispatch song song.

**Tính năng.**
- Giữ chỗ hai pha
- Trần phân cấp: portfolio → channel → package → stage
- Đối soát orphan khi timeout hoặc lease hết hạn
- Chỉ số kinh tế đơn vị

**Quy trình.**
```
RESERVE:  atomic check
          (đã dùng + đang giữ chỗ + ước lượng) > ceiling → REJECT, zero dispatch
          ngược lại → ghi spend_reservation state=HELD, expires_at

DISPATCH: gọi provider với idempotency key

SETTLE:   ghi actual_cost, giải phóng phần giữ chỗ dư, state=SETTLED

TIMEOUT:  reservation quá expires_at → state=EXPIRED → orphan ledger
          → bắt buộc đối soát trước khi package tiếp tục
```

**Tiêu chuẩn.**

| Chỉ số cần theo dõi | Mục đích |
|---|---|
| Cost per sealed artifact | Phát hiện stage đắt bất thường |
| Cost per published video | Kinh tế đơn vị |
| Tỷ trọng chi phí tournament / tổng | Biết khi nào tournament width mua thêm chi phí thay vì chất lượng |
| Orphan rate | Sức khỏe của reconciliation |

**Giao diện & dữ liệu.**
```ts
reserve(scope, estimate): Reservation | null
settle(reservationId, actualCost): void
reconcileOrphans(packageId): OrphanReport
```
Sở hữu `spend_reservation`, `provider_request`, `cost_entry`.

**Acceptance.** 50 dispatch song song với trần chỉ đủ cho 10 → đúng 10 được phép, 40 bị từ chối ở bước reserve với zero spend.

---

## PRV-03 · Rights & License Registry

**Mục đích.** Biến rights từ một trường kiểm tra thành đối tượng lineage có điều khoản, phù hợp với kênh sẽ monetize.

**Tính năng.**
- Schema license riêng theo provider
- Điều khoản có cấu trúc: territory, duration, editorial-vs-commercial
- Kiểm tương thích với mục đích sử dụng
- Cảnh báo rủi ro Content ID

**Cấu trúc.**
```
license_record {
  provider, provider_asset_id, license_type, license_url,
  territory[], duration_rights, editorial_only BOOLEAN,
  monetization_allowed BOOLEAN,
  modification_allowed BOOLEAN,
  attribution_required BOOLEAN, attribution_text,
  content_id_risk: NONE | POSSIBLE | KNOWN,
  acquired_at, snapshot_r2_key      // snapshot trang license tại thời điểm mua
}
```

**Tiêu chuẩn.**

| Provider | Rủi ro đặc thù |
|---|---|
| Pexels / Pixabay | Provenance biến động; điều khoản có thể đổi hồi tố → bắt buộc snapshot trang license |
| Shutterstock | Có gói editorial-only — cấm dùng cho nội dung thương mại |
| Production music | Bắt buộc `monetization_allowed = true` và có cơ chế clear Content ID |

Gate M0: mọi asset trong master phải có `license_record` đầy đủ và tương thích với mục đích sử dụng. Thiếu → chặn, không cảnh báo.

**Acceptance.** Thử đưa một asset `editorial_only = true` vào video monetize → bị chặn ở gate M0; mọi license record có snapshot trang điều khoản.

---

# NHÓM 4 — EXECUTION

## EXE-01 · Orchestrator

**Mục đích.** Điều phối vòng đời stage: gọi DoR resolver, phát lệnh, quản lý hàng đợi, xử lý ngoại lệ và định tuyến nguyên nhân gốc.

**Tính năng.**
- Vòng lặp lifecycle chuẩn cho mọi stage
- Định tuyến lỗi về stage gốc, không sửa tại chỗ
- Hàng đợi theo kênh với ưu tiên
- Emergency stop và resume có kiểm soát

**Quy trình lifecycle.**
```
DoR → START_STAGE → [Stage Runner sản xuất và preflight]
    → PRODUCE_ARTIFACT → [read-back, checksum, rights, quality verify]
    → VERIFY_ARTIFACT → FREEZE_STAGE → mở stage kế
```
Khi assurance fail:
```
1. dừng scale
2. giữ nguyên master và findings (không sửa, không retry cosmetic)
3. phân loại: contract | capability | provider | integration | standard
4. REOPEN_ROOT_STAGE tại stage gốc
5. sửa cơ chế tái sử dụng được, requalify capability
6. sản xuất đúng MỘT revision mới
7. revision mới vẫn fail → architecture incident, không auto-retry
```

**Tiêu chuẩn.** `auto_dispatch = false` và `auto_publish = false` là mặc định ở mọi package. Tối đa 1 root-cause revision mỗi video ở pilot, tiến về 0 khi scale.

**Acceptance.** Assurance fail → hệ thống không tự sinh revision thứ hai; phân loại nguyên nhân là bắt buộc trước khi `REOPEN_ROOT_STAGE` được chấp nhận.

---

## EXE-02 · Stage Runner Framework

**Mục đích.** Khung chung để triển khai 18 stage runner, đảm bảo mọi stage tuân thủ cùng một lifecycle và cùng các bất biến.

**Tính năng.**
- Template method: mỗi stage chỉ implement phần đặc thù
- Preflight bắt buộc trước khi seal
- Read-back verification bắt buộc
- Xử lý attempt và idempotency

**Giao diện.**
```ts
abstract class StageRunner<In, Out> {
  abstract requiredCapabilities(): CapabilityRef[]
  abstract inputSchema(): JSONSchema
  abstract produce(input: In, ctx: RunContext): Promise<Candidate<Out>[]>
  abstract preflight(candidate: Out, ctx): Promise<PreflightResult>  // xác định
  abstract acceptanceTests(out: Out): AcceptanceTest[]

  // framework lo: DoR, lease, tournament, seal, read-back, evidence
  final run(stageInstanceId): Promise<void>
}
```

**Quy trình khung.**
```
1. resolveDoR                    → fail: dừng, zero spend
2. validate input schema         → strict, không dùng default cho trường quan trọng
3. produce candidates            → có giới hạn số lượng
4. tournament                    → chọn champion
5. preflight (deterministic)     → fail: không seal, ghi evidence
6. PRODUCE_ARTIFACT              → ghi R2 + D1
7. read-back + checksum + rights + quality verify
8. VERIFY_ARTIFACT
9. FREEZE_STAGE
```

**Tiêu chuẩn.** Không stage nào được bỏ qua bước 5 và 7. Preflight phải là xác định, không dùng model — mô hình chỉ dùng ở tournament (bước 4) và ở assurance độc lập.

**Acceptance.** Mỗi trong 18 stage runner pass bộ test khung chung trước khi có test đặc thù.

---

## EXE-03 · Tournament Engine

**Mục đích.** Cơ chế chung cho mọi lựa chọn nội bộ: creative route, voice take, source candidate, composition. Đảm bảo sinh và chấm thật sự độc lập.

**Tính năng.**
- Eligibility filter trước khi tốn chi phí nặng
- Chấm blind, độc lập từng critic
- Rubric anchoring
- Bảo tồn candidate bị loại làm bằng chứng

**Quy trình.**
```
candidates ← generate(n, temperature=CAO, spec)
       ↓
eligibility_filter(candidates)    ← lọc TRƯỚC khi tải bytes / render
       ↓
∀ critic: score ← judge(candidate, temperature=0, seed cố định,
                        blind=true, rubric_anchored=true)
          (mỗi critic một API call độc lập, KHÔNG chia sẻ context)
       ↓
champion ← argmax(score) where score ≥ threshold
       ↓
production_preflight(champion)    ← xác định, phải PASS
       ↓
seal(champion) + preserve(rejected)
```

**Tiêu chuẩn.**

| Khía cạnh | Sinh | Chấm |
|---|---|---|
| Temperature | 0.9–1.1 | 0 |
| System prompt | Sáng tạo | Giám khảo có rubric |
| Ngữ cảnh | Đầy đủ | Blind — ẩn nguồn gốc candidate, xáo thứ tự |
| Số call | 1 sinh n candidate | n_critic call độc lập |

**Rubric anchoring:** mỗi tiêu chí kèm 3 ví dụ mẫu (fail / borderline / pass) đặt trong prompt. Không có anchor, thang 0–100 của mô hình trôi giữa các phiên và ngưỡng mất ý nghĩa.

**Acceptance.** Chạy cùng một tournament 3 lần với seed cố định → champion giống nhau; ẩn metadata nguồn gốc được kiểm bằng test.

---

## EXE-04 · Media Worker Runtime & Job Envelope

**Mục đích.** Tầng tính toán nặng cho FFmpeg, Sharp, alignment và computer vision. Đây là thành phần chưa tồn tại trong kiến trúc hiện tại và là điều kiện tiên quyết của FP4.

**Tính năng.**
- Worker stateless nhận job envelope qua queue
- Không có quyền ghi D1 trực tiếp
- Tái lập được: cùng envelope → cùng output hash
- Giới hạn tài nguyên và deadline

**Job envelope.**
```json
{
  "trace_id": "...", "package_id": "...", "stage_instance_id": "...",
  "fencing_token": 42,
  "capability_id": "COMPOSITOR@1.2.0",
  "settings_hash": "...",
  "reservation_id": "...",
  "namespace": "production | qualification",
  "inputs":  [{"r2_key": "...", "sha256": "..."}],
  "spec":    { /* xác định, đủ để tái lập */ },
  "outputs": {"r2_prefix": "...", "expected_artifacts": [...]},
  "deadline_at": "..."
}
```

**Quy trình.**
```
1. nhận envelope từ queue
2. xác minh sha256 của mọi input sau khi tải từ R2
3. thực thi spec (FFmpeg / Sharp / WhisperX / OpenCV)
4. ghi output vào R2 dưới r2_prefix
5. tính sha256 + framemd5
6. phát lệnh PRODUCE_ARTIFACT qua control plane  ← KHÔNG ghi D1 trực tiếp
7. báo cáo tài nguyên đã dùng
```

**Công cụ & kỹ thuật.** Container image chứa: FFmpeg (có `libvpx`, `libopus`, `ffv1`), ffprobe, Sharp, headless Chromium, WhisperX hoặc Montreal Forced Aligner, OpenCV. GPU tùy chọn cho alignment và optical flow.

**Tiêu chuẩn.**

| Ràng buộc | Giá trị |
|---|---|
| Tính tái lập | Cùng envelope + cùng image digest → cùng output hash |
| Image | Pin theo digest, không theo tag |
| Quyền D1 | Không có |
| Credential R2 | Presigned URL phạm vi hẹp, không phải key |
| Deadline | Bắt buộc; quá hạn → reservation EXPIRED |

**Acceptance.** Chạy cùng một envelope 5 lần trên 5 worker khác nhau → 5 output có cùng sha256; worker không có credential ghi D1 (kiểm bằng test negative).

---

# NHÓM 5 — OPERATIONS

## OPS-01 · Observability

**Mục đích.** Cho phép điều tra bất kỳ sự cố nào mà không phải đọc ngược D1 thủ công.

**Tính năng.**
- Tracing xuyên suốt: `trace_id` cho một stage attempt, `span_id` cho từng provider call
- Structured logging có schema
- Chỉ số vận hành và chỉ số kinh tế
- Cảnh báo theo ngưỡng

**Tiêu chuẩn — bộ chỉ số tối thiểu.**

| Nhóm | Chỉ số |
|---|---|
| Độ trễ | p50/p95/p99 theo capability và theo stage |
| Lỗi | Tỷ lệ theo `ErrorClass`, theo provider |
| Chi phí | Tích lũy theo stage, theo package, theo kênh; cost per sealed artifact |
| Chất lượng | First-pass yield theo stage; P0 escape; variance của critic |
| Capability | Số binding qualified / tổng; số lần dispatch bị chặn và lý do |
| Vận hành | Orphan reservation rate; lease expiry rate; queue depth |

**Cảnh báo bắt buộc.** Vượt 80% trần chi phí; `SCHEMA_VIOLATION` rate vượt ngưỡng; variance critic vượt ngưỡng; capability bị revoke; orphan reservation tồn quá 24 giờ.

**Acceptance.** Với một `trace_id` bất kỳ, tái dựng được toàn bộ chuỗi sự kiện của một stage attempt gồm mọi provider call, chi phí và output.

---

## OPS-02 · Operator Workspace

**Mục đích.** Giao diện vận hành. Nguyên tắc thiết kế đã đúng trong bản hiện tại và cần giữ: dẫn bằng effective state, không dẫn bằng dòng READY đầu tiên.

**Tính năng.**
- Effective state tính từ bằng chứng canonical
- Next valid action rõ ràng, đúng một hành động
- Phân biệt trực quan `NOT_EVALUATED` với `FAIL`
- Phân biệt fixture với release candidate
- Owner console tách riêng cho ba lệnh identity-bound

**Tiêu chuẩn hiển thị.**

| Yêu cầu | Lý do |
|---|---|
| `NOT_EVALUATED` phải khác màu và khác nhóm đếm với `FAIL` | Hai hồ sơ rủi ro hoàn toàn khác nhau |
| Fixture phải mang nhãn `QUALIFICATION FIXTURE — NOT A RELEASE CANDIDATE` | Ngăn fixture leo thành release evidence |
| Hiển thị `standard_version` cạnh mọi stage | Làm lộ ra lệch version V7 / V23.4 / V281 |
| Hiển thị chi phí tích lũy và trần còn lại | Kinh tế là ràng buộc thiết kế, phải thấy được |
| Prior-work detail ở chế độ on-demand | Giữ màn hình tập trung vào effective state |

**Acceptance.** Một operator mới, không đọc tài liệu, nhìn màn hình xác định đúng: trạng thái thật, hành động hợp lệ kế tiếp, và những gì đang chặn.
