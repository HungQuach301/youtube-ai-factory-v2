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

Kiểm tra ngày 2026-08-23 xác nhận `main` vẫn chưa được bảo vệ. Connector GitHub
hiện tại không expose thao tác branch-protection và Cloud Browser không có phiên
GitHub đã đăng nhập, nên agent không tuyên bố blocker đã đóng. Mọi thay đổi vẫn
tiếp tục đi qua draft PR + CI + squash merge trong lúc chờ cấu hình cấp repository.

## B-003 · Owner confirmations trong DECISIONS-ANSWERED

Trạng thái: `OPEN — budget confirmation CLOSED 2026-08-23; các mục còn lại giữ nguyên blocker theo WP`

- **CLOSED 2026-08-23:** owner đã xác nhận ngân sách thật `$30/video`, `$400 qualification`, `$350 Track G`; WP-08 và WP-12B được mở khóa với đúng các trần này.
- Thay placeholder `owner@<domain>` và `operator@<domain>` bằng identity người thật trước WP-28.
- Xác nhận `OWNER_WEEKLY_CEILING_MIN = 300` và cung cấp 10–15 mẫu audio chuẩn trước WP-15/Track G G-02.
- Chọn nhà cung cấp production audio và xác nhận license hiện hành trước WP-19.

Ghi chú xung đột nội bộ đã được giải quyết bằng xác nhận owner ngày 2026-08-23. Không được tự nâng các trần đã xác nhận; mọi thay đổi sau này cần quyết định owner mới.

## B-004 · Fly production deployment credential/tool chưa hiện diện

Trạng thái: `OPEN — code/image qualification vẫn tiếp tục`

Owner đã ủy quyền production và provider/API trả phí trong các trần đã chốt. Tuy
nhiên, phiên triển khai hiện tại không có `flyctl`, Fly connector hoặc credential
Fly đã xác thực. Đây là thiếu capability kỹ thuật, không phải thiếu phê duyệt.

WP-12 vẫn được build và kiểm định bằng GitHub Actions. Không được tuyên bố Fly
production đã deploy, không được ghi image digest giả và không được đưa secret vào
repository. Blocker đóng khi CI image pass và một môi trường Fly được xác thực để
deploy đúng image digest rồi health-check production.

## B-005 · WP-12B numeric checkpoint cần owner xác nhận sau phép đo

Trạng thái: `CLOSED — OWNER CONFIRMED 2026-08-23`

Benchmark đã đo đủ 16 case và kết luận trong phạm vi WP-12B:

- FULL: `$0.266674/video`;
- REDUCED: `$0.123168/video`;
- REDUCED + deterministic max: `$0.127076/video`.

Cả ba dưới trần `$30/video`, nhưng đây không phải all-in factory cost và pricing
fixture chưa phải capability `QUALIFIED`. `docs/04-BUILD-ORDER.md` yêu cầu owner
xác nhận con số **sau khi đo** trước WP-13. Standing authorization không thay thế
được quyết định evidence-specific này. Owner đã xác nhận cả bảng và chọn
`PROFILE=REDUCED`; WP-13 được mở khóa. Các caveat phạm vi đo, qualification và
cost reservation vẫn giữ nguyên.
