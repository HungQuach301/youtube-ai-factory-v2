# Deployment Evidence

Append-only evidence for production deployment surfaces. GitHub `main` remains
the sole source of truth; deployments are derived, immutable checkpoints.

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
