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
