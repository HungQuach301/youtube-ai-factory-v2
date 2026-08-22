# GitHub ↔ ChatGPT Sites SSOT Contract v1

## Authority

- Canonical repository: `HungQuach301/youtube-ai-factory-v2`
- Canonical branch: `main`
- Canonical Site source path: `sites/control-plane`
- ChatGPT Site: `youtube-ai-factory-v2`
- Direction: **GitHub main → ChatGPT Sites checkpoint**

ChatGPT conversations, Library files, scratch workspaces, local build output and
the Sites editor are not sources of factory truth. A change becomes valid only
after it exists in a GitHub pull request, passes CI and is merged into `main`.

## Release invariant

A Site checkpoint is eligible only when all conditions are true:

1. Its managed source files match `source-lock.json`.
2. The same lock and files exist under `sites/control-plane` on GitHub `main`.
3. GitHub CI passed for the canonical commit.
4. The Site build passed without bypassing source verification.
5. The access policy did not widen without explicit owner approval.

If equality cannot be proven, the deployment state is `UNVERIFIED` and factory
mutations, provider dispatch, spending and publishing remain blocked.

## Change protocol

1. Start from a clean checkout of GitHub `main`.
2. Read `AGENTS.md`, `docs/00-AGENT-BRIEF.md`, `docs/00-INDEX.md`,
   `docs/SSOT-POLICY.md` and `BLOCKED.md`.
3. Create one feature branch and one work-package PR.
4. Update tests and regenerate the source lock when Site source changes.
5. Merge only after all required GitHub checks pass.
6. Sync the approved Site directory into the ChatGPT Sites checkout.
7. Verify the source lock, create an immutable checkpoint and verify deployment.
8. Append deployment evidence to the canonical repository.

Direct authoring in the Sites editor is prohibited. For an emergency Site-side
repair, export the exact patch to a GitHub branch, pass review and CI, merge it,
then redeploy from GitHub. Never treat the emergency checkout as canonical.

## AI/model handoff

Any replacement AI or new chat must reconstruct state from the repository, not
from conversation memory. It must verify the current commit, checksums, CI,
`DONE.md`, `BLOCKED.md`, open PRs and the latest deployment evidence before it
acts. Missing or conflicting evidence fails closed.

The legacy Site and legacy project remain isolated and immutable. No V2 sync or
deployment process may rewrite their source, data, artifacts or history.
