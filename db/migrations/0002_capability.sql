-- migrate:up

CREATE TABLE capability (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL CHECK (length(trim(code)) > 0),
  kind              TEXT NOT NULL CHECK (kind IN ('TEXT','IMAGE','VIDEO','AUDIO','CONTROL')),
  version           TEXT NOT NULL CHECK (length(trim(version)) > 0),
  provider          TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  model_snapshot    TEXT NOT NULL
                    CHECK (length(trim(model_snapshot)) > 0
                      AND lower(model_snapshot) NOT IN ('latest','default')
                      AND lower(model_snapshot) NOT GLOB '*[-_/]latest'
                      AND lower(model_snapshot) NOT GLOB '*[-_/]default'),
  settings_hash     TEXT NOT NULL
                    CHECK (length(settings_hash) = 64 AND settings_hash NOT GLOB '*[^0-9a-f]*'),
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','SUPERSEDED','REVOKED')),
  created_at        TEXT NOT NULL,
  UNIQUE (code, version)
);

CREATE TRIGGER trg_capability_identity_immutable
BEFORE UPDATE OF code, kind, version, provider, model_snapshot, settings_hash ON capability
BEGIN SELECT RAISE(ABORT, 'CAP-01: capability identity is immutable; register a new version'); END;

CREATE TABLE archetype (
  id                    TEXT PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  domain                TEXT NOT NULL CHECK (domain IN ('VISUAL','AUDIO','TEXT','CONTROL')),
  criticality           TEXT NOT NULL CHECK (criticality IN ('CRITICAL','HIGH','NORMAL')),
  min_first_pass_yield  REAL NOT NULL CHECK (min_first_pass_yield >= 0 AND min_first_pass_yield <= 1)
);

CREATE TABLE fixture (
  id                TEXT PRIMARY KEY,
  archetype_id      TEXT NOT NULL REFERENCES archetype(id),
  spec_json         TEXT NOT NULL CHECK (json_valid(spec_json)),
  is_hardest        INTEGER NOT NULL DEFAULT 0 CHECK (is_hardest IN (0,1))
);

CREATE TABLE capability_archetype_binding (
  capability_id       TEXT NOT NULL REFERENCES capability(id),
  archetype_id        TEXT NOT NULL REFERENCES archetype(id),
  qualification_state TEXT NOT NULL DEFAULT 'REGISTERED'
                      CHECK (qualification_state IN
                        ('REGISTERED','FIXTURE_DESIGNED','QUALIFICATION_RUNNING',
                         'QUALIFIED','SUPERSEDED','REVOKED')),
  qualified_at         TEXT,
  qualification_run_id TEXT,
  CHECK (qualification_state <> 'QUALIFIED'
    OR (qualified_at IS NOT NULL AND qualification_run_id IS NOT NULL)),
  PRIMARY KEY (capability_id, archetype_id)
);

CREATE TABLE qualification_run (
  id                TEXT PRIMARY KEY,
  capability_id     TEXT NOT NULL REFERENCES capability(id),
  archetype_id      TEXT NOT NULL REFERENCES archetype(id),
  fixture_id        TEXT REFERENCES fixture(id),
  namespace         TEXT NOT NULL DEFAULT 'qualification'
                    CHECK (namespace IN ('qualification','staging')),
  recall            REAL CHECK (recall IS NULL OR (recall >= 0 AND recall <= 1)),
  precision_val     REAL CHECK (precision_val IS NULL OR (precision_val >= 0 AND precision_val <= 1)),
  first_pass_yield  REAL CHECK (first_pass_yield IS NULL OR (first_pass_yield >= 0 AND first_pass_yield <= 1)),
  variance          REAL CHECK (variance IS NULL OR variance >= 0),
  evidence_r2_key   TEXT NOT NULL CHECK (length(trim(evidence_r2_key)) > 0),
  verdict           TEXT NOT NULL CHECK (verdict IN ('PASS','FAIL','INCONCLUSIVE')),
  cost_usd          REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at        TEXT NOT NULL
);

CREATE TRIGGER trg_binding_insert_requires_passed_run
BEFORE INSERT ON capability_archetype_binding
WHEN NEW.qualification_state = 'QUALIFIED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualification_run
    WHERE id = NEW.qualification_run_id
      AND capability_id = NEW.capability_id
      AND archetype_id = NEW.archetype_id
      AND verdict = 'PASS'
  ) = 0 THEN RAISE(ABORT, 'CAP: QUALIFIED requires a passing qualification_run') END;
END;

CREATE TRIGGER trg_binding_requires_passed_run
BEFORE UPDATE OF qualification_state, qualification_run_id ON capability_archetype_binding
WHEN NEW.qualification_state = 'QUALIFIED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualification_run
    WHERE id = NEW.qualification_run_id
      AND capability_id = NEW.capability_id
      AND archetype_id = NEW.archetype_id
      AND verdict = 'PASS'
  ) = 0 THEN RAISE(ABORT, 'CAP: QUALIFIED requires a passing qualification_run') END;
END;

CREATE TABLE gold_sample (
  id                TEXT PRIMARY KEY,
  defect_class      TEXT NOT NULL CHECK (length(trim(defect_class)) > 0),
  severity          TEXT NOT NULL CHECK (severity IN ('P0','P1','P2')),
  source            TEXT NOT NULL CHECK (source IN
                      ('rejected_master','synthetic','escaped_defect','incident')),
  r2_key            TEXT NOT NULL CHECK (length(trim(r2_key)) > 0),
  ground_truth_json TEXT NOT NULL CHECK (json_valid(ground_truth_json)),
  retired_at        TEXT,
  retired_by        TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_gold_defect ON gold_sample(defect_class, severity);

CREATE TABLE dispatch_block_log (
  id                     TEXT PRIMARY KEY,
  trace_id               TEXT NOT NULL,
  package_id             TEXT NOT NULL REFERENCES production_package(id),
  stage_instance_id      TEXT NOT NULL REFERENCES stage_instance(id),
  capability_id          TEXT NOT NULL REFERENCES capability(id),
  archetype_id           TEXT NOT NULL REFERENCES archetype(id),
  guard_step             INTEGER NOT NULL CHECK (guard_step BETWEEN 1 AND 4),
  reason                 TEXT NOT NULL CHECK (reason IN
                           ('CAPABILITY_NOT_ACTIVE','BINDING_NOT_QUALIFIED',
                            'SETTINGS_HASH_MISMATCH','STALE_FENCING_TOKEN','BUDGET_DENIED')),
  request_settings_hash  TEXT NOT NULL CHECK (length(request_settings_hash) = 64),
  registry_settings_hash TEXT CHECK (registry_settings_hash IS NULL OR length(registry_settings_hash) = 64),
  zero_spend             INTEGER NOT NULL DEFAULT 1 CHECK (zero_spend = 1),
  created_at             TEXT NOT NULL
);
CREATE INDEX idx_dispatch_block_trace ON dispatch_block_log(trace_id, created_at);

CREATE TRIGGER trg_dispatch_block_no_update
BEFORE UPDATE ON dispatch_block_log
BEGIN SELECT RAISE(ABORT, 'CAP-04: dispatch block log is append-only'); END;

CREATE TRIGGER trg_dispatch_block_no_delete
BEFORE DELETE ON dispatch_block_log
BEGIN SELECT RAISE(ABORT, 'CAP-04: dispatch block log is append-only'); END;

-- migrate:down

DROP TRIGGER trg_dispatch_block_no_delete;
DROP TRIGGER trg_dispatch_block_no_update;
DROP INDEX idx_dispatch_block_trace;
DROP TABLE dispatch_block_log;
DROP INDEX idx_gold_defect;
DROP TABLE gold_sample;
DROP TRIGGER trg_binding_requires_passed_run;
DROP TRIGGER trg_binding_insert_requires_passed_run;
DROP TABLE qualification_run;
DROP TABLE capability_archetype_binding;
DROP TABLE fixture;
DROP TABLE archetype;
DROP TRIGGER trg_capability_identity_immutable;
DROP TABLE capability;

-- migrate:end
