# DONE

## WP-00 · Scaffold & Contracts

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| Monorepo TypeScript strict, package contracts v2 | `pnpm typecheck` |
| G1 cấm `JSON.stringify` trước hash | `eslint-rules.test.ts`; fixture `g1-violation.ts` bị ESLint từ chối |
| G2 chỉ adapter được import SDK provider | `eslint-rules.test.ts` kiểm cả đường cấm và đường cho phép |
| G6 `preflight()` không gọi provider/LLM | ESLint test đối kháng + type test `PreflightContext` |
| PROFILE, UNDECIDED, UNCALIBRATED, OPS, ATTENTION, POLICY, EVOLUTION có trong contracts | `contracts.test.ts` + typecheck |
| 12 command và ranh giới owner/operator đúng contract | `contracts.test.ts` |
| Job envelope có runtime boundary | Zod schema + test input sai |
| CI chạy source integrity, typecheck, lint, guardrail và unit | `.github/workflows/build.yml` |

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| G1 | ESLint rule `g1-no-json-stringify-hash` |
| G2 | ESLint rule `g2-provider-sdk-boundary` |
| G6 | ESLint rule `g6-no-provider-in-preflight` + type boundary |

## Lệnh xác minh

`pnpm verify:source` · `pnpm typecheck` · `pnpm lint` · `pnpm test:guardrails` · `pnpm test:unit`

## Ngoài phạm vi WP-00

G3–G15, implementation của `guardedDispatch`, StageRunner lifecycle, migration và integration được triển khai tại đúng WP trong `docs/04-BUILD-ORDER.md`.

---

## WP-01 · CORE-01 Canonical Hashing & Lineage

## Mode: BUILD

## Acceptance ↔ Test

| Acceptance | Bằng chứng cưỡng chế |
|---|---|
| RFC 8785 + NFC tạo hash ổn định | 1.000 permutation, NFC/NFD và vector số ECMAScript |
| Dữ liệu ngoài I-JSON bị từ chối | Test NaN, Infinity, BigInt, undefined, sparse array, cycle, surrogate, symbol, accessor |
| Volatile fields không làm đổi content identity | Test strip đệ quy `timestamp`, `request_id`, `latency`, `nonce` |
| Stream hashing không phụ thuộc chunk boundary | SHA-256 vector `abc` qua hai cách chia chunk |
| Lineage truy vấn đúng depth 10 | Recursive CTE integration test trên SQLite |
| Lineage fail-closed | Test chống cycle, quarantine và G5 namespace isolation |
| Migration `0001` tái lập | UP/DOWN ×2, không còn bảng dư |

## Trigger ↔ Test

| Trigger/Constraint | Test |
|---|---|
| `trg_command_log_no_update` | UPDATE command → ABORT |
| `trg_command_log_no_delete` | DELETE command → ABORT |
| `trg_owner_command_signature` | Owner command thiếu signature/evidence → ABORT |
| `CHECK (auto_publish = 0)` | Package có `auto_publish=1` → ABORT |

## Guardrail đã cưỡng chế

| Guardrail | Cơ chế |
|---|---|
| G1 | Mọi content hash đi qua `canonicalHash`; không `JSON.stringify` trước hash |
| G4 | Trigger append-only trong migration `0001` |
| G5 | `LineageStore` chặn non-production parent và cycle trong transaction |
| G10 | CHECK constraint trong migration `0001` |

## Ngoài phạm vi WP-01

Physical tables `artifact`, `artifact_lineage`, `quarantine_hash` và trigger G5 vẫn thuộc migration `0004` theo nguồn chuẩn `docs/03-DATA-SCHEMA.sql`; WP-01 không đổi thứ tự migration.
