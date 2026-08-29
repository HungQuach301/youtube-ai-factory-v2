# DONE

## WP-00 · Scaffold & Contracts

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Monorepo TypeScript strict, package contracts v2 | `pnpm typecheck` |
| G1 cấm `JSON.stringify` trước hash | `eslint-rules.test.ts`; fixture `g1-violation.ts` bị ESLint từ chối |
| G2 chỉ adapter được import SDK provider | `eslint-rules.test.ts` kiểm cả đường cấm và đường cho phép |
| G6 `preflight()` không gọi provider/LLM | ESLint test đối kháng + type test `PreflightContext` |
| PROFILE, UNDECIDED, UNCALIBRATED, OPS, ATTENTION, POLICY, EVOLUTION có trong contracts | `contracts.test.ts` + typecheck |
| 12 command và ranh giới owner/operator đúng contract | `contracts.test.ts` |
| Job envelope có runtime boundary | Zod schema + test input sai |
| CI chạy source integrity, typecheck, lint, guardrail và unit | `.github/workflows/build.yml` |

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| G1 | ESLint rule `g1-no-json-stringify-hash` |
| G2 | ESLint rule `g2-provider-sdk-boundary` |
| G6 | ESLint rule `g6-no-provider-in-preflight` + type boundary |

## Lệnh xác minh

`pnpm verify:source` · `pnpm typecheck` · `pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit`

## Ngoài phạm vi WP-00

G3–G15, implementation của `guardedDispatch`, StageRunner lifecycle, migration và integration được triển khai tại đúng WP trong `docs/04-BUILD-ORDER.md`.

---

## WP-01 · CORE-01 Canonical Hashing & Lineage

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| RFC 8785 + NFC tạo hash ổn định | 1.000 permutation, NFC/NFD và vector số ECMAScript |
| Dữ liệu ngoài I-JSON bị từ chối | Test NaN, Infinity, BigInt, undefined, sparse array, cycle, surrogate, symbol, accessor |
| Volatile fields không làm đổi content identity | Test strip đệ quy `timestamp`, `request_id`, `latency`, `nonce` |
| Stream hashing không phụ thuộc chunk boundary | SHA-256 vector `abc` qua hai cách chia chunk |
| Lineage truy vấn đúng depth 10 | Recursive CTE integration test trên SQLite |
| Lineage fail-closed | Test chống cycle, quarantine và G5 namespace isolation |
| Migration `0001` tái lập | UP/DOWN ×2, không còn bảng dư |

## Trigger ↔ Test

| Trigger/Constraint | Test |
|---|---|
| `trg_command_log_no_update` | UPDATE command → ABORT |
| `trg_command_log_no_delete` | DELETE command → ABORT |
| `trg_owner_command_signature` | Owner command thiếu signature/evidence → ABORT |
| `CHECK (auto_publish = 0)` | Package có `auto_publish=1` → ABORT |

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| G1 | Mọi content hash đi qua `canonicalHash`; không `JSON.stringify` trước hash |
| G4 | Trigger append-only trong migration `0001` |
| G5 | `LineageStore` chặn non-production parent và cycle trong transaction |
| G10 | CHECK constraint trong migration `0001` |

## Ngoài phạm vi WP-01

Physical tables `artifact`, `artifact_lineage`, `quarantine_hash` và trigger G5 vẫn thuộc migration `0004` theo nguồn chuẩn `docs/03-DATA-SCHEMA.sql`; WP-01 không đổi thứ tự migration.

---

## WP-02 · CORE-02 Typed Command & State Machine

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Đủ 12 typed command với transition xác định | `packages/core-command/tests/state-machine.test.ts` |
| 100 lệnh đồng thời trùng idempotency chỉ có đúng một hiệu lực | Unit transaction test + SQLite integration trên migration `0001` |
| Writer có fencing token cũ bị từ chối, zero side effect | `rejects stale writers with zero side effect` |
| `prevState` sai bị rollback cả state và command reservation | `rolls back the reserved log when prevState conflicts` |
| Năm lệnh P10 bắt buộc identity + signature + evidence hợp lệ | Hai test owner command đối nghịch + trigger `trg_owner_command_signature` |
| Lệnh không thể tác động target thuộc package khác | `fails closed when a command crosses package boundaries` |

## Transaction 6 bước

1. So fencing token với lease hiện tại.
2. Append bản ghi đầy đủ vào `command_log`; UNIQUE giữ idempotency.
3. Đọc target theo `packageId` và so `prevState`.
4. Xác minh identity-bound cho đúng 5 lệnh P10.
5. Compare-and-set target sang trạng thái kế tiếp.
6. Commit state và command log trong cùng transaction; mọi lỗi rollback toàn bộ.

## Trigger ↔ Test

| Trigger | Test |
|---|---|
| `trg_command_log_no_update` | `tests/migrations/0001-control-core.test.mjs` — UPDATE abort |
| `trg_command_log_no_delete` | `tests/migrations/0001-control-core.test.mjs` — DELETE abort |
| `trg_owner_command_signature` | `tests/migrations/0001-control-core.test.mjs` — thiếu signature/evidence abort |

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| G4 | Chỉ append command log; schema trigger cấm UPDATE/DELETE |
| P10 | `OWNER_COMMANDS` giữ đúng 5 lệnh; verifier tầng ứng dụng + allowlist trigger tầng DB |
| G5 / cô lập đa kênh | Mọi state target được scope bằng `packageId`, fail closed khi cross-package |

## Lệnh xác minh

`pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test:migrations` · `pnpm test:integration`

## Ngoài phạm vi WP-02

Durable Object, cấp fencing token đơn điệu, heartbeat và reconciliation thuộc WP-03. Điều kiện owner + promoted learning cho `UNFREEZE_CHANNEL` vẫn do migration `0010`/WP-29 cưỡng chế; lệnh này không được thêm vào năm lệnh P10.

---

## WP-03 · CORE-03 Lease & Fencing

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Lease độc quyền theo `(channel_id, package_id)` | `scopes leases by channel and package instead of globally` |
| 100 acquire đồng thời chỉ có đúng một holder | `serializes concurrent acquisition so exactly one holder wins` |
| Fencing token tăng đơn điệu và không tái sử dụng | `never reuses a fencing token after a clean release` |
| Heartbeat 30 s, TTL 90 s = 3 × heartbeat | `uses a 90 second TTL equal to three heartbeat intervals` |
| Heartbeat chỉ nhận đúng holder + token hiện hành | `renews only the exact active holder and fencing token` |
| GC pause 120 s làm writer cũ mất quyền ghi | `rejects the old writer after a 120 second GC pause...` |
| Sau expiry không cấp lease mới trước reconciliation sạch | Cùng test GC pause kiểm cả trạng thái `PENDING` và `CLEAN` |
| State và event lease sống qua Durable Object restart | `durable-storage.test.ts` |

## Trạng thái và sự kiện

`ACQUIRE → HEARTBEAT* → RELEASE` cho đường sạch. Khi quá TTL: `EXPIRE → RECONCILED`; mọi acquire bị fail-closed với `RECONCILIATION_REQUIRED` cho tới khi reconciler trả `CLEAN` và không còn ID chưa xử lý. State và event append-only được ghi cùng một aggregate trong Durable Object storage để tránh torn write.

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| Single writer | Hàng đợi tuần tự trong coordinator + lease scope riêng cho từng channel/package |
| Stale writer rejection | Mọi heartbeat, release và kiểm tra writer so khớp đồng thời holder + fencing token |
| Fail-closed expiry | Lease hết hạn chuyển sang `REQUIRED`; không tự động trao quyền cho holder khác |
| Durable recovery | Repository dùng storage bền vững; instance mới đọc lại lease đang hoạt động |

## Lệnh xác minh

`pnpm typecheck` · `pnpm lint` · `pnpm test:unit`

## Ngoài phạm vi WP-03

Reconciler nhận interface để WP-08 triển khai thao tác vật lý `provider_request → ORPHANED` và `spend_reservation HELD → EXPIRED`. DoR sử dụng trạng thái lease/reconciliation này tại WP-04. WP-03 không gọi provider, không tạo spend và không đổi thứ tự migration.

---

## WP-04 · CORE-04 Definition of Ready Resolver

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Đánh giá đủ 11 điều kiện DoR | `resolver.test.ts` — từng condition có mutation đối kháng và kiểm tra count duy nhất |
| M0/M1 `NOT_EVALUATED` bị từ chối | `rejects NOT_EVALUATED at M0...`; `requires PASS at M1...` |
| Kênh frozen hoặc trạng thái freeze không xác định đều chặn | `blocks a frozen channel`; test unknown evidence |
| Thiếu human decision chặn từ Stage 14 | `requires human decisions only from Stage 14 onward` |
| Settings hash lệch hoặc thiếu archetype qualification đều chặn | `rejects capability settings drift...` |
| Gate PASS thiếu evidence vẫn chặn | `rejects a PASS gate that lacks evidence` |
| D1/evidence query lỗi không mở stage | `fails every condition when the evidence query is unavailable` |
| Mọi từ chối có expected/actual/remediation | `treats unknown evidence as failure and returns structured remediation` |
| Resolver luôn đọc lại bằng chứng, không tin ready flag đã lưu | `recomputes from the repository on every request...` |
| p95 resolver ≤200 ms | `performance.test.ts`; manual 500 lượt đo p95 ≈0,004 ms |

## 11 điều kiện fail-closed

`LEASE_VALID` · `PARENTS_READY` · `MANDATORY_GATES_PASS` · `CAPABILITIES_QUALIFIED` · `NO_ACTIVE_PROVIDER_REQUESTS` · `NO_UNRECONCILED_LEASES` · `BUDGET_AVAILABLE` · `INPUTS_NOT_QUARANTINED` · `NO_CONFLICTING_PROVIDER_REQUESTS` · `CHANNEL_NOT_FROZEN` · `HUMAN_DECISIONS_SUFFICIENT`.

Không dùng cache ở WP-04: mỗi lần resolve đọc bằng chứng mới, tương đương TTL 0 giây và nằm trong giới hạn cache tối đa 10 giây. Lỗi truy vấn trả `ready=false` cho cả 11 điều kiện; không có demo fallback.

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| P2 fail-closed | `false`, `null`, thiếu evidence hoặc query error đều không thể trả `ready=true` |
| G6 zero-spend preflight | `DoREvidenceRepository` chỉ expose `loadEvidence`; type test chứng minh không có `providerClient` |
| G7 evidence-bound gate | M0/M1 chỉ đạt khi state=`PASS` và `evidenceR2Key` khác null |
| G15/P13 | Từ Stage 14, count phải đạt `POLICY.MIN_HUMAN_DECISIONS` |

## Trigger mới ↔ Test

WP-04 không thêm migration hoặc trigger.

## Lệnh xác minh

`pnpm typecheck` · `pnpm lint` · `pnpm test:unit`

## Ngoài phạm vi WP-04

CORE-05/WP-05 sở hữu standard inheritance, waiver validation, drift detection và migration `0005`. WP-04 chỉ đọc evidence qua repository, không gọi provider, không ghi D1, không reserve spend và không tạo production attempt.

---

## WP-05 · CORE-05 Standard & Policy Registry

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Kế thừa bốn scope và chỉ cho cấp dưới siết | `registry.test.ts` — resolve `PORTFOLIO → CHANNEL → PILLAR → EPISODE` |
| Episode nới rule của Channel bị từ chối | Test đối kháng đủ `MINIMUM`, `MAXIMUM`, `REQUIRED`, `ALLOWLIST` |
| G11 phân loại từ cấu trúc, không tin nhãn agent | `classifies strictness structurally`; xóa rule được phân loại `RELAX` |
| RELAX bắt buộc evolution đã PROMOTED, owner và evidence | `rejects RELAX unless a promoted owner-signed evolution is supplied` |
| M0 không bao giờ WAIVED; M1/M2 cần owner active + expiry tương lai | Unit test `gate policy` và trigger migration |
| M2 chỉ chạy sau khi M0/M1 sạch | `does not evaluate M2 until M0 and M1 are clean` |
| `STANDARD_DRIFT` chặn freeze; ngưỡng chưa chốt fail-closed | `blocks freeze on configured drift and fails closed when threshold is UNDECIDED` |
| Migration `0005` tái lập | UP/DOWN ×2 và test đối kháng cho từng trigger |

## Quyết định phạm vi kế thừa

Schema chuẩn `0005` chỉ định bốn scope lưu trữ `PORTFOLIO → CHANNEL → PILLAR → EPISODE`; CORE-05 dùng đúng bốn scope này. `Series` trong tài liệu module được giữ là khái niệm lập kế hoạch nội dung vì schema hiện không có scope/table `SERIES`; không tự thêm schema ngoài nguồn chuẩn.

## Ngưỡng STANDARD_DRIFT

Tài liệu chưa chốt giá trị số. Resolver nhận `maxAllowedVersionSpread` từ cấu hình; `null` tương ứng `UNDECIDED` và luôn trả cảnh báo `STANDARD_DRIFT` với `blocksFreeze=true`. Không có numeric threshold tự suy đoán trong code.

## Trigger ↔ Test

| Trigger | Test |
|---|---|
| `trg_gate_pass_requires_evidence_ins` | INSERT PASS thiếu evidence → ABORT |
| `trg_gate_pass_requires_evidence_upd` | UPDATE thành PASS thiếu evidence → ABORT |
| `trg_no_waive_m0_ins` | INSERT WAIVED M0 → ABORT |
| `trg_no_waive_m0_upd` | UPDATE thành WAIVED M0 → ABORT |
| `trg_waiver_requires_owner` | WAIVED thiếu active owner/expiry → ABORT |
| `trg_critic_must_be_qualified` | Critic chưa QUALIFIED → ABORT |

## G11 và thứ tự migration

CORE-05 cưỡng chế G11 ở tầng ứng dụng. Các trigger vật lý `standard_change_log` vẫn thuộc migration `0008`/WP-26 đúng theo `docs/03-DATA-SCHEMA.sql`; WP-05 không kéo bảng tương lai về `0005` và không phá thứ tự migration.

## Lệnh xác minh

`pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test:migrations`

## Ngoài phạm vi WP-05

Không gọi provider, không tạo production spend, không bật auto-publish. Evidence Store thuộc WP-06; physical G11 threshold-diff/trigger thuộc WP-26; Evolution Pipeline thuộc WP-27.

---

## WP-06 · CORE-06 Evidence Store

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Xóa hoặc mất live source vẫn tái tạo được nội dung gốc | `evidence-store.test.ts` — snapshot HTML + extracted text, sau đó nguồn trả lỗi nhưng replay vẫn thành công |
| Mọi provider call có đủ request/response snapshot | `stores and replays a complete request/response pair...` kiểm cả hai key và payload round-trip |
| Snapshot giữ nguyên trường volatile phục vụ audit | `canonicalizeExact` + test `request_id`, `timestamp`, `latency`; `canonicalize` nhận diện content vẫn giữ hành vi G1 cũ |
| Bốn namespace R2 tách biệt | Test bảng `production→prod`, `qualification→qual`, `staging→stg`, `quarantine→quar` |
| Evidence bất biến, ghi lặp cùng bytes idempotent | Test ghi hai lần cùng pair chỉ tạo hai object; thay payload cùng trace/span bị `IMMUTABILITY_VIOLATION` |
| Read-back phải khớp checksum và byte length | Test thay bytes sau registry → `INTEGRITY_MISMATCH`; thiếu object/registry → fail closed |
| Không ghi secret vào evidence | Test Authorization lồng trong request bị chặn trước khi có bất kỳ object nào |
| Retention provider tối thiểu 12 tháng, source/measurement/rejected vĩnh viễn | `contracts.test.ts` + registry assertion dùng `thresholds.EVIDENCE.PROVIDER_RETENTION_MONTHS` |
| Path không thể thoát namespace | Test absolute path, backslash, `.` và `..` traversal đều bị `INVALID_R2_PATH` |

## Cấu trúc key chuẩn

| Loại | Key |
|---|---|
| Source HTML | `{ns}/snapshot/{package_id}/sources/{content_hash}.html` |
| Source text | `{ns}/snapshot/{package_id}/sources/{content_hash}.txt` |
| Provider request | `{ns}/evidence/{package_id}/{trace_id}/{span_id}/request.json.gz` |
| Provider response | `{ns}/evidence/{package_id}/{trace_id}/{span_id}/response.json.gz` |

`{ns}` chỉ có thể là `prod`, `qual`, `stg` hoặc `quar`. Payload provider được canonicalize đầy đủ rồi gzip; request và response có hash riêng. Mỗi lần đọc đều đối chiếu immutable registry, SHA-256 và byte length trước khi trả dữ liệu.

## Ranh giới secret và dữ liệu

Snapshot lưu đầy đủ business payload để audit, bao gồm trường volatile, nhưng từ chối credential-bearing field trước khi encode hoặc ghi bytes. Source URL chỉ nhận HTTP(S), không nhận userinfo, token/signature trong query. Metadata mang classification và retention, không mang provider credential.

## Migration và tích hợp tương lai

WP-06 không thêm migration. `source.snapshot_r2_key`/`content_hash` vẫn thuộc migration `0003` tại WP-16; `provider_request.request_r2_key`/`response_r2_key` vẫn thuộc migration `0006` tại WP-08. Evidence Store cung cấp interface object store + immutable registry để các WP sở hữu schema bind key sau, không kéo bảng tương lai về sớm.

## Lệnh xác minh

`pnpm typecheck` · `pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit` · strict TypeScript độc lập · runtime smoke source/provider/integrity

## Ngoài phạm vi WP-06

Không gọi provider thật, không tạo reservation/spend, không ghi production data, không bật auto-publish. Provider adapter framework và ledger vật lý thuộc WP-07/WP-08; binding R2/D1 thật được cấu hình tại WP sở hữu hạ tầng tương ứng.

---

## WP-07 · PRV-01 Provider Adapter Framework

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| `SCHEMA_VIOLATION` không bao giờ retry | `guarded-dispatch.test.ts` — terminal error table kiểm đúng một transport attempt |
| Chỉ `TRANSIENT` và `RATE_LIMIT` được retry | Test từng lớp retryable tới `thresholds.RETRY.MAX_ATTEMPTS`; cùng idempotency key qua mọi attempt |
| Năm lớp còn lại dừng ngay | Test bảng `SCHEMA_VIOLATION`, `RIGHTS_DENIED`, `BUDGET_DENIED`, `CONTENT_FILTERED`, `PROVIDER_ERROR` |
| Error normalization ngoài contract fail closed | Adapter trả error class không hợp lệ hoặc normalizer lỗi → `PROVIDER_ERROR`, không retry |
| Estimate chạy trước transport và estimate lỗi là zero dispatch | Event-order test + invalid estimate trả `attempts=0` và provider call count bằng 0 |
| Token cost dùng tokenizer thật và output ceiling | `estimateTokenCost` test đếm tokenizer một lần, giữ exact input/output token detail và max cost |
| Adapter không export raw `dispatch` | Public API test không có `dispatch`; package exports chỉ root framework |
| Mọi transport call đi qua `guardedDispatch` | G9 ESLint adversarial tests chặn direct `.dispatch`, concrete adapter import và named dispatch export |

## Retry contract

`guardedDispatch` tính cost estimate trước, tạo một canonical idempotency key từ capability, version, settings hash, archetype, package, stage và request, rồi tái sử dụng key đó cho mọi attempt. Backoff dùng `thresholds.RETRY`: tối đa 3 attempt, base 1.000 ms, exponential jitter 0,3. Fencing token và trace vẫn nằm trong context để WP-09 kiểm quyền, nhưng không làm thay đổi provider idempotency của cùng stage/request.

## Guardrail G9

ESLint mới cưỡng chế ba ranh giới: code ngoài framework không được gọi `.dispatch`; code ngoài provider package không được import adapter cụ thể; file adapter không được export hàm `dispatch` trực tiếp. Concrete adapter sẽ chỉ được liên kết nội bộ phía sau root API `guardedDispatch`.

## Exact cost estimate

`estimateTokenCost` không suy token từ ký tự. Adapter phải cung cấp tokenizer thật, giá theo từng token và `maxOutputTokens`; mọi count/price không hữu hạn, âm hoặc token count không nguyên đều bị từ chối trước transport. WP-07 chỉ tính cận trên; reservation/settlement vật lý vẫn thuộc WP-08.

## Lệnh xác minh

`pnpm typecheck` · `pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit` · strict TypeScript độc lập · runtime smoke retry/terminal/token cost

## Ngoài phạm vi WP-07

Không thêm concrete provider SDK hoặc chọn provider, không gọi provider thật, không tạo spend và không thêm migration. Evidence binding, cost reservation/ledger và chín bước capability dispatch guard lần lượt thuộc WP-08/WP-09. Auto-publish tiếp tục bị khóa.

---

## WP-08 · PRV-02 Cost Reservation & Ledger

## Mode: BUILD

## Owner decision đã ghi vào SSOT

Owner xác nhận ngày 2026-08-23: `$30/video`, `$400 qualification`, `$350 Track G`. `DECISIONS-ANSWERED.md`, `BLOCKED.md`, `docs/02-CONTRACTS.md`, source manifest và checksum đã được cập nhật cùng WP; hệ thống không được tự nâng các trần này.

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| 50 dispatch intent song song với trần đủ 10 → đúng 10 qua, 40 bị từ chối | `packages/cost/tests/reservation.test.ts` kiểm 10 `HELD`, 40 `BUDGET_DENIED`; `tests/migrations/0006-cost.test.mjs` lặp 50 insert qua atomic SQL trigger và cho đúng 10/40 |
| 40 intent bị từ chối có zero spend | Test chứng minh chỉ 10 transport intent được mở, `cost_ledger` vẫn có 0 entry cho 40 denial |
| Trần phân cấp không thể bị né | Service buộc production/staging có portfolio + channel + package; atomic migration abort khi thiếu ceiling và kiểm mọi ceiling khớp, kể cả stage nếu được cấu hình |
| Production và qualification không trộn ngân sách | Ceiling/reservation/ledger có namespace; service test chứng minh utilization tách biệt và từ chối cost kind sai namespace |
| Reservation hai pha | `HELD → SETTLED` chỉ một lần, actual cost không vượt estimate, phần hold dư được giải phóng; test ở cả service và SQL trigger |
| Orphan fail closed | Reservation quá hạn thành `EXPIRED`, provider request `OPEN` thành `ORPHANED`, estimate tiếp tục chiếm ceiling và package mới bị `RECONCILIATION_REQUIRED` |
| G8 tồn tại ở cả service và database | Test `SCHEMA_VIOLATION`, `RIGHTS_DENIED`, `BUDGET_DENIED`, `CONTENT_FILTERED` không thể có attempt tiếp theo; `TRANSIENT`/`RATE_LIMIT` vẫn được phép |
| Kinh tế đơn vị không dùng mẫu số giả | Test cost/sealed artifact, cost/published video, tournament share và orphan rate; mẫu số bằng 0 trả `null` |
| Migration an toàn | `0006_cost.sql` UP/DOWN lặp hai lần; CHECK tiền không âm, idempotency key 64 ký tự, unique attempt và provider request chỉ từ reservation `HELD` |

## Atomicity và fail-closed

`CostReservationLedger` tuần tự hóa critical section trong một control-plane process. `0006_cost.sql` là lớp cưỡng chế bền vững: `BEFORE INSERT` kiểm atomically tổng `SETTLED actual + HELD/EXPIRED/ORPHANED estimate + NEW estimate` trên mọi ceiling đang áp dụng. Thiếu ceiling bắt buộc hoặc vượt một scope bất kỳ đều abort trước khi tồn tại provider request.

## Unit economics

Ledger theo dõi `PRODUCTION`, `QUALIFICATION`, `REJECTED_CANDIDATE`; API trả tổng cost, cost/sealed artifact, cost/published video, tournament share và orphan rate. Không đặt gate mới lên các chỉ số này trước WP-12B vì chưa có benchmark thực.

## Lệnh xác minh

`pnpm verify:source` · `pnpm typecheck` · `pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit` · `pnpm test:migrations` · runtime smoke 10/50 · migration trigger smoke

## Ngoài phạm vi WP-08

Không gọi provider thật, không ghi production D1, không tạo reservation/spend thật và không bật auto-publish. WP-09 sở hữu capability registry, binding, settings hash và dispatch guard chín bước; WP-12B sở hữu benchmark chi phí thực so với các trần owner đã xác nhận.

---

## WP-09 · CAP-01 + CAP-04 Registry & Dispatch Guard

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Capability chỉ dispatch khi đúng version `ACTIVE` và binding `QUALIFIED` | `packages/capability/tests/dispatch-guard.test.ts` chặn version/binding không đủ điều kiện tại bước 1, zero spend |
| Đổi một ký tự system prompt làm đổi settings hash và chặn transport | Test `changes the settings hash...` kiểm hash khác, transport count bằng 0 và block log ở bước 2 |
| Chỉ dùng model snapshot cụ thể | Registry và migration từ chối `latest`, `default`, cùng alias có hậu tố `-`, `_` hoặc `/` |
| Shadow qualification không đóng version cũ | Test giữ version cũ `QUALIFIED` dispatchable khi version mới còn `QUALIFICATION_RUNNING` |
| Guard chạy đúng chín bước fail-closed | Unit/runtime smoke kiểm qualification → hash → fencing → reservation → request evidence → transport → response evidence → settlement → return |
| Bốn bước chặn đầu đều zero spend và có audit | Test riêng cho binding, hash, fencing và budget denial; `dispatch_block_log.zero_spend = 1` |
| Không có đường lấy/call raw provider dispatch ngoài framework | G9 ESLint chặn call, computed access, method reference, destructuring, concrete-adapter import và raw export |
| Migration `0002` tái lập và dữ liệu bất biến | UP/DOWN ×2; capability identity/settings immutable; QUALIFIED cần PASS run; block log append-only |

## Guardrail chín bước

1. Resolve đúng capability version và binding `QUALIFIED`.
2. So khớp registry, adapter và request settings hash.
3. Xác minh fencing token hiện hành.
4. Reserve ngân sách qua ledger WP-08.
5. Snapshot request và đăng ký provider request.
6. Gọi transport duy nhất qua provider framework.
7. Snapshot response.
8. Settle actual cost theo reservation.
9. Trả response.

Nếu lỗi xảy ra sau reservation, reservation tiếp tục ở trạng thái giữ chỗ để reconciler xử lý; hệ thống không tự giải phóng và không che giấu provider request mồ côi.

## Trigger ↔ Test

| Trigger | Test |
|---|---|
| `trg_capability_identity_immutable` | UPDATE settings hash/model/version → ABORT |
| `trg_binding_insert_requires_passed_run` | INSERT binding QUALIFIED thiếu PASS run → ABORT |
| `trg_binding_requires_passed_run` | UPDATE binding QUALIFIED thiếu PASS run → ABORT |
| `trg_dispatch_block_no_update` | UPDATE block log → ABORT |
| `trg_dispatch_block_no_delete` | DELETE block log → ABORT |

## Lệnh xác minh

`pnpm verify:source` · `pnpm typecheck` · `pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit` · `pnpm test:migrations` · runtime smoke guard/migration

## Điểm dừng bắt buộc

WP-09 hoàn tất Giai đoạn 1 — Nền tảng. Không bắt đầu WP-10 cho tới khi owner xem báo cáo checkpoint và phê duyệt rõ ràng việc mở Giai đoạn 2. Provider thật, production data, actual spend và auto-publish vẫn bị khóa.

---

## WP-10 · EXE-02 Stage Runner Framework

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Framework sở hữu đúng chín bước lifecycle | `packages/stage-runner/tests/framework.test.ts` kiểm thứ tự DoR → validate → candidates → tournament → preflight → artifact → read-back → verify → freeze |
| DoR fail có zero production và zero command side effect | Test dừng ngay tại `RESOLVE_DOR`, không produce candidate/artifact và không phát command |
| Input critical không được default/transform âm thầm | Test schema thêm default làm đổi canonical input hash và bị `INPUT_IDENTITY_MISMATCH` trước `START_STAGE` |
| G6: preflight không thể gọi provider/LLM | `tests/typecheck/preflight-provider-denied.ts` dùng negative compile contract; G6 ESLint chặn `guardedDispatch`, direct call và method reference trong `preflight()` |
| Tournament không thể trả candidate ngoài attempt hiện tại | Test thay lineage hash và bị `INVALID_CHAMPION` trước tạo artifact |
| Preflight fail không seal và không tự sinh revision thứ hai | Test ghi failure evidence, produce candidate đúng một lần, không tạo artifact và chỉ có `START_STAGE` |
| Read-back fail chặn verify/freeze | Test checksum failure ghi evidence và không phát `VERIFY_ARTIFACT`/`FREEZE_STAGE` |
| Command retry có định danh ổn định | Test hai lần chạy cùng stage attempt tạo cùng bốn idempotency key và mỗi command có key riêng |
| PROFILE được truyền đúng vào stage | Test xác nhận `RunContext.profileSettings` và `PreflightContext.thresholds.PROFILE.REDUCED` dùng SSOT thresholds |

## Ranh giới framework

Subclass chỉ cài `requiredCapabilities`, input schema, candidate production,
deterministic preflight và acceptance tests. `run()` là template method do
framework sở hữu; stage-specific code không được bỏ qua preflight hoặc read-back.
Preflight không nhận provider client. Bốn command lifecycle được phát qua typed
command port với fencing token, actor identity, trace và idempotency key xác định.

## Điểm dừng

WP-10 không gọi provider thật, không ghi production data, không tạo actual spend
và không bật auto-publish. Dừng checkpoint sau WP-10; WP-11 chỉ bắt đầu ở lượt
triển khai tiếp theo của owner.

---

## WP-11 · EXE-03 Tournament Engine

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Cùng seed tạo cùng champion ba lần | `packages/tournament/tests/engine.test.ts` — chạy ba engine độc lập, so cùng lineage hash |
| Judge input không chứa metadata nguồn | Test đưa provider/model/prompt/request/source metadata vào candidate rồi kiểm payload judge chỉ có `blindId` và `value` |
| Eligibility chạy trước chi phí judge | Test loại candidate trước judge, mỗi critic chỉ nhận candidate đủ điều kiện |
| Sinh và chấm độc lập theo P7 | Test chặn system prompt hash trùng; generation temperature đọc contract, judge temperature luôn 0 |
| Rubric anchoring bắt buộc | Test thiếu anchor `borderline` fail-closed trước judge |
| Width và critic count đọc từ PROFILE | Test thiếu candidate hoặc thiếu critic so với REDUCED đều bị chặn |
| Candidate bị loại được bảo tồn | Test bundle giữ đủ `CHAMPION`, `REJECTED`, `INELIGIBLE`, critic score và evidence hash |
| Lỗi evidence hoặc judge output không thể trả champion | Test evidence store throw và partial score đều fail-closed |

## Ranh giới blind và xác định

Candidate giữ source metadata riêng để audit nhưng `BlindJudgeInput` không có
ordinal, lineage hash hay source metadata. Engine xáo thứ tự xác định theo seed,
tạo blind ID theo vị trí và gọi từng critic bằng payload mới, không truyền kết quả
critic trước. Điểm criterion nằm trên thang contract 0–100; aggregate là trung
bình xác định, champion phải đạt `CREATIVE.CHAMPION_MIN_SCORE`, hòa được phá bằng
rank hash theo seed.

## PROFILE và bảo tồn evidence

Candidate width chỉ có thể đọc qua `routeCount`, `compositionsPerCriticalUnit`
hoặc `sourceCandidates`; critic count chỉ qua `criticCountStage04` hoặc
`criticCountAssurance`. Engine từ chối context không trỏ đúng object PROFILE
trong SSOT. Mọi candidate phải được preserve trước khi trả champion; lỗi preserve
không được hạ xuống warning.

## Lệnh xác minh

`pnpm verify:source` · `pnpm typecheck` · `pnpm test:typecheck-boundaries` ·
`pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit` ·
`pnpm test:migrations` · `pnpm test:integration`

## Điểm dừng

WP-11 không gọi provider thật, không ghi production data, không tạo reservation
hoặc actual spend và không bật auto-publish. Quyết định hạ tầng WP-12 sau đó đã
được owner chốt là Fly.io Machines, CPU-only trong `DECISIONS-ANSWERED.md`.

---

## WP-12 · EXE-04 Media Worker Runtime

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Envelope sai không tạo side effect | `packages/media-worker/tests/runtime.test.ts` kiểm validation trước read/execute/write/publish |
| Image runtime phải khớp immutable digest | Schema và runtime từ chối digest sai trước khi đọc input |
| Mọi input được xác minh trước media tool | Test checksum sai tạo zero execute, zero write |
| Sáu operation có invocation xác định | Test plans cho composite, encode, align, probe, flow và pHash |
| Cùng envelope trên 5 worker cho cùng output | Năm runtime/stateless store độc lập trả cùng SHA-256 và frame MD5 |
| Output chỉ hoàn tất sau immutable read-back | Test corruption chặn completion command |
| Deadline cưỡng chế cả runtime lẫn subprocess | Runtime kiểm giữa các pha; container kill media tool khi quá hạn |
| Worker không có D1 binding | Negative TypeScript contract và container image inspection trong CI |
| Image tái lập từ base immutable | Dockerfile pin Node bằng digest; workflow build image và health-check |

## Ranh giới G3

Worker chỉ nhận envelope đã fence, scoped HTTPS object access và scoped command
URL. Nó không có D1/database port, không tự mutate control-plane state và không
được coi object write là hoàn tất trước read-back checksum. Completion duy nhất là
typed `PRODUCE_ARTIFACT` kèm reservation, image digest và resource report.

## Hạ tầng và trạng thái production

`fly.toml` cố định Fly.io Machines tại `sin`, shared CPU 1 vCPU, RAM 1 GiB và
`MEDIA_GPU=false`. Production qualification ngày 2026-08-27 đã deploy exact
digest `sha256:03742f4b5a882fb9791ee49a5d2a384c318e40329c6bac221af23bc9f8fe07d7`
qua run 33086046765. Live health và Fly service check PASS; unauthenticated
`POST /jobs` vẫn trả `503 JOB_DISPATCH_DISABLED`; image qualification run
33085036691 chứng minh không có D1 binding. B-004 được đóng, còn provider dispatch,
job dispatch và auto-publish tiếp tục OFF.

---

## WP-12B · Cost Benchmark — OWNER CONFIRMED; PROFILE=REDUCED

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| 8 archetype × 2 kiến trúc render | `benchmarks/wp-12b/results/evidence.json` chứa đúng 16 case |
| Đo wall, CPU, RAM đỉnh, output size | Mỗi case có bốn trường đo dương; `verify.mjs` fail nếu thiếu |
| Ghi rõ nhu cầu headless Chromium | `device-ui` và `webpage-scroll` được đánh dấu ở cả hai kiến trúc |
| Stage 14 giả lập critic × media fixture | Input định giá versioned; 9 critic FULL và 4 critic REDUCED |
| Ba cấu hình có cost/video bằng số | FULL `$0.266674`; REDUCED `$0.123168`; REDUCED + deterministic max `$0.127076` trong phạm vi đo |
| Đối chiếu trần owner | Cả ba dưới `$30/video` và `$18` scaled target trong **phạm vi đã đo** |
| Evidence được khóa hash | `REPORT.md` bind SHA-256 `f29da6ada2a4bc73746fdb2e7af94ea0f3c41ac93e284df8e8178ea9098bf0e1` |

## Kết luận bằng số

`ALL_THREE_WITHIN_30_USD_FOR_MEASURED_SCOPE`.

Kết quả không phải all-in factory cost: chưa gồm provider chưa qualified, TTS,
stock, music, storage egress và rework. Stage 14 dùng pricing fixture
`gpt-5.6-terra` `$2/MTok input` + `$12/MTok output`, không tuyên bố capability đã
qualified và không dispatch provider. Fly compute dùng mức bảo thủ
`$0.00000355/started-second` cho shared CPU 1x + 1 GiB.

## Numeric checkpoint

Owner xác nhận bảng kết quả ngày 2026-08-23 và chọn `PROFILE=REDUCED`. `B-005`
đã đóng; WP-13 được mở khóa. Không có provider qualification hoặc actual spend
nào được suy ra từ xác nhận này.

---

## WP-13 · MSR-01 Deterministic Measurement

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Đủ đúng 15 phép đo MSR-01 | `packages/measurement/tests/measurement.test.ts` có test đánh số 01–15 và wrapper kiểm đúng 15 evidence hash |
| Black/freeze/silence có interval xác định | Ba fixture FFmpeg log biết trước start/end và tổng thời lượng |
| Clipping/loudness giữ số đo công cụ, không suy diễn bằng model | Fixture `astats`/`ebur128` biết trước giá trị |
| Drop frame và stream profile tái lập | Fixture duration×fps và probe profile biết trước kết quả |
| Phoneme mismatch đo ở mức phoneme | Fixture edit distance 1/3; kết quả bắt buộc `gateEvaluated=false` trước WP-15 |
| Seam, semantic motion, duplicate và near-static xác định | Fixture correlation/MFCC/F0, residual flow, pHash Hamming và SSIM interval |
| Mobile legibility và safe zone dùng ngưỡng SSOT/hình học | Fixture x-height/WCAG và bbox có phần tử pass/fail biết trước |
| Timeline lint tìm đúng gap/overlap | Fixture có một gap và một overlap, tolerance đọc từ `thresholds.SHOT` |
| Control wrapper fail-closed ở boundary | Zod strict schema; aggregate chỉ phát sau đủ 15 phép đo và evidence hash canonical |

## Ranh giới P5/P6

WP-13 không gọi provider hoặc LLM. Worker/media tool tạo raw measurement;
wrapper control-side chỉ validate, tính kết quả xác định và bind canonical
evidence. `phoneme_mismatch_rate` được đo nhưng không tạo PASS/FAIL vì
`ALIGNER_ERROR_FLOOR` chưa được đo ở WP-15; hạ nó thành hard gate lúc này sẽ vi
phạm P5.

## Lệnh xác minh

`pnpm verify:source` · `pnpm typecheck` · `pnpm lint` ·
`pnpm test:guardrails` · `pnpm test:unit` · `pnpm test:migrations` ·
`pnpm test:integration`

## Điểm dừng

WP-13 không dispatch provider thật, không ghi production data, không tạo actual
spend và không bật auto-publish. WP-14 chỉ bắt đầu sau khi PR WP-13 pass CI và
được merge.


---

## WP-16 · Truth Layer (TRU-01, TRU-02) + Stage 03

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Advice lint bắt 100% bộ đối kháng ≥30 mẫu | `packages/truth-layer/tests/truth.test.ts` — 32/32 blocked; neutral qualified language passes |
| Parser số xác định, không dùng LLM/provider | Numeric fixture currency, suffix, percent và basis point |
| CRITICAL claim cần PRIMARY source tier 1/2 | Unit test + `tests/migrations/0003-truth.test.mjs` trigger abort tier 3 |
| Terminology có IPA và ARPAbet | Strict Zod boundary test |
| Migration `0003` tái lập | UP/DOWN ×2 và trigger test |

Không dispatch provider, không ghi production data và không thay đổi auto-publish.


---

## WP-17 · Intelligence Layer (INT-01, INT-02) + Stage 01, 02

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Audience job đúng cấu trúc và không chứa topic name | `packages/intelligence/tests/intelligence.test.ts` kiểm format EN/VI, tối thiểu năm từ mỗi thành phần và topic-name rejection |
| Freshness dùng đúng cửa sổ SSOT | Test kiểm dữ liệu research/intelligence hết hạn; policy được tách khỏi freshness vì hiệu lực phải được xác minh riêng |
| Anti-copy bắt exact shared 7-gram và đo 5-gram Jaccard | Fixture biết trước bị chặn ở text dimension |
| Beat, thumbnail và title có phép đo xác định | Normalized Levenshtein, pHash Hamming và cosine similarity dùng ngưỡng SSOT |
| Bốn chiều anti-copy đều phải qua | `measureAntiCopy` fail-closed nếu bất kỳ text/beat/thumbnail/title vi phạm |
| Differentiation chỉ được đo, chưa dựng gate | Test Euclidean distance tới reference centroid; ngưỡng vẫn `UNCALIBRATED` |

WP-17 không gọi provider thật, không ghi production data, không tạo actual spend
và không bật auto-publish. Differentiation score không trở thành hard gate trước
khi có dữ liệu calibration theo P5.


---

## WP-28 · Human Touchpoints & Evidence — minimum Track G boundary

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Thiếu allowlist thật fail-closed | `packages/human-evidence/tests/human-evidence.test.ts` — empty allowlist throws before evaluation |
| Thiếu hai decision hoặc hai loại chặn Stage 14 | Test `MIN_HUMAN_DECISIONS` và `MIN_DISTINCT_DECISION_TYPES` |
| Service/inactive actor và rationale ngắn bị chặn | Unit boundary + `tests/migrations/0009-human.test.mjs` |
| Artifact seal phải hậu-quyết-định | Imprint evaluation kiểm timestamp của artifact-after |
| Pattern human imprint máy móc bị cảnh báo | Diversity lint bắt rationale lặp và chỉ một decision type trong cửa sổ năm video |
| Trần chú ý 300 phút và queue alert 48 giờ | Runtime test + SQL trigger atomic |
| Evidence report tái lập từ D1/R2 | Cùng input cho cùng canonical content và SHA-256 |
| Migration `0009` tái lập | UP/DOWN ×2 và trigger abort |

Implementation tối thiểu đã hoàn tất nhưng activation vẫn fail-closed cho tới khi
owner cung cấp một `human_actor.identity` thật. Hệ thống không suy identity từ
GitHub login, email phiên ChatGPT hay service account. Không dispatch provider,
không ghi production data, không tạo actual spend và không bật auto-publish.


---

## WP-29 · Policy Defense — minimum Track G boundary

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| PC1..PC8 đều PASS và có evidence | Strict schema, checklist test và SQL trigger |
| Publish thiếu checklist/disclosure/prediction/owner hoặc kênh freeze bị chặn | Runtime aggregate và `trg_publish_requires_policy_checklist` |
| Disclosure mặc định bật; tắt cần rationale ≥20 | Unit test + INSERT/UPDATE SQL triggers |
| PC7 dùng primitive WP-17 | Import trực tiếp beat Levenshtein và pHash Hamming từ `@youtube-ai-factory/intelligence`; thêm voice-settings reuse |
| I2+ thiếu matching freeze là hard failure | `assertIncidentFreeze` test; operator active được emergency freeze, owner xác nhận trong 24h |
| Unfreeze đòi owner + learning promoted | Runtime test + SQL trigger |
| Policy-watch diff tạo proposal xác định | Cùng snapshot diff tạo cùng proposal/idempotency hash |
| Migration `0010` tái lập | UP/DOWN ×2; disclosure, evidence, publish và unfreeze abort tests |

SSOT đã được đồng bộ với quyết định owner: disclosure mặc định bật, operator
emergency freeze, owner confirm 24 giờ, clean streak 15 và kill criterion 12.
Các URL chính thức chỉ được resolve/snapshot trong OPERATE; BUILD không tự đổi
gate và không khẳng định capability/provider qualification. Auto-publish tiếp tục
bị khóa.

---

## WP-18 · Creative Layer (CRE-01..CRE-04)

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Taxonomy hook và narrative đóng | Zod enum trong `packages/creative/src/types.ts` |
| PROFILE điều khiển route và critic Stage 04 | `stage04TournamentSettings`; REDUCED = 2 route, 3 critic |
| Trùng `hook × narrativeDevice` fail-closed | `creative.test.ts` fixture FULL route thứ tư trùng cặp |
| Champion dưới 95 hoặc thiếu lý do loại bị từ chối | `sealCreativeContract` đọc ngưỡng SSOT và seal canonical hash |
| Packaging promise phải bind vào claim của script | `lintPackagingAgainstScript`; title cosine dùng anti-copy threshold |
| Mọi beat thay đổi knowledge state; vòng tò mò đóng đúng hạn | `lintStory` kiểm hook, promise, midpoint, payoff, loop và entity density |
| Prediction được seal trước sản xuất | `sealPrediction` dùng baseline `v0-flat`, curve 5% và weights runtime |
| Nhịp script dựa trên ARPAbet syllable | `lintScript` kiểm pacing theo section, câu và breath group |
| Mọi số trong script truy về claim và as-of evidence | `auditNumbers` bind deterministic từng số được parse |
| Không hard-code ngưỡng ngoài contracts | Pacing, entity window và prediction baseline nằm ở `thresholds.ts` + `docs/02-CONTRACTS.md` |

## Ranh giới

WP-18 chỉ xây Creative Layer deterministic và contract seal. Không dispatch
provider, không tạo reservation/actual spend, không ghi production data và không
bật auto-publish. Baseline retention `v0-flat` phải được tái hiệu chỉnh sau 6
video có analytics hợp lệ; không được trình bày như calibration evidence thực.

---

## WP-19 · Design Layer (DES-01..DES-03) — fail-closed framework

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Identity là tài sản cấp kênh | `sealChannelIdentity` chỉ nhận `scope=channel` và seal canonical hash |
| Voice settings/fingerprint nhất quán | Hash settings được tái tính; fingerprint đúng 30 giây |
| Video không tự đổi narrator | `assertInheritedVoice` yêu cầu owner exception hash khi voice/model/settings đổi |
| TTS chỉ cắt tại sentence boundary an toàn | `planTtsSegments` loại boundary nằm trong entity, number hoặc causal clause |
| Segment/context dùng ngưỡng SSOT | 300–800 ký tự; context 200–300 ký tự từ `thresholds.AUDIO` |
| Music provider thiếu thì fail-closed | `sealSoundscape` chỉ cho ambience/silence khi provider evidence là null |
| Sáu điều kiện license là bắt buộc | Provider schema yêu cầu toàn bộ literal `true` và contract evidence hash |
| Source routing là hàm xác định, toàn phần | MECHANISM/PROCESS → MAKE; observed → SOURCE; evidence + explanation → HYBRID |
| Motion classifier có ba nhóm rời nhau | Exhaustive 8 tổ hợp boolean; authored layer ưu tiên LAYERED_SEMANTIC |
| Route không đổi sau Stage 07B | `assertRouteFrozen` từ chối mọi thay đổi route |
| Visual grammar được seal | Mọi shot có route, motion class, archetype và canonical hash |

## Trạng thái activation

Implementation deterministic của WP-19 hoàn tất. Production music vẫn
fail-closed vì `PRODUCTION_AUDIO_PROVIDER=null` và chưa có hợp đồng chứng minh
sáu tiêu chí license. Ambience/silence mode tiếp tục hợp lệ; không suy diễn rằng
nhà cung cấp đã được qualify.

## Ranh giới

Không gọi provider, không dùng asset music có bản quyền, không tạo spend, không
ghi production data và không bật auto-publish.


---

## WP-20 · ShotCueProgram Compiler (CMP-01) + Stage 08

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Timeline phủ đủ canonical duration và bắt đầu tại zero | `packages/compiler/tests/compiler.test.ts` kiểm toàn bộ 33,813,454 tick = 704.4469583333333 giây |
| Zero gap/overlap | Unit test gap/overlap; `IntervalTree`; trigger seal trong migration `0004` |
| Tổng thời lượng khớp ±1 frame | Unit test chấp nhận 1,600 tick ở 30 fps/48 kHz và từ chối 1,601 tick |
| Không có hard limit 90–180 shot | Compiler dùng shot count dẫn xuất; test source scan cấm legacy range và `SHOT_COUNT_MIN/MAX` |
| Mỗi shot có đúng BEFORE/DURING/AFTER | Zod boundary, unit test missing/duplicate state và seal trigger yêu cầu ba assertion |
| Claim và source binding fail-closed | Compiler từ chối assertion ngoài claim của shot, thiếu source query hoặc source query trên MAKE |
| Adaptive validation không tự tạo gate mới | Pacing/archetype chỉ xuất warning từ `thresholds.SHOT`; không thay đổi SSOT |
| Output được seal xác định | Shot order chuẩn hóa và `canonicalHash` tạo hash 64 hex |
| Migration `0004` tái lập và bất biến | UP/DOWN ×2; test sequence, gap, assertion completeness và mọi INSERT/UPDATE/DELETE sau seal |

## Ranh giới

WP-20 chỉ biên dịch ShotCueProgram xác định cho Stage 08. Shot count 98 trong
fixture là kết quả dẫn xuất của full timeline, không phải ngưỡng. Không gọi
provider, không tạo reservation/actual spend, không ghi production data và không
bật auto-publish.


---

## WP-21 · Media Layer (MED-01..06) + Stage 09–13

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Eligibility chạy trước byte acquisition | `filterSourceCandidates` chỉ trả `bytesAllowedCandidateIds` sau metadata, rights, watermark, provenance và pHash filter |
| Kiến trúc render-once là mặc định | `planCompositions` chọn FFmpeg filter graph; Chromium chỉ cho path/chart/morph; render-per-frame được đếm tường minh |
| TTS request stitching và delta retry | `planNarrationRequests` truyền context/request trước; `planNarrationRetry` chỉ trả section fail |
| Phoneme mismatch chưa hiệu chuẩn không làm hard gate | `evaluatePhonemeMismatch` trả `WARNING_UNCALIBRATED` cho tới khi có measured floor WP-15 |
| Track G không lách license audio | `ambience_only` từ chối mọi cue MUSIC; asset âm thanh khác vẫn cần license evidence |
| Loudness dùng hai pass | Pass 1 đo; pass 2 bắt buộc `measured_*` và `linear=true`; ducking dùng ngưỡng SSOT |
| Edit dùng OTIO và caption từ alignment | Timeline zero-gap/canonical-duration; mọi caption giữ alignment evidence ref và tối đa 5 từ |
| Deterministic QA fail-closed | Duplicate, near-static, debug overlay, watermark và template residue đều chặn |
| Master hai lớp | Plan FFV1/PCM archival trước VP9/Opus distribution; readback R2 + Drive và framemd5 bắt buộc |
| Distribution không tồn tại thiếu archival cha | Migration `0011` trigger cùng package; master seal immutable; UP/DOWN ×2 test |

## Ranh giới

WP-21 triển khai control-side media specification cho cấu hình owner đã chọn
`PROFILE=REDUCED`. Production music vẫn fail-closed vì chưa có provider/license
evidence theo §5; Track G chỉ hợp lệ với ambience/silence đã có rights evidence.
Không dispatch provider, không tạo actual spend, không ghi production data và
không tuyên bố Fly production đã deploy.


---

## WP-22 · Assurance Panel (MSR-02, MSR-03) + Stage 12, 14

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| M0/M1 chạy trước M2 | Engine chặn trước dispatch; migration `0012` chặn INSERT/UPDATE M2 khi bất kỳ gate active M0/M1 chưa PASS |
| Critic count/set đọc từ PROFILE | REDUCED bắt buộc đúng bốn critic không thay thế được bằng deterministic measurement; FULL bắt buộc đủ chín |
| Critic blind và độc lập | Mỗi call chỉ nhận blind master hash, sample refs, rubric clone, temperature 0, seed cố định; không có package/owner identity hoặc verdict trước |
| Rubric anchoring fail-closed | Thiếu bất kỳ fail/borderline/pass anchor nào → `NOT_RUN`, zero provider call, M2 `NOT_EVALUATED` |
| Qualification không thể giả | Gold/anchor chưa ready → `INCONCLUSIVE`; P0 recall 100%, P1 recall 90%, precision 80%, variance ≤3 mới trả `QUALIFIED` |
| Critic DB assignment phải qualified | Migration trigger kiểm đúng capability/archetype binding `QUALIFIED` có passing run |
| Vùng biên n=3 median | Điểm trong floor ±3 chạy đúng ba total samples; median được dùng, toàn bộ evidence ref được giữ |
| Variance cao không được dùng | Vượt 3 điểm variance → bỏ verdict, M2 `NOT_EVALUATED`, yêu cầu requalify critic |
| Track G không biến warning thành gate | `WARNING_ONLY` có thể tính verdict khi evidence đủ nhưng luôn trả gate `NOT_EVALUATED` |
| HARD_GATE cần human evidence | Migration yêu cầu 36 anchor append-only do active real human chọn, gold evidence, qualification evidence và đúng critic count PROFILE |

## Trạng thái activation

WP-22 harness và lớp cưỡng chế bền vững đã được triển khai. Activation vẫn
fail-closed vì B-007 còn mở: chưa có 36 rubric anchor thật, gold set đủ chuẩn và
critic qualification provider run. Không có critic production nào được tự gắn
`QUALIFIED`; M2 chưa được phép authorize Stage 15.

## Ranh giới

Không gọi provider, không tạo qualification spend, không ghi production verdict,
không suy diễn anchor/owner judgment và không bật auto-publish.


---

## WP-23 · Publishing (PUB-01) + Stage 15

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Release và publish là hai quyết định owner riêng | `authorizeRelease` và `authorizePublish` yêu cầu đúng hai command ID/type khác nhau, owner active, signature và evidence hash |
| Đối soát cuối bind đúng master | Release chặn active request/exception, thiếu rights/cost/hash evidence và assurance checksum lệch distribution master |
| Warning-only không âm thầm thành PASS | Assurance warning được ghi tường minh; reported FAIL vẫn chặn release, HARD_GATE bắt buộc PASS |
| P9 + G15 chặn trước upload | Thiếu sealed prediction hoặc bất kỳ PC1..PC8 PASS evidence nào → không tạo manifest |
| Disclosure metadata không trôi | Toggle trong metadata phải khớp decision đã ghi; migration kiểm lại tại persistence |
| Không hidden upload default | Title, description, tags, category, privacy, made-for-kids, disclosure, language, chapters đều bắt buộc trong artifact |
| Thumbnail owner-selected và có rights | Chính xác 1280×720 PNG/JPEG, rights evidence và HP-02 D3 selection evidence bắt buộc |
| Auto-publish bất khả thi | Runtime chỉ phát `autoPublish: false`; DB `CHECK (auto_publish = 0)` |
| Upload resumable không gửi lại byte đã xác nhận | Chunk kế bắt đầu từ server-confirmed offset; ack không monotonic bị từ chối ở runtime và migration |
| YouTube ID bind đúng checksum | Chỉ session VERIFIED đủ byte mới tạo binding append-only với master SHA và readback evidence |

## Trạng thái activation

WP-23 implementation hoàn tất nhưng không có publish production: chưa có package
Stage 00–14 thật đủ evidence, owner commands thật hoặc YouTube provider dispatch.
Mọi transport tiếp tục OFF; code chỉ chuẩn bị manifest/session sau authorization.

## Ranh giới

Không gọi YouTube API, không tạo upload session thật, không ghi video ID giả,
không tạo spend và không bật auto-publish.


---

## WP-24 · Learning (LRN-01..03) + Stage 16

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Chỉ analytics thật được nạp | Runtime từ chối `simulated=true`, source khác YouTube Analytics API, evidence rỗng và cửa sổ ngoài 14–28 ngày; migration có trigger/check tương ứng |
| Analytics bind đúng video/master | Runtime đối chiếu package, YouTube video ID, master ID/SHA và verified readback evidence; migration đối chiếu `youtube_video_binding` + `media_master` |
| MAE, beat-level error và CTR delta xác định | `analyzeDeviation` nội suy trên lưới 5% của SSOT; unit test kiểm MAE 0.1, ba beat error và CTR delta 0.02 |
| Calibration có version và lineage | Hồi quy least-squares dùng feature evidence; thiếu 6 video hợp lệ bị chặn; model mới bind parent version + toàn bộ analytics hash |
| Experiment chỉ thử một biến và giữ hằng số tường minh | `registerExperiment` yêu cầu `variableTested`, held constants, min sample size và decision criterion |
| Learning thiếu cỡ mẫu không READY/promote | Runtime + migration chặn dưới `experiment.min_sample_size`, dưới hai video độc lập hoặc direction không nhất quán |
| PORTFOLIO không học từ một kênh/không mang voice | Runtime + migration yêu cầu ≥2 channel ID độc lập; `VOICE` bị chặn theo P8 |
| Promotion chỉ qua owner command | Runtime yêu cầu executed signed `PROMOTE_LEARNING`; migration bind command payload, active OWNER, signature/evidence và tăng đúng một version |
| Learning không ghi trực tiếp Standard Registry | Package chỉ phát promotion record/intent; không import hoặc expose write API tới Standard Registry |
| Migration `0007` tái lập | UP/DOWN ×2; trigger test real-only analytics, sample/consistency/scope và owner promotion |

## Trạng thái activation

WP-24 implementation hoàn tất ở chế độ BUILD. B-008 vẫn mở: chưa có YouTube
Analytics production evidence sau cửa sổ 14–28 ngày, nên chưa calibration thật,
learning READY thật hoặc `PROMOTE_LEARNING` thật. `v0-flat` vẫn là baseline đã
seal, không được trình bày như model đã hiệu chỉnh.

## Ranh giới

Không gọi YouTube Analytics API, không ghi analytics/video ID/owner command giả,
không chạy experiment production và không cập nhật Standard Registry.


---

## WP-25 · Observability & Operator UI (OPS-01, OPS-02)

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Một `trace_id` tái dựng toàn bộ stage attempt | `reconstructTrace` sắp thứ tự sự kiện, bắt đầu/kết thúc đúng biên và trả đủ provider call, cost, output cùng canonical hash |
| Chuỗi thiếu evidence không được coi là hoàn chỉnh | Unit test chặn sequence gap, provider thiếu response/cost và trace thiếu terminal; migration `0014` kiểm lại trước khi hoàn tất |
| Structured log bền vững, append-only | `trace_event` khóa scope package/stage, sequence liên tục, lifecycle request→response→cost và cấm UPDATE/DELETE |
| Bộ metric tối thiểu đủ OPS-01 + v2 addendum | Latency p50/p95/p99, lỗi, cost, first-pass/P0/variance, capability, orphan/lease/queue, attention/HP age, proposal và defect density |
| Cảnh báo bắt buộc không hardcode số ngoài SSOT | 80% spend, critic variance và HP queue đọc `thresholds`; schema rate nhận từ active standard; orphan 24h theo đặc tả OPS-01 |
| `NOT_EVALUATED` tách khỏi `FAIL` | Operator view model tạo hai group/count và hai color token khác nhau |
| Fixture không thể leo thành release candidate | Runtime trả `releaseCandidate=false` và banner `QUALIFICATION FIXTURE — NOT A RELEASE CANDIDATE`; SQL chỉ cho đúng nhãn và cấm mutation |
| Workspace có đủ năm yêu cầu v2 | Queue HP hợp nhất; D1–D5 side-by-side + diff; rejection form có schema; Generate Evidence Report action; attention budget clock |
| Hành động kế tiếp không mơ hồ | Workspace từ chối nếu không có chính xác một `nextValidAction`; prior work chỉ hiện on-demand |
| Incident I2 chưa freeze hiện cảnh báo cứng | Operator workspace phát `I2_INCIDENT_REQUIRES_CHANNEL_FREEZE` khi canonical incident I2/I3 chưa có freeze |
| Migration `0014` tái lập | UP/DOWN ×2; test sequence/lifecycle/append-only và fixture label |

## Trạng thái activation

WP-25 implementation hoàn tất ở chế độ BUILD. Fixture trong test chỉ là dữ liệu
qualification có nhãn cấm release; không phải trace, alert, metric hoặc operator
evidence production. Dashboard production chỉ được dựng từ D1/R2 và các ledger
canonical khi Track G tạo stage attempt thật.

## Ranh giới

Không tạo trace/alert/metric giả trong production, không đổi gate state, không tạo
owner action, không dispatch provider và không coi operator fixture là release evidence.


---

## WP-27 · Evolution Pipeline (EVO-01)

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Chiều nghiêm ngặt được tính từ cấu trúc | `createProposal` dùng `classifyRuleChange`; test khai RELAX thành NEUTRAL bị `STRICTNESS_DIRECTION_MISMATCH` |
| Threshold/gate shadow trên ≥10 artifact production gần nhất | `runThresholdShadow` dùng `EVOLUTION.SHADOW_MIN_ARTIFACTS`, chỉ chạy namespace `qualification`, giữ bảng before/after verdict và evidence từng artifact |
| Capability shadow chạy toàn bộ gold set | `runCapabilityShadow` đối chiếu đủ sample/class và chặn bất kỳ recall/precision giảm hoặc variance tăng theo defect class |
| Evidence bundle đủ năm mục | `buildEvidenceBundle` bind exact diff, shadow result, actual/projected cost, strictness + RELAX risk, recommendation + rollback và canonical hash |
| Thiếu shadow evidence không thành EVIDENCE_READY | Runtime trả `SHADOW_EVIDENCE_MISSING`; migration yêu cầu shadow run, evidence key/hash và rollback ref |
| RELAX không promote thiếu owner | Runtime chỉ nhận executed signed `PROMOTE_EVOLUTION`; migration bind đúng command, proposal, active OWNER, evidence hash, target và rollback |
| Promotion audit append-only | `evolution_promotion` là record bất biến; direct update proposal sang PROMOTED bị chặn nếu thiếu record đã bind |
| Đổi đúng một registry location | `applyPromoteEvolutionCommand` đối chiếu exact before rule rồi chỉ thay `targetRef`; unit test giữ nguyên registry key còn lại |
| Rollback đưa registry về nguyên trạng | `rollbackPromotion` yêu cầu đúng `rollback_ref`, exact current rule và chỉ phục hồi `targetRef` |
| Migration `0008` tái lập | UP/DOWN ×2; smoke + migration test owner command, evidence, rollback, append-only và G11/G12/G14 |

## Trạng thái activation

WP-27 triển khai harness và lớp cưỡng chế trong BUILD. Không có proposal thật nào
được tự chuyển `PROMOTED`: production activation vẫn yêu cầu shadow run thật trong
`qualification`, evidence bundle đã lưu và lệnh `PROMOTE_EVOLUTION` do owner ký.

## Ranh giới

Không tạo owner identity, chữ ký, shadow evidence hoặc promotion giả; không sửa
ngưỡng production, không dispatch provider, không tạo spend và không bật publish.


---

## WP-30 · LRN-04 Failure Mining + Learning Scope

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Rejected master có HP-04 cấu trúc thành gold sample trong cùng lần chạy | `mineRejection` + fixture kiểm source, namespace, ground truth và zero provider cost |
| Escaped defect tạo gold + proposal; P0 cờ requalify critic | `mineEscapedDefects` bind assurance PASS với evidence phát hiện và SLA 48 giờ |
| Gate FAIL lặp chỉ tạo proposal khi đạt ngưỡng, đo được và có stage sớm hơn | `mineRepeatedFailures` đọc `OPS.GATE_FAIL_REPEAT_TO_LRN04`, chặn ID trùng |
| Quarantine cluster chỉ đề xuất trên 20% và chưa có lint xác định | `mineQuarantine` đọc threshold SSOT, chặn ID trùng |
| LRN-04 không có đường ghi ngoài hai bảng | Union type cố định + `allowedTables=['gold_sample','evolution_proposal']`; không export persistence adapter |
| PORTFOLIO không thể nâng từ một kênh hoặc learning giả PROMOTED | Migration `0015` yêu cầu ≥2 channel độc lập, cùng finding/direction/STRUCTURE và promotion record |
| Mined writes giữ namespace và không nới chuẩn | Trigger `trg_lrn04_gold_namespace` + `trg_lrn04_proposal_boundary` |
| Migration tái lập | `0015-failure-mining.test.mjs` chạy UP/DOWN ×2 |

## Ranh giới

WP-30 chỉ khai thác evidence đã tồn tại và phát sinh kế hoạch INSERT vào
`gold_sample` hoặc `evolution_proposal`. Không gọi provider, không tạo spend,
không ghi production data, không tự promote learning/evolution và không thay đổi
ChannelIdentityContract xuyên kênh.


---

## WP-31 · OPERATE Mode Harness

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| §0-OPS chỉ mở phiên sau khi đọc trạng thái và nêu đúng năm điều cấm | `openOperateSession` kiểm ba OPS entry gần nhất, BLOCKED, incident register và guardrail set |
| Incident đang mở chiếm toàn bộ phiên | Session start + daily scan fail-closed sang `POLICY_INCIDENT_RESPONSE`/halt |
| Fixture có orphan + FAIL cho đúng báo cáo/runbook | Unit test kiểm reconcile orphan, block lease mới, propose reopen và tuyệt đối không waive |
| Spend ≥80% cảnh báo nhưng không tự nâng ceiling | `runDailyOperationalScan` đọc `OPS.SPEND_ALERT_PCT`, yêu cầu owner decision |
| M2 vùng biên chạy n=3 median; variance cao loại verdict | Action plan đọc `ASSURANCE.RERUN_N` và `MAX_VARIANCE` từ SSOT |
| OPS-LOG append-only theo phiên | `formatOpsLogEntry`, `appendOpsLog`, `assertOpsLogAppend` |
| command_log thiếu OPS-LOG bị audit phát hiện | `auditOpsLog` trả `unloggedCommandIds`; fixture có command không được log |
| §2-OPS báo cáo tuần chỉ đọc | `buildWeeklyOwnerReport` trả `readOnly=true`, zero writes/cost |

## Ranh giới

WP-31 xây harness deterministic trong mode BUILD. Harness chỉ đọc snapshot và phát
action plan; không dispatch provider, không phát owner command, không ghi production,
không tự waive gate, không tự đổi ceiling và không sửa vùng cấm G13.


---

## Track G · G-01 Production Projection · HP-01 Owner Decision

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| HP-01 owner decision được seal trong GitHub | `DECISIONS-ANSWERED.md` + `TRACK-G-G01-DECISION.md` ghi ngày, niche, market, audience, positioning và legacy exclusion |
| Production thể hiện đúng outcome niche discovery | Rendered HTML test kiểm champion, 5 candidate scores, market evidence và queue 10 video |
| Channel identity không giả trạng thái persistence | UI và test bắt buộc `APPROVED SOURCE · PERSISTENCE PENDING` |
| Blocker còn thiếu không bị che giấu | Readiness surface vẫn BLOCKED cho D1, real-human identity, voice fingerprint và Fly.io |
| Canonical source không drift | `source-lock.json` + build-verified + rendered HTML test |
| Không mở đường mutation/dispatch/publish | Chỉ thay projection read-only; không D1 giả, không provider call, không owner command, không auto-publish |

## Ranh giới

Deliverable này seal HP-01 và projection các outcome đã phê duyệt lên Production.
Nó không kích hoạt channel, không persist identity, không dispatch provider,
không phát lệnh owner và không tạo production evidence khi binding/evidence thật
còn thiếu.


---

## G-01A1 · Production Command Runtime

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Lệnh từ giao diện được ghi thành runtime truth, không phải dashboard tĩnh | Authenticated `/operate` → `POST /api/operator` → Production D1 |
| Owner thật và allowlist fail-closed | ChatGPT auth header + hosted `FACTORY_OWNER_EMAIL`; thiếu/lệch identity trả lỗi |
| `PREPARE_CHANNEL` idempotent và atomic | SHA-256 payload binding, UNIQUE idempotency, D1 batch, replay trả run cũ |
| Outcome và deliverables đọc lại được | channel `PREPARED`, contract v1, HP-01, pillar, 10 episode, 1 run, 4 ordered events |
| Receipt không thể sửa/xóa | D1 triggers cho command log, HP decision và operation event |
| Không vượt activation boundary | provider dispatch OFF, auto-publish OFF, cost $0; ACTIVE vẫn bị voice/calibration/Fly blockers |
| Production projection phản ánh D1 | root readiness và operator surface đọc operational state từ D1 |

## Lệnh xác minh

`npm run verify:source` · `npm run lint` · `npm test` trong `sites/control-plane`; Miniflare integration áp migration thật, chạy/replay typed command, đọc lại 10 episode và chứng minh append-only trigger từ chối UPDATE.

## Ngoài phạm vi G-01A1

MCP connection từ ChatGPT thuộc G-01A2. Provider/media execution và YouTube transport không được mở bởi work package này.

---

## G-02A · Voice Fingerprint Qualification Contract

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Fingerprint bind đúng channel, voice ID, model và settings hash | `packages/design/tests/design.test.ts` — settings drift bị từ chối |
| Mẫu chuẩn đúng 30 giây | Runtime đọc `AUDIO.VOICE_FINGERPRINT_SEC`; sai duration fail-closed |
| Audio và embedding có R2 key + SHA-256 riêng | Strict evidence schema; key phải thuộc `qual/` và không được trùng |
| Đủ tám audio archetype | Exact set, không thiếu/không trùng; mỗi binding phải `QUALIFIED` và có run/evidence |
| Qualification không leo sang Production | Namespace chỉ nhận `qualification`; `production` bị từ chối |
| Evidence có content identity xác định | `fingerprintHash` tính bằng canonical hash trên toàn bộ envelope |

## Trạng thái activation

Contract/harness G-02A đã triển khai nhưng Production blocker chưa đóng. Chỉ được
ghi qualified voice fingerprint sau khi provider tạo mẫu audio thật 30 giây,
embedding thật và capability registry đọc lại đủ tám passing qualification
binding. Fixture unit test không phải Production evidence.

## Ranh giới

Không gọi TTS provider, không tạo audio/embedding giả, không ghi R2/D1, không tạo
qualification spend và không bật provider/job dispatch hoặc auto-publish.

---

## G-02C · Bounded Live Voice Qualification

## Mode: BUILD

## Acceptance ↔ Evidence

| Acceptance | Production-grade evidence |
|---|---|
| Exact approved voice/model/settings | Voice `KXyrWqXTuK63FlJ9XZ33`; model `eleven_multilingual_v2`; settings hash `5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9` |
| Eight required audio archetypes | GitHub Actions run `33129874420`, job `qualify` completed `success` |
| Immutable provider artifact | Artifact ID `9669841544`; ZIP digest `sha256:8b29e539c76d3cddc7f7e1fa69448aae5c3fd96abdadba0c03c7e94f97d0b796` |
| Bounded actual cost | Evidence records `actualCostUsd=0.3195` under hard `maxCostUsd=1.5` |
| Production boundary preserved | Artifact remains qualification evidence; no Production D1/R2 mutation in G-02C |

## G-02D · Production Voice Registration

## Mode: BUILD

## Acceptance ↔ Evidence

| Acceptance | Read-back evidence |
|---|---|
| Exact lossless fingerprint | 30-second mono 16 kHz FLAC SHA-256 `be522da58be81470d7e86bfab471677c6c0b56d383b2aafd3cbdc07d7e85cb90` |
| Deterministic acoustic embedding | `log-goertzel-voiceprint-v1`, 64 dimensions, normalized vector; SHA-256 `08561f7142c92c462694dffe0e6f975c49ae7a50cc24f26bc79d8a622322bf5a` |
| Provider evidence identity | Artifact `evidence.json` SHA-256 `88d67d277ec62a914d258897877d3e453f215a7117a1aa74cab0b628b091de94` |
| Immutable Production registration | First `register_qualified_voice`: `accepted=true`, `replayed=false`, `COMPLETED`, `VOICE_EVIDENCE_READ_BACK_VERIFIED` |
| Idempotent replay | Exact replay: `accepted=true`, `replayed=true`; state and binding count unchanged |
| Final Production read-back | Channel `PREPARED`; contract `PERSISTED`; voice `QUALIFIED`; 8/8 bindings; 10 episodes |
| Fail-closed boundary | Only blocker remaining: `critic_qualification_and_real_calibration_evidence`; provider dispatch and auto-publish `OFF` |

## Trạng thái kế tiếp

G-02D hoàn tất. G-02E phải bootstrap calibration/qualification corpus thật trong
namespace `qualification`: tái sử dụng 16 synthetic defect recipes hiện có,
tích lũy owner-rejected masters và 36 rubric anchors có evidence. Không critic
nào được gắn `QUALIFIED`, không bật M2 hard gate và không dispatch provider
trước khi B-006/B-007 đạt đủ điều kiện.

---

## G-02E · Qualification Gold Sample Materialization

## Mode: BUILD

## Acceptance ↔ Test / Evidence

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Materialize đúng 16 MP4 từ tám defect class, hai variant mỗi class | `packages/gold-set/tests/materialization.test.ts`; Actions run [33187748930](https://github.com/HungQuach301/youtube-ai-factory-v2/actions/runs/33187748930) |
| Mọi key bị cô lập dưới `qualification/`; không có đường production | Unit test + runtime `G5_NAMESPACE_ISOLATION` assertion; artifact read-back `qualificationKeys=true` |
| Mỗi MP4 có audio/video và bytes đọc lại khớp SHA-256 | FFprobe/read-back trong `scripts/materialize-synthetic-gold-set.mjs`; toàn bộ 21 file trong `artifact-sha256s.txt` PASS |
| Replay cùng pinned input tạo cùng manifest byte-for-byte | `firstManifestSha256 = replayManifestSha256 = 49fd4fa8989912318014795cdc977c23fe18cee12bafb0613cf6b078972ac418` |
| Receipt idempotent được seal | `accepted=true`, `replayed=true`; receipt SHA-256 `30095d0554f845e0631249660327249101cae84f511bfa3a4dfb4b1e5116c66b` |
| Không tạo bằng chứng owner giả và không qualify critic | Manifest: `ownerJudgment=null`, `criticQualificationState=NOT_QUALIFIED`, `productionEligible=false` |
| Readiness vẫn fail-closed | `ready=false`, 16 samples, 0 rejected masters; failures `GOLD_SET_MIN_30`, `REJECTED_MASTER_MIN_15` |
| Toàn bộ CI repository vẫn xanh | Build run [33187751949](https://github.com/HungQuach301/youtube-ai-factory-v2/actions/runs/33187751949); source-integrity run [33187752098](https://github.com/HungQuach301/youtube-ai-factory-v2/actions/runs/33187752098) |

## Artifact receipt

- Artifact: `gold-set-g-02e-33187748930` (ID `9692479988`, 22,926,374 bytes, expires 2026-09-11).
- ZIP SHA-256: `7c562dc8ace9fb029c855f3cb0a62790518c3bd456b525bd79ffcfd9e51d5974`.
- Manifest canonical hash: `bb63fe7cafa3306fdf623b79bd74aa44245bdd776f26f637b6302e29773748de`.
- Toolchain: Node `v22.23.2`, pnpm `11.19.0`, FFmpeg/FFprobe `6.1.1-3ubuntu5`.
- Provider dispatch: `OFF`; provider call/spend: zero.

## Ranh giới còn chặn

G-02E chỉ hoàn tất synthetic half của B-006. Gold set chưa đủ điều kiện cho tới khi có ít nhất 15 rejected masters kèm phán quyết owner; B-007 vẫn thiếu 36 assurance anchors. M2 và publishing không được kích hoạt.



## G-02I-1C — Track G Video #1 bounded runner

MODE: BUILD. This work package adds the Production control-plane command surface only; it performs zero provider dispatch and no Production mutation during CI.

| Acceptance | Proof |
|---|---|
| Open only episode #1 with PROFILE=REDUCED and WARNING_ONLY | `tests/operator-d1.test.mjs` — bounded Track G run |
| Seal exact Stage 00→14 plan and stop before Stage 15 | D1 `track_g_run_contract_insert_guard` + end-to-end test |
| Preserve rejected candidates; never release or publish | Immutable contract flags + insert trigger |
| Require PREPARED channel and 8/8 qualified voice bindings | Fail-closed precondition test |
| Seal/read back bootstrap receipt in qualification R2 | Miniflare D1/R2 end-to-end test |
| Replay command idempotently | MCP replay assertion |
| Keep contract append-only | D1 update/delete trigger assertions |
