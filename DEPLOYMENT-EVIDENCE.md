# Deployment Evidence

Append-only evidence for production deployment surfaces. GitHub `main` remains
the sole source of truth; deployments are derived, immutable checkpoints.

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
