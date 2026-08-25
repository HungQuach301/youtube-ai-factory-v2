# Single Source of Truth Policy

## 1. Nguồn có hiệu lực

GitHub repository này là nguồn duy nhất có hiệu lực cho project YouTube AI Factory V2. `main` biểu diễn baseline đã phê duyệt; branch/PR biểu diễn thay đổi đang đề xuất.

## 2. Nguồn không tự có hiệu lực

ChatGPT conversation, ChatGPT Library, Sites, Google Drive, local workspace, email, screenshot và tài liệu bên ngoài chỉ là nguồn đầu vào. Chúng không thay đổi project cho tới khi được nhập, đối chiếu, commit và hợp nhất vào repository.

## 3. Quy trình thay đổi

1. Tạo branch đúng mode/work package.
2. Nêu provenance và lý do thay đổi.
3. Cập nhật tài liệu/code/test/evidence liên quan trong cùng PR.
4. Nếu sửa file nguồn, cập nhật `SOURCE-MANIFEST.md` và `SOURCE_SHA256SUMS`.
5. Chạy guardrail và test bắt buộc.
6. Chỉ merge khi không còn xung đột nguồn chuẩn hoặc blocker chưa được thừa nhận.

## 4. Quy tắc xung đột

- Contract thắng implementation.
- Data schema thắng code về mô hình dữ liệu.
- Addendum thắng tài liệu gốc tại đúng phần nó hiệu chỉnh.
- Quyết định owner đã commit thắng đề xuất/mặc định.
- Thiếu bằng chứng được xử lý fail-closed.

## 5. Tách biệt project cũ và khóa identity

- Canonical repository duy nhất của YouTube AI Factory V2 là `HungQuach301/youtube-ai-factory-v2`.
- `HungQuach301/youtube-ai-factory` là repository bị loại trừ: không được dùng làm upstream, mirror, fallback, recovery input hoặc đích commit cho V2.
- Repository này không chia sẻ Git history, remote, secret, production data hoặc artifact với project cũ.
- Trước mọi mutation, agent phải xác minh exact `owner/repo`, branch, HEAD, remote và chạy `pnpm verify:repo`. Mismatch hoặc identity không xác minh được trả `REPOSITORY_IDENTITY_BLOCKED` và dừng trước edit/commit/deploy.
- Việc tham khảo project cũ trong tương lai chỉ được thực hiện qua migration proposal có inventory, provenance, impact analysis và owner approval; không cherry-pick ngầm.

## 6. Incident receipt — 2026-08-25

Ba commit Phase 45 đã bị ghi nhầm vào `HungQuach301/youtube-ai-factory`. Chúng được hoàn tác không phá lịch sử qua pull request `HungQuach301/youtube-ai-factory#3`; source tree sau revert được đối chiếu byte-equivalent với baseline trước sự cố `5f874568`. Không force-push và không có code nào từ sự cố được tự động nhập vào V2. Guardrail identity trong `AGENTS.md`, `tools/verify-repository-identity.mjs` và GitHub CI là biện pháp phòng tái diễn.

