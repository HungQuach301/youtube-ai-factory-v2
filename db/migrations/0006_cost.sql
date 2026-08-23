-- migrate:up

CREATE TABLE spend_ceiling (
  namespace         TEXT NOT NULL
                    CHECK (namespace IN ('production','qualification','staging')),
  scope             TEXT NOT NULL CHECK (scope IN ('PORTFOLIO','CHANNEL','PACKAGE','STAGE')),
  scope_ref         TEXT NOT NULL,
  ceiling_usd       REAL NOT NULL CHECK (ceiling_usd >= 0),
  window_start      TEXT,
  window_end        TEXT,
  CHECK (window_start IS NULL OR window_end IS NULL OR window_end > window_start),
  PRIMARY KEY (namespace, scope, scope_ref)
);

CREATE TABLE spend_reservation (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  stage_instance_id TEXT REFERENCES stage_instance(id),
  capability_id     TEXT NOT NULL REFERENCES capability(id),
  namespace         TEXT NOT NULL
                    CHECK (namespace IN ('production','qualification','staging')),
  portfolio_ref     TEXT NOT NULL,
  channel_ref       TEXT,
  estimated_cost    REAL NOT NULL CHECK (estimated_cost >= 0),
  actual_cost       REAL CHECK (actual_cost >= 0),
  state             TEXT NOT NULL DEFAULT 'HELD'
                    CHECK (state IN ('HELD','SETTLED','EXPIRED','ORPHANED')),
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL
                    CHECK (expires_at > created_at)
);
CREATE INDEX idx_reservation_state ON spend_reservation(state, expires_at);

CREATE TRIGGER trg_reservation_namespace_match
BEFORE INSERT ON spend_reservation
WHEN NEW.namespace <> (SELECT namespace FROM production_package WHERE id = NEW.package_id)
BEGIN SELECT RAISE(ABORT, 'PRV-02: reservation namespace must match package'); END;

CREATE TRIGGER trg_reservation_requires_ceiling
BEFORE INSERT ON spend_reservation
WHEN NOT EXISTS (
       SELECT 1 FROM spend_ceiling
       WHERE namespace = NEW.namespace AND scope = 'PORTFOLIO' AND scope_ref = NEW.portfolio_ref
         AND (window_start IS NULL OR NEW.created_at >= window_start)
         AND (window_end IS NULL OR NEW.created_at < window_end)
     )
  OR (NEW.namespace <> 'qualification' AND (
       NOT EXISTS (
         SELECT 1 FROM spend_ceiling
         WHERE namespace = NEW.namespace AND scope = 'CHANNEL' AND scope_ref = NEW.channel_ref
           AND (window_start IS NULL OR NEW.created_at >= window_start)
           AND (window_end IS NULL OR NEW.created_at < window_end)
       )
       OR NOT EXISTS (
         SELECT 1 FROM spend_ceiling
         WHERE namespace = NEW.namespace AND scope = 'PACKAGE' AND scope_ref = NEW.package_id
           AND (window_start IS NULL OR NEW.created_at >= window_start)
           AND (window_end IS NULL OR NEW.created_at < window_end)
       )
     ))
BEGIN SELECT RAISE(ABORT, 'PRV-02: required spend ceiling is missing'); END;

CREATE TRIGGER trg_reservation_budget
BEFORE INSERT ON spend_reservation
WHEN EXISTS (
  SELECT 1 FROM spend_ceiling AS ceiling
  WHERE ceiling.namespace = NEW.namespace
    AND (ceiling.window_start IS NULL OR NEW.created_at >= ceiling.window_start)
    AND (ceiling.window_end IS NULL OR NEW.created_at < ceiling.window_end)
    AND (
      (ceiling.scope = 'PORTFOLIO' AND ceiling.scope_ref = NEW.portfolio_ref)
      OR (ceiling.scope = 'CHANNEL' AND ceiling.scope_ref = NEW.channel_ref)
      OR (ceiling.scope = 'PACKAGE' AND ceiling.scope_ref = NEW.package_id)
      OR (ceiling.scope = 'STAGE' AND ceiling.scope_ref = NEW.stage_instance_id)
    )
    AND COALESCE((
      SELECT SUM(CASE WHEN reservation.state = 'SETTLED'
        THEN reservation.actual_cost ELSE reservation.estimated_cost END)
      FROM spend_reservation AS reservation
      WHERE reservation.namespace = NEW.namespace
        AND reservation.state IN ('HELD','SETTLED','EXPIRED','ORPHANED')
        AND (ceiling.window_start IS NULL OR reservation.created_at >= ceiling.window_start)
        AND (ceiling.window_end IS NULL OR reservation.created_at < ceiling.window_end)
        AND (
          (ceiling.scope = 'PORTFOLIO' AND reservation.portfolio_ref = ceiling.scope_ref)
          OR (ceiling.scope = 'CHANNEL' AND reservation.channel_ref = ceiling.scope_ref)
          OR (ceiling.scope = 'PACKAGE' AND reservation.package_id = ceiling.scope_ref)
          OR (ceiling.scope = 'STAGE' AND reservation.stage_instance_id = ceiling.scope_ref)
        )
    ), 0) + NEW.estimated_cost > ceiling.ceiling_usd
)
BEGIN SELECT RAISE(ABORT, 'PRV-02: spend ceiling exceeded'); END;

CREATE TABLE provider_request (
  id                TEXT PRIMARY KEY,
  reservation_id    TEXT NOT NULL REFERENCES spend_reservation(id),
  idempotency_key   TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) = 64),
  request_r2_key    TEXT NOT NULL CHECK (length(request_r2_key) > 0),
  response_r2_key   TEXT,
  actual_cost       REAL CHECK (actual_cost >= 0),
  latency_ms        INTEGER CHECK (latency_ms >= 0),
  error_class       TEXT CHECK (error_class IN
                      ('TRANSIENT','RATE_LIMIT','SCHEMA_VIOLATION','RIGHTS_DENIED',
                       'BUDGET_DENIED','CONTENT_FILTERED','PROVIDER_ERROR')),
  attempt_ordinal   INTEGER NOT NULL DEFAULT 1 CHECK (attempt_ordinal >= 1),
  state             TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (state IN ('OPEN','COMPLETED','FAILED','ORPHANED')),
  created_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_provider_request_attempt
ON provider_request(reservation_id, attempt_ordinal);

CREATE TRIGGER trg_provider_request_requires_held
BEFORE INSERT ON provider_request
WHEN (SELECT state FROM spend_reservation WHERE id = NEW.reservation_id) <> 'HELD'
BEGIN SELECT RAISE(ABORT, 'PRV-02: provider request requires HELD reservation'); END;

CREATE TRIGGER trg_no_retry_terminal_errors
BEFORE INSERT ON provider_request
WHEN NEW.attempt_ordinal > 1
BEGIN
  SELECT CASE WHEN (
    SELECT error_class FROM provider_request
    WHERE reservation_id = NEW.reservation_id
    ORDER BY attempt_ordinal DESC LIMIT 1
  ) IN ('SCHEMA_VIOLATION','RIGHTS_DENIED','BUDGET_DENIED','CONTENT_FILTERED')
  THEN RAISE(ABORT, 'G8: terminal error class must not be retried') END;
END;

CREATE TRIGGER trg_settle_from_held
BEFORE UPDATE OF state ON spend_reservation
WHEN NEW.state = 'SETTLED'
 AND (OLD.state <> 'HELD' OR NEW.actual_cost IS NULL OR NEW.actual_cost > OLD.estimated_cost)
BEGIN SELECT RAISE(ABORT, 'PRV-02: can only SETTLE a HELD reservation'); END;

CREATE TABLE cost_ledger (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  stage_instance_id TEXT REFERENCES stage_instance(id),
  capability_id     TEXT REFERENCES capability(id),
  namespace         TEXT NOT NULL
                    CHECK (namespace IN ('production','qualification','staging')),
  amount_usd        REAL NOT NULL CHECK (amount_usd >= 0),
  kind              TEXT NOT NULL CHECK (kind IN ('PRODUCTION','QUALIFICATION','REJECTED_CANDIDATE')),
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_cost_package ON cost_ledger(package_id, kind);

-- migrate:down

DROP INDEX idx_cost_package;
DROP TABLE cost_ledger;
DROP TRIGGER trg_settle_from_held;
DROP TRIGGER trg_no_retry_terminal_errors;
DROP TRIGGER trg_provider_request_requires_held;
DROP INDEX idx_provider_request_attempt;
DROP TABLE provider_request;
DROP TRIGGER trg_reservation_budget;
DROP TRIGGER trg_reservation_requires_ceiling;
DROP TRIGGER trg_reservation_namespace_match;
DROP INDEX idx_reservation_state;
DROP TABLE spend_reservation;
DROP TABLE spend_ceiling;

-- migrate:end
