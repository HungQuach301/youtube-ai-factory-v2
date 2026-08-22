# YouTube AI Factory V2 · ChatGPT Sites Control Plane

This directory is the deployable mirror of `sites/control-plane` in the private
GitHub repository `HungQuach301/youtube-ai-factory-v2`.

GitHub `main` is the only source of truth. The ChatGPT Sites checkout is a
derived deployment surface, never an independent place to author factory truth.

Before any checkpoint:

1. Merge the change into GitHub through a reviewed pull request with green CI.
2. Sync the exact `sites/control-plane` source into the Sites checkout.
3. Run `npm run verify:source` or let the checkpoint build run it.
4. Confirm that the aggregate fingerprint matches the approved GitHub source.
5. Deploy the immutable checkpoint and record the evidence back in GitHub.

See [`SSOT-CONTRACT.md`](SSOT-CONTRACT.md) for the continuity and handoff rules.
