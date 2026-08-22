# Source Gap & Conflict Register

Ngày kiểm kê: 2026-08-22

## Các gap đã xử lý

| Tài liệu | Vai trò | Tác động |
|---|---|---|
| `02-CONTRACTS.md` | Type và mọi ngưỡng số | Khôi phục; blocker WP-00 đã gỡ |
| `06-PROMPT-PACK.md` | Giao thức prompt BUILD/OPS | Khôi phục |
| `08-CONTINUOUS-OPERATION.md` | Mode/runbook/anti-drift | Khôi phục |
| `12-BUILD-ORDER-DELTA.md` | Lý giải WP mới | Không có file; nội dung đã hợp nhất vào `04` theo `00-INDEX` |
| `ai-factory-modul-nghiep-vu.md` | 25 module nghiệp vụ | Khôi phục |
| `DECISIONS-ANSWERED.md` | 11 quyết định owner | Khôi phục; còn ba xác nhận owner-specific trong B-003 |

## Xung đột/điểm cần chuẩn hóa

| ID | Phát hiện | Cách xử lý hiện tại |
|---|---|---|
| C-001 | `00-AGENT-BRIEF.md` còn ghi 44 module | Lấy 48 làm đích: 44 gốc + 4 trong `15-MODULE-ADDENDUM.md` |
| C-002 | Tài liệu dùng “18 stage” nhưng ID là 00–16 | Hợp lệ vì 07 tách thành 07A và 07B; tổng là 18 |
| C-003 | `16-ARCHITECTURE-ADDENDUM.md` nói `DECISIONS-ANSWERED` đã điền nhưng file ban đầu không có | Resolved: file đã khôi phục; các mục `[XÁC NHẬN]` vẫn fail-closed |
| C-004 | `00-INDEX.md` mô tả pack đầy đủ trong khi đợt nhập đầu chỉ có 16 file | Resolved cho build: 21 file active; delta 12 đã merge vào 04 |
| C-005 | `DECISIONS-ANSWERED` nói xác nhận không chặn WP-00→11 nhưng đồng thời ngân sách chặn WP-08 | Fail-closed: WP-08 bị chặn cho tới owner confirmation |
