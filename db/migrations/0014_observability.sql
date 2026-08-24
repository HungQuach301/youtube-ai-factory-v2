-- migrate:up

CREATE TABLE trace_event (
  id                 TEXT PRIMARY KEY,
  trace_id           TEXT NOT NULL,
  sequence_no        INTEGER NOT NULL CHECK (sequence_no >= 0),
  package_id         TEXT NOT NULL,
  stage_instance_id  TEXT NOT NULL,
  event_type         TEXT NOT NULL CHECK (event_type IN (
                       'STAGE_ATTEMPT_STARTED','PROVIDER_REQUESTED','PROVIDER_RESPONDED',
                       'COST_SETTLED','OUTPUT_SEALED','GATE_EVALUATED','STAGE_ATTEMPT_COMPLETED')),
  span_id            TEXT,
  reservation_id     TEXT,
  request_r2_key     TEXT,
  response_r2_key    TEXT,
  latency_ms         INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_class        TEXT CHECK (error_class IS NULL OR error_class IN (
                       'TRANSIENT','RATE_LIMIT','SCHEMA_VIOLATION','RIGHTS_DENIED',
                       'BUDGET_DENIED','CONTENT_FILTERED','PROVIDER_ERROR')),
  cost_usd           REAL CHECK (cost_usd IS NULL OR cost_usd >= 0),
  output_id          TEXT,
  output_r2_key      TEXT,
  output_sha256      TEXT CHECK (output_sha256 IS NULL OR (
                       length(output_sha256) = 64 AND output_sha256 NOT GLOB '*[^0-9a-f]*')),
  gate_code          TEXT,
  gate_state         TEXT CHECK (gate_state IS NULL OR gate_state IN ('PASS','FAIL','NOT_EVALUATED','WAIVED')),
  evidence_r2_key    TEXT NOT NULL CHECK (length(trim(evidence_r2_key)) > 0),
  outcome            TEXT CHECK (outcome IS NULL OR outcome IN ('SUCCEEDED','FAILED')),
  occurred_at        TEXT NOT NULL,
  canonical_hash     TEXT NOT NULL CHECK (
                       length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  UNIQUE (trace_id, sequence_no),
  UNIQUE (trace_id, event_type, span_id),
  CHECK ((event_type IN ('PROVIDER_REQUESTED','PROVIDER_RESPONDED','COST_SETTLED')) = (span_id IS NOT NULL)),
  CHECK ((event_type IN ('PROVIDER_REQUESTED','COST_SETTLED')) = (reservation_id IS NOT NULL)),
  CHECK ((event_type = 'PROVIDER_REQUESTED') = (request_r2_key IS NOT NULL)),
  CHECK ((event_type = 'PROVIDER_RESPONDED') = (response_r2_key IS NOT NULL AND latency_ms IS NOT NULL)),
  CHECK (error_class IS NULL OR event_type = 'PROVIDER_RESPONDED'),
  CHECK ((event_type = 'COST_SETTLED') = (cost_usd IS NOT NULL)),
  CHECK ((event_type = 'OUTPUT_SEALED') = (
    output_id IS NOT NULL AND output_r2_key IS NOT NULL AND output_sha256 IS NOT NULL)),
  CHECK ((event_type = 'GATE_EVALUATED') = (gate_code IS NOT NULL AND gate_state IS NOT NULL)),
  CHECK ((event_type = 'STAGE_ATTEMPT_COMPLETED') = (outcome IS NOT NULL))
);

CREATE INDEX idx_trace_event_trace_sequence ON trace_event(trace_id, sequence_no);

CREATE TRIGGER trg_trace_event_chain
BEFORE INSERT ON trace_event
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM trace_event WHERE trace_id = NEW.trace_id AND event_type = 'STAGE_ATTEMPT_COMPLETED'
  ) THEN RAISE(ABORT, 'OPS-01: trace is already terminal') END;
  SELECT CASE WHEN NEW.sequence_no <> COALESCE((
    SELECT MAX(sequence_no) + 1 FROM trace_event WHERE trace_id = NEW.trace_id
  ), 0) THEN RAISE(ABORT, 'OPS-01: trace sequence must be contiguous') END;
  SELECT CASE WHEN NEW.sequence_no = 0 AND NEW.event_type <> 'STAGE_ATTEMPT_STARTED'
    THEN RAISE(ABORT, 'OPS-01: trace must start with STAGE_ATTEMPT_STARTED') END;
  SELECT CASE WHEN NEW.sequence_no > 0 AND NEW.event_type = 'STAGE_ATTEMPT_STARTED'
    THEN RAISE(ABORT, 'OPS-01: trace may start only once') END;
  SELECT CASE WHEN NEW.sequence_no > 0 AND EXISTS (
    SELECT 1 FROM trace_event
    WHERE trace_id = NEW.trace_id
      AND (package_id <> NEW.package_id OR stage_instance_id <> NEW.stage_instance_id)
  ) THEN RAISE(ABORT, 'OPS-01: trace scope is immutable') END;
  SELECT CASE WHEN NEW.event_type = 'PROVIDER_RESPONDED' AND NOT EXISTS (
    SELECT 1 FROM trace_event WHERE trace_id = NEW.trace_id
      AND event_type = 'PROVIDER_REQUESTED' AND span_id = NEW.span_id
  ) THEN RAISE(ABORT, 'OPS-01: provider response requires prior request') END;
  SELECT CASE WHEN NEW.event_type = 'COST_SETTLED' AND NOT EXISTS (
    SELECT 1 FROM trace_event WHERE trace_id = NEW.trace_id
      AND event_type = 'PROVIDER_REQUESTED' AND span_id = NEW.span_id AND reservation_id = NEW.reservation_id
  ) THEN RAISE(ABORT, 'OPS-01: settled cost requires matching reservation') END;
  SELECT CASE WHEN NEW.event_type = 'COST_SETTLED' AND NOT EXISTS (
    SELECT 1 FROM trace_event WHERE trace_id = NEW.trace_id
      AND event_type = 'PROVIDER_RESPONDED' AND span_id = NEW.span_id
  ) THEN RAISE(ABORT, 'OPS-01: settled cost requires prior provider response') END;
  SELECT CASE WHEN NEW.event_type = 'STAGE_ATTEMPT_COMPLETED' AND EXISTS (
    SELECT 1 FROM trace_event request
    WHERE request.trace_id = NEW.trace_id AND request.event_type = 'PROVIDER_REQUESTED'
      AND (NOT EXISTS (
        SELECT 1 FROM trace_event response WHERE response.trace_id = request.trace_id
          AND response.event_type = 'PROVIDER_RESPONDED' AND response.span_id = request.span_id
      ) OR NOT EXISTS (
        SELECT 1 FROM trace_event cost WHERE cost.trace_id = request.trace_id
          AND cost.event_type = 'COST_SETTLED' AND cost.span_id = request.span_id
          AND cost.reservation_id = request.reservation_id
      ))
  ) THEN RAISE(ABORT, 'OPS-01: provider lifecycle is incomplete') END;
  SELECT CASE WHEN NEW.event_type = 'STAGE_ATTEMPT_COMPLETED' AND NEW.outcome = 'SUCCEEDED' AND NOT EXISTS (
    SELECT 1 FROM trace_event WHERE trace_id = NEW.trace_id AND event_type = 'OUTPUT_SEALED'
  ) THEN RAISE(ABORT, 'OPS-01: successful trace requires sealed output') END;
END;

CREATE TRIGGER trg_trace_event_no_update
BEFORE UPDATE ON trace_event
BEGIN SELECT RAISE(ABORT, 'OPS-01: trace events are append-only'); END;

CREATE TRIGGER trg_trace_event_no_delete
BEFORE DELETE ON trace_event
BEGIN SELECT RAISE(ABORT, 'OPS-01: trace events are append-only'); END;

CREATE TABLE alert_event (
  id                TEXT PRIMARY KEY,
  alert_code        TEXT NOT NULL CHECK (alert_code IN (
                      'SPEND_CEILING_80_PERCENT','SCHEMA_VIOLATION_RATE_EXCEEDED',
                      'CRITIC_VARIANCE_EXCEEDED','CAPABILITY_REVOKED',
                      'ORPHAN_RESERVATION_OVER_24H','HUMAN_QUEUE_OVER_48H')),
  severity          TEXT NOT NULL CHECK (severity IN ('WARNING','CRITICAL')),
  subject_json      TEXT NOT NULL CHECK (json_valid(subject_json) AND json_type(subject_json) = 'array'),
  observed_value    REAL NOT NULL,
  threshold_value   REAL NOT NULL,
  threshold_source  TEXT NOT NULL CHECK (length(trim(threshold_source)) > 0),
  evidence_r2_key   TEXT NOT NULL CHECK (length(trim(evidence_r2_key)) > 0),
  created_at        TEXT NOT NULL,
  canonical_hash    TEXT NOT NULL CHECK (
                      length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*')
);

CREATE TRIGGER trg_alert_event_no_update
BEFORE UPDATE ON alert_event
BEGIN SELECT RAISE(ABORT, 'OPS-01: alert events are append-only'); END;

CREATE TRIGGER trg_alert_event_no_delete
BEFORE DELETE ON alert_event
BEGIN SELECT RAISE(ABORT, 'OPS-01: alert events are append-only'); END;

CREATE TABLE operator_fixture (
  id                 TEXT PRIMARY KEY,
  banner             TEXT NOT NULL CHECK (banner = 'QUALIFICATION FIXTURE — NOT A RELEASE CANDIDATE'),
  release_candidate  INTEGER NOT NULL CHECK (release_candidate = 0),
  created_at         TEXT NOT NULL
);

CREATE TRIGGER trg_operator_fixture_no_update
BEFORE UPDATE ON operator_fixture
BEGIN SELECT RAISE(ABORT, 'OPS-02: operator fixtures are append-only'); END;

CREATE TRIGGER trg_operator_fixture_no_delete
BEFORE DELETE ON operator_fixture
BEGIN SELECT RAISE(ABORT, 'OPS-02: operator fixtures are append-only'); END;

-- migrate:down

DROP TRIGGER trg_operator_fixture_no_delete;
DROP TRIGGER trg_operator_fixture_no_update;
DROP TABLE operator_fixture;
DROP TRIGGER trg_alert_event_no_delete;
DROP TRIGGER trg_alert_event_no_update;
DROP TABLE alert_event;
DROP TRIGGER trg_trace_event_no_delete;
DROP TRIGGER trg_trace_event_no_update;
DROP TRIGGER trg_trace_event_chain;
DROP INDEX idx_trace_event_trace_sequence;
DROP TABLE trace_event;

-- migrate:end
