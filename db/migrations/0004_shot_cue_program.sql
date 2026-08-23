-- 0004_shot_cue_program.sql — CMP-01 deterministic Stage 08 storage
-- migrate:up

CREATE TABLE shot_cue_program (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL REFERENCES production_package(id),
  canonical_duration_ms INTEGER NOT NULL CHECK (canonical_duration_ms > 0),
  shot_count            INTEGER NOT NULL CHECK (shot_count > 0),
  canonical_hash        TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  sealed_at             TEXT
);

CREATE TABLE shot (
  id                TEXT PRIMARY KEY,
  program_id        TEXT NOT NULL REFERENCES shot_cue_program(id),
  seq               INTEGER NOT NULL CHECK (seq >= 0),
  t_start_ms        INTEGER NOT NULL CHECK (t_start_ms >= 0),
  t_end_ms          INTEGER NOT NULL CHECK (t_end_ms > t_start_ms),
  route             TEXT NOT NULL CHECK (route IN ('SOURCE','MAKE','HYBRID')),
  archetype_id      TEXT NOT NULL,
  motion_class      TEXT NOT NULL CHECK (motion_class IN ('CAMERA_ONLY','LAYERED_SEMANTIC','SOURCE_SEMANTIC')),
  claim_ids_json    TEXT NOT NULL,
  layers_json       TEXT NOT NULL,
  source_query_json TEXT,
  UNIQUE (program_id, seq)
);

CREATE TABLE shot_assertion (
  id                TEXT PRIMARY KEY,
  shot_id           TEXT NOT NULL REFERENCES shot(id),
  temporal_state    TEXT NOT NULL CHECK (temporal_state IN ('BEFORE','DURING','AFTER')),
  assertion_json    TEXT NOT NULL,
  UNIQUE (shot_id, temporal_state)
);

CREATE TRIGGER trg_shot_program_seal_complete
BEFORE UPDATE OF sealed_at ON shot_cue_program
WHEN OLD.sealed_at IS NULL AND NEW.sealed_at IS NOT NULL
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM shot WHERE program_id = NEW.id) <> NEW.shot_count
    THEN RAISE(ABORT, 'CMP-01: shot_count mismatch') END;
  SELECT CASE WHEN (
    (SELECT MIN(seq) FROM shot WHERE program_id = NEW.id) <> 0
    OR (SELECT MAX(seq) FROM shot WHERE program_id = NEW.id) <> NEW.shot_count - 1
  ) THEN RAISE(ABORT, 'CMP-01: shot sequence must be contiguous') END;
  SELECT CASE WHEN (SELECT MIN(t_start_ms) FROM shot WHERE program_id = NEW.id) <> 0
    THEN RAISE(ABORT, 'CMP-01: timeline must start at zero') END;
  SELECT CASE WHEN (SELECT MAX(t_end_ms) FROM shot WHERE program_id = NEW.id) <> NEW.canonical_duration_ms
    THEN RAISE(ABORT, 'CMP-01: canonical duration mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM shot current
    WHERE current.program_id = NEW.id AND current.seq > 0
      AND current.t_start_ms <> (
        SELECT previous.t_end_ms FROM shot previous
        WHERE previous.program_id = NEW.id AND previous.seq = current.seq - 1
      )
  ) THEN RAISE(ABORT, 'CMP-01: timeline gap or overlap') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM shot item WHERE item.program_id = NEW.id
      AND (SELECT COUNT(*) FROM shot_assertion assertion WHERE assertion.shot_id = item.id) <> 3
  ) THEN RAISE(ABORT, 'CMP-01: each shot requires three assertions') END;
END;

CREATE TRIGGER trg_shot_program_sealed_immutable
BEFORE UPDATE ON shot_cue_program
WHEN OLD.sealed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed program is immutable'); END;

CREATE TRIGGER trg_shot_insert_after_seal
BEFORE INSERT ON shot
WHEN (SELECT sealed_at FROM shot_cue_program WHERE id = NEW.program_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed shots are immutable'); END;

CREATE TRIGGER trg_shot_update_after_seal
BEFORE UPDATE ON shot
WHEN (SELECT sealed_at FROM shot_cue_program WHERE id = OLD.program_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed shots are immutable'); END;

CREATE TRIGGER trg_shot_delete_after_seal
BEFORE DELETE ON shot
WHEN (SELECT sealed_at FROM shot_cue_program WHERE id = OLD.program_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed shots are immutable'); END;

CREATE TRIGGER trg_shot_assertion_insert_after_seal
BEFORE INSERT ON shot_assertion
WHEN (
  SELECT program.sealed_at
  FROM shot_cue_program program
  JOIN shot item ON item.program_id = program.id
  WHERE item.id = NEW.shot_id
) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed assertions are immutable'); END;

CREATE TRIGGER trg_shot_assertion_update_after_seal
BEFORE UPDATE ON shot_assertion
WHEN (
  SELECT program.sealed_at
  FROM shot_cue_program program
  JOIN shot item ON item.program_id = program.id
  WHERE item.id = OLD.shot_id
) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed assertions are immutable'); END;

CREATE TRIGGER trg_shot_assertion_delete_after_seal
BEFORE DELETE ON shot_assertion
WHEN (
  SELECT program.sealed_at
  FROM shot_cue_program program
  JOIN shot item ON item.program_id = program.id
  WHERE item.id = OLD.shot_id
) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'CMP-01: sealed assertions are immutable'); END;

-- migrate:down
DROP TRIGGER trg_shot_assertion_delete_after_seal;
DROP TRIGGER trg_shot_assertion_update_after_seal;
DROP TRIGGER trg_shot_assertion_insert_after_seal;
DROP TRIGGER trg_shot_delete_after_seal;
DROP TRIGGER trg_shot_update_after_seal;
DROP TRIGGER trg_shot_insert_after_seal;
DROP TRIGGER trg_shot_program_sealed_immutable;
DROP TRIGGER trg_shot_program_seal_complete;
DROP TABLE shot_assertion;
DROP TABLE shot;
DROP TABLE shot_cue_program;
-- migrate:end
