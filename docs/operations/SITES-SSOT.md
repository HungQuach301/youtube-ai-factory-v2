# ChatGPT Sites deployment mirror

The only canonical repository is `HungQuach301/youtube-ai-factory-v2` on branch
`main`. The deployable Site source is stored at `sites/control-plane`.

The ChatGPT Site named `YouTube AI Factory V2` is a derived execution surface.
It is not a second source of truth. Its source lock and build must match the
approved GitHub content before any checkpoint is eligible.

Operational rules:

1. Start from GitHub `main`; never reconstruct from chat history.
2. Use one feature branch and one work-package PR.
3. Pass the root CI and `sites-control-plane` CI.
4. Merge before deployment.
5. Sync the exact approved directory to Sites and verify its source fingerprint.
6. Deploy an immutable checkpoint with the narrowest access.
7. Record deployment evidence back in GitHub.
8. Fail closed when commit, fingerprint, CI or access cannot be verified.

Direct authoring in Sites is prohibited. Emergency changes must be exported to a
GitHub branch, reviewed, merged and redeployed. The legacy Site remains isolated
and immutable.
