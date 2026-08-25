# AGENTS.md — YouTube AI Factory V2

## Mode

Khóa nhận diện repository phải PASS trước khi tuyên bố mode. Sau đó, mọi phiên phải tuyên bố đúng một mode: `BUILD`, `OPERATE` hoặc `EVOLVE`. Repository mới bắt đầu ở `BUILD`.

## Khóa nhận diện repository — bắt buộc trước mọi mode

- Canonical repository duy nhất: `HungQuach301/youtube-ai-factory-v2`.
- Repository bị loại trừ: `HungQuach301/youtube-ai-factory`; không dùng làm upstream, mirror, fallback, recovery input hoặc đích commit cho V2.
- Trước mọi đọc nguồn dẫn tới mutation, edit, commit, PR, merge, checkpoint, deploy, migration hoặc provider dispatch: xác minh exact `owner/repo`, branch, HEAD, remote và worktree; sau đó chạy `pnpm verify:repo`.
- Chỉ được tiếp tục khi identity bằng đúng canonical repository và không có remote nào trỏ tới repository bị loại trừ.
- Sai hoặc không xác minh được identity phải dừng fail-closed với `REPOSITORY_IDENTITY_BLOCKED`; không được “làm trước, sửa repo sau”.
- Mọi thay đổi canonical đi qua branch + PR của repository V2. ChatGPT Sites chỉ là deployment mirror dẫn xuất từ `sites/control-plane`, không phải nơi author project truth.
- Cấm force-push hoặc viết lại lịch sử để chữa commit nhầm. Recovery mặc định là branch + PR + commit revert không phá lịch sử, kèm receipt đối chiếu bytes.

## Nguồn chuẩn

- GitHub repository này là single source of truth duy nhất sau bootstrap.
- Đọc `docs/00-AGENT-BRIEF.md` và `docs/00-INDEX.md` trước khi làm việc.
- `docs/02-CONTRACTS.md` là nguồn chuẩn về type/ngưỡng.
- `docs/03-DATA-SCHEMA.sql` là nguồn chuẩn về dữ liệu.
- Addendum thắng khi mâu thuẫn với tài liệu gốc.
- Không suy diễn hoặc tự tạo nội dung thay cho tài liệu đang thiếu; ghi vào `BLOCKED.md`.

## Ranh giới bootstrap

- Không import code, Git history, production data, secret hoặc artifact từ project cũ.
- Không dùng conversation state làm nguồn chuẩn nếu chưa có commit.
- Mọi thay đổi tài liệu nguồn phải cập nhật `docs/SOURCE-MANIFEST.md` và `docs/SOURCE_SHA256SUMS` trong cùng PR.
- Mỗi work package dùng một branch, một PR và `DONE.md` có Acceptance ↔ Test.
- Tuân thủ P1–P13 và G1–G15 trong `docs/00-AGENT-BRIEF.md`.
