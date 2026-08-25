-- 0015_failure_mining.sql — LRN-04 write boundary and promoted cross-channel evidence
-- migrate:up

CREATE TRIGGER trg_lrn04_gold_namespace
BEFORE INSERT ON gold_sample
WHEN NEW.source IN ('rejected_master','escaped_defect')
BEGIN
  SELECT CASE WHEN NEW.r2_key NOT LIKE 'gold/%'
    THEN RAISE(ABORT, 'G5/LRN-04: mined samples must use gold namespace') END;
  SELECT CASE WHEN length(trim(COALESCE(json_extract(NEW.ground_truth_json, '$.masterId'), ''))) = 0
    OR length(trim(COALESCE(json_extract(NEW.ground_truth_json, '$.stageCode'), ''))) = 0
    OR COALESCE(json_type(NEW.ground_truth_json, '$.tStart'), '') NOT IN ('integer','real')
    OR COALESCE(json_type(NEW.ground_truth_json, '$.tEnd'), '') NOT IN ('integer','real')
    OR json_extract(NEW.ground_truth_json, '$.tStart') < 0
    OR json_extract(NEW.ground_truth_json, '$.tEnd') <= json_extract(NEW.ground_truth_json, '$.tStart')
    OR COALESCE(json_type(NEW.ground_truth_json, '$.evidenceR2Keys'), '') <> 'array'
    OR json_array_length(NEW.ground_truth_json, '$.evidenceR2Keys') < 1
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.ground_truth_json, '$.evidenceR2Keys') evidence
      WHERE evidence.type <> 'text' OR length(trim(evidence.value)) = 0
    )
    THEN RAISE(ABORT, 'LRN-04: mined samples require structured ground truth, time span and evidence') END;
END;

CREATE TRIGGER trg_lrn04_proposal_boundary
BEFORE INSERT ON evolution_proposal
WHEN NEW.source = 'LRN04'
BEGIN
  SELECT CASE WHEN NEW.status <> 'PROPOSED'
    THEN RAISE(ABORT, 'LRN-04: mined evolution must begin as PROPOSED') END;
  SELECT CASE WHEN NEW.strictness_direction <> 'TIGHTEN'
    THEN RAISE(ABORT, 'LRN-04: failure mining cannot relax standards') END;
  SELECT CASE WHEN NEW.diff_r2_key NOT LIKE 'learning/lrn04/%'
    THEN RAISE(ABORT, 'LRN-04: proposal diff must use the LRN-04 evidence namespace') END;
END;

CREATE TRIGGER trg_learning_no_direct_promoted_insert
BEFORE INSERT ON learning
WHEN NEW.status = 'PROMOTED'
BEGIN SELECT RAISE(ABORT, 'P10/LRN-03: PROMOTED learning requires a bound promotion record'); END;

CREATE TRIGGER trg_learning_no_direct_promoted_update
BEFORE UPDATE OF status ON learning
WHEN NEW.status = 'PROMOTED' AND NOT EXISTS (
  SELECT 1 FROM promotion WHERE learning_id = NEW.id
)
BEGIN SELECT RAISE(ABORT, 'P10/LRN-03: PROMOTED learning requires a bound promotion record'); END;

CREATE TRIGGER trg_learning_portfolio_promoted_sources_insert
BEFORE INSERT ON learning
WHEN NEW.scope = 'PORTFOLIO' AND NEW.status IN ('READY','PROMOTED')
BEGIN
  SELECT CASE WHEN NEW.channel_id IS NOT NULL OR NEW.knowledge_kind <> 'STRUCTURE'
    THEN RAISE(ABORT, 'P8/LRN-03: portfolio learning is STRUCTURE-only and has no channel_id') END;
  SELECT CASE WHEN NEW.replicated_channel_ids_json IS NULL
    OR json_type(NEW.replicated_channel_ids_json) <> 'array'
    OR json_array_length(NEW.replicated_channel_ids_json) < 2
    OR json_array_length(NEW.replicated_channel_ids_json) <> (
      SELECT COUNT(DISTINCT value) FROM json_each(NEW.replicated_channel_ids_json)
    )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.replicated_channel_ids_json)
      WHERE type <> 'text' OR length(trim(value)) = 0
    )
    THEN RAISE(ABORT, 'LRN-03: portfolio learning requires distinct channel identifiers') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.replicated_channel_ids_json) source_channel
    WHERE NOT EXISTS (
      SELECT 1 FROM learning source_learning
      JOIN promotion source_promotion ON source_promotion.learning_id = source_learning.id
      WHERE source_learning.scope = 'CHANNEL'
        AND source_learning.status = 'PROMOTED'
        AND source_learning.channel_id = source_channel.value
        AND source_learning.knowledge_kind = 'STRUCTURE'
        AND source_learning.finding = NEW.finding
        AND json_extract(source_learning.evidence_json, '$.direction') IS NOT NULL
        AND json_extract(source_learning.evidence_json, '$.direction') = json_extract(NEW.evidence_json, '$.direction')
    )
  ) THEN RAISE(ABORT, 'LRN-03: portfolio learning requires matching owner-promoted evidence from every channel') END;
END;

CREATE TRIGGER trg_learning_portfolio_promoted_sources_update
BEFORE UPDATE OF status, scope, channel_id, replicated_channel_ids_json, knowledge_kind, finding, evidence_json ON learning
WHEN NEW.scope = 'PORTFOLIO' AND NEW.status IN ('READY','PROMOTED')
BEGIN
  SELECT CASE WHEN NEW.channel_id IS NOT NULL OR NEW.knowledge_kind <> 'STRUCTURE'
    THEN RAISE(ABORT, 'P8/LRN-03: portfolio learning is STRUCTURE-only and has no channel_id') END;
  SELECT CASE WHEN NEW.replicated_channel_ids_json IS NULL
    OR json_type(NEW.replicated_channel_ids_json) <> 'array'
    OR json_array_length(NEW.replicated_channel_ids_json) < 2
    OR json_array_length(NEW.replicated_channel_ids_json) <> (
      SELECT COUNT(DISTINCT value) FROM json_each(NEW.replicated_channel_ids_json)
    )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.replicated_channel_ids_json)
      WHERE type <> 'text' OR length(trim(value)) = 0
    )
    THEN RAISE(ABORT, 'LRN-03: portfolio learning requires distinct channel identifiers') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.replicated_channel_ids_json) source_channel
    WHERE NOT EXISTS (
      SELECT 1 FROM learning source_learning
      JOIN promotion source_promotion ON source_promotion.learning_id = source_learning.id
      WHERE source_learning.scope = 'CHANNEL'
        AND source_learning.status = 'PROMOTED'
        AND source_learning.channel_id = source_channel.value
        AND source_learning.knowledge_kind = 'STRUCTURE'
        AND source_learning.finding = NEW.finding
        AND json_extract(source_learning.evidence_json, '$.direction') IS NOT NULL
        AND json_extract(source_learning.evidence_json, '$.direction') = json_extract(NEW.evidence_json, '$.direction')
    )
  ) THEN RAISE(ABORT, 'LRN-03: portfolio learning requires matching owner-promoted evidence from every channel') END;
END;

-- migrate:down

DROP TRIGGER trg_learning_portfolio_promoted_sources_update;
DROP TRIGGER trg_learning_portfolio_promoted_sources_insert;
DROP TRIGGER trg_learning_no_direct_promoted_update;
DROP TRIGGER trg_learning_no_direct_promoted_insert;
DROP TRIGGER trg_lrn04_proposal_boundary;
DROP TRIGGER trg_lrn04_gold_namespace;

-- migrate:end
