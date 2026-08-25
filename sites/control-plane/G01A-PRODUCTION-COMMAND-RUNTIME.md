# G-01A1 · Production Command Runtime

## Outcome

The Factory now has an authenticated working surface at `/operate`. An owner can
issue `PREPARE_CHANNEL` without changing code. A successful command persists and
reads back the approved AI-Era Money Defense channel as `PREPARED`.

`PREPARED` is a completed operational outcome. It does not imply `ACTIVE` and
does not authorize provider dispatch, spend, media execution or publishing.

## Production records

One idempotent command creates the following D1 records in a single batch:

- real owner identity from ChatGPT authentication;
- append-only typed command with trace and 64-hex idempotency key;
- sealed HP-01 owner decision;
- channel and versioned Channel Identity Contract;
- first pillar and ten queued episodes;
- completed operation run;
- four append-only receipt events: `COMMAND_ACCEPTED`, `OWNER_AUTHORIZED`,
  `CHANNEL_PREPARED`, and `READ_BACK_VERIFIED`.

## Authority and safety

- GitHub `main` governs source, contracts and migrations.
- Production D1 governs operational commands, runs, events and channel state.
- `FACTORY_OWNER_EMAIL` is a hosted allowlist; absence or mismatch fails closed.
- The only accepted G-01A1 command is `PREPARE_CHANNEL`.
- Command log, HP decisions and operation events are immutable by D1 triggers.
- Provider dispatch is OFF, automatic publishing is OFF and provider cost is $0.
- Activation remains blocked by qualified voice fingerprint, real calibration
  evidence and Fly.io media runtime.

## Verification

- source-lock verification;
- lint and bounded production build;
- rendered control-plane and authenticated operator route tests;
- local Workers runtime plus real D1 migration test;
- idempotent command replay returns the original run;
- Production read-back contains one run, four ordered events and ten episodes;
- adversarial command-log update is rejected by the append-only trigger.

## Next boundary

G-01A2 may expose the same command contract through a ChatGPT MCP connection.
It must reuse this authenticated runtime and cannot introduce a parallel state
store or bypass the owner allowlist.
