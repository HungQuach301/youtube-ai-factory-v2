# AGENTS.md — YouTube AI Factory V2

## Mode

Mọi phiên phải tuyên bố đúng một mode: `BUILD`, `OPERATE` hoặc `EVOLVE`. Repository mới bắt đầu ở `BUILD`.

## Nguồn chuẩn

- GitHub repository này là single source of truth duy nhất sau bootstrap.
- Đọc `docs/00-AGENT-BRIEF.md` và `docs/00-INDEX.md` trước khi làm việc.
- `docs/02-CONTRACTS.md` là nguồn chuẩn về type/ngưỡng khi file này được bổ sung.
- `docs/03-DATA-SCHEMA.sql` là nguồn chuẩn về dữ liệu.
- Addendum thắng khi mâu thuẫn với tài liệu gốc.
- Không suy diễn hoặc tự tạo nội dung thay cho tài liệu đang thiếu; ghi vào `BLOCKED.md`.

## Ranh giới bootstrap

- Không import code, Git history, production data, secret hoặc artifact từ project cũ.
- Không dùng conversation state làm nguồn chuẩn nếu chưa có commit.
- Mọi thay đổi tài liệu nguồn phải cập nhật `docs/SOURCE-MANIFEST.md` và `docs/SOURCE_SHA256SUMS` trong cùng PR.
- Mỗi work package dùng một branch, một PR và `DONE.md` có Acceptance ↔ Test.
- Tuân thủ P1–P13 và G1–G15 trong `docs/00-AGENT-BRIEF.md`.

