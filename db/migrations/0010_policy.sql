-- migrate:up
CREATE TABLE disclosure_decision (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  synthetic_toggle INTEGER NOT NULL DEFAULT 1 CHECK (synthetic_toggle IN (0,1)),
  rationale_text TEXT,
  decided_by TEXT NOT NULL REFERENCES human_actor(identity),
  decided_at TEXT NOT NULL
);

CREATE TRIGGER trg_disclosure_off_requires_rationale_insert
BEFORE INSERT ON disclosure_decision
WHEN NEW.synthetic_toggle = 0 AND (NEW.rationale_text IS NULL OR length(NEW.rationale_text) < 20)
BEGIN SELECT RAISE(ABORT, 'PC-4: disabling disclosure requires written rationale'); END;

CREATE TRIGGER trg_disclosure_off_requires_rationale_update
BEFORE UPDATE OF synthetic_toggle, rationale_text ON disclosure_decision
WHEN NEW.synthetic_toggle = 0 AND (NEW.rationale_text IS NULL OR length(NEW.rationale_text) < 20)
BEGIN SELECT RAISE(ABORT, 'PC-4: disabling disclosure requires written rationale'); END;

CREATE TABLE policy_check (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES production_package(id),
  check_code TEXT NOT NULL CHECK (check_code IN ('PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8')),
  state TEXT NOT NULL CHECK (state IN ('PASS','FAIL','NOT_EVALUATED')),
  evidence_r2_key TEXT,
  evaluated_at TEXT NOT NULL,
  UNIQUE (package_id, check_code)
);

CREATE TRIGGER trg_policy_check_evidence
BEFORE INSERT ON policy_check
WHEN NEW.state = 'PASS' AND (NEW.evidence_r2_key IS NULL OR NEW.evidence_r2_key = '')
BEGIN SELECT RAISE(ABORT, 'G7/G15: policy check PASS requires evidence'); END;

CREATE TABLE policy_incident (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel(id),
  package_id TEXT REFERENCES production_package(id),
  level TEXT NOT NULL CHECK (level IN ('I1','I2','I3','I4')),
  platform_ref TEXT,
  source TEXT NOT NULL CHECK (source IN ('PLATFORM_NOTICE','INTERNAL','VIEWER')),
  detected_at TEXT NOT NULL,
  rca_r2_key TEXT,
  appeal_state TEXT CHECK (appeal_state IN ('NONE','PREPARING','SUBMITTED','ACCEPTED','REJECTED')),
  resolved_at TEXT,
  learned_proposal_ids_json TEXT
);

CREATE TABLE channel_freeze (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel(id),
  incident_id TEXT REFERENCES policy_incident(id),
  frozen_at TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  owner_confirmed_at TEXT,
  unfrozen_at TEXT,
  unfrozen_by TEXT
);
CREATE INDEX idx_freeze_open ON channel_freeze(channel_id, unfrozen_at);

CREATE TRIGGER trg_unfreeze_requires_owner_and_learning
BEFORE UPDATE OF unfrozen_at ON channel_freeze
WHEN NEW.unfrozen_at IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM owner_identity WHERE identity = NEW.unfrozen_by AND role='OWNER' AND active=1) = 0
      THEN RAISE(ABORT, 'INCIDENT: unfreeze requires active owner identity')
    WHEN OLD.incident_id IS NOT NULL AND (
      SELECT COUNT(*) FROM evolution_proposal
      WHERE source='INCIDENT' AND status='PROMOTED' AND target_ref LIKE '%' || OLD.incident_id || '%'
    ) = 0 THEN RAISE(ABORT, 'INCIDENT: unfreeze requires at least one promoted learning')
  END;
END;

CREATE TABLE publish_record (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  master_id TEXT NOT NULL REFERENCES master(id),
  youtube_video_id TEXT,
  authorized_by TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TRIGGER trg_publish_requires_policy_checklist
BEFORE INSERT ON publish_record
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM policy_check WHERE package_id = NEW.package_id AND state='PASS') < 8
      THEN RAISE(ABORT, 'G15: publish blocked - policy defense checklist incomplete')
    WHEN (SELECT COUNT(*) FROM predicted_performance WHERE package_id = NEW.package_id) = 0
      THEN RAISE(ABORT, 'P9: publish blocked - no sealed prediction')
    WHEN (SELECT COUNT(*) FROM disclosure_decision WHERE package_id = NEW.package_id) = 0
      THEN RAISE(ABORT, 'PC-4: publish blocked - no disclosure decision')
    WHEN (SELECT COUNT(*) FROM owner_identity WHERE identity = NEW.authorized_by AND role='OWNER' AND active=1) = 0
      THEN RAISE(ABORT, 'P10: publish requires active owner identity')
    WHEN (SELECT COUNT(*) FROM channel_freeze cf JOIN production_package p ON p.channel_id = cf.channel_id WHERE p.id = NEW.package_id AND cf.unfrozen_at IS NULL) > 0
      THEN RAISE(ABORT, 'INCIDENT: channel is frozen - publish blocked')
  END;
END;

CREATE TABLE policy_snapshot (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  snapshot_r2_key TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  diff_from_prev_r2_key TEXT
);
CREATE INDEX idx_policy_snapshot ON policy_snapshot(source_url, fetched_at);

-- migrate:down
DROP INDEX idx_policy_snapshot;
DROP TABLE policy_snapshot;
DROP TRIGGER trg_publish_requires_policy_checklist;
DROP TABLE publish_record;
DROP TRIGGER trg_unfreeze_requires_owner_and_learning;
DROP INDEX idx_freeze_open;
DROP TABLE channel_freeze;
DROP TABLE policy_incident;
DROP TRIGGER trg_policy_check_evidence;
DROP TABLE policy_check;
DROP TRIGGER trg_disclosure_off_requires_rationale_update;
DROP TRIGGER trg_disclosure_off_requires_rationale_insert;
DROP TABLE disclosure_decision;
-- migrate:end
