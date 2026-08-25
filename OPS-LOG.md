# OPS LOG

Append-only. Chưa có phiên `OPERATE`; repository đang ở mode `BUILD`.



## Entry convention (WP-31)

Mỗi phiên thật chỉ được nối thêm đúng một mục `## OPS-SESSION <session_id>`.
Mục phải ghi mode, một nhiệm vụ, thời gian mở/đóng, năm guardrail đã nêu lại,
mọi `trace_id` của command, exception và việc cần người quyết. Nội dung cũ
không được sửa; phiên chỉ đọc vẫn ghi `traceIds: none`.
