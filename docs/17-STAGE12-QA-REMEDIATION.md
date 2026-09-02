# 17 — Stage 12 QA Remediation

Evolution ID: `EVOLVE_STAGE12_QA_REMEDIATION`

## Phạm vi được owner phê duyệt

- Lưu receipt và toàn bộ số đo của callback QA thất bại dưới dạng immutable evidence.
- Cho phép đúng một diagnostic scan có kiểu dữ liệu cho pre-master bất biến của attempt 3.
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
