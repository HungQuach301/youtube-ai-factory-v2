# ChatGPT Sites deployment ledger

This append-only ledger records verified deployments derived from the canonical
GitHub repository. A URL alone is not evidence of source equality.

| Recorded at (UTC) | Canonical source commit | PR | Source fingerprint | Site | Version | Status | Access |
|---|---|---:|---|---|---:|---|---|
| 2026-08-22T15:49:25Z | `adc719ba3c5fc46ad53724231ecfc2c52d536f0f` | [#5](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/5) | `f03564cf959576255805c14d3dd3d4d066f975a38abe83a2d4ed66cd061df1e6` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 1 | SUCCEEDED | custom; owner-controlled |

## Verification evidence

- GitHub root build: passed.
- Imported source integrity: passed.
- Sites control-plane frozen install, source lock, lint, build and rendered test: passed.
- Local Sites checkpoint re-verified the same 35-file aggregate before build.
- Direct deployment-status verification returned `succeeded`.
- The Site is active and the connected user is its owner.
- Provider dispatch, production spend and automatic publishing remain disabled.

## Invariant

Every later row must identify the GitHub source commit and source fingerprint
used for the deployment. If either cannot be matched to `main`, the deployment
is `UNVERIFIED` and cannot authorize factory mutations.
