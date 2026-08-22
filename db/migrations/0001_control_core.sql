-- 0001_control_core.sql — extracted from docs/03-DATA-SCHEMA.sql
-- migrate:up

CREATE TABLE channel (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','PAUSED','FROZEN','KILLED')),
  created_at        TEXT NOT NULL
);

CREATE TABLE channel_identity_contract (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channel(id),
  version           INTEGER NOT NULL,
  payload_json      TEXT NOT NULL,
  canonical_hash    TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  sealed_at         TEXT,
  superseded_by     TEXT REFERENCES channel_identity_contract(id),
  UNIQUE (channel_id, version)
);

CREATE TABLE pillar (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channel(id),
  name              TEXT NOT NULL,
  version           INTEGER NOT NULL
);

CREATE TABLE episode (
  id                TEXT PRIMARY KEY,
  pillar_id         TEXT NOT NULL REFERENCES pillar(id),
  sequence          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','IN_PRODUCTION','PUBLISHED','ABANDONED')),
  UNIQUE (pillar_id, sequence)
);

CREATE TABLE content_brief (
  id                TEXT PRIMARY KEY,
  episode_id        TEXT NOT NULL REFERENCES episode(id),
  version           INTEGER NOT NULL,
  payload_json      TEXT NOT NULL,
  canonical_hash    TEXT NOT NULL CHECK (length(canonical_hash) = 64)
);

CREATE TABLE production_package (
  id                   TEXT PRIMARY KEY,
  episode_id           TEXT NOT NULL REFERENCES episode(id),
  channel_id           TEXT NOT NULL REFERENCES channel(id),
  namespace            TEXT NOT NULL DEFAULT 'production'
                       CHECK (namespace IN ('production','qualification','staging','quarantine')),
  brief_hash           TEXT NOT NULL,
  identity_contract_id TEXT NOT NULL REFERENCES channel_identity_contract(id),
  lease_holder         TEXT,
  lease_token          INTEGER NOT NULL DEFAULT 0,
  lease_expires_at     TEXT,
  request_ceiling      INTEGER NOT NULL,
  spend_ceiling_usd    REAL    NOT NULL,
  -- G10: auto_publish KHÔNG BAO GIỜ được = 1
  auto_dispatch        INTEGER NOT NULL DEFAULT 0 CHECK (auto_dispatch IN (0,1)),
  auto_publish         INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish = 0),
  status               TEXT NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','RUNNING','HELD','RELEASED','PUBLISHED','ABANDONED')),
  created_at           TEXT NOT NULL
);
CREATE INDEX idx_package_channel ON production_package(channel_id, status);

CREATE TABLE stage_instance (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  stage_code        TEXT NOT NULL,
  control_state     TEXT NOT NULL DEFAULT 'NOT_STARTED'
                    CHECK (control_state IN
                      ('NOT_STARTED','RUNNING','PRODUCED','VERIFIED','FROZEN','REOPENED')),
  standard_version  INTEGER NOT NULL,
  attempt_ordinal   INTEGER NOT NULL DEFAULT 1,
  started_at        TEXT,
  frozen_at         TEXT,
  UNIQUE (package_id, stage_code, attempt_ordinal)
);

-- ---------- COMMAND LOG (G4: append-only) ----------
CREATE TABLE command_log (
  id                TEXT PRIMARY KEY,
  package_id        TEXT REFERENCES production_package(id),
  command_type      TEXT NOT NULL CHECK (command_type IN (
                      'START_STAGE','PRODUCE_ARTIFACT','VERIFY_ARTIFACT',
                      'FREEZE_STAGE','REOPEN_ROOT_STAGE',
                      'AUTHORIZE_RELEASE','AUTHORIZE_PUBLISH','PROMOTE_LEARNING',
                      'PROMOTE_EVOLUTION','RETIRE_GOLD_SAMPLE','FREEZE_CHANNEL',
                      'UNFREEZE_CHANNEL')),
  payload_json      TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) = 64),
  fencing_token     INTEGER NOT NULL,
  actor_identity    TEXT NOT NULL,
  actor_signature   TEXT,
  evidence_hash     TEXT,
  prev_state        TEXT,
  next_state        TEXT,
  trace_id          TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_command_trace ON command_log(trace_id);
CREATE INDEX idx_command_package ON command_log(package_id, created_at);

CREATE TRIGGER trg_command_log_no_update
BEFORE UPDATE ON command_log
BEGIN SELECT RAISE(ABORT, 'G4: command_log is append-only'); END;

CREATE TRIGGER trg_command_log_no_delete
BEFORE DELETE ON command_log
BEGIN SELECT RAISE(ABORT, 'G4: command_log is append-only'); END;

-- Owner allowlist — identity binding cho lệnh P10
CREATE TABLE owner_identity (
  identity          TEXT PRIMARY KEY,
  public_key        TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('OWNER','OPERATOR')),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at        TEXT NOT NULL
);

-- P10: năm lệnh bắt buộc chữ ký owner hợp lệ
CREATE TRIGGER trg_owner_command_signature
BEFORE INSERT ON command_log
WHEN NEW.command_type IN ('AUTHORIZE_RELEASE','AUTHORIZE_PUBLISH',
                          'PROMOTE_LEARNING','PROMOTE_EVOLUTION','RETIRE_GOLD_SAMPLE')
BEGIN
  SELECT CASE
    WHEN NEW.actor_signature IS NULL OR NEW.evidence_hash IS NULL
      THEN RAISE(ABORT, 'P10: owner command requires signature and evidence_hash')
    WHEN (SELECT COUNT(*) FROM owner_identity
          WHERE identity = NEW.actor_identity AND role = 'OWNER' AND active = 1) = 0
      THEN RAISE(ABORT, 'P10: actor is not an active owner')
  END;
END;

-- Lease reconciliation ledger
CREATE TABLE lease_event (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  event_type        TEXT NOT NULL CHECK (event_type IN
                      ('ACQUIRE','HEARTBEAT','RELEASE','EXPIRE','RECONCILED')),
  holder            TEXT,
  token             INTEGER NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_lease_package ON lease_event(package_id, created_at);

-- migrate:down
DROP TRIGGER trg_owner_command_signature;
DROP TRIGGER trg_command_log_no_delete;
DROP TRIGGER trg_command_log_no_update;
DROP TABLE lease_event;
DROP TABLE owner_identity;
DROP TABLE command_log;
DROP TABLE stage_instance;
DROP TABLE production_package;
DROP TABLE content_brief;
DROP TABLE episode;
DROP TABLE pillar;
DROP TABLE channel_identity_contract;
DROP TABLE channel;
-- migrate:end

