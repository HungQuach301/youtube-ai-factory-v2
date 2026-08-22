# YouTube AI Factory V2

Repository độc lập cho một nhà máy YouTube đa kênh vận hành bằng ChatGPT Work: nghiên cứu → chiến lược → sản xuất → phát hành → đo lường → cải thiện, với human-in-the-loop, policy defense và cơ chế tự nâng cấp có kiểm soát.

## Trạng thái

- Mode hiện tại: `BUILD`
- Mốc hiện tại: `WP-01_COMPLETE`; GitHub CI đã xác minh Canonical Hashing & Lineage trên clean install
- Nguồn đã nhập: 21 tài liệu, giữ nguyên nội dung và kiểm soát bằng SHA-256
- Kiến trúc đích: 48 module, 18 stage, hai track `Platform` và `Golden Path`
- WP-00 và WP-01 đã hoàn tất; work package kế tiếp là WP-02 Typed Command & State Machine. Các blocker owner-specific vẫn được cưỡng chế theo [`BLOCKED.md`](BLOCKED.md) và `DECISIONS-ANSWERED.md`.

## Quy tắc single source of truth

Sau khi repository này được đẩy lên GitHub, mọi quyết định, tài liệu, code, test, evidence và thay đổi phải được ghi nhận bằng commit/PR tại đây. Nội dung chỉ tồn tại trong ChatGPT conversation, Library, Sites hoặc tài liệu rời không có hiệu lực cho tới khi được hợp nhất vào repository.

Thứ tự đọc bắt buộc:

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/00-AGENT-BRIEF.md`](docs/00-AGENT-BRIEF.md)
3. [`docs/00-INDEX.md`](docs/00-INDEX.md)
4. [`docs/SSOT-POLICY.md`](docs/SSOT-POLICY.md)
5. [`BLOCKED.md`](BLOCKED.md)

## Phạm vi bootstrap

Commit đầu tiên chỉ thiết lập nguồn chuẩn và governance. Không tái sử dụng code, dữ liệu production, secret, artifact hay lịch sử Git của project cũ; không dispatch provider và không phát sinh chi phí sản xuất.

## ChatGPT Sites deployment mirror

- Canonical source: GitHub `main`
- Deployable source: [`sites/control-plane`](sites/control-plane)
- Continuity contract: [`sites/control-plane/SSOT-CONTRACT.md`](sites/control-plane/SSOT-CONTRACT.md)
- Direction: GitHub `main` → reviewed immutable ChatGPT Sites checkpoint

Direct Site edits, chat-only decisions and temporary workspace files are not factory truth. Every change must return through a GitHub pull request and green CI before deployment.
