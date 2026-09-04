# 05 — TEST SPEC (v2)

Cách chứng minh một work package đã xong. Mỗi mục Acceptance phải ánh xạ tới ít nhất một test có tên cụ thể.

---

## 1. Bốn tầng test

| Tầng | Vị trí | Chạy khi | Đặc điểm |
|---|---|---|---|
| **Guardrail** | `tests/guardrails/` | Mọi PR — **chặn merge** | Không mock; chạy trên codebase và DB thật |
| **Unit** | Cạnh file được test | Mọi PR | Mock provider; nhanh |
| **Integration** | `tests/integration/` | Mọi PR | D1 tạm, R2 tạm; không gọi provider thật |
| **Qualification** | Thủ công | Khi có yêu cầu | Gọi provider thật, tốn tiền |

Test qualification **không** chạy trong CI — nó tốn tiền và cần phê duyệt ngân sách.

---

## 2. Guardrail suite — bắt buộc

Mười lăm nhóm test chạy trên codebase và DB thật. Fail một cái là không merge.

```ts
// tests/guardrails/g01-canonical-hash.test.ts
test('G1: không có lời gọi hash nào dùng JSON.stringify')
test('G1: canonicalHash ổn định qua 1000 permutation thứ tự khóa')
test('G1: canonicalHash chuẩn hóa NFC — chuỗi NFD cho cùng hash')
test('G1: số thực serialize theo ECMAScript, không phải toFixed')

// g02-provider-isolation.test.ts
test('G2: không file nào ngoài provider/adapters/ import SDK provider')

// g03-media-worker-no-d1.test.ts
test('G3: container config không có D1 binding')
test('G3: media-worker không import package nào chạm D1')

// g04-append-only.test.ts
test('G4: UPDATE command_log bị trigger abort')
test('G4: DELETE command_log bị trigger abort')

// g05-namespace-isolation.test.ts
test('G5: insert lineage qualification→production bị abort')
test('G5: insert lineage quarantine→production bị abort')
test('G5: quét toàn bộ artifact_lineage không có vi phạm')

// g06-preflight-deterministic.test.ts
test('G6: PreflightContext không expose provider client — kiểm bằng type')
test('G6: không lời gọi LLM nào trong thân preflight()')

// g07-gate-evidence.test.ts
test('G7: gate state=PASS thiếu evidence_r2_key bị abort (INSERT)')
test('G7: gate state=PASS thiếu evidence_r2_key bị abort (UPDATE)')
test('G7: WAIVE gate M0 bị abort')

// g08-no-retry.test.ts
test.each(['SCHEMA_VIOLATION','RIGHTS_DENIED','BUDGET_DENIED','CONTENT_FILTERED'])
  ('G8: %s không bao giờ được retry')

// g09-dispatch-guard.test.ts
test('G9: adapter không export dispatch trực tiếp')
test('G9: mọi lời gọi provider đi qua guardedDispatch')

// g10-no-autopublish.test.ts
test('G10: không đường code nào set auto_publish = 1')
test('G10: CHECK constraint chặn auto_publish = 1')

// ---------- v2 ----------
// g11-no-self-relax.test.ts
test('G11: hạ strictness_rank của gate không kèm change_log → abort')
test('G11: vô hiệu hóa gate (active=0) không kèm promotion → abort')
test('G11: RELAX trong standard_change_log thiếu promotion_id → abort')
test('G11: CI threshold-diff phát hiện chiều RELAX trong thresholds.ts')
test('G11: chiều TIGHTEN đi qua được, không cần owner')

// g12-shadow-required.test.ts
test('G12: proposal sang EVIDENCE_READY thiếu shadow_run_id → abort')
test('G12: proposal sang PROMOTED từ trạng thái khác EVIDENCE_READY → abort')
test('G12: PROMOTED với decided_by không phải owner → abort')

// g13-operate-boundary.test.ts
test('G13: PR nhãn mode=OPERATE chạm packages/contracts → CI fail')
test('G13: PR nhãn mode=OPERATE chạm tests/guardrails → CI fail')
test('G13: PR nhãn mode=OPERATE chạm db/migrations → CI fail')

// g14-goldset-append-only.test.ts
test('G14: DELETE gold_sample bị abort')
test('G14: UPDATE defect_class hoặc severity bị abort')
test('G14: retire không có owner identity bị abort')

// g15-policy-checklist.test.ts
test('G15: publish với <8 policy_check PASS → abort')
test('G15: publish thiếu predicted_performance → abort (P9)')
test('G15: publish thiếu disclosure_decision → abort')
test('G15: publish khi channel đang frozen → abort')
test('G15: publish với authorized_by không phải owner → abort')

// thresholds.test.ts
test('Không literal số nào trong packages/ ngoài thresholds.ts')
test('Không `any`, `as unknown as`, hay @ts-ignore trong packages/')
test('Ngưỡng trong UNCALIBRATED không được dùng làm gate M0/M1')   // P5

// human-imprint.test.ts   (v2)
test('P13: package thiếu MIN_HUMAN_DECISIONS → DoR chặn Stage 14')
test('P13: human_decision với actor là service account → abort')
test('P13: rationale_text ngắn hơn ngưỡng → abort')
```

**Quy tắc v2:** mỗi trigger trong `03-DATA-SCHEMA.sql` phải có ít nhất một test chứng minh nó ABORT đúng trường hợp. Trigger không có test coi như chưa tồn tại. 33 trigger → ≥33 test.

---

## 3. Test then chốt theo work package

Nếu chỉ chạy được một test, chạy cái này.

| WP | Test then chốt |
|---|---|
| WP-00 | File cố ý vi phạm G1 → lint fail |
| WP-01 | 1000 permutation → cùng hash |
| WP-02 | 100 lệnh trùng idempotency đồng thời → đúng 1 có hiệu lực |
| WP-03 | GC pause 120 s → writer cũ bị từ chối bằng fencing token |
| WP-04 | **Gate M0 = NOT_EVALUATED → DoR `ready: false`**; kênh frozen → `ready: false` |
| WP-05 | Episode standard nới gate của channel → bị từ chối |
| WP-06 | Xóa URL nguồn → vẫn tái lập được từ snapshot |
| WP-07 | SCHEMA_VIOLATION không retry |
| WP-08 | 50 dispatch song song, trần đủ 10 → đúng 10 qua, 40 zero spend |
| WP-09 | Đổi 1 ký tự system prompt → dispatch bị chặn |
| WP-10 | Gọi LLM trong preflight() → compile error |
| WP-11 | Cùng seed → cùng champion 3 lần; judge input không chứa metadata nguồn |
| WP-12 | Cùng envelope trên 5 worker → 5 output cùng sha256 |
| **WP-12B** | **Bảng cost/video ba cấu hình, có kết luận bằng số vs trần §3** |
| WP-13 | Mỗi phép đo cho kết quả đúng trên input đã biết |
| WP-14 | Gold set ≥30 mẫu, mọi defect class có ≥2 mẫu |
| WP-15 | `ALIGNER_ERROR_FLOOR` là giá trị đo được, không phải hằng số giả định |
| WP-16 | Advice lint bắt 100% trong bộ đối kháng ≥30 mẫu |
| WP-17 | Audience job chứa tên chủ đề → lint fail; 7-gram trùng bị bắt |
| WP-18 | 4 route trùng cặp hook×device → lint fail; beat không đổi knowledge → lint fail |
| WP-19 | Cắt đoạn TTS không rơi giữa entity/số/mệnh đề nhân quả |
| WP-20 | **Không tồn tại ràng buộc 90–180 shots trong code**; zero gap/overlap |
| WP-21 | Insert distribution master thiếu archival cha → abort |
| WP-22 | M2 không chạy được khi M1 còn FAIL; critic chưa qualified → abort |
| WP-23 | `AUTHORIZE_PUBLISH` thiếu `predicted_performance` → từ chối (P9) |
| WP-24 | Learning chưa đạt cỡ mẫu → không promote được |
| WP-25 | Một `trace_id` tái dựng được toàn bộ chuỗi sự kiện |
| **WP-26** | **RELAX threshold không kèm promotion → CI fail; DELETE gold_sample → abort** |
| **WP-27** | **Proposal thiếu shadow evidence không sang EVIDENCE_READY được** |
| **WP-28** | **Package thiếu human decision → DoR chặn Stage 14; evidence report tái lập 100%** |
| **WP-29** | **Publish thiếu PC-4 → abort; unfreeze thiếu learning promoted → abort** |
| **WP-30** | **Rejected master → gold sample cùng lần chạy; promote PORTFOLIO từ 1 kênh → từ chối** |
| **WP-31** | **Lệnh trong command_log không có trong OPS-LOG → audit bắt được** |

---

## 4. Bộ test đối kháng agent phải tự viết

Năm nơi cần agent chủ động sinh mẫu tấn công, không chỉ mẫu hạnh phúc:

**Advice lint (WP-16)** — ≥30 mẫu, gồm biến thể né tránh:
```
"bạn nên mua"                          → chặn
"nhiều người đã chọn cách chuyển sang" → chặn (mệnh lệnh gián tiếp)
"nếu bạn muốn tăng lợi nhuận, hãy"     → chặn (điều kiện hứa hẹn)
"cơ chế này hoạt động như sau"         → cho qua
"một số nhà phân tích cho rằng"        → cho qua (có qualifier)
```

**Anti-copy (WP-17)** — paraphrase nông:
```
Đổi thứ tự từ trong câu gốc      → phải bắt được
Thay từ đồng nghĩa, giữ cấu trúc → phải bắt được qua beat sequence
Viết lại hoàn toàn, cùng ý       → cho qua
```

**Number audit (WP-18)** — số sai tinh vi:
```
Claim 4.2%, script nói "khoảng 4%"          → cho qua nếu claim là ESTIMATE
Claim 4.2%, script nói "hơn 5%"             → chặn
Claim as_of_date 2024, script nói "hiện nay" → chặn (thiếu qualifier)
Đơn vị đổi mà magnitude không đổi           → chặn
```

**Self-relax attack (WP-26, v2)** — ≥10 mẫu, agent thử tự nới bằng mọi đường:
```
Sửa trực tiếp thresholds.ts theo chiều dễ hơn      → CI fail
Đổi tier gate M0 → M1                              → abort
Set gate active = 0                                → abort
Thêm nhánh waiver mới cho M0                       → abort
Xóa một điều kiện trong DoR resolver               → guardrail test fail
Ghi standard_change_log NEUTRAL cho thay đổi RELAX → audit phải bắt
```

**Human imprint bypass (WP-28, v2)** — ≥8 mẫu:
```
Service account ghi human_decision              → abort
rationale_text sinh bởi model, giống nhau qua nhiều video
                                                 → lint đa dạng phải cảnh báo
2 decision cùng một loại D3                     → không đạt MIN_DISTINCT_TYPES
Decision timestamp sau khi artifact đã seal     → lineage check phải bắt
```

---

## 5. Mẫu DONE.md

```markdown
# DONE — WP-04 · CORE-04 DoR Resolver

## Mode: BUILD

## Acceptance ↔ Test
| Acceptance | Test file | Test name | Trạng thái |
|---|---|---|---|
| Đánh giá đủ 11 điều kiện DoR | core-dor/resolver.test.ts | resolves all eleven conditions | ✅ |
| NOT_EVALUATED bị từ chối ở M0/M1 | core-dor/resolver.test.ts | rejects NOT_EVALUATED at M0 | ✅ |
| Kênh frozen → ready=false | core-dor/resolver.test.ts | blocks when channel frozen | ✅ |
| Trả DoRFailure có cấu trúc | core-dor/resolver.test.ts | returns structured failures | ✅ |
| p95 ≤ 200 ms | core-dor/perf.test.ts | p95 under 200ms | ✅ |

## Guardrail đã cưỡng chế
| ID | Cơ chế |
|---|---|
| G6 | Type system — DoRContext không có provider client |
| G7 | Đọc gate_evaluation, tôn trọng trigger từ 0005 |
| G15 | DoR đọc policy_check, chặn Stage 14 khi chưa đủ |

## Trigger mới ↔ Test
| Trigger | Test chứng minh ABORT |
|---|---|
| (không có trigger mới trong WP này) | — |

## Lệnh đã chạy
typecheck ✅ · lint ✅ · mode-guard ✅ · threshold-diff ✅ · guardrails ✅
· unit ✅ · migration up/down ×2 ✅ · integration ✅

## BLOCKED
(trống)
```

---

## 6. Quy tắc chống test giả

Bốn dạng test vô nghĩa mà agent hay tạo ra khi bị chặn — audit phải bắt được:

| Dạng | Dấu hiệu |
|---|---|
| **Test tautology** | `expect(fn()).toBe(fn())`; assert lại chính implementation |
| **Ngưỡng giả** | Test pass vì ngưỡng đặt bằng giá trị quan sát được, thay vì ngưỡng thật |
| **Mock che lỗi** | Mock trả về đúng thứ test cần, không phản ánh hành vi thật |
| **Trigger không test** (v2) | Migration có trigger nhưng không test nào chứng minh nó ABORT |

Với gate có `error_floor`: nếu `error_floor` là hằng số hardcode chứ không phải giá trị đo được, đó là ngưỡng giả — gate vẫn PASS/FAIL đều đặn nhưng con số nó tạo ra không có ý nghĩa. Danh sách `UNCALIBRATED` trong contracts tồn tại để làm điều này hiển thị: ngưỡng nằm trong danh sách đó **không được dùng làm gate M0/M1** cho tới khi có evidence hiệu chuẩn.

## 7. EVOLVE_STAGE12_QA_REMEDIATION

| Acceptance | Test/evidence |
|---|---|
| Failed receipt trả về typed measurements và vẫn fail validator | `0023-stage12-qa-evidence.test.ts` |
| Evidence callback/diagnostic append-only | trigger UPDATE/DELETE abort trong migration test |
| Diagnostic chỉ nhận failed attempt 3 `S12QA:*` | trigger source eligibility + command transition test |
| Nền tối không tạo black/freeze interval qua cửa sổ 7s | `stage12-render-smoke.mjs` quét 9s |
| File Opus cuối nằm trong LUFS/true-peak/LRA cũ | `stage12-audio-smoke.mjs` |
| Không nới threshold | `verify:g11` + diff `packages/contracts/src/thresholds.ts` rỗng |
| Không generation/provider/publish | diagnostic envelope literal `generation=false`, `providerDispatch=OFF`, `autoPublish=OFF` |

## 8. EVOLVE_STAGE12_DIAGNOSTIC_CALLBACK

| Acceptance | Test/evidence |
|---|---|
| Timeout/Abort callback thành `STAGE12_CALLBACK_TIMEOUT`; code `23` bị từ chối | `stage12-callback-error.test.ts` và mirror Sites |
| Callback không hydrate pipeline hoặc băm lại video lớn | source contract test yêu cầu `targetDurationSec` + `verifyStage12DiagnosticPreMasterPointer` |
| Failed diagnostic terminal immutable | migration 0024 test UPDATE/DELETE → ABORT |
| Chỉ đúng một retry có typed lineage | migration 0024 test ordinal, predecessor, reason, duration và third-attempt rejection |
| Không scan/generation/provider/finalize/publish | evolution chỉ sửa code/migration; không gọi Production command; envelope giữ literals OFF/false |
| Không nới threshold | `verify:g11` + diff `packages/contracts/src/thresholds.ts` rỗng |

## 9. EVOLVE_STAGE12_ENCODED_LOUDNESS_FAILURE_OBSERVABILITY

| Acceptance | Test/evidence |
|---|---|
| Worker giữ exact initial + post-pass 1/2 + final/pass 3 measurements | `stage12-remediation.test.ts` kiểm failure object và ba số LUFS/true-peak/LRA ở từng mốc |
| Failed predicates được suy ra từ threshold hiện hành | parser regression từ chối predicate thiếu/sai và final scalar không khớp pass cuối |
| Failure callback đóng job và INSERT evidence atomically | Sites Miniflare E2E gọi route thật, đọc lại job `FAILED` và evidence row |
| Evidence và source identity append-only | migration 0029 test UPDATE/DELETE, source SHA mismatch và duplicate job → ABORT |
| Không backfill số đo ordinal 3 đã mất | migration test áp 0029 trên terminal row hiện hữu rồi yêu cầu evidence count bằng 0 |
| Không đổi threshold/ordinal/attempt/provider/publish | `thresholds.ts` không đổi; pass limit vẫn `RETRY.MAX_ATTEMPTS=3`; E2E xác minh attempt 4 bằng 0 và controls `0/OFF` |

## 10. EVOLVE_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY

| Acceptance | Test/evidence |
|---|---|
| Typed command chỉ nhận exact ordinal 2 source + ordinal 3 loudness failure | worker validator, MCP diagnostic và migration 0030 lineage tests |
| Source route chỉ đọc và không upload output | route static guardrail yêu cầu chỉ `GET`/`POST`; FFmpeg smoke đếm đúng một source GET và zero write request |
| Exact per-pass/final LUFS, true peak, LRA được giữ cả raw và numeric | runtime unit test, real FFmpeg smoke và strict control-plane parser |
| Predicate của source, từng pass và final khớp threshold cũ | migration mutation vectors đổi final/intermediate predicate phải ABORT |
| Worker/runtime provenance được pin | validator + D1 trigger từ chối image mismatch; evidence khóa algorithm, threshold, FFmpeg và libopus fingerprints |
| Replay evidence là reproduction mới, không backfill lịch sử | `evidenceSemantics=NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL`; migration áp trên ordinal 2/3 fixture rồi chứng minh history unchanged |
| Job/evidence append-only và terminal shape fail-closed | migration test từ chối UPDATE/DELETE, READY thiếu evidence, PENDING có result và FAILED có evidence |
| Không ordinal 4/attempt 4/provider/calibration/output/finalize/publish | unit, migration, static guardrail và Sites E2E kiểm literals `false`, `0`, `OFF` và zero attempt 4 |
| Control plane/worker dùng cùng deterministic fingerprints | cross-boundary unit test so exact algorithm/threshold hashes |
| Production không tự chạy replay | CI chỉ build/test; mọi invocation cần owner OPERATE approval riêng sau merge/deploy/health PASS |

## 11. EVOLVE_STAGE12_CODEC_SAFE_TRUE_PEAK_CONVERGENCE

| Acceptance | Test/evidence |
|---|---|
| Mọi candidate đọc cùng canonical lossless source | Runtime unit/guardrail kiểm exact lossless SHA; FFmpeg smoke kiểm một source GET và zero write |
| Post-Opus feedback deterministic, limiter không tăng | `stage12-codec-safe-true-peak.test.ts` kiểm recurrence và monotonic ceiling |
| Final encoded candidate giữ nguyên LUFS/TP/LRA thresholds | Real FFmpeg shadow smoke đo file Opus terminal; threshold snapshot parity worker/control plane |
| Exact ordinal 2/3 + diagnostic replay lineage | Migration 0031 từ chối source/replay evidence drift; typed payload/parser khóa IDs và hashes |
| Exact raw/numeric evidence và pinned runtime | Parser + D1 trigger khóa candidates/final, frame-MD5, image digest, FFmpeg/libopus fingerprints |
| Job/evidence append-only và shadow-only | Migration test UPDATE/DELETE → ABORT; READY bắt buộc matching evidence; activation flag luôn 0 |
| Không ordinal/attempt 4, provider, output, calibration, Finalize/release/publish | Unit, static guardrail, migration checks và smoke zero-write kiểm literals `false`, `0`, `OFF` |
| Merge/deploy không tự chạy Production shadow | CI chỉ build/test; invocation cần owner OPERATE approval riêng sau promotion |

## 12. EVOLVE_STAGE12_CODEC_SAFE_LRA_CONVERGENCE_GUARD

| Acceptance | Test/evidence |
|---|---|
| Candidate 0 tái tạo exact parent pass 1 | Controller unit + FFmpeg smoke so raw measurements và audio frame-MD5; drift → terminal fail |
| LRA search tách khỏi LUFS/limiter feedback | Unit test khóa target/ceiling của anchor và midpoint bracket `7.8..14 → 10.9` |
| Bisection bounded và deterministic | Unit/parser/migration khóa pass order, bracket recurrence, macro bounds và tối đa 8 candidates |
| LUFS trim về biên trong gần nhất | Unit test khóa `-15.09 → -14.95`, step `+0.14`, target `-13.86`; mỗi step tuyệt đối ≤0.25 LU |
| True-peak/codec regression rollback | Vector `+4.22 dBTP` bị `REGRESSION_REJECTED`, high bound thu về `10.9`, candidate kế `9.35` |
| Threshold giữ nguyên | Worker/control-plane threshold fingerprint parity và guardrail khóa `-14±1`, `≤-1`, `4..8` |
| Exact parent evidence/runtime provenance | Migration 0032 + strict parser khóa parent job/evidence, lossless SHA, image, FFmpeg/libopus và render fingerprint |
| Job/evidence append-only, shadow-only | UPDATE/DELETE/terminal-shape tests; source route chỉ GET/POST; FFmpeg smoke zero write |
| Không ordinal/attempt 4 hoặc side effect | Migration/static/Sites tests kiểm no attempt 4, output/provider/calibration/finalize/activation/publish false/0/OFF |
| PR/CI không chạy Production replay | Workflow chỉ build/test smoke; invocation cần owner OPERATE approval riêng sau merge/deploy/health PASS |

## 13. EVOLVE_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH

| Acceptance | Test/evidence |
|---|---|
| Exact parent trace pass `0..7` và selected pass 5 được tái tạo | Controller fixture khóa known raw/numeric measurements, shared controls, predicates và pass order; migration fixture khóa full candidate JSON/frame-MD5 vào exact immutable parent evidence; duplicate/missing/reordered pass hoặc lineage/hash drift → fail closed |
| Parent `14 dB/-11.79 LUFS` không làm fixed-control bracket | Unit/parser test đánh dấu reference `CONFOUNDED`; search bắt buộc đo lại `14 dB` với target `-14 LUFS` |
| LRA map không giả định response đơn điệu | Unit vectors cho slope jump, reversal, interior feasible island và endpoint-only feasibility; true-peak fail không thu hẹp miền LRA |
| Probe order deterministic trong `10.9..14 dB` | Unit + strict parser khóa `14,12.45,11.675,13.225,11.2875,12.0625,12.8375,13.6125` và tie-break seed |
| Mỗi phase chỉ thay đúng một control variable | Unit trace khóa macro-only LRA map, ceiling-only containment, target-only LUFS trim; candidate sau luôn render từ cùng lossless source |
| True-peak containment là hậu Opus và có rollback | Real FFmpeg smoke encode/decode/measure từng step; reversal/no-improvement/LRA regress reject seed và chọn exact safe fallback |
| LUFS trim có reserve và step riêng | Vector `-15.25` cần ít nhất hai step vì mỗi target step tuyệt đối `≤0.25 LU`; macro phase không tiêu trim reserve |
| Một artifact duy nhất phải đạt cả ba predicates | Parser/migration từ chối measurement mix giữa candidates và pre-codec PASS/post-Opus FAIL; final verification khóa cùng `encodedArtifactSha256`, decoded frame-MD5 và exact measurement strings khi đo `-15..-13`, `≤-1`, `4..8` |
| Budget ledger deterministic và không vay giữa phase | Unit/migration khóa slots `8/4/3/2/1/1`, tổng tối đa `19`; exhaustion trả `FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED` |
| Threshold giữ nguyên | Worker/control-plane fingerprint parity và static guardrail khóa `-14±1 LUFS-I`, `≤-1 dBTP`, `4..8 LU`; threshold source diff bằng 0 |
| Exact lineage/provenance append-only | Migration 0033 mutation vectors khóa ordinal-2 SHA, true-peak/LRA-guard evidence, candidate trace, image/FFmpeg/libopus/algorithm/threshold fingerprints; UPDATE/DELETE → ABORT |
| Không ordinal/attempt 4 hoặc side effect | Unit/migration/Sites/static checks khóa output/provider/calibration/finalize/activation/release/publish ở `false/0/OFF`; real FFmpeg smoke zero write |
| Build/deploy không tự chạy Production search | Image/deploy workflow chỉ chạy local container smoke và readiness health; invocation cần owner OPERATE approval riêng sau merge/deploy/exact-tree/health PASS |
