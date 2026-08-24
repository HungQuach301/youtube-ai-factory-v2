-- migrate:up

CREATE TABLE rubric_anchor (
  id                  TEXT PRIMARY KEY,
  standard_version    INTEGER NOT NULL,
  dimension           TEXT NOT NULL CHECK (dimension IN (
                        'FACTUAL_SAFETY','SEMANTIC_ALIGNMENT','VOICE_INTELLIGIBILITY',
                        'STORY_PAYOFF','VISUAL_DIRECTION','MUSIC_SOUND_DESIGN',
                        'RETENTION','MOBILE_LEGIBILITY','PACKAGING_CTR',
                        'EXECUTIVE_PRODUCER','COMPETITIVE_EDITOR','OVERALL')),
  anchor_level        TEXT NOT NULL CHECK (anchor_level IN ('FAIL','BORDERLINE','PASS')),
  example_r2_key      TEXT NOT NULL CHECK (length(trim(example_r2_key)) > 0),
  example_hash        TEXT NOT NULL CHECK (
                        length(example_hash) = 64 AND example_hash NOT GLOB '*[^0-9a-f]*'),
  selected_by         TEXT NOT NULL REFERENCES human_actor(identity),
  selected_at         TEXT NOT NULL,
  UNIQUE (standard_version, dimension, anchor_level)
);

CREATE TRIGGER trg_rubric_anchor_requires_human
BEFORE INSERT ON rubric_anchor
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM human_actor
    WHERE identity = NEW.selected_by AND active = 1 AND is_service = 0
  ) = 0 THEN RAISE(ABORT, 'MSR-02: rubric anchor requires an active real-human selector') END;
END;

CREATE TRIGGER trg_rubric_anchor_no_update
BEFORE UPDATE ON rubric_anchor
BEGIN SELECT RAISE(ABORT, 'MSR-02: rubric anchors are append-only; create a new standard version'); END;

CREATE TRIGGER trg_rubric_anchor_no_delete
BEFORE DELETE ON rubric_anchor
BEGIN SELECT RAISE(ABORT, 'MSR-02: rubric anchors are append-only'); END;

CREATE TABLE assurance_activation (
  id                                TEXT PRIMARY KEY,
  standard_version                  INTEGER NOT NULL,
  profile                           TEXT NOT NULL CHECK (profile IN ('FULL','REDUCED')),
  mode                              TEXT NOT NULL DEFAULT 'WARNING_ONLY'
                                    CHECK (mode IN ('WARNING_ONLY','HARD_GATE')),
  anchor_set_hash                   TEXT CHECK (anchor_set_hash IS NULL OR (
                                      length(anchor_set_hash) = 64
                                      AND anchor_set_hash NOT GLOB '*[^0-9a-f]*')),
  gold_set_evidence_r2_key          TEXT,
  qualification_evidence_r2_key     TEXT,
  activated_by                      TEXT REFERENCES human_actor(identity),
  activated_at                      TEXT,
  created_at                        TEXT NOT NULL,
  CHECK (mode <> 'HARD_GATE' OR (
    anchor_set_hash IS NOT NULL
    AND length(trim(gold_set_evidence_r2_key)) > 0
    AND length(trim(qualification_evidence_r2_key)) > 0
    AND activated_by IS NOT NULL
    AND activated_at IS NOT NULL
  )),
  UNIQUE (standard_version, profile)
);

CREATE TABLE assurance_critic_assignment (
  activation_id       TEXT NOT NULL REFERENCES assurance_activation(id),
  critic_code         TEXT NOT NULL CHECK (critic_code IN (
                        'EXECUTIVE_PRODUCER','STORY_RETENTION','VISUAL_DIRECTION',
                        'SEMANTIC_ALIGNMENT','AUDIO_DIRECTION','AUDIENCE_SIMULATION',
                        'COMPETITIVE_EDITOR','TRUTH_BRAND_SAFETY','PACKAGING_CTR')),
  capability_id       TEXT NOT NULL REFERENCES capability(id),
  archetype_id        TEXT NOT NULL REFERENCES archetype(id),
  PRIMARY KEY (activation_id, critic_code),
  UNIQUE (activation_id, capability_id)
);

CREATE TRIGGER trg_assurance_assignment_requires_qualified
BEFORE INSERT ON assurance_critic_assignment
BEGIN
  SELECT CASE WHEN (
    SELECT mode FROM assurance_activation WHERE id = NEW.activation_id
  ) = 'HARD_GATE' THEN RAISE(ABORT, 'MSR-02: active HARD_GATE assignments are immutable') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM capability_archetype_binding
    WHERE capability_id = NEW.capability_id
      AND archetype_id = NEW.archetype_id
      AND qualification_state = 'QUALIFIED'
  ) = 0 THEN RAISE(ABORT, 'MSR-02: assurance critic assignment is not QUALIFIED') END;
END;

CREATE TRIGGER trg_assurance_assignment_no_update
BEFORE UPDATE ON assurance_critic_assignment
BEGIN SELECT RAISE(ABORT, 'MSR-02: critic assignments are immutable'); END;

CREATE TRIGGER trg_assurance_assignment_no_delete
BEFORE DELETE ON assurance_critic_assignment
BEGIN SELECT RAISE(ABORT, 'MSR-02: critic assignments are append-only'); END;

CREATE TRIGGER trg_hard_assurance_activation_insert
BEFORE INSERT ON assurance_activation
WHEN NEW.mode = 'HARD_GATE'
BEGIN SELECT RAISE(ABORT, 'MSR-02: HARD_GATE must be promoted from a verified WARNING_ONLY activation'); END;

CREATE TRIGGER trg_hard_assurance_activation
BEFORE UPDATE OF mode ON assurance_activation
WHEN NEW.mode = 'HARD_GATE'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM rubric_anchor WHERE standard_version = NEW.standard_version
  ) <> 36 THEN RAISE(ABORT, 'MSR-02/P5: HARD_GATE requires 36 real-human rubric anchors') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM human_actor
    WHERE identity = NEW.activated_by AND active = 1 AND is_service = 0
  ) = 0 THEN RAISE(ABORT, 'MSR-02: HARD_GATE activation requires an active real human') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM assurance_critic_assignment WHERE activation_id = NEW.id
  ) <> CASE NEW.profile WHEN 'FULL' THEN 9 ELSE 4 END
  THEN RAISE(ABORT, 'MSR-02: HARD_GATE critic count must match PROFILE') END;
  SELECT CASE WHEN NEW.profile = 'REDUCED' AND EXISTS (
    SELECT 1 FROM assurance_critic_assignment
    WHERE activation_id = NEW.id
      AND critic_code NOT IN (
        'TRUTH_BRAND_SAFETY','SEMANTIC_ALIGNMENT','STORY_RETENTION','PACKAGING_CTR'
      )
  ) THEN RAISE(ABORT, 'MSR-02: REDUCED critic set does not match PROFILE') END;
END;

CREATE TABLE assurance_panel_run (
  assurance_run_id    TEXT PRIMARY KEY REFERENCES assurance_run(id),
  activation_id       TEXT NOT NULL REFERENCES assurance_activation(id),
  gate_effect         TEXT NOT NULL CHECK (gate_effect IN ('WARNING_ONLY','HARD_GATE')),
  anchor_set_hash     TEXT,
  blocker_json        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(blocker_json)),
  CHECK (gate_effect <> 'HARD_GATE' OR anchor_set_hash IS NOT NULL)
);

CREATE TRIGGER trg_assurance_run_matches_activation
BEFORE INSERT ON assurance_panel_run
BEGIN
  SELECT CASE WHEN (
    SELECT mode FROM assurance_activation WHERE id = NEW.activation_id
  ) <> NEW.gate_effect THEN RAISE(ABORT, 'MSR-02: run gate effect must match activation mode') END;
END;

CREATE TRIGGER trg_critic_verdict_matches_activation
BEFORE INSERT ON critic_verdict
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM assurance_panel_run panel
    JOIN assurance_critic_assignment assignment
      ON assignment.activation_id = panel.activation_id
    WHERE panel.assurance_run_id = NEW.assurance_run_id
      AND assignment.critic_code = NEW.critic_code
      AND assignment.capability_id = NEW.capability_id
  ) THEN RAISE(ABORT, 'MSR-02: critic verdict must match the sealed panel activation') END;
END;

CREATE TRIGGER trg_m2_prerequisites_insert
BEFORE INSERT ON gate_evaluation
WHEN (SELECT tier FROM gate_definition WHERE id = NEW.gate_id) = 'M2'
 AND NEW.state <> 'NOT_EVALUATED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM gate_definition prerequisite
    WHERE prerequisite.active = 1
      AND prerequisite.tier IN ('M0','M1')
      AND prerequisite.standard_version = (
        SELECT standard_version FROM gate_definition WHERE id = NEW.gate_id
      )
  ) = 0 THEN RAISE(ABORT, 'MSR-03: M2 requires an explicit M0/M1 prerequisite set') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gate_definition prerequisite
    WHERE prerequisite.active = 1
      AND prerequisite.tier IN ('M0','M1')
      AND prerequisite.standard_version = (
        SELECT standard_version FROM gate_definition WHERE id = NEW.gate_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM gate_evaluation evaluation
        WHERE evaluation.package_id = NEW.package_id
          AND evaluation.gate_id = prerequisite.id
          AND evaluation.state = 'PASS'
      )
  ) THEN RAISE(ABORT, 'MSR-03: M2 requires every active M0/M1 gate to PASS') END;
END;

CREATE TRIGGER trg_m2_prerequisites_update
BEFORE UPDATE OF state ON gate_evaluation
WHEN (SELECT tier FROM gate_definition WHERE id = NEW.gate_id) = 'M2'
 AND NEW.state <> 'NOT_EVALUATED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM gate_definition prerequisite
    WHERE prerequisite.active = 1
      AND prerequisite.tier IN ('M0','M1')
      AND prerequisite.standard_version = (
        SELECT standard_version FROM gate_definition WHERE id = NEW.gate_id
      )
  ) = 0 THEN RAISE(ABORT, 'MSR-03: M2 requires an explicit M0/M1 prerequisite set') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gate_definition prerequisite
    WHERE prerequisite.active = 1
      AND prerequisite.tier IN ('M0','M1')
      AND prerequisite.standard_version = (
        SELECT standard_version FROM gate_definition WHERE id = NEW.gate_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM gate_evaluation evaluation
        WHERE evaluation.package_id = NEW.package_id
          AND evaluation.gate_id = prerequisite.id
          AND evaluation.state = 'PASS'
      )
  ) THEN RAISE(ABORT, 'MSR-03: M2 requires every active M0/M1 gate to PASS') END;
END;

-- migrate:down

DROP TRIGGER trg_m2_prerequisites_update;
DROP TRIGGER trg_m2_prerequisites_insert;
DROP TRIGGER trg_critic_verdict_matches_activation;
DROP TRIGGER trg_assurance_run_matches_activation;
DROP TABLE assurance_panel_run;
DROP TRIGGER trg_hard_assurance_activation;
DROP TRIGGER trg_hard_assurance_activation_insert;
DROP TRIGGER trg_assurance_assignment_no_delete;
DROP TRIGGER trg_assurance_assignment_no_update;
DROP TRIGGER trg_assurance_assignment_requires_qualified;
DROP TABLE assurance_critic_assignment;
DROP TABLE assurance_activation;
DROP TRIGGER trg_rubric_anchor_no_delete;
DROP TRIGGER trg_rubric_anchor_no_update;
DROP TRIGGER trg_rubric_anchor_requires_human;
DROP TABLE rubric_anchor;

-- migrate:end
