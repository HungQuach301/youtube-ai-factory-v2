# ChatGPT Sites deployment ledger

This append-only ledger records verified deployments derived from the canonical
GitHub repository. A URL alone is not evidence of source equality.

| Recorded at (UTC) | Canonical source commit | PR | Source fingerprint | Site | Version | Status | Access |
|---|---|---:|---|---|---:|---|---|
| 2026-08-22T15:49:25Z | `adc719ba3c5fc46ad53724231ecfc2c52d536f0f` | [#5](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/5) | `f03564cf959576255805c14d3dd3d4d066f975a38abe83a2d4ed66cd061df1e6` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 1 | SUCCEEDED | custom; owner-controlled |
| 2026-08-22T16:17:29Z | `1c91e982f69cdee0077d823a8e655c90740b5cfd` | [#7](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/7) | `eff5ba063a71dbbb0ee4adb1460dc90fc7abfef4a3d13181df122404659c49c6` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 2 | SUCCEEDED | custom; owner-controlled |
| 2026-08-22T16:43:40Z | `05fc1cc1bc74fe03445bf1ecfed5271492c94b3c` | [#9](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/9) | `e2c571c3edf8ef9f37aceeffe192ff0da4485811bd97692bf2342f66aa761068` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 3 | SUCCEEDED | custom; owner-controlled |
| 2026-08-22T17:01:02Z | `f517a78abbcfc022b1d0517895ea096836eeb3b9` | [#11](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/11) | `ee7bac1a6830d06727d72c9e7a060905be29fe0a714d9cb53a13a19cfca1d1e7` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 4 | SUCCEEDED | custom; owner-controlled |
| 2026-08-23T00:27:32Z | `8e2bdad980292a729dd8bc9cd1649dfe4ffcb2e0` | [#14](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/14) | `57c4172382cd6e3984aff47096cce74cb6e2589efe2146b5e68c4e850af12768` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 5 | SUCCEEDED | custom; owner-controlled |
| 2026-08-23T01:03:15Z | `f44a4228821452e5a15a491f95002450ed17d684` | [#17](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/17) | `70291967cfbe97f2b01865181773b2a9c1fad3199a64123be4c78c677540357c` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 6 | SUCCEEDED | custom; owner-controlled |

| 2026-08-23T01:31:03Z | `f168bd141d4c64aba7cae1c1002af79aaaffc16f` | [#20](https://github.com/HungQuach301/youtube-ai-factory-v2/pull/20) | `1d5309cbe73e8c0f084c3d33760b227924f5886cfa60a521897c1988559abc21` | [youtube-ai-factory-v2](https://youtube-ai-factory-v2.quach-hung.chatgpt.site) | 7 | SUCCEEDED | custom; owner-controlled |

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
