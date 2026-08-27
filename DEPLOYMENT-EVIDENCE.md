# Deployment Evidence

## 2026-08-27 — Fly.io Media Worker Production qualification

- Mode: `BUILD`
- Work package: WP-12 / EXE-04 Media Worker Runtime
- Status: `SUCCEEDED · QUALIFIED · READY`
- App: `youtube-ai-factory-v2-media-worker-prod`
- Region/runtime: Fly.io Machines, `sin`, shared CPU, 1 GiB RAM, CPU-only
- Canonical merge commit: `4fced0dd1adbb77461000d0f90a2c9a85d8d2198`
- Immutable image digest: `sha256:03742f4b5a882fb9791ee49a5d2a384c318e40329c6bac221af23bc9f8fe07d7`
- Machine/read-back: `48ee742b377758`, version 1, 1/1 check passing
- GitHub evidence: image qualification run 33085036691; Production deployment run 33086046765
- Live health: `{"ok":true,"imageDigest":"sha256:03742f4b5a882fb9791ee49a5d2a384c318e40329c6bac221af23bc9f8fe07d7","jobDispatchEnabled":false}`
- Negative boundary: unauthenticated `POST /jobs` returned `503 JOB_DISPATCH_DISABLED`; image qualification proved no D1 binding.
- Determinism: five isolated stateless worker fixtures returned the same output SHA-256 and frame MD5.
- Cost posture: scale-to-zero remains enabled; this checkpoint made no provider call and created no media job spend.
- Safety posture: provider dispatch OFF; job dispatch OFF; auto-publish OFF; no Production D1 mutation.

Append-only evidence for production deployment surfaces. GitHub `main` remains


## 2026-08-25 — ChatGPT Sites v29

- Mode: `BUILD`
- Surface: G-01A3 owner OAuth 2.1 bridge for the Production MCP command surface
- Status: `SUCCEEDED · ACCESS_POLICY_BLOCKED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source path: `sites/control-plane`
- Site source commits: `a5bc7a92ec8889f5a3d03f2b64d30686956b0d4e` (OAuth bridge), `3d1b8919cb467d54d0a078202c64688056d65dad` (application owner guard)
- Source-lock aggregate SHA-256: `2a38f228bd52766ffd1200141997beb83c53771368944bc92b0e810311d24154`
- Versions: v28 and v29; latest deployment reached terminal status `succeeded`.
- Verification: source lock, lint, build and 5/5 tests passed; OAuth discovery, authorization-code + PKCE, one-use code exchange, bearer MCP access and tool security metadata passed against local Workers + D1.
- D1: all 12 expected tables exist; all 12 remain empty after deployment verification.
- Access posture: Sites custom owner-only access retained. The platform currently intercepts unauthenticated `/.well-known/*` and `/mcp` requests before the application, so ChatGPT cannot complete discovery until the owner approves the bounded access-policy transition.
- Application posture for that transition: `/` and `/operate` require ChatGPT sign-in plus the server-side owner allowlist; `/api/operator` is identity-gated; `/mcp` requires an owner bearer token; only OAuth discovery and token exchange are network-public.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF; no operational or OAuth records were fabricated.

the sole source of truth; deployments are derived, immutable checkpoints.


## 2026-08-25 — ChatGPT Sites v27

- Mode: `BUILD`
- Surface: G-01A2 authenticated ChatGPT MCP command surface and manifest recovery
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commits: `b32043b1a475446954b23748027e01855d53031c` (MCP runtime), `76b735203219504a32cc80ec017a68a0bb03386b` (valid manifest recovery)
- Canonical source path: `sites/control-plane`
- Site source commit: `dec3849530204af212385155013dec5edb6404be`
- Source-lock aggregate SHA-256: `c694083d0129fa158d73622bde91303bdac6f8eeb0b888c5a96565bd5a4d14da`
- Version: `appgver_26ad8a8e0fe081918d6062ca032cbb1e`
- Deployment: `appgdep_6a8d907836c8819195763dbb132dbead`
- Verification: source lock, lint, build and 4/4 tests passed; the build contains
  `/mcp`; deployment reached terminal status `succeeded`; all nine Production D1
  tables were inspected and remain empty.
- Delivery chain: G-01A2 PR #85; invalid manifest correction PR #87.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF.

### Connection boundary

- The MCP server route and persistent command runtime are deployed.
- Sites does not currently advertise native MCP connection metadata for this
  project; `MCP_CONNECTION_BLOCKED` remains the truthful state.
- No command, operation run, receipt, channel, identity contract, pillar or episode
  row was inserted to simulate a ChatGPT action.
- The next persistent command must originate from a supported authenticated custom
  MCP app selected by the owner in ChatGPT web.

## 2026-08-25 — ChatGPT Sites v24

- Mode: `BUILD`
- Surface: Track G G-01 owner decision and production projection
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `19633a60798d475516f05d1e908e6a4e69f89714`
- Canonical source path: `sites/control-plane`
- Site source commit: `c18fcbac4a88abdfb591fcd7c0026787df8edf9c`
- Source-lock aggregate SHA-256: `4fae5ef2c5d613d84474c202ffcb824740ef79c676381da54a5809fe1f43570e`
- Checkpoint verification: source lock, build, lint and rendered HTML tests passed;
  Preview DOM QA verified the approved niche, owner date, identity state, first
  pillar, 10-episode queue and remaining blockers; Production reached terminal
  status `succeeded` and was verified directly by deployment ID.
- Delivery chain: G-01 owner-decision Production PR #81.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF;
  HP-01 is sealed but Channel Identity remains `APPROVED SOURCE · PERSISTENCE
  PENDING`.

### Evidence-bound remaining states

- Production D1/R2 bindings remain null; no production channel or identity record
  can be persisted.
- WP-28 remains fail-closed until an explicit real-human allowlist identity exists.
- Production voice activation remains blocked until a qualified voice fingerprint
  and its evidence bundle exist.
- G-02 remains blocked by B-004 until Fly.io application credentials and deployment
  authority are available.

## 2026-08-25 — ChatGPT Sites v23

- Mode: `BUILD`
- Surface: Track G G-01 activation preflight
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `6b1ab6079ee28171e0bdba732234b361edb83e36`
- Canonical source path: `sites/control-plane`
- Site source commit: `51802a6876dbe9259dd60f4f84ada7e9de801da9`
- Source-lock aggregate SHA-256: `2c67a023418c8bb5b1d46d9c513c833ed9859ed41a32be0f15ce6da19ee70dc4`
- Checkpoint verification: source lock, build and rendered HTML tests passed;
  production deployment reached terminal status `succeeded` and was verified
  directly.
- Delivery chain: G-01 activation-preflight PR #79.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF;
  D1 and R2 bindings remain null. The deployed surface is read-only and cannot
  create production identity, voice or activation evidence.

### Evidence-bound remaining states

- G-01 activation remains blocked until HP-01 contains a canonically sealed niche
  decision and the derived ChannelIdentityContract v1 is backed by production D1.
- WP-28 remains fail-closed until an explicit real-human allowlist identity exists.
- Production voice activation remains blocked until a qualified voice fingerprint
  and its evidence bundle exist.
- G-02 remains blocked by B-004 until Fly.io application credentials and deployment
  authority are available.

## 2026-08-24 — ChatGPT Sites v22

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `07c7920aa8ea8dc6374699aaf3148db92e0832d9`
- Canonical source path: `sites/control-plane`
- Site source commit: `c0620ac4fa613fd500f89ce6dc98aafaffa7be58`
- Source-lock aggregate SHA-256: `a94175d8a50a6aad5a40a487477ded40b64e6a25dd5b2249b9f0e8412494226e`
- Checkpoint verification: source lock, build, lint and rendered HTML tests passed;
  production deployment `appgdep_6a8c7414dc708191afcf9b17a9130d5c`
  reached terminal status `succeeded` and was verified directly.
- Delivery chain: WP-27 PR #73; control-plane sync PR #74.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; YouTube upload and Analytics transport OFF;
  production spend USD 0; auto-publish OFF.

### Evidence-bound remaining states

- WP-14/15 still require real calibration inputs.
- WP-22 HARD_GATE still requires anchors, gold readiness and critic qualification.
- WP-24 activation still requires verified production Analytics and an owner-issued
  learning promotion command.
- WP-27 promotion remains impossible without a real qualification shadow run,
  stored five-part evidence bundle and exact owner-signed PROMOTE_EVOLUTION command.
- WP-28 still requires an explicit real-human allowlist identity.

## 2026-08-24 — ChatGPT Sites v21

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `ce235919eea7ef2c643ba48ce701fbea43a1d1d4`
- Canonical source path: `sites/control-plane`
- Site source commit: `39b8e9670212e78c76d29a32ca48bb00befe116f`
- Source-lock aggregate SHA-256: `07ec4b40932ce957ddbc7b4219a3f8b014a01d266af866236632eb568f81f3f3`
- Checkpoint verification: source lock, build and rendered HTML tests passed;
  production deployment `appgdep_6a8c579655988191a70a48edcb40d026`
  reached terminal status `succeeded` and was verified directly.
- Delivery chain: WP-26 PR #70; control-plane sync PR #71.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; YouTube upload and Analytics transport OFF;
  production spend USD 0; auto-publish OFF.

### Evidence-bound remaining states

- WP-14/15 still require real calibration inputs.
- WP-22 HARD_GATE still requires anchors, gold readiness and critic qualification.
- WP-24 production activation still requires verified published video/master
  bindings, 14–28 day real Analytics and an owner-issued promotion command.
- WP-25 production dashboards still require canonical D1/R2 records from real
  stage attempts; qualification fixtures cannot authorize release.
- WP-26 introduced no threshold relaxation or synthetic promotion evidence;
  any future RELAX remains blocked without exact owner-signed promotion evidence.
- WP-28 still requires an explicit real-human allowlist identity.

## 2026-08-24 — ChatGPT Sites v20

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `c067049363d9973fcd5ee0a9a1f7c58ad567479c`
- Canonical source path: `sites/control-plane`
- Site source commit: `4098123cf4a61a2c07474a741d8ee91da9b3233a`
- Source-lock aggregate SHA-256: `a1a28a39212533d0a004390e6f2f560f220dd7fa30c84b26e69fb0bc9ab1094e`
- Checkpoint verification: source lock, lint, build and rendered HTML tests passed;
  production deployment reached terminal status `succeeded` and was verified
  directly by deployment ID.
- Delivery chain: WP-25 PR #67; control-plane sync PR #68.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; YouTube upload and Analytics transport OFF;
  production spend USD 0; auto-publish OFF.

### Evidence-bound remaining states

- WP-14/15 still require real calibration inputs.
- WP-22 HARD_GATE still requires anchors, gold readiness and critic qualification.
- WP-24 production activation still requires verified published video/master
  bindings, 14–28 day real Analytics and an owner-issued promotion command.
- WP-25 production dashboards require canonical D1/R2 trace, metric and alert
  records from real stage attempts; qualification fixtures cannot authorize release.
- WP-28 still requires an explicit real-human allowlist identity.

## 2026-08-24 — ChatGPT Sites v19

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `9594b387a6bb5606074bab6d68f36c3d2bf6604b`
- Canonical source path: `sites/control-plane`
- Source-lock aggregate SHA-256: `38bc378701fd8b4f35e8e83015e02b5aae12f1be44c51141fe8b2aa1b51bd5bc`
- Checkpoint verification: source lock, lint, build and rendered HTML tests passed;
  production deployment reached terminal status `succeeded` and was verified
  directly by deployment ID.
- Delivery chain: WP-24 PR #64; control-plane sync PR #65.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; YouTube upload and Analytics transport OFF;
  production spend USD 0; auto-publish OFF.

### Evidence-bound remaining states

- WP-14/15 still require real calibration inputs.
- WP-22 HARD_GATE still requires anchors, gold readiness and critic qualification.
- WP-24 production activation requires verified published video/master bindings,
  14–28 day real Analytics, the six-video calibration floor, experiment sample
  sufficiency and an owner-issued `PROMOTE_LEARNING` command.
- WP-28 still requires an explicit real-human allowlist identity.

## 2026-08-24 — ChatGPT Sites v18

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `60a30493b8cb94b2b7725fd362bdfaa5bd7a7a8c`
- Canonical source path: `sites/control-plane`
- Source-lock aggregate SHA-256: `bcaecbbb01f78bbbdeb113ebfe288091c426de26df616716ebd7dc2c13624dd5`
- Checkpoint verification: source lock, lint, build and rendered HTML tests passed;
  production deployment reached terminal status `succeeded` and was verified
  directly by deployment ID.
- Delivery chain: WP-23 PR #61; control-plane sync PR #62.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; YouTube transport OFF; production spend
  USD 0; auto-publish OFF.

### Evidence-bound remaining states

- WP-14/15 still require real calibration inputs.
- WP-22 HARD_GATE still requires anchors, gold readiness and critic qualification.
- WP-23 production activation requires a real package, distinct owner commands
  and configured YouTube transport; implementation created no upload or video ID.
- WP-28 still requires an explicit real-human allowlist identity.

## 2026-08-24 — ChatGPT Sites v17

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `d8918f344ee1522fa91e174ba48ff3eb30e77b91`
- Canonical source path: `sites/control-plane`
- Source-lock aggregate SHA-256: `276b2838547480d057a4e2d7c6ac5ff81f6de38cb79a69d1f3878463d3f9fbb7`
- Checkpoint verification: source lock, lint, build and rendered HTML tests passed;
  production deployment reached terminal status `succeeded` and was verified
  directly by deployment ID.
- Delivery chain: WP-22 PR #58; control-plane sync PR #59.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF;
  Stage 14 M2 remains warning-only pending B-007 evidence.

### Evidence-bound remaining states

- WP-14 implementation is complete; full calibration remains pending at least 30
  gold samples including 15 real rejected masters.
- WP-15 implementation is complete; hard calibration remains pending 10–15 real
  human-reader audio samples with transcripts.
- WP-22 implementation is complete; HARD_GATE activation remains blocked until
  36 real-human rubric anchors, a ready gold set and paid critic qualification exist.
- WP-28 minimum implementation is complete; activation remains fail-closed until
  an explicit real-human allowlist identity is configured.

## 2026-08-24 — ChatGPT Sites v16

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `7f3d8ddbf3a9a707259605da04b06539da474857`
- Canonical source path: `sites/control-plane`
- Source-lock aggregate SHA-256: `52755da8ca988b586423b76fe0a144f7e98c687ce99ccb885d38dbbc4b9ae993`
- Checkpoint verification: source lock passed; build passed; production deployment
  reached terminal status `succeeded` and was verified directly by deployment ID.
- Delivery chain: WP-21 PR #55; control-plane sync PR #56.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF;
  MUSIC remains fail-closed without license evidence.

### Evidence-bound remaining states

- WP-14 implementation is complete; full calibration remains pending at least 30
  gold samples including 15 real rejected masters.
- WP-15 implementation is complete; hard calibration remains pending 10–15 real
  human-reader audio samples with transcripts.
- WP-28 minimum implementation is complete; activation remains fail-closed until
  an explicit real-human allowlist identity is configured.
- WP-21 implementation is complete; licensed production music remains disabled
  until asset-level rights evidence is present.

## 2026-08-23 — ChatGPT Sites v14

- Mode: `BUILD`
- Surface: `YouTube AI Factory V2` control plane
- Status: `SUCCEEDED`
- Production URL: https://youtube-ai-factory-v2.quach-hung.chatgpt.site
- Canonical source commit: `c94ba2f426890e07abe17a4d5216828582b4d598`
- Canonical source path: `sites/control-plane`
- Source-lock aggregate SHA-256: `7b22d5c69096bcfa96c08f0966f4adcafb08603f10f736609dca423c1883d02b`
- Checkpoint verification: source lock passed; build passed; production deployment
  reached terminal status `succeeded`.
- Delivery chain: WP-17 PR #45; WP-28 minimum PR #46; WP-29 minimum PR
  #47; Site status sync PR #48; commit-independent authority label PR #49.
- Access posture: owner-only custom access retained.
- Safety posture: provider dispatch OFF; production spend USD 0; auto-publish OFF.

### Evidence-bound remaining states

- WP-14 implementation is complete; full calibration remains pending at least 30
  gold samples including 15 real rejected masters.
- WP-15 implementation is complete; hard calibration remains pending 10–15 real
  human-reader audio samples with transcripts.
- WP-28 minimum implementation is complete; activation remains fail-closed until
  an explicit real-human allowlist identity is configured.
