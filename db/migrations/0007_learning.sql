-- 0007_learning.sql — prediction, real analytics, experiment and owner promotion
-- migrate:up

CREATE TABLE prediction_model (
  model_version          TEXT PRIMARY KEY,
  parent_model_version   TEXT REFERENCES prediction_model(model_version),
  weights_json           TEXT NOT NULL CHECK (json_valid(weights_json)),
  analytics_hashes_json  TEXT NOT NULL CHECK (json_valid(analytics_hashes_json)),
  canonical_hash         TEXT NOT NULL UNIQUE CHECK (
                           length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  created_at             TEXT NOT NULL
);

CREATE TRIGGER trg_prediction_model_no_update
BEFORE UPDATE ON prediction_model
BEGIN SELECT RAISE(ABORT, 'LRN-01: prediction models are append-only'); END;

CREATE TRIGGER trg_prediction_model_no_delete
BEFORE DELETE ON prediction_model
BEGIN SELECT RAISE(ABORT, 'LRN-01: prediction models are append-only'); END;

CREATE TABLE predicted_performance (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  model_version         TEXT NOT NULL,
  retention_curve_json  TEXT NOT NULL CHECK (json_valid(retention_curve_json)),
  ctr_estimate          REAL NOT NULL CHECK (ctr_estimate >= 0 AND ctr_estimate <= 1),
  beat_risk_json        TEXT NOT NULL CHECK (json_valid(beat_risk_json)),
  canonical_hash        TEXT NOT NULL UNIQUE CHECK (
                          length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  sealed_at             TEXT NOT NULL
);

CREATE TRIGGER trg_predicted_performance_no_update
BEFORE UPDATE ON predicted_performance
BEGIN SELECT RAISE(ABORT, 'P9/LRN-01: sealed prediction is append-only'); END;

CREATE TRIGGER trg_predicted_performance_no_delete
BEFORE DELETE ON predicted_performance
BEGIN SELECT RAISE(ABORT, 'P9/LRN-01: sealed prediction is append-only'); END;

CREATE TABLE actual_performance (
  id                         TEXT PRIMARY KEY,
  package_id                 TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  youtube_video_id           TEXT NOT NULL UNIQUE,
  master_id                  TEXT NOT NULL REFERENCES media_master(id),
  master_sha256              TEXT NOT NULL CHECK (
                               length(master_sha256) = 64 AND master_sha256 NOT GLOB '*[^0-9a-f]*'),
  source                     TEXT NOT NULL CHECK (source = 'YOUTUBE_ANALYTICS_API'),
  simulated                  INTEGER NOT NULL DEFAULT 0 CHECK (simulated = 0),
  ingested_at                TEXT NOT NULL,
  window_days                INTEGER NOT NULL CHECK (window_days BETWEEN 14 AND 28),
  metrics_json               TEXT NOT NULL CHECK (json_valid(metrics_json)),
  response_evidence_r2_key   TEXT NOT NULL CHECK (length(trim(response_evidence_r2_key)) > 0),
  response_sha256            TEXT NOT NULL CHECK (
                               length(response_sha256) = 64 AND response_sha256 NOT GLOB '*[^0-9a-f]*'),
  canonical_hash             TEXT NOT NULL UNIQUE CHECK (
                               length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*')
);

CREATE TRIGGER trg_actual_performance_real_only
BEFORE INSERT ON actual_performance
BEGIN
  SELECT CASE WHEN NEW.simulated <> 0
    THEN RAISE(ABORT, 'LRN-02: simulated analytics forbidden') END;
  SELECT CASE WHEN NEW.source <> 'YOUTUBE_ANALYTICS_API'
    THEN RAISE(ABORT, 'LRN-02: source must be YouTube Analytics API') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM youtube_video_binding binding
    WHERE binding.package_id = NEW.package_id
      AND binding.youtube_video_id = NEW.youtube_video_id
      AND binding.master_sha256 = NEW.master_sha256
      AND length(trim(binding.verification_evidence_r2_key)) > 0
  ) THEN RAISE(ABORT, 'LRN-02: video/master checksum mismatch or unverified binding') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM media_master master
    WHERE master.id = NEW.master_id AND master.package_id = NEW.package_id
      AND master.file_sha256 = NEW.master_sha256
  ) THEN RAISE(ABORT, 'LRN-02: video/master checksum mismatch') END;
  SELECT CASE WHEN
    json_type(NEW.metrics_json, '$.retentionCurve') <> 'array'
    OR json_type(NEW.metrics_json, '$.impressions') NOT IN ('integer','real')
    OR json_type(NEW.metrics_json, '$.impressionClickThroughRate') NOT IN ('integer','real')
    OR json_type(NEW.metrics_json, '$.averageViewDurationSec') NOT IN ('integer','real')
    OR json_type(NEW.metrics_json, '$.averageViewPercentage') NOT IN ('integer','real')
    OR json_type(NEW.metrics_json, '$.trafficSources') <> 'array'
  THEN RAISE(ABORT, 'LRN-02: required YouTube Analytics metrics are incomplete') END;
END;

CREATE TRIGGER trg_actual_performance_no_update
BEFORE UPDATE ON actual_performance
BEGIN SELECT RAISE(ABORT, 'LRN-02: analytics snapshots are append-only'); END;

CREATE TRIGGER trg_actual_performance_no_delete
BEFORE DELETE ON actual_performance
BEGIN SELECT RAISE(ABORT, 'LRN-02: analytics snapshots are append-only'); END;

CREATE TABLE experiment (
  id                  TEXT PRIMARY KEY,
  channel_id          TEXT NOT NULL REFERENCES channel(id),
  hypothesis          TEXT NOT NULL CHECK (length(trim(hypothesis)) > 0),
  variable_tested     TEXT NOT NULL CHECK (length(trim(variable_tested)) > 0),
  held_constant_json  TEXT NOT NULL CHECK (
                        json_valid(held_constant_json) AND json_array_length(held_constant_json) > 0),
  min_sample_size     INTEGER NOT NULL CHECK (min_sample_size > 0),
  decision_criterion  TEXT NOT NULL CHECK (length(trim(decision_criterion)) > 0),
  status              TEXT NOT NULL DEFAULT 'RUNNING'
                      CHECK (status IN ('RUNNING','CONCLUDED','ABANDONED')),
  created_at          TEXT NOT NULL
);

CREATE TABLE experiment_observation (
  id              TEXT PRIMARY KEY,
  experiment_id   TEXT NOT NULL REFERENCES experiment(id),
  youtube_video_id TEXT NOT NULL,
  analytics_hash  TEXT NOT NULL CHECK (
                    length(analytics_hash) = 64 AND analytics_hash NOT GLOB '*[^0-9a-f]*'),
  direction       TEXT NOT NULL CHECK (direction IN ('POSITIVE','NEGATIVE')),
  effect          REAL NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (experiment_id, youtube_video_id)
);

CREATE TRIGGER trg_experiment_observation_no_update
BEFORE UPDATE ON experiment_observation
BEGIN SELECT RAISE(ABORT, 'LRN-03: experiment observations are append-only'); END;

CREATE TRIGGER trg_experiment_observation_no_delete
BEFORE DELETE ON experiment_observation
BEGIN SELECT RAISE(ABORT, 'LRN-03: experiment observations are append-only'); END;

CREATE TABLE learning (
  id                            TEXT PRIMARY KEY,
  experiment_id                 TEXT NOT NULL REFERENCES experiment(id),
  scope                         TEXT NOT NULL DEFAULT 'CHANNEL'
                                CHECK (scope IN ('CHANNEL','PORTFOLIO')),
  channel_id                    TEXT REFERENCES channel(id),
  replicated_channel_ids_json   TEXT CHECK (
                                  replicated_channel_ids_json IS NULL
                                  OR json_valid(replicated_channel_ids_json)),
  knowledge_kind                TEXT NOT NULL DEFAULT 'STRUCTURE'
                                CHECK (knowledge_kind IN ('STRUCTURE','VOICE')),
  finding                       TEXT NOT NULL CHECK (length(trim(finding)) > 0),
  evidence_json                 TEXT NOT NULL CHECK (json_valid(evidence_json)),
  supporting_video_count        INTEGER NOT NULL DEFAULT 0 CHECK (supporting_video_count >= 0),
  status                        TEXT NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE'
                                CHECK (status IN ('INSUFFICIENT_EVIDENCE','READY','PROMOTED','REJECTED')),
  canonical_hash                TEXT NOT NULL UNIQUE CHECK (
                                  length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  created_at                    TEXT NOT NULL
);

CREATE TRIGGER trg_learning_ready_rules
BEFORE UPDATE OF status ON learning
WHEN NEW.status = 'READY'
BEGIN
  SELECT CASE WHEN NEW.scope = 'CHANNEL' AND (
    NEW.channel_id IS NULL OR NEW.channel_id <> (
      SELECT channel_id FROM experiment WHERE id = NEW.experiment_id
    )
  ) THEN RAISE(ABORT, 'LRN-03: CHANNEL learning requires the experiment channel') END;
  SELECT CASE WHEN NEW.scope = 'PORTFOLIO' AND (
    NEW.replicated_channel_ids_json IS NULL
    OR json_array_length(NEW.replicated_channel_ids_json) < 2
  ) THEN RAISE(ABORT, 'LRN-03: PORTFOLIO requires at least two independent channels') END;
  SELECT CASE WHEN NEW.scope = 'PORTFOLIO' AND NEW.knowledge_kind = 'VOICE'
    THEN RAISE(ABORT, 'P8/LRN-03: voice cannot cross channels') END;
  SELECT CASE WHEN (
    SELECT COUNT(DISTINCT youtube_video_id) FROM experiment_observation
    WHERE experiment_id = NEW.experiment_id
  ) < (
    SELECT min_sample_size FROM experiment WHERE id = NEW.experiment_id
  ) THEN RAISE(ABORT, 'LRN-03: minimum sample size not met') END;
  SELECT CASE WHEN (
    SELECT COUNT(DISTINCT youtube_video_id) FROM experiment_observation
    WHERE experiment_id = NEW.experiment_id
  ) < 2 THEN RAISE(ABORT, 'LRN-03: fewer than two independent videos') END;
  SELECT CASE WHEN (
    SELECT COUNT(DISTINCT direction) FROM experiment_observation
    WHERE experiment_id = NEW.experiment_id
  ) <> 1 THEN RAISE(ABORT, 'LRN-03: observation direction is not consistent') END;
END;

CREATE TABLE promotion (
  id                     TEXT PRIMARY KEY,
  learning_id            TEXT NOT NULL UNIQUE REFERENCES learning(id),
  command_id             TEXT NOT NULL UNIQUE REFERENCES command_log(id),
  target_kind            TEXT NOT NULL CHECK (target_kind IN ('STANDARD','STRATEGY')),
  target_ref             TEXT NOT NULL CHECK (length(trim(target_ref)) > 0),
  target_version_before  INTEGER NOT NULL CHECK (target_version_before >= 0),
  target_version_after   INTEGER NOT NULL,
  owner_identity         TEXT NOT NULL REFERENCES owner_identity(identity),
  evidence_hash          TEXT NOT NULL CHECK (
                           length(evidence_hash) = 64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'),
  canonical_hash         TEXT NOT NULL UNIQUE CHECK (
                           length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  created_at             TEXT NOT NULL,
  CHECK (target_version_after = target_version_before + 1)
);

CREATE TRIGGER trg_promotion_owner_command
BEFORE INSERT ON promotion
BEGIN
  SELECT CASE WHEN (
    SELECT status FROM learning WHERE id = NEW.learning_id
  ) <> 'READY' THEN RAISE(ABORT, 'LRN-03: only READY learning can be promoted') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM command_log command
    JOIN owner_identity owner ON owner.identity = command.actor_identity
    WHERE command.id = NEW.command_id
      AND command.command_type = 'PROMOTE_LEARNING'
      AND json_extract(command.payload_json, '$.learningId') = NEW.learning_id
      AND command.actor_identity = NEW.owner_identity
      AND command.actor_signature IS NOT NULL
      AND command.evidence_hash = NEW.evidence_hash
      AND owner.role = 'OWNER' AND owner.active = 1
  ) THEN RAISE(ABORT, 'P10/LRN-03: promotion requires signed PROMOTE_LEARNING owner command') END;
END;

CREATE TRIGGER trg_promotion_marks_learning
AFTER INSERT ON promotion
BEGIN
  UPDATE learning SET status = 'PROMOTED' WHERE id = NEW.learning_id;
END;

CREATE TRIGGER trg_promotion_no_update
BEFORE UPDATE ON promotion
BEGIN SELECT RAISE(ABORT, 'LRN-03: promotions are append-only'); END;

CREATE TRIGGER trg_promotion_no_delete
BEFORE DELETE ON promotion
BEGIN SELECT RAISE(ABORT, 'LRN-03: promotions are append-only'); END;

-- migrate:down

DROP TRIGGER trg_promotion_no_delete;
DROP TRIGGER trg_promotion_no_update;
DROP TRIGGER trg_promotion_marks_learning;
DROP TRIGGER trg_promotion_owner_command;
DROP TABLE promotion;
DROP TRIGGER trg_learning_ready_rules;
DROP TABLE learning;
DROP TRIGGER trg_experiment_observation_no_delete;
DROP TRIGGER trg_experiment_observation_no_update;
DROP TABLE experiment_observation;
DROP TABLE experiment;
DROP TRIGGER trg_actual_performance_no_delete;
DROP TRIGGER trg_actual_performance_no_update;
DROP TRIGGER trg_actual_performance_real_only;
DROP TABLE actual_performance;
DROP TRIGGER trg_predicted_performance_no_delete;
DROP TRIGGER trg_predicted_performance_no_update;
DROP TABLE predicted_performance;
DROP TRIGGER trg_prediction_model_no_delete;
DROP TRIGGER trg_prediction_model_no_update;
DROP TABLE prediction_model;

-- migrate:end
