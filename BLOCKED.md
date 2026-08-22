# BLOCKED

## B-001 · Thiếu tài liệu nguồn chuẩn — RESOLVED

Trạng thái: `CLOSED`
Phát hiện: 2026-08-22
Đóng: 2026-08-22

Các file được `docs/00-INDEX.md` hoặc tài liệu liên quan tuyên bố là bắt buộc nhưng chưa có trong bộ nguồn đã nhận:

- `docs/02-CONTRACTS.md` — nguồn chân lý về type và mọi ngưỡng số; chặn WP-00 trở đi.
- `docs/06-PROMPT-PACK.md` — prompt BUILD/OPS chuẩn.
- `docs/08-CONTINUOUS-OPERATION.md` — mode, runbook và nhịp vận hành liên tục.
- `docs/12-BUILD-ORDER-DELTA.md` — tài liệu giải thích; nội dung được nói là đã hợp nhất vào `04-BUILD-ORDER.md`, nên không chặn build nhưng cần để đủ pack.
- `docs/ai-factory-modul-nghiep-vu.md` — đặc tả 25 module nghiệp vụ.
- `DECISIONS-ANSWERED.md` — 11 quyết định owner; các quyết định chưa trả lời tiếp tục chặn các WP nêu trong `docs/07-DECISIONS-REQUIRED.md`.

Kết quả khôi phục:

- Đã khôi phục và kiểm tra provenance: `02-CONTRACTS.md`, `06-PROMPT-PACK.md`, `08-CONTINUOUS-OPERATION.md`, `ai-factory-modul-nghiep-vu.md`, `DECISIONS-ANSWERED.md`.
- `12-BUILD-ORDER-DELTA.md` không tồn tại như file độc lập; `00-INDEX.md` xác nhận nội dung đã được hợp nhất vào `04-BUILD-ORDER.md`, nên không chặn build.
- Không tạo placeholder và không suy diễn quyết định.

## B-002 · Chưa cấu hình bảo vệ branch trên GitHub

Trạng thái: `OPEN`

Sau khi repository GitHub được tạo cần bật branch protection cho `main`: PR bắt buộc, CI bắt buộc, không force-push, không xóa branch và yêu cầu CODEOWNER review cho vùng governance.

## B-003 · Owner confirmations trong DECISIONS-ANSWERED

Trạng thái: `OPEN — không chặn WP-00 → WP-07`

- Xác nhận ngân sách thật: `$30/video`, `$400 qualification`, `$350 Track G`. Fail-closed: xem như chặn WP-08 và WP-12B cho tới khi owner xác nhận.
- Thay placeholder `owner@<domain>` và `operator@<domain>` bằng identity người thật trước WP-28.
- Xác nhận `OWNER_WEEKLY_CEILING_MIN = 300` và cung cấp 10–15 mẫu audio chuẩn trước WP-15/Track G G-02.
- Chọn nhà cung cấp production audio và xác nhận license hiện hành trước WP-19.

Ghi chú xung đột nội bộ: `DECISIONS-ANSWERED.md` vừa nói ba xác nhận “không chặn WP-00 → WP-11”, vừa nói ngân sách chặn WP-08. Áp dụng P2 fail-closed: WP-08 bị chặn cho tới khi xác nhận ngân sách.
