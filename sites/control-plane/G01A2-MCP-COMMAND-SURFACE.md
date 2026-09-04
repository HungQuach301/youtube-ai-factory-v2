# G-01A2 · ChatGPT MCP Command Surface

## Outcome

The Factory exposes a standards-based Streamable HTTP MCP endpoint at `/api/mcp`.
An authenticated owner can inspect Production state and issue the approved
`PREPARE_CHANNEL` command directly from ChatGPT. The command uses the same D1
runtime as `/operate`; it does not create a second source of operational truth.

Sites reserves `/mcp` for a native MCP declaration. This Factory intentionally
uses `/api/mcp` as its public custom-plugin endpoint so the request reaches the
application-owned OAuth and owner-authorization boundary. ChatGPT must use the
exact `/api/mcp` resource returned by OAuth discovery; `/mcp` is not a fallback.

## Tools

### `get_factory_state`

Read-only. Returns channel and contract status, latest run status, pillar,
episode count, remaining activation blockers, provider dispatch state and
automatic publishing state. It intentionally returns no owner PII.

### `prepare_approved_channel`

Persistent and idempotent. Requires the owner's explicit objective and
confirmation. It seals the approved HP-01 strategy, channel identity, first
pillar and ten-episode queue, then reads the state back from Production D1.

The result `PREPARED` does not mean `ACTIVE`. Provider dispatch and automatic
publishing remain OFF, and the run incurs zero provider spend.

### Stage 12 diagnostic and shadow commands

Later reviewed migrations extend the same owner-authenticated MCP boundary with
typed Stage 12 diagnostic and shadow-only commands. In particular,
`RUN_STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY` may only reproduce the pinned
ordinal-2 lossless source and append migration-0032 job/evidence records. It has
no corrected-output upload path and cannot create ordinal 4, attempt 4, provider
calls, calibration, Finalize, release, activation or publishing side effects.

The command is eligible only from the exact immutable parent codec-safe shadow
evidence. Its source and callback routes are media-worker-only, pin the render
and runtime provenance, and fail closed on lineage, source, anchor, threshold or
worker-image drift. A shadow PASS is evidence, never Production activation.

## Authorization

- ChatGPT authentication is resolved server-side from trusted platform headers.
- `FACTORY_OWNER_EMAIL` remains the sole hosted owner allowlist.
- Tool inputs cannot supply or override identity.
- Requests without authentication or from a different identity fail closed.
- The server returns no owner email or full name in tool output.

## Verification

- official MCP SDK with stateless Streamable HTTP transport;
- real local Workers runtime and D1 migration;
- MCP client initialization, tool discovery and state read;
- owner-authorized command execution and read-back;
- idempotent replay produces one command, one run and four receipt events;
- Stage 12 LRA-guard replay produces at most one append-only shadow job/evidence
  pair for an exact parent and preserves all earlier correction/replay history;
- provider dispatch and automatic publishing remain OFF.

## Next boundary

After an authenticated ChatGPT connection is installed, ChatGPT must connect
to the Production `/api/mcp` URL, call `get_factory_state`, call
`prepare_approved_channel` under the explicit owner instruction, and read state
again. Production D1 and the operator UI must then show the exact command
receipt and persisted deliverables.
