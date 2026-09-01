# OPS LOG

Append-only. Chưa có phiên `OPERATE`; repository đang ở mode `BUILD`.



## Entry convention (WP-31)

Mỗi phiên thật chỉ được nối thêm đúng một mục `## OPS-SESSION <session_id>`.
Mục phải ghi mode, một nhiệm vụ, thời gian mở/đóng, năm guardrail đã nêu lại,
mọi `trace_id` của command, exception và việc cần người quyết. Nội dung cũ
không được sửa; phiên chỉ đọc vẫn ghi `traceIds: none`.

## OPS-SESSION 2026-09-01-stage12-attempt3-readback

- mode: `OPERATE`
- task: read back and continue the already-approved Stage 12 attempt 3 recovery;
  finalize only after an immutable `READY` receipt.
- opened_at: `2026-09-01T11:49:00Z`
- closed_at: `2026-09-01T12:02:16Z`
- guardrails: no contracts/guardrail-tests/gate-definitions/migrations change;
  no owner release/publish command; no threshold relaxation; no provider dispatch
  outside `guardedDispatch`; one task only.
- commands: exact recovery replay was invoked through the authenticated Production
  MCP surface; it created no new command because the canonical recovery idempotency
  key already existed. Existing command trace read back as
  `b5f3dcde-2019-4a03-b10f-6c5982677415`.
- traceIds: `b5f3dcde-2019-4a03-b10f-6c5982677415` (existing canonical command;
  current invocation was an idempotent failed replay with no new trace).
- exception: `TRACK_G_STAGE_12_RECOVERY_ALREADY_FAILED:STAGE12_CALLBACK_FAILED:422`.
  Sites worker log request `90bde8a7faebfb07e448020f7c930037`, trace
  `8f1cf1c8978134ee79545a627354df50`, returned 422 after `20313 ms`.
- read_back: attempt 3 remains `FAILED`; receipt fields are null;
  `stage12_pre_master_qa` has zero rows; the immutable pre-master remains present at
  SHA-256 `8f3e76527bc219b8f85db7adefe6abdcd18ef59617e6016aaf838f5c4ea5fd42`;
  provider dispatch and auto-publish remain `OFF`.
- outstanding: `EVO-STAGE12-CALLBACK-EVIDENCE-RECOVERY`; do not finalize and do
  not create attempt 4.
