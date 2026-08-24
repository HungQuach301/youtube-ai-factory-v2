-- migrate:up

CREATE TABLE evolution_proposal (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN
                         ('THRESHOLD','GATE','CAPABILITY','PIPELINE_CODE','LEXICON','POLICY')),
  source               TEXT NOT NULL CHECK (source IN
                         ('LRN04','LEARNING','PROVIDER_WATCH','POLICY_WATCH','HUMAN','INCIDENT')),
  target_ref           TEXT NOT NULL CHECK (length(trim(target_ref)) > 0),
  diff_r2_key          TEXT NOT NULL CHECK (length(trim(diff_r2_key)) > 0),
  strictness_direction TEXT NOT NULL CHECK (strictness_direction IN ('TIGHTEN','RELAX','NEUTRAL')),
  shadow_run_id        TEXT REFERENCES qualification_run(id),
  evidence_r2_key      TEXT,
  evidence_hash        TEXT CHECK (evidence_hash IS NULL OR (
                         length(evidence_hash) = 64 AND evidence_hash NOT GLOB '*[^0-9a-f]*')),
  status               TEXT NOT NULL DEFAULT 'DETECTED'
                       CHECK (status IN ('DETECTED','PROPOSED','SHADOW_RUNNING',
                                         'EVIDENCE_READY','PROMOTED','REJECTED','EXPIRED')),
  rollback_ref         TEXT,
  created_at           TEXT NOT NULL,
  decided_at           TEXT,
  decided_by           TEXT,
  promotion_id         TEXT,
  promotion_command_id TEXT REFERENCES command_log(id)
);

CREATE TRIGGER trg_evolution_evidence_required
BEFORE UPDATE OF status ON evolution_proposal
WHEN NEW.status = 'EVIDENCE_READY'
BEGIN
  SELECT CASE WHEN NEW.shadow_run_id IS NULL OR NEW.evidence_r2_key IS NULL
    OR length(trim(NEW.evidence_r2_key)) = 0
    THEN RAISE(ABORT, 'G12: EVIDENCE_READY requires shadow_run_id and evidence') END;
  SELECT CASE WHEN NEW.evidence_hash IS NULL
    THEN RAISE(ABORT, 'G12: EVIDENCE_READY requires evidence_hash') END;
  SELECT CASE WHEN NEW.rollback_ref IS NULL OR length(trim(NEW.rollback_ref)) = 0
    THEN RAISE(ABORT, 'G12: EVIDENCE_READY requires rollback_ref') END;
END;

CREATE TRIGGER trg_evolution_promote_record
BEFORE UPDATE OF status ON evolution_proposal
WHEN NEW.status = 'PROMOTED'
BEGIN
  SELECT CASE
    WHEN OLD.status <> 'EVIDENCE_READY'
      THEN RAISE(ABORT, 'G12: promotion requires EVIDENCE_READY state')
    WHEN NOT EXISTS (
      SELECT 1 FROM evolution_promotion promotion
      WHERE promotion.id = NEW.promotion_id
        AND promotion.proposal_id = OLD.id
        AND promotion.command_id = NEW.promotion_command_id
        AND promotion.owner_identity = NEW.decided_by
        AND promotion.evidence_hash = OLD.evidence_hash
        AND promotion.rollback_ref = OLD.rollback_ref
    ) THEN RAISE(ABORT, 'G12: promotion requires a bound evolution_promotion record')
  END;
END;

CREATE TABLE evolution_promotion (
  id                   TEXT PRIMARY KEY,
  proposal_id          TEXT NOT NULL UNIQUE REFERENCES evolution_proposal(id),
  command_id           TEXT NOT NULL UNIQUE REFERENCES command_log(id),
  target_ref           TEXT NOT NULL CHECK (length(trim(target_ref)) > 0),
  rollback_ref         TEXT NOT NULL CHECK (length(trim(rollback_ref)) > 0),
  owner_identity       TEXT NOT NULL REFERENCES owner_identity(identity),
  evidence_hash        TEXT NOT NULL CHECK (
                         length(evidence_hash) = 64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'),
  before_json          TEXT NOT NULL CHECK (json_valid(before_json)),
  after_json           TEXT NOT NULL CHECK (json_valid(after_json)),
  canonical_hash       TEXT NOT NULL UNIQUE CHECK (
                         length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  created_at           TEXT NOT NULL
);

CREATE TRIGGER trg_evolution_promotion_owner_command
BEFORE INSERT ON evolution_promotion
BEGIN
  SELECT CASE WHEN (
    SELECT status FROM evolution_proposal WHERE id = NEW.proposal_id
  ) <> 'EVIDENCE_READY'
    THEN RAISE(ABORT, 'G12: only EVIDENCE_READY evolution can be promoted') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM evolution_proposal proposal
    WHERE proposal.id = NEW.proposal_id
      AND proposal.target_ref = NEW.target_ref
      AND proposal.rollback_ref = NEW.rollback_ref
      AND proposal.evidence_hash = NEW.evidence_hash
  ) THEN RAISE(ABORT, 'G12: evolution promotion target, evidence or rollback mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM command_log command
    JOIN owner_identity owner ON owner.identity = command.actor_identity
    WHERE command.id = NEW.command_id
      AND command.command_type = 'PROMOTE_EVOLUTION'
      AND json_extract(command.payload_json, '$.proposalId') = NEW.proposal_id
      AND command.actor_identity = NEW.owner_identity
      AND command.actor_signature IS NOT NULL
      AND command.evidence_hash = NEW.evidence_hash
      AND owner.role = 'OWNER' AND owner.active = 1
  ) THEN RAISE(ABORT, 'P10/G12: promotion requires signed PROMOTE_EVOLUTION owner command') END;
END;

CREATE TRIGGER trg_evolution_promotion_marks_proposal
AFTER INSERT ON evolution_promotion
BEGIN
  UPDATE evolution_proposal SET
    status = 'PROMOTED',
    decided_at = NEW.created_at,
    decided_by = NEW.owner_identity,
    promotion_id = NEW.id,
    promotion_command_id = NEW.command_id
  WHERE id = NEW.proposal_id;
END;

CREATE TRIGGER trg_evolution_promotion_no_update
BEFORE UPDATE ON evolution_promotion
BEGIN SELECT RAISE(ABORT, 'G12: evolution promotions are append-only'); END;

CREATE TRIGGER trg_evolution_promotion_no_delete
BEFORE DELETE ON evolution_promotion
BEGIN SELECT RAISE(ABORT, 'G12: evolution promotions are append-only'); END;

CREATE TABLE standard_change_log (
  id                   TEXT PRIMARY KEY,
  target_kind          TEXT NOT NULL CHECK (target_kind IN ('GATE','THRESHOLD','GUARDRAIL','STANDARD')),
  target_ref           TEXT NOT NULL CHECK (length(trim(target_ref)) > 0),
  strictness_direction TEXT NOT NULL CHECK (strictness_direction IN ('TIGHTEN','RELAX','NEUTRAL')),
  promotion_id         TEXT REFERENCES evolution_promotion(id),
  before_json          TEXT NOT NULL CHECK (json_valid(before_json)),
  after_json           TEXT NOT NULL CHECK (json_valid(after_json)),
  actor_identity       TEXT NOT NULL CHECK (length(trim(actor_identity)) > 0),
  created_at           TEXT NOT NULL
);

CREATE TRIGGER trg_relax_requires_promotion
BEFORE INSERT ON standard_change_log
WHEN NEW.strictness_direction = 'RELAX'
BEGIN
  SELECT CASE WHEN NEW.promotion_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM evolution_promotion promotion
    JOIN evolution_proposal proposal ON proposal.id = promotion.proposal_id
    WHERE promotion.id = NEW.promotion_id
      AND promotion.target_ref = NEW.target_ref
      AND proposal.strictness_direction = 'RELAX'
      AND proposal.status = 'PROMOTED'
  ) THEN RAISE(ABORT, 'G11: relaxing a standard requires an owner-signed promotion') END;
END;

CREATE TRIGGER trg_gate_no_silent_relax
BEFORE UPDATE OF strictness_rank, threshold_json, tier ON gate_definition
WHEN NEW.strictness_rank < OLD.strictness_rank
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM standard_change_log change_log
    JOIN evolution_promotion promotion ON promotion.id = change_log.promotion_id
    WHERE change_log.target_kind='GATE' AND change_log.target_ref = OLD.id
      AND change_log.strictness_direction='RELAX'
      AND promotion.target_ref = OLD.id
      AND change_log.created_at >= datetime('now','-5 minutes')
  ) THEN RAISE(ABORT, 'G11: gate relaxation requires a promoted change_log entry') END;
END;

CREATE TRIGGER trg_gate_no_silent_disable
BEFORE UPDATE OF active ON gate_definition
WHEN NEW.active = 0 AND OLD.active = 1
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM standard_change_log change_log
    JOIN evolution_promotion promotion ON promotion.id = change_log.promotion_id
    WHERE change_log.target_kind='GATE' AND change_log.target_ref = OLD.id
      AND change_log.strictness_direction='RELAX'
      AND promotion.target_ref = OLD.id
      AND change_log.created_at >= datetime('now','-5 minutes')
  ) THEN RAISE(ABORT, 'G11: disabling a gate requires a promoted change_log entry') END;
END;

CREATE TRIGGER trg_gold_no_delete
BEFORE DELETE ON gold_sample
BEGIN SELECT RAISE(ABORT, 'G14: gold_sample is append-only; use RETIRE_GOLD_SAMPLE'); END;

CREATE TRIGGER trg_gold_label_immutable
BEFORE UPDATE ON gold_sample
WHEN NEW.defect_class <> OLD.defect_class
  OR NEW.severity <> OLD.severity
  OR NEW.source <> OLD.source
  OR NEW.ground_truth_json <> OLD.ground_truth_json
BEGIN SELECT RAISE(ABORT, 'G14: gold_sample labels are immutable'); END;

CREATE TRIGGER trg_gold_retire_owner_command
BEFORE UPDATE OF retired_at, retired_by ON gold_sample
WHEN OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM command_log command
    JOIN owner_identity owner ON owner.identity = command.actor_identity
    WHERE command.command_type = 'RETIRE_GOLD_SAMPLE'
      AND json_extract(command.payload_json, '$.sampleId') = OLD.id
      AND command.actor_identity = NEW.retired_by
      AND command.actor_signature IS NOT NULL
      AND command.evidence_hash IS NOT NULL
      AND owner.role = 'OWNER' AND owner.active = 1
      AND command.created_at >= datetime('now','-5 minutes')
  ) THEN RAISE(ABORT, 'G14: retirement requires a signed RETIRE_GOLD_SAMPLE owner command') END;
END;

CREATE TRIGGER trg_gold_retirement_immutable
BEFORE UPDATE OF retired_at, retired_by ON gold_sample
WHEN OLD.retired_at IS NOT NULL
  AND (NEW.retired_at IS NOT OLD.retired_at OR NEW.retired_by IS NOT OLD.retired_by)
BEGIN SELECT RAISE(ABORT, 'G14: gold_sample retirement is immutable'); END;

-- migrate:down

DROP TRIGGER trg_gold_retirement_immutable;
DROP TRIGGER trg_gold_retire_owner_command;
DROP TRIGGER trg_gold_label_immutable;
DROP TRIGGER trg_gold_no_delete;
DROP TRIGGER trg_gate_no_silent_disable;
DROP TRIGGER trg_gate_no_silent_relax;
DROP TRIGGER trg_relax_requires_promotion;
DROP TABLE standard_change_log;
DROP TRIGGER trg_evolution_promotion_no_delete;
DROP TRIGGER trg_evolution_promotion_no_update;
DROP TRIGGER trg_evolution_promotion_marks_proposal;
DROP TRIGGER trg_evolution_promotion_owner_command;
DROP TABLE evolution_promotion;
DROP TRIGGER trg_evolution_promote_record;
DROP TRIGGER trg_evolution_evidence_required;
DROP TABLE evolution_proposal;

-- migrate:end
