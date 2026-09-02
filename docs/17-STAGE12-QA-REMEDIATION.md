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
