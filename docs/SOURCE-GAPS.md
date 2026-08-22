# Source Gap & Conflict Register

Ngày kiểm kê: 2026-08-22

## Thiếu

| Tài liệu | Vai trò | Tác động |
|---|---|---|
| `02-CONTRACTS.md` | Type và mọi ngưỡng số | Blocker cứng cho implementation |
| `06-PROMPT-PACK.md` | Giao thức prompt BUILD/OPS | Chưa thể chạy đúng pack hoàn chỉnh |
| `08-CONTINUOUS-OPERATION.md` | Mode/runbook/anti-drift | Blocker trước OPERATE |
| `12-BUILD-ORDER-DELTA.md` | Lý giải WP mới | Không chặn vì đã hợp nhất vào `04` |
| `ai-factory-modul-nghiep-vu.md` | 25 module nghiệp vụ | Blocker khi triển khai domain WP-16..24 |
| `DECISIONS-ANSWERED.md` | 11 quyết định owner | Chặn theo ma trận trong `07` |

## Xung đột/điểm cần chuẩn hóa

| ID | Phát hiện | Cách xử lý hiện tại |
|---|---|---|
| C-001 | `00-AGENT-BRIEF.md` còn ghi 44 module | Lấy 48 làm đích: 44 gốc + 4 trong `15-MODULE-ADDENDUM.md` |
| C-002 | Tài liệu dùng “18 stage” nhưng ID là 00–16 | Hợp lệ vì 07 tách thành 07A và 07B; tổng là 18 |
| C-003 | `16-ARCHITECTURE-ADDENDUM.md` nói `DECISIONS-ANSWERED` đã điền nhưng file không có trong nguồn | Không coi quyết định nào là đã trả lời cho tới khi file được commit |
| C-004 | `00-INDEX.md` mô tả pack đầy đủ trong khi bộ nhận chỉ có 16 file | Manifest thực tế thắng tuyên bố về completeness; trạng thái là `PARTIAL_SOURCE_PACK` |

