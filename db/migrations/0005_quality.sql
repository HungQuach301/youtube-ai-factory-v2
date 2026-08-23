-- migrate:up

CREATE TABLE standard (
  id                TEXT PRIMARY KEY,
  scope             TEXT NOT NULL CHECK (scope IN ('PORTFOLIO','CHANNEL','PILLAR','EPISODE')),
  scope_ref         TEXT,
  version           INTEGER NOT NULL,
  payload_json      TEXT NOT NULL,
  canonical_hash    TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  sealed_at         TEXT,
  UNIQUE (scope, scope_ref, version)
);

CREATE TABLE gate_definition (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL,
  tier              TEXT NOT NULL CHECK (tier IN ('M0','M1','M2')),
  owner_stages_json TEXT NOT NULL,
  standard_version  INTEGER NOT NULL,
  threshold_json    TEXT,
  strictness_rank   INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (code, standard_version)
);

CREATE TABLE gate_evaluation (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  gate_id           TEXT NOT NULL REFERENCES gate_definition(id),
  state             TEXT NOT NULL DEFAULT 'NOT_EVALUATED'
                    CHECK (state IN ('PASS','FAIL','NOT_EVALUATED','WAIVED')),
  evidence_r2_key   TEXT,
  waiver_owner      TEXT,
  waiver_expires_at TEXT,
  evaluated_at      TEXT,
  UNIQUE (package_id, gate_id)
);
CREATE INDEX idx_gate_eval_package ON gate_evaluation(package_id, state);

CREATE TRIGGER trg_gate_pass_requires_evidence_ins
BEFORE INSERT ON gate_evaluation
WHEN NEW.state = 'PASS' AND (NEW.evidence_r2_key IS NULL OR NEW.evidence_r2_key = '')
BEGIN SELECT RAISE(ABORT, 'G7: gate PASS requires evidence_r2_key'); END;

CREATE TRIGGER trg_gate_pass_requires_evidence_upd
BEFORE UPDATE ON gate_evaluation
WHEN NEW.state = 'PASS' AND (NEW.evidence_r2_key IS NULL OR NEW.evidence_r2_key = '')
BEGIN SELECT RAISE(ABORT, 'G7: gate PASS requires evidence_r2_key'); END;

CREATE TRIGGER trg_no_waive_m0_ins
BEFORE INSERT ON gate_evaluation
WHEN NEW.state = 'WAIVED'
 AND (SELECT tier FROM gate_definition WHERE id = NEW.gate_id) = 'M0'
BEGIN SELECT RAISE(ABORT, 'P2: M0 gates cannot be WAIVED'); END;

CREATE TRIGGER trg_no_waive_m0_upd
BEFORE UPDATE ON gate_evaluation
WHEN NEW.state = 'WAIVED'
 AND (SELECT tier FROM gate_definition WHERE id = NEW.gate_id) = 'M0'
BEGIN SELECT RAISE(ABORT, 'P2: M0 gates cannot be WAIVED'); END;

CREATE TRIGGER trg_waiver_requires_owner
BEFORE INSERT ON gate_evaluation
WHEN NEW.state = 'WAIVED'
BEGIN
  SELECT CASE WHEN NEW.waiver_expires_at IS NULL
    OR (SELECT COUNT(*) FROM owner_identity
        WHERE identity = NEW.waiver_owner AND role='OWNER' AND active=1) = 0
    THEN RAISE(ABORT, 'WAIVED requires active owner and expiry') END;
END;

CREATE TABLE assurance_run (
  id                TEXT PRIMARY KEY,
  master_id         TEXT NOT NULL REFERENCES master(id),
  standard_version  INTEGER NOT NULL,
  aggregate_json    TEXT NOT NULL,
  verdict           TEXT NOT NULL CHECK (verdict IN ('PASS','FAIL','BORDERLINE')),
  created_at        TEXT NOT NULL
);

CREATE TABLE critic_verdict (
  id                TEXT PRIMARY KEY,
  assurance_run_id  TEXT NOT NULL REFERENCES assurance_run(id),
  critic_code       TEXT NOT NULL,
  capability_id     TEXT NOT NULL REFERENCES capability(id),
  score             REAL NOT NULL,
  p0_count          INTEGER NOT NULL DEFAULT 0,
  p1_count          INTEGER NOT NULL DEFAULT 0,
  variance          REAL,
  sample_count      INTEGER NOT NULL DEFAULT 1,
  evidence_r2_key   TEXT NOT NULL
);

CREATE TRIGGER trg_critic_must_be_qualified
BEFORE INSERT ON critic_verdict
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM capability_archetype_binding
    WHERE capability_id = NEW.capability_id AND qualification_state = 'QUALIFIED'
  ) = 0 THEN RAISE(ABORT, 'MSR-02: critic capability is not QUALIFIED') END;
END;

-- migrate:down

DROP TRIGGER trg_critic_must_be_qualified;
DROP TABLE critic_verdict;
DROP TABLE assurance_run;
DROP TRIGGER trg_waiver_requires_owner;
DROP TRIGGER trg_no_waive_m0_upd;
DROP TRIGGER trg_no_waive_m0_ins;
DROP TRIGGER trg_gate_pass_requires_evidence_upd;
DROP TRIGGER trg_gate_pass_requires_evidence_ins;
DROP INDEX idx_gate_eval_package;
DROP TABLE gate_evaluation;
DROP TABLE gate_definition;
DROP TABLE standard;

-- migrate:end
