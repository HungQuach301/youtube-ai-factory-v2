# BLOCKED

## B-001 · Thiếu tài liệu nguồn chuẩn

Trạng thái: `OPEN`  
Phát hiện: 2026-08-22

Các file được `docs/00-INDEX.md` hoặc tài liệu liên quan tuyên bố là bắt buộc nhưng chưa có trong bộ nguồn đã nhận:

- `docs/02-CONTRACTS.md` — nguồn chân lý về type và mọi ngưỡng số; chặn WP-00 trở đi.
- `docs/06-PROMPT-PACK.md` — prompt BUILD/OPS chuẩn.
- `docs/08-CONTINUOUS-OPERATION.md` — mode, runbook và nhịp vận hành liên tục.
- `docs/12-BUILD-ORDER-DELTA.md` — tài liệu giải thích; nội dung được nói là đã hợp nhất vào `04-BUILD-ORDER.md`, nên không chặn build nhưng cần để đủ pack.
- `docs/ai-factory-modul-nghiep-vu.md` — đặc tả 25 module nghiệp vụ.
- `DECISIONS-ANSWERED.md` — 11 quyết định owner; các quyết định chưa trả lời tiếp tục chặn các WP nêu trong `docs/07-DECISIONS-REQUIRED.md`.

Quy tắc: không tạo placeholder mang giá trị giả và không tự điền quyết định.

## B-002 · Chưa cấu hình bảo vệ branch trên GitHub

Trạng thái: `OPEN`

Sau khi repository GitHub được tạo cần bật branch protection cho `main`: PR bắt buộc, CI bắt buộc, không force-push, không xóa branch và yêu cầu CODEOWNER review cho vùng governance.

