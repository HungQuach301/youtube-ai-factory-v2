# 17 — Stage 12 QA Remediation

Evolution ID: `EVOLVE_STAGE12_QA_REMEDIATION`

## Phạm vi được owner phê duyệt

- Lưu receipt và toàn bộ số đo của callback QA thất bại dưới dạng immutable evidence.
- Cho phép một diagnostic scan ban đầu có kiểu dữ liệu cho pre-master bất biến của attempt 3; chỉ callback timeout mới được tạo đúng một retry có lineage.
- Sửa renderer và audio từ nguyên nhân gốc; không thay đổi hay nới bất kỳ threshold nào.
- Không chạy remediation generation, không finalize Stage 12 và không publish trong evolution này.
- `providerDispatch=OFF`, `providerCallCount=0`, `autoPublish=OFF` ở mọi đường đi.

## Luồng bằng chứng

1. Worker quét toàn timeline và trả `Stage12MediaReceipt`, kể cả khi QA fail.
2. Control plane kiểm checksum pre-master, ghi canonical receipt vào R2 và read-back.
3. D1 chỉ giữ con trỏ/hash cùng typed measurements trong `stage12_qa_evidence`.
4. Callback QA fail vẫn trả 422 và job gốc vẫn fail-closed; không có retry thứ tư.
5. Diagnostic scan dùng `stage12_qa_diagnostic_job`, idempotency key và callback token riêng; không đổi trạng thái job attempt 3.
6. Client đã kết nối có thể dùng stable gateway `execute_factory_command` với `commandType=SCAN_STAGE_12_ATTEMPT_3`; không cần Reconnect app hay Refresh metadata để thấy schema tool mới.
7. Callback lưu `target_duration_sec` trong job và chỉ xác minh pointer/hash/size R2 đã niêm phong; không hydrate lại toàn pipeline và không băm lại video lớn trong request.
8. DOMException timeout được chuẩn hóa thành `STAGE12_CALLBACK_TIMEOUT`; numeric `23` không còn hợp lệ cho callback mới.
9. Diagnostic terminal là immutable. Retry ordinal 2 giữ `retry_of_diagnostic_job_id` và `retry_reason_code=STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT`; legacy row code `23` được giữ nguyên làm predecessor evidence.

## Sửa gốc

- Renderer chuyển từ `drawbox` có tọa độ thời gian không được đảm bảo evaluate mỗi frame sang overlay `eval=frame`. Overlay chiếm đủ diện tích để nền tối không bị nhận nhầm là black frame và tạo chuyển động thật trong cửa sổ near-static hiện hành.
- Audio được đo lại sau encode Opus. Chỉ khi file cuối lệch gate, worker chạy một pass loudnorm trên chính stream đã encode, copy nguyên video và đo lại toàn bộ file.

## Threshold lock

- near-static: `7s`
- integrated loudness: `-14 ± 1 LUFS-I`
- true peak: `≤ -1 dBTP`
- LRA: `4..8 LU`
- A/V sync: `≤ 120ms`
- P0 defect: `0`

## Promotion và rollback

- Promotion chỉ sau source-integrity, typecheck, lint, migrations, unit/integration, Sites health và media-worker health/smoke đều PASS.
- Rollback là deploy lại image digest và Sites commit trước evolution; evidence đã ghi vẫn giữ bất biến.
- Sau deploy, diagnostic scan là lệnh OPERATE riêng. Evolution không tự chạy scan và không khởi tạo generation.

## Callback evolution

Evolution ID: `EVOLVE_STAGE12_DIAGNOSTIC_CALLBACK`

- Migration `0024` giới hạn `diagnostic_ordinal BETWEEN 1 AND 2`, khóa UPDATE/DELETE terminal và bắt buộc duration cho mọi job mới.
- Callback mới vẫn ghi canonical receipt vào R2, read-back hash, rồi commit evidence/job pointer trong D1; chỉ loại bỏ các full-read dư thừa trước bước này.
- Việc triển khai code không đồng nghĩa phê duyệt retry scan. Retry chỉ được chạy bằng một lệnh OPERATE owner-approved riêng sau đó.

## Corrected pre-master evolution

Evolution ID: `EVOLVE_STAGE12_CORRECTED_PREMASTER`

- Diagnostic ordinal 2 `READY` với immutable evidence `FAIL` là nguồn duy nhất được phép tạo corrected pre-master; attempt 3, diagnostic jobs và QA evidence cũ không bị sửa.
- `stage12_corrected_pre_master_job` khóa quan hệ source job → diagnostic ordinal 2 → diagnostic evidence → corrected artifact. Corrected R2 key và SHA-256 phải mới; terminal row không thể UPDATE/DELETE.
- Worker áp dụng strategy v1 xác định: temporal noise/motion repair cho toàn timeline, dynamic-range expansion rồi loudnorm trên encoded audio, sau đó chạy lại full Stage 12 scan.
- Stable gateway dùng `commandType=CREATE_STAGE_12_CORRECTED_PREMASTER` và exact approval `CREATE STAGE 12 CORRECTED PRE-MASTER`; triển khai evolution không tự gọi command này.
- Mọi QA threshold ở trên giữ nguyên. Remediation không gọi provider, không tạo attempt 4, không finalize và không publish.

## Audio/P0 correction evolution

Evolution ID: `EVOLVE_STAGE12_AUDIO_P0_CORRECTION`

- Nguồn duy nhất là corrected pre-master strategy v1 đã seal ở trạng thái `READY/FAIL`, còn đúng các failure `TECHNICAL_DEFECT`, `LOUDNESS` và `M0_INPUT_RIGHTS_P0`. Artifact, receipt, hash và byte length của predecessor phải khớp tuyệt đối.
- Migration `0026` tạo `stage12_audio_p0_correction_job` append-only với `correction_ordinal=2`, liên kết trực tiếp predecessor và Stage 12 attempt 3. Output phải có R2 key/hash mới; terminal row không thể UPDATE/DELETE.
- Strategy v2 copy nguyên video stream đã sửa ở strategy v1, chỉ xử lý audio bằng macro-dynamic shaping, downward expansion và loudnorm. Worker đo lại file Opus cuối và chỉ chạy số pass hậu encode bị chặn bởi `RETRY.MAX_ATTEMPTS` hiện hành.
- True-peak target nội bộ có headroom `-1.5 dBTP`, được suy ra từ gate `-1 dBTP` và nửa tolerance loudness hiện hành; LRA target là trung điểm `6 LU` của gate `4..8 LU`. Đây là target xử lý, không sửa threshold QA.
- Stable gateway dùng `commandType=CREATE_STAGE_12_AUDIO_P0_CORRECTION` và exact approval `CREATE STAGE 12 AUDIO P0 CORRECTION`. Việc merge/deploy evolution không tự chạy command.
- Finalize chỉ có thể chọn ordinal 2 khi job `READY/PASS` và receipt immutable hợp lệ; nếu ordinal 2 chưa PASS thì Stage 12 tiếp tục fail-closed.
- Evolution và CI không gọi provider, không tạo attempt 4, không chạy generation, không finalize và không publish.

## Audio/P0 command-contract repair

Evolution ID: `EVOLVE_STAGE12_AUDIO_P0_COMMAND_CONTRACT`

- Migration `0027` thay trigger allowlist của `command_log` và chỉ thêm command
  `CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION` với transition
  `TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL` →
  `TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING`.
- Toàn bộ command và transition đã có trong migration `0023` được sao chép nguyên
  trạng; unknown command, state sai và idempotency key sai vẫn fail-closed.
- Stable MCP gateway chuẩn hóa lỗi trigger thành
  `STABLE_COMMAND_CONTRACT_VIOLATION`, không trả chi tiết D1/SQLite cho client.
- Regression E2E chạy full migration chain qua `execute_factory_command`: trigger
  legacy bị từ chối atomically; sau `0027`, đúng một command và đúng một correction
  job được tạo trong fixture, với provider/publish OFF và không có attempt 4.
- Evolution này chỉ sửa contract, test và mở PR. Nó không retry correction,
  không gọi provider, không finalize và không publish.

## Audio/P0 correction ordinal 3

Evolution ID: `EVOLVE_STAGE12_AUDIO_P0_CORRECTION_ORDINAL3`

- Nguồn duy nhất là correction ordinal 2 `READY/FAIL` có immutable artifact,
  receipt và các lỗi encoded `clippingSampleCount > 0`, true peak vượt `-1 dBTP`,
  LRA dưới `4 LU` và P0 vượt `0`. Artifact SHA nguồn hiện hành là
  `163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2`.
- Migration `0028` thêm bảng retry append-only với `correction_ordinal=3`,
  `correction_strategy_version=3` và typed reason
  `STAGE12_AUDIO_P0_ENCODED_QA_FAIL`; ordinal 2 không bị sửa hoặc xóa.
- Strategy v3 giữ nguyên video, tạo macro-dynamics theo chu kỳ vuông khi LRA dưới
  sàn, dùng true-peak target nội bộ `-2 dBTP`, tắt auto-level của limiter, đo lại
  chính file Opus sau từng pass và fail-closed bằng
  `STAGE12_ENCODED_LOUDNESS_UNRESOLVED` nếu output cuối chưa đạt contract.
- Các target xử lý được suy ra từ threshold hiện hành; QA threshold vẫn giữ
  nguyên: `-14 ± 1 LUFS-I`, true peak `≤ -1 dBTP`, LRA `4..8 LU`, P0 `0`.
- Stable diagnostic trả đầy đủ source/output R2 key, SHA-256, byte length,
  frame-MD5 SHA-256, receipt R2/SHA, report SHA và worker image digest.
- Evolution này chỉ mở PR. Nó không chạy correction ordinal 3, không tạo attempt
  4, không gọi provider, không finalize và không publish.

## Encoded-loudness failure observability

Evolution ID: `EVOLVE_STAGE12_ENCODED_LOUDNESS_FAILURE_OBSERVABILITY`

- Worker ghi exact measurement của initial encoded stream, output sau pass 1/2 và
  final output sau pass 3 vào typed failure diagnostic; mỗi mốc có integrated LUFS,
  true peak, LRA và exact failed predicates.
- Callback chỉ nhận diagnostic này cùng
  `STAGE12_ENCODED_LOUDNESS_UNRESOLVED`, correction pass/limit `3/3`, boundary
  `FINAL_POST_ENCODE_LOUDNESS_VERIFICATION` và immutable worker image digest.
- Control plane tự tính lại predicate từ threshold hiện hành và từ chối payload
  thiếu, không hữu hạn, sai pass, sai final hoặc sai digest trước khi ghi dữ liệu.
- Migration `0029` tạo bảng evidence riêng, UNIQUE theo ordinal-3 correction job,
  khóa exact source R2/SHA/byte length/receipt và cấm UPDATE/DELETE. Job chuyển
  `PENDING` → `FAILED` cùng evidence INSERT trong một D1 batch nguyên tử.
- Migration không backfill số đo đã mất của terminal ordinal 3 hiện hữu và không
  UPDATE bất kỳ ordinal 2/3 history nào. Diagnostic read-back trả evidence mới khi
  nó thực sự tồn tại; nếu không thì trả `null`, không suy đoán.
- Threshold giữ nguyên `-14 ±1 LUFS-I`, true peak `≤ -1 dBTP`, LRA `4..8 LU`;
  evolution không tạo ordinal 4/attempt 4, không provider, calibration, Finalize,
  release hoặc publish.
