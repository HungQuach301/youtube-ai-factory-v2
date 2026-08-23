-- migrate:up
CREATE TABLE human_actor (
  identity TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','OPERATOR','EDITOR')),
  is_service INTEGER NOT NULL DEFAULT 0 CHECK (is_service = 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE human_decision (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES production_package(id),
  decision_type TEXT NOT NULL CHECK (decision_type IN ('D1','D2','D3','D4','D5')),
  actor_identity TEXT NOT NULL REFERENCES human_actor(identity),
  artifact_before_id TEXT REFERENCES artifact(id),
  artifact_after_id TEXT NOT NULL REFERENCES artifact(id),
  diff_r2_key TEXT NOT NULL,
  rationale_text TEXT NOT NULL CHECK (length(rationale_text) >= 20),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_human_decision_package ON human_decision(package_id, decision_type);

CREATE TRIGGER trg_human_decision_actor
BEFORE INSERT ON human_decision
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM human_actor
    WHERE identity = NEW.actor_identity AND active = 1 AND is_service = 0
  ) = 0 THEN RAISE(ABORT, 'HP-02: decision actor must be an active human actor') END;
END;

CREATE TABLE attention_ledger (
  id TEXT PRIMARY KEY,
  actor_identity TEXT NOT NULL REFERENCES human_actor(identity),
  touchpoint TEXT NOT NULL CHECK (touchpoint IN ('HP01','HP02','HP03','HP04','HP05','HP06','HP07')),
  package_id TEXT REFERENCES production_package(id),
  minutes_spent REAL NOT NULL CHECK (minutes_spent > 0),
  week_start TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attention_week ON attention_ledger(week_start, actor_identity);

CREATE TRIGGER trg_attention_weekly_ceiling
BEFORE INSERT ON attention_ledger
BEGIN
  SELECT CASE WHEN (
    SELECT COALESCE(SUM(minutes_spent), 0) FROM attention_ledger
    WHERE week_start = NEW.week_start
  ) + NEW.minutes_spent > 300
  THEN RAISE(ABORT, 'P12: owner weekly attention ceiling exceeded') END;
END;

CREATE TABLE sampling_policy (
  channel_id TEXT PRIMARY KEY REFERENCES channel(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  clean_video_streak INTEGER NOT NULL DEFAULT 0,
  last_incident_at TEXT,
  last_escaped_p0_at TEXT,
  sample_rate REAL NOT NULL DEFAULT 0.0 CHECK (sample_rate >= 0 AND sample_rate <= 1)
);

-- migrate:down
DROP TABLE sampling_policy;
DROP TRIGGER trg_attention_weekly_ceiling;
DROP INDEX idx_attention_week;
DROP TABLE attention_ledger;
DROP TRIGGER trg_human_decision_actor;
DROP INDEX idx_human_decision_package;
DROP TABLE human_decision;
DROP TABLE human_actor;
-- migrate:end
