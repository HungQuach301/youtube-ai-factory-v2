# G-01A2 · ChatGPT MCP Command Surface

## Outcome

The Factory exposes a standards-based Streamable HTTP MCP endpoint at `/mcp`.
An authenticated owner can inspect Production state and issue the approved
`PREPARE_CHANNEL` command directly from ChatGPT. The command uses the same D1
runtime as `/operate`; it does not create a second source of operational truth.

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
- provider dispatch and automatic publishing remain OFF.

## Next boundary

After the checkpoint is live, ChatGPT must connect to the Production MCP URL,
call `get_factory_state`, call `prepare_approved_channel` under the explicit
owner instruction, and read state again. Production D1 and the operator UI must
then show the exact command receipt and persisted deliverables.
