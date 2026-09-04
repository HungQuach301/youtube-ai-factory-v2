-- =====================================================================
-- AI FACTORY — DATA SCHEMA (Cloudflare D1 / SQLite)
-- NGUỒN CHÂN LÝ VỀ DỮ LIỆU. Code mâu thuẫn file này → code sai.
--
-- 10 migration. Mỗi migration có phần UP và phần DOWN tường minh.
-- Agent tách file này thành db/migrations/000X_*.sql theo mốc phân cách.
--
-- Nguyên tắc: guardrail được cưỡng chế bằng TRIGGER và CONSTRAINT,
-- không dựa vào kỷ luật tầng ứng dụng.
--   G4  → 0001  command_log append-only
--   G5  → 0004  namespace isolation trong lineage
--   G7  → 0005  gate PASS đòi evidence
--   G10 → 0001  auto_publish
--   G11 → 0008  cấm tự nới chuẩn
--   G14 → 0009  gold_sample append-only
--   G15 → 0010  policy defense checklist chặn publish
--
-- Quy ước: mọi bảng có cột namespace đều CHECK trong 4 giá trị.
-- Mọi khóa chính là TEXT (ULID/UUID sinh ở tầng ứng dụng).
-- =====================================================================


-- =====================================================================
-- 0001_control_core.sql   —  GOVERNANCE, COMMAND, LEASE
-- =====================================================================
-- UP

CREATE TABLE channel (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','PAUSED','FROZEN','KILLED')),
  created_at        TEXT NOT NULL
);

CREATE TABLE channel_identity_contract (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channel(id),
  version           INTEGER NOT NULL,
  payload_json      TEXT NOT NULL,
  canonical_hash    TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  sealed_at         TEXT,
  superseded_by     TEXT REFERENCES channel_identity_contract(id),
  UNIQUE (channel_id, version)
);

CREATE TABLE pillar (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channel(id),
  name              TEXT NOT NULL,
  version           INTEGER NOT NULL
);

CREATE TABLE episode (
  id                TEXT PRIMARY KEY,
  pillar_id         TEXT NOT NULL REFERENCES pillar(id),
  sequence          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','IN_PRODUCTION','PUBLISHED','ABANDONED')),
  UNIQUE (pillar_id, sequence)
);

CREATE TABLE content_brief (
  id                TEXT PRIMARY KEY,
  episode_id        TEXT NOT NULL REFERENCES episode(id),
  version           INTEGER NOT NULL,
  payload_json      TEXT NOT NULL,
  canonical_hash    TEXT NOT NULL CHECK (length(canonical_hash) = 64)
);

CREATE TABLE production_package (
  id                   TEXT PRIMARY KEY,
  episode_id           TEXT NOT NULL REFERENCES episode(id),
  channel_id           TEXT NOT NULL REFERENCES channel(id),
  namespace            TEXT NOT NULL DEFAULT 'production'
                       CHECK (namespace IN ('production','qualification','staging','quarantine')),
  brief_hash           TEXT NOT NULL,
  identity_contract_id TEXT NOT NULL REFERENCES channel_identity_contract(id),
  lease_holder         TEXT,
  lease_token          INTEGER NOT NULL DEFAULT 0,
  lease_expires_at     TEXT,
  request_ceiling      INTEGER NOT NULL,
  spend_ceiling_usd    REAL    NOT NULL,
  -- G10: auto_publish KHÔNG BAO GIỜ được = 1
  auto_dispatch        INTEGER NOT NULL DEFAULT 0 CHECK (auto_dispatch IN (0,1)),
  auto_publish         INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish = 0),
  status               TEXT NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','RUNNING','HELD','RELEASED','PUBLISHED','ABANDONED')),
  created_at           TEXT NOT NULL
);
CREATE INDEX idx_package_channel ON production_package(channel_id, status);

CREATE TABLE stage_instance (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  stage_code        TEXT NOT NULL,
  control_state     TEXT NOT NULL DEFAULT 'NOT_STARTED'
                    CHECK (control_state IN
                      ('NOT_STARTED','RUNNING','PRODUCED','VERIFIED','FROZEN','REOPENED')),
  standard_version  INTEGER NOT NULL,
  attempt_ordinal   INTEGER NOT NULL DEFAULT 1,
  started_at        TEXT,
  frozen_at         TEXT,
  UNIQUE (package_id, stage_code, attempt_ordinal)
);

-- ---------- COMMAND LOG (G4: append-only) ----------
CREATE TABLE command_log (
  id                TEXT PRIMARY KEY,
  package_id        TEXT REFERENCES production_package(id),
  command_type      TEXT NOT NULL CHECK (command_type IN (
                      'START_STAGE','PRODUCE_ARTIFACT','VERIFY_ARTIFACT',
                      'FREEZE_STAGE','REOPEN_ROOT_STAGE',
                      'AUTHORIZE_RELEASE','AUTHORIZE_PUBLISH','PROMOTE_LEARNING',
                      'PROMOTE_EVOLUTION','RETIRE_GOLD_SAMPLE','FREEZE_CHANNEL',
                      'UNFREEZE_CHANNEL')),
  payload_json      TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) = 64),
  fencing_token     INTEGER NOT NULL,
  actor_identity    TEXT NOT NULL,
  actor_signature   TEXT,
  evidence_hash     TEXT,
  prev_state        TEXT,
  next_state        TEXT,
  trace_id          TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_command_trace ON command_log(trace_id);
CREATE INDEX idx_command_package ON command_log(package_id, created_at);

CREATE TRIGGER trg_command_log_no_update
BEFORE UPDATE ON command_log
BEGIN SELECT RAISE(ABORT, 'G4: command_log is append-only'); END;

CREATE TRIGGER trg_command_log_no_delete
BEFORE DELETE ON command_log
BEGIN SELECT RAISE(ABORT, 'G4: command_log is append-only'); END;

-- Owner allowlist — identity binding cho lệnh P10
CREATE TABLE owner_identity (
  identity          TEXT PRIMARY KEY,
  public_key        TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('OWNER','OPERATOR')),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at        TEXT NOT NULL
);

-- P10: năm lệnh bắt buộc chữ ký owner hợp lệ
CREATE TRIGGER trg_owner_command_signature
BEFORE INSERT ON command_log
WHEN NEW.command_type IN ('AUTHORIZE_RELEASE','AUTHORIZE_PUBLISH',
                          'PROMOTE_LEARNING','PROMOTE_EVOLUTION','RETIRE_GOLD_SAMPLE')
BEGIN
  SELECT CASE
    WHEN NEW.actor_signature IS NULL OR NEW.evidence_hash IS NULL
      THEN RAISE(ABORT, 'P10: owner command requires signature and evidence_hash')
    WHEN (SELECT COUNT(*) FROM owner_identity
          WHERE identity = NEW.actor_identity AND role = 'OWNER' AND active = 1) = 0
      THEN RAISE(ABORT, 'P10: actor is not an active owner')
  END;
END;

-- Lease reconciliation ledger
CREATE TABLE lease_event (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  event_type        TEXT NOT NULL CHECK (event_type IN
                      ('ACQUIRE','HEARTBEAT','RELEASE','EXPIRE','RECONCILED')),
  holder            TEXT,
  token             INTEGER NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_lease_package ON lease_event(package_id, created_at);

-- DOWN
-- DROP TRIGGER trg_owner_command_signature; DROP TRIGGER trg_command_log_no_delete;
-- DROP TRIGGER trg_command_log_no_update;
-- DROP TABLE lease_event; DROP TABLE owner_identity; DROP TABLE command_log;
-- DROP TABLE stage_instance; DROP TABLE production_package; DROP TABLE content_brief;
-- DROP TABLE episode; DROP TABLE pillar; DROP TABLE channel_identity_contract;
-- DROP TABLE channel;


-- =====================================================================
-- 0002_capability.sql   —  CAPABILITY REGISTRY, FIXTURE, GOLD SET
-- =====================================================================
-- UP

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
  code                  TEXT NOT NULL UNIQUE,
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
  qualified_at        TEXT,
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
  -- KHÔNG BAO GIỜ 'production'
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

-- QUALIFIED chỉ được cấp khi có run PASS tương ứng, cả INSERT và UPDATE.
CREATE TRIGGER trg_binding_insert_requires_passed_run
BEFORE INSERT ON capability_archetype_binding
WHEN NEW.qualification_state = 'QUALIFIED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualification_run
    WHERE id = NEW.qualification_run_id
      AND capability_id = NEW.capability_id
      AND archetype_id  = NEW.archetype_id
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
      AND archetype_id  = NEW.archetype_id
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

-- DOWN
-- DROP TRIGGER trg_dispatch_block_no_delete; DROP TRIGGER trg_dispatch_block_no_update;
-- DROP TABLE dispatch_block_log;
-- DROP TRIGGER trg_binding_requires_passed_run; DROP TRIGGER trg_binding_insert_requires_passed_run;
-- DROP TABLE gold_sample;
-- DROP TABLE qualification_run; DROP TABLE capability_archetype_binding;
-- DROP TABLE fixture; DROP TABLE archetype;
-- DROP TRIGGER trg_capability_identity_immutable; DROP TABLE capability;


-- =====================================================================
-- 0003_truth.sql   —  SOURCE, CLAIM, TERMINOLOGY
-- =====================================================================
-- UP

CREATE TABLE source (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  url               TEXT NOT NULL,
  tier              INTEGER NOT NULL CHECK (tier IN (1,2,3,4)),
  fetched_at        TEXT NOT NULL,
  snapshot_r2_key   TEXT NOT NULL,          -- P1: snapshot bắt buộc, không chỉ URL
  content_hash      TEXT NOT NULL CHECK (length(content_hash) = 64)
);

CREATE TABLE claim (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  claim_type        TEXT NOT NULL CHECK (claim_type IN
                      ('FACT','ESTIMATE','MECHANISM','INTERPRETATION','PREDICTION')),
  text              TEXT NOT NULL,
  criticality       TEXT NOT NULL CHECK (criticality IN ('CRITICAL','NORMAL','SUPPORTING')),
  numeric_json      TEXT,
  as_of_date        TEXT,
  jurisdiction      TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE claim_source (
  claim_id          TEXT NOT NULL REFERENCES claim(id),
  source_id         TEXT NOT NULL REFERENCES source(id),
  role              TEXT NOT NULL CHECK (role IN ('PRIMARY','SUPPORTING','LOCATING')),
  PRIMARY KEY (claim_id, source_id)
);

-- TRU-01: claim CRITICAL phải có ≥1 nguồn tier ≤2 ở vai trò PRIMARY
CREATE TRIGGER trg_critical_claim_source_tier
BEFORE INSERT ON claim_source
WHEN NEW.role = 'PRIMARY'
BEGIN
  SELECT CASE WHEN (
    (SELECT criticality FROM claim WHERE id = NEW.claim_id) = 'CRITICAL'
    AND (SELECT tier FROM source WHERE id = NEW.source_id) > 2
  ) THEN RAISE(ABORT, 'TRU-01: CRITICAL claim requires T1/T2 primary source') END;
END;

CREATE TABLE contradiction (
  id                TEXT PRIMARY KEY,
  claim_a           TEXT NOT NULL REFERENCES claim(id),
  claim_b           TEXT NOT NULL REFERENCES claim(id),
  resolution_state  TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (resolution_state IN ('OPEN','RESOLVED_A','RESOLVED_B','BOTH_QUALIFIED','UNRESOLVABLE'))
);

CREATE TABLE terminology (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  term              TEXT NOT NULL,
  plain_meaning     TEXT NOT NULL,
  institutional_role TEXT,
  ipa               TEXT NOT NULL,
  arpabet           TEXT NOT NULL
);

-- DOWN
-- DROP TABLE terminology; DROP TABLE contradiction;
-- DROP TRIGGER trg_critical_claim_source_tier; DROP TABLE claim_source;
-- DROP TABLE claim; DROP TABLE source;


-- =====================================================================
-- 0004_production.sql   —  ARTIFACT, LINEAGE (G5), SHOT, ASSET, MASTER
-- =====================================================================
-- UP

CREATE TABLE artifact (
  id                      TEXT PRIMARY KEY,
  stage_instance_id       TEXT NOT NULL REFERENCES stage_instance(id),
  artifact_type           TEXT NOT NULL,
  namespace               TEXT NOT NULL
                          CHECK (namespace IN ('production','qualification','staging','quarantine')),
  -- P4: hai trục trạng thái ĐỘC LẬP
  immutability_state      TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (immutability_state IN ('DRAFT','SEALED','SUPERSEDED')),
  eligibility_state       TEXT NOT NULL DEFAULT 'INELIGIBLE'
                          CHECK (eligibility_state IN
                            ('INELIGIBLE','ELIGIBLE_FOR_STAGE','ELIGIBLE_FOR_RELEASE')),
  eligibility_reason_json TEXT,
  canonical_hash          TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  r2_key                  TEXT,
  byte_size               INTEGER,
  content_sha256          TEXT,
  stream_hash             TEXT,
  standard_version        INTEGER NOT NULL,
  capability_bindings_json TEXT,
  created_at              TEXT NOT NULL
);
CREATE INDEX idx_artifact_stage ON artifact(stage_instance_id);
CREATE INDEX idx_artifact_hash  ON artifact(canonical_hash);

-- P1: SEALED đòi bytes đã read-back (checksum tồn tại)
CREATE TRIGGER trg_sealed_requires_bytes
BEFORE UPDATE OF immutability_state ON artifact
WHEN NEW.immutability_state = 'SEALED'
BEGIN
  SELECT CASE WHEN NEW.content_sha256 IS NULL OR NEW.r2_key IS NULL
    THEN RAISE(ABORT, 'P1: cannot SEAL without read-back bytes and checksum') END;
END;

-- Artifact đã SEALED là bất biến về nội dung
CREATE TRIGGER trg_sealed_immutable
BEFORE UPDATE ON artifact
WHEN OLD.immutability_state = 'SEALED'
 AND (NEW.canonical_hash <> OLD.canonical_hash
   OR NEW.content_sha256 IS NOT OLD.content_sha256
   OR NEW.r2_key IS NOT OLD.r2_key)
BEGIN SELECT RAISE(ABORT, 'P4: SEALED artifact content is immutable'); END;

CREATE TABLE artifact_lineage (
  parent_artifact_id TEXT NOT NULL REFERENCES artifact(id),
  child_artifact_id  TEXT NOT NULL REFERENCES artifact(id),
  relation           TEXT NOT NULL,
  PRIMARY KEY (parent_artifact_id, child_artifact_id, relation)
);

-- G5: artifact 'qualification' (hoặc quarantine) KHÔNG được làm cha của 'production'
CREATE TRIGGER trg_namespace_isolation
BEFORE INSERT ON artifact_lineage
BEGIN
  SELECT CASE WHEN (
    (SELECT namespace FROM artifact WHERE id = NEW.child_artifact_id) = 'production'
    AND (SELECT namespace FROM artifact WHERE id = NEW.parent_artifact_id)
        IN ('qualification','quarantine','staging')
  ) THEN RAISE(ABORT, 'G5: non-production artifact cannot parent a production artifact') END;
END;

CREATE TABLE quarantine_hash (
  hash              TEXT PRIMARY KEY CHECK (length(hash) = 64),
  reason            TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE shot_cue_program (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL REFERENCES production_package(id),
  canonical_duration_ms INTEGER NOT NULL,
  shot_count            INTEGER NOT NULL,
  canonical_hash        TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  sealed_at             TEXT
);

CREATE TABLE shot (
  id                TEXT PRIMARY KEY,
  program_id        TEXT NOT NULL REFERENCES shot_cue_program(id),
  seq               INTEGER NOT NULL,
  t_start_ms        INTEGER NOT NULL,
  t_end_ms          INTEGER NOT NULL CHECK (t_end_ms > t_start_ms),
  route             TEXT NOT NULL CHECK (route IN ('SOURCE','MAKE','HYBRID')),
  archetype_id      TEXT REFERENCES archetype(id),
  motion_class      TEXT NOT NULL CHECK (motion_class IN
                      ('CAMERA_ONLY','LAYERED_SEMANTIC','SOURCE_SEMANTIC')),
  claim_ids_json    TEXT,
  layers_json       TEXT,
  source_query_json TEXT,
  UNIQUE (program_id, seq)
);

CREATE TABLE shot_assertion (
  id                TEXT PRIMARY KEY,
  shot_id           TEXT NOT NULL REFERENCES shot(id),
  temporal_state    TEXT NOT NULL CHECK (temporal_state IN ('BEFORE','DURING','AFTER')),
  assertion_json    TEXT NOT NULL
);

CREATE TABLE asset (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  provider          TEXT NOT NULL,
  provider_asset_id TEXT,
  r2_key            TEXT NOT NULL,
  content_sha256    TEXT NOT NULL,
  source_fps        REAL,
  resolution        TEXT,
  license_type      TEXT NOT NULL,
  license_url       TEXT,
  territory         TEXT,
  duration_rights   TEXT,
  editorial_only    INTEGER NOT NULL DEFAULT 0 CHECK (editorial_only IN (0,1)),
  phash             TEXT
);

CREATE TABLE composition (
  id                TEXT PRIMARY KEY,
  shot_id           TEXT NOT NULL REFERENCES shot(id),
  variant           INTEGER NOT NULL,
  r2_key            TEXT NOT NULL,
  content_sha256    TEXT NOT NULL,
  tournament_score  REAL,
  is_champion       INTEGER NOT NULL DEFAULT 0 CHECK (is_champion IN (0,1))
);

CREATE TABLE audio_section (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  seq               INTEGER NOT NULL,
  char_start        INTEGER NOT NULL,
  char_end          INTEGER NOT NULL,
  text              TEXT NOT NULL,
  prev_context      TEXT,
  next_context      TEXT
);

CREATE TABLE audio_take (
  id                     TEXT PRIMARY KEY,
  section_id             TEXT NOT NULL REFERENCES audio_section(id),
  r2_key                 TEXT NOT NULL,
  alignment_score        REAL,
  phoneme_mismatch_rate  REAL,
  seam_score             REAL,
  is_champion            INTEGER NOT NULL DEFAULT 0 CHECK (is_champion IN (0,1))
);

CREATE TABLE cue (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  kind              TEXT NOT NULL CHECK (kind IN ('MUSIC','SFX','AMBIENCE','SILENCE')),
  t_ms              INTEGER NOT NULL,
  function          TEXT NOT NULL,
  asset_id          TEXT REFERENCES asset(id)
);

CREATE TABLE master (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL REFERENCES production_package(id),
  tier                  TEXT NOT NULL CHECK (tier IN ('ARCHIVAL','DISTRIBUTION')),
  derived_from_master_id TEXT REFERENCES master(id),
  r2_key                TEXT NOT NULL,
  drive_file_id         TEXT,
  file_sha256           TEXT NOT NULL,
  stream_framemd5       TEXT NOT NULL,
  codec                 TEXT NOT NULL,
  duration_ms           INTEGER NOT NULL,
  fps                   REAL NOT NULL,
  probe_json            TEXT NOT NULL,
  sealed_at             TEXT
);

-- MED-06: distribution master phải có archival cha
CREATE TRIGGER trg_distribution_requires_archival
BEFORE INSERT ON master
WHEN NEW.tier = 'DISTRIBUTION'
BEGIN
  SELECT CASE WHEN NEW.derived_from_master_id IS NULL
    OR (SELECT tier FROM master WHERE id = NEW.derived_from_master_id) <> 'ARCHIVAL'
    THEN RAISE(ABORT, 'MED-06: DISTRIBUTION master requires an ARCHIVAL parent') END;
END;

-- DOWN
-- DROP TRIGGER trg_distribution_requires_archival; DROP TABLE master;
-- DROP TABLE cue; DROP TABLE audio_take; DROP TABLE audio_section;
-- DROP TABLE composition; DROP TABLE asset; DROP TABLE shot_assertion;
-- DROP TABLE shot; DROP TABLE shot_cue_program; DROP TABLE quarantine_hash;
-- DROP TRIGGER trg_namespace_isolation; DROP TABLE artifact_lineage;
-- DROP TRIGGER trg_sealed_immutable; DROP TRIGGER trg_sealed_requires_bytes;
-- DROP TABLE artifact;


-- =====================================================================
-- 0005_quality.sql   —  STANDARD, GATE (G7), ASSURANCE
-- =====================================================================
-- UP

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
  strictness_rank   INTEGER NOT NULL DEFAULT 0,   -- dùng cho G11 (0009)
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

-- G7: PASS bắt buộc có evidence
CREATE TRIGGER trg_gate_pass_requires_evidence_ins
BEFORE INSERT ON gate_evaluation
WHEN NEW.state = 'PASS' AND (NEW.evidence_r2_key IS NULL OR NEW.evidence_r2_key = '')
BEGIN SELECT RAISE(ABORT, 'G7: gate PASS requires evidence_r2_key'); END;

CREATE TRIGGER trg_gate_pass_requires_evidence_upd
BEFORE UPDATE ON gate_evaluation
WHEN NEW.state = 'PASS' AND (NEW.evidence_r2_key IS NULL OR NEW.evidence_r2_key = '')
BEGIN SELECT RAISE(ABORT, 'G7: gate PASS requires evidence_r2_key'); END;

-- M0 KHÔNG BAO GIỜ được WAIVED
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

-- WAIVED (M1/M2) đòi owner hợp lệ và thời hạn
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

-- Critic chưa QUALIFIED không được dùng
CREATE TRIGGER trg_critic_must_be_qualified
BEFORE INSERT ON critic_verdict
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM capability_archetype_binding
    WHERE capability_id = NEW.capability_id AND qualification_state = 'QUALIFIED'
  ) = 0 THEN RAISE(ABORT, 'MSR-02: critic capability is not QUALIFIED') END;
END;

-- DOWN
-- DROP TRIGGER trg_critic_must_be_qualified; DROP TABLE critic_verdict;
-- DROP TABLE assurance_run; DROP TRIGGER trg_waiver_requires_owner;
-- DROP TRIGGER trg_no_waive_m0_upd; DROP TRIGGER trg_no_waive_m0_ins;
-- DROP TRIGGER trg_gate_pass_requires_evidence_upd;
-- DROP TRIGGER trg_gate_pass_requires_evidence_ins;
-- DROP TABLE gate_evaluation; DROP TABLE gate_definition; DROP TABLE standard;

-- =====================================================================
-- 0006_cost.sql   —  RESERVATION, PROVIDER REQUEST, CEILING
-- =====================================================================
-- UP

CREATE TABLE spend_ceiling (
  namespace         TEXT NOT NULL
                    CHECK (namespace IN ('production','qualification','staging')),
  scope             TEXT NOT NULL CHECK (scope IN ('PORTFOLIO','CHANNEL','PACKAGE','STAGE')),
  scope_ref         TEXT NOT NULL,
  ceiling_usd       REAL NOT NULL CHECK (ceiling_usd >= 0),
  window_start      TEXT,
  window_end        TEXT,
  CHECK (window_start IS NULL OR window_end IS NULL OR window_end > window_start),
  PRIMARY KEY (namespace, scope, scope_ref)
);

CREATE TABLE spend_reservation (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  stage_instance_id TEXT REFERENCES stage_instance(id),
  capability_id     TEXT NOT NULL REFERENCES capability(id),
  namespace         TEXT NOT NULL
                    CHECK (namespace IN ('production','qualification','staging')),
  portfolio_ref     TEXT NOT NULL,
  channel_ref       TEXT,
  estimated_cost    REAL NOT NULL CHECK (estimated_cost >= 0),
  actual_cost       REAL CHECK (actual_cost >= 0),
  state             TEXT NOT NULL DEFAULT 'HELD'
                    CHECK (state IN ('HELD','SETTLED','EXPIRED','ORPHANED')),
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL
                    CHECK (expires_at > created_at)
);
CREATE INDEX idx_reservation_state ON spend_reservation(state, expires_at);

CREATE TRIGGER trg_reservation_namespace_match
BEFORE INSERT ON spend_reservation
WHEN NEW.namespace <> (SELECT namespace FROM production_package WHERE id = NEW.package_id)
BEGIN SELECT RAISE(ABORT, 'PRV-02: reservation namespace must match package'); END;

-- Atomic reservation: thiếu ceiling hoặc vượt bất kỳ scope nào đều zero dispatch.
CREATE TRIGGER trg_reservation_requires_ceiling
BEFORE INSERT ON spend_reservation
WHEN NOT EXISTS (
       SELECT 1 FROM spend_ceiling
       WHERE namespace = NEW.namespace AND scope = 'PORTFOLIO' AND scope_ref = NEW.portfolio_ref
         AND (window_start IS NULL OR NEW.created_at >= window_start)
         AND (window_end IS NULL OR NEW.created_at < window_end)
     )
  OR (NEW.namespace <> 'qualification' AND (
       NOT EXISTS (
         SELECT 1 FROM spend_ceiling
         WHERE namespace = NEW.namespace AND scope = 'CHANNEL' AND scope_ref = NEW.channel_ref
           AND (window_start IS NULL OR NEW.created_at >= window_start)
           AND (window_end IS NULL OR NEW.created_at < window_end)
       )
       OR NOT EXISTS (
         SELECT 1 FROM spend_ceiling
         WHERE namespace = NEW.namespace AND scope = 'PACKAGE' AND scope_ref = NEW.package_id
           AND (window_start IS NULL OR NEW.created_at >= window_start)
           AND (window_end IS NULL OR NEW.created_at < window_end)
       )
     ))
BEGIN SELECT RAISE(ABORT, 'PRV-02: required spend ceiling is missing'); END;

CREATE TRIGGER trg_reservation_budget
BEFORE INSERT ON spend_reservation
WHEN EXISTS (
  SELECT 1 FROM spend_ceiling AS ceiling
  WHERE ceiling.namespace = NEW.namespace
    AND (ceiling.window_start IS NULL OR NEW.created_at >= ceiling.window_start)
    AND (ceiling.window_end IS NULL OR NEW.created_at < ceiling.window_end)
    AND (
      (ceiling.scope = 'PORTFOLIO' AND ceiling.scope_ref = NEW.portfolio_ref)
      OR (ceiling.scope = 'CHANNEL' AND ceiling.scope_ref = NEW.channel_ref)
      OR (ceiling.scope = 'PACKAGE' AND ceiling.scope_ref = NEW.package_id)
      OR (ceiling.scope = 'STAGE' AND ceiling.scope_ref = NEW.stage_instance_id)
    )
    AND COALESCE((
      SELECT SUM(CASE WHEN reservation.state = 'SETTLED'
        THEN reservation.actual_cost ELSE reservation.estimated_cost END)
      FROM spend_reservation AS reservation
      WHERE reservation.namespace = NEW.namespace
        AND reservation.state IN ('HELD','SETTLED','EXPIRED','ORPHANED')
        AND (ceiling.window_start IS NULL OR reservation.created_at >= ceiling.window_start)
        AND (ceiling.window_end IS NULL OR reservation.created_at < ceiling.window_end)
        AND (
          (ceiling.scope = 'PORTFOLIO' AND reservation.portfolio_ref = ceiling.scope_ref)
          OR (ceiling.scope = 'CHANNEL' AND reservation.channel_ref = ceiling.scope_ref)
          OR (ceiling.scope = 'PACKAGE' AND reservation.package_id = ceiling.scope_ref)
          OR (ceiling.scope = 'STAGE' AND reservation.stage_instance_id = ceiling.scope_ref)
        )
    ), 0) + NEW.estimated_cost > ceiling.ceiling_usd
)
BEGIN SELECT RAISE(ABORT, 'PRV-02: spend ceiling exceeded'); END;

CREATE TABLE provider_request (
  id                TEXT PRIMARY KEY,
  reservation_id    TEXT NOT NULL REFERENCES spend_reservation(id),
  idempotency_key   TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) = 64),
  request_r2_key    TEXT NOT NULL CHECK (length(request_r2_key) > 0), -- CORE-06
  response_r2_key   TEXT,
  actual_cost       REAL CHECK (actual_cost >= 0),
  latency_ms        INTEGER CHECK (latency_ms >= 0),
  error_class       TEXT CHECK (error_class IN
                      ('TRANSIENT','RATE_LIMIT','SCHEMA_VIOLATION','RIGHTS_DENIED',
                       'BUDGET_DENIED','CONTENT_FILTERED','PROVIDER_ERROR')),
  attempt_ordinal   INTEGER NOT NULL DEFAULT 1 CHECK (attempt_ordinal >= 1),
  state             TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (state IN ('OPEN','COMPLETED','FAILED','ORPHANED')),
  created_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_provider_request_attempt
ON provider_request(reservation_id, attempt_ordinal);

CREATE TRIGGER trg_provider_request_requires_held
BEFORE INSERT ON provider_request
WHEN (SELECT state FROM spend_reservation WHERE id = NEW.reservation_id) <> 'HELD'
BEGIN SELECT RAISE(ABORT, 'PRV-02: provider request requires HELD reservation'); END;

-- G8: bốn lớp lỗi không bao giờ được retry (attempt > 1)
CREATE TRIGGER trg_no_retry_terminal_errors
BEFORE INSERT ON provider_request
WHEN NEW.attempt_ordinal > 1
BEGIN
  SELECT CASE WHEN (
    SELECT error_class FROM provider_request
    WHERE reservation_id = NEW.reservation_id
    ORDER BY attempt_ordinal DESC LIMIT 1
  ) IN ('SCHEMA_VIOLATION','RIGHTS_DENIED','BUDGET_DENIED','CONTENT_FILTERED')
  THEN RAISE(ABORT, 'G8: terminal error class must not be retried') END;
END;

-- Settle chỉ từ HELD
CREATE TRIGGER trg_settle_from_held
BEFORE UPDATE OF state ON spend_reservation
WHEN NEW.state = 'SETTLED'
 AND (OLD.state <> 'HELD' OR NEW.actual_cost IS NULL OR NEW.actual_cost > OLD.estimated_cost)
BEGIN SELECT RAISE(ABORT, 'PRV-02: can only SETTLE a HELD reservation'); END;

CREATE TABLE cost_ledger (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  stage_instance_id TEXT REFERENCES stage_instance(id),
  capability_id     TEXT REFERENCES capability(id),
  namespace         TEXT NOT NULL
                    CHECK (namespace IN ('production','qualification','staging')),
  amount_usd        REAL NOT NULL CHECK (amount_usd >= 0),
  kind              TEXT NOT NULL CHECK (kind IN ('PRODUCTION','QUALIFICATION','REJECTED_CANDIDATE')),
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_cost_package ON cost_ledger(package_id, kind);

-- DOWN
-- DROP TABLE cost_ledger; DROP TRIGGER trg_settle_from_held;
-- DROP TRIGGER trg_no_retry_terminal_errors;
-- DROP TRIGGER trg_provider_request_requires_held;
-- DROP INDEX idx_provider_request_attempt; DROP TABLE provider_request;
-- DROP TRIGGER trg_reservation_budget; DROP TRIGGER trg_reservation_requires_ceiling;
-- DROP TRIGGER trg_reservation_namespace_match;
-- DROP TABLE spend_reservation; DROP TABLE spend_ceiling;


-- =====================================================================
-- 0007_learning.sql   —  PREDICTION (P9), ANALYTICS, EXPERIMENT, PROMOTION
-- =====================================================================
-- UP

CREATE TABLE predicted_performance (
  id                   TEXT PRIMARY KEY,
  package_id           TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  model_version        TEXT NOT NULL,
  retention_curve_json TEXT NOT NULL,
  ctr_estimate         REAL NOT NULL,
  beat_risk_json       TEXT NOT NULL,
  canonical_hash       TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  sealed_at            TEXT NOT NULL
);

CREATE TABLE actual_performance (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  youtube_video_id  TEXT NOT NULL,
  master_id         TEXT NOT NULL REFERENCES master(id),
  ingested_at       TEXT NOT NULL,
  window_days       INTEGER NOT NULL,
  metrics_json      TEXT NOT NULL
);

CREATE TABLE experiment (
  id                 TEXT PRIMARY KEY,
  channel_id         TEXT NOT NULL REFERENCES channel(id),
  hypothesis         TEXT NOT NULL,
  variable_tested    TEXT NOT NULL,
  held_constant_json TEXT NOT NULL,
  min_sample_size    INTEGER NOT NULL,
  decision_criterion TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'RUNNING'
                     CHECK (status IN ('RUNNING','CONCLUDED','ABANDONED'))
);

CREATE TABLE learning (
  id                          TEXT PRIMARY KEY,
  experiment_id               TEXT REFERENCES experiment(id),
  scope                       TEXT NOT NULL DEFAULT 'CHANNEL'
                              CHECK (scope IN ('CHANNEL','PORTFOLIO')),
  channel_id                  TEXT REFERENCES channel(id),
  replicated_channel_ids_json TEXT,
  finding                     TEXT NOT NULL,
  evidence_json               TEXT NOT NULL,
  supporting_video_count      INTEGER NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE'
                              CHECK (status IN
                                ('INSUFFICIENT_EVIDENCE','READY','PROMOTED','REJECTED'))
);

-- Learning CHANNEL scope phải có channel_id; PORTFOLIO phải có ≥2 kênh tái lập
CREATE TRIGGER trg_learning_scope_rules
BEFORE UPDATE OF status ON learning
WHEN NEW.status = 'READY'
BEGIN
  SELECT CASE
    WHEN NEW.scope = 'CHANNEL' AND NEW.channel_id IS NULL
      THEN RAISE(ABORT, 'LRN: CHANNEL learning requires channel_id')
    WHEN NEW.scope = 'PORTFOLIO'
     AND (NEW.replicated_channel_ids_json IS NULL
          OR json_array_length(NEW.replicated_channel_ids_json) < 2)
      THEN RAISE(ABORT, 'LRN: PORTFOLIO learning requires >=2 independent channels')
  END;
END;

CREATE TABLE promotion (
  id                    TEXT PRIMARY KEY,
  learning_id           TEXT REFERENCES learning(id),
  evolution_proposal_id TEXT,
  target_kind           TEXT NOT NULL CHECK (target_kind IN ('STANDARD','STRATEGY','CAPABILITY','THRESHOLD','PIPELINE_CODE')),
  target_ref            TEXT NOT NULL,
  target_version_before INTEGER,
  target_version_after  INTEGER,
  owner_identity        TEXT NOT NULL,
  evidence_hash         TEXT NOT NULL CHECK (length(evidence_hash) = 64),
  created_at            TEXT NOT NULL
);

-- Promotion đòi owner hợp lệ
CREATE TRIGGER trg_promotion_owner
BEFORE INSERT ON promotion
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM owner_identity
    WHERE identity = NEW.owner_identity AND role='OWNER' AND active=1
  ) = 0 THEN RAISE(ABORT, 'P10: promotion requires active owner identity') END;
END;

-- DOWN
-- DROP TRIGGER trg_promotion_owner; DROP TABLE promotion;
-- DROP TRIGGER trg_learning_scope_rules; DROP TABLE learning;
-- DROP TABLE experiment; DROP TABLE actual_performance; DROP TABLE predicted_performance;


-- =====================================================================
-- 0008_evolution.sql   —  SELF-UPGRADE GOVERNANCE (G11, G12, G14)
-- =====================================================================
-- UP

CREATE TABLE evolution_proposal (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN
                         ('THRESHOLD','GATE','CAPABILITY','PIPELINE_CODE','LEXICON','POLICY')),
  source               TEXT NOT NULL CHECK (source IN
                         ('LRN04','LEARNING','PROVIDER_WATCH','POLICY_WATCH','HUMAN','INCIDENT')),
  target_ref           TEXT NOT NULL,
  diff_r2_key          TEXT NOT NULL,
  strictness_direction TEXT NOT NULL CHECK (strictness_direction IN ('TIGHTEN','RELAX','NEUTRAL')),
  shadow_run_id        TEXT REFERENCES qualification_run(id),
  evidence_r2_key      TEXT,
  status               TEXT NOT NULL DEFAULT 'DETECTED'
                       CHECK (status IN ('DETECTED','PROPOSED','SHADOW_RUNNING',
                                         'EVIDENCE_READY','PROMOTED','REJECTED','EXPIRED')),
  rollback_ref         TEXT,
  created_at           TEXT NOT NULL,
  decided_at           TEXT,
  decided_by           TEXT
);

-- G12: EVIDENCE_READY đòi shadow run thật + evidence
CREATE TRIGGER trg_evolution_evidence_required
BEFORE UPDATE OF status ON evolution_proposal
WHEN NEW.status = 'EVIDENCE_READY'
BEGIN
  SELECT CASE WHEN NEW.shadow_run_id IS NULL OR NEW.evidence_r2_key IS NULL
    THEN RAISE(ABORT, 'G12: EVIDENCE_READY requires shadow_run_id and evidence') END;
END;

-- G12 + P10: PROMOTED đòi owner + đã qua EVIDENCE_READY
CREATE TRIGGER trg_evolution_promote_owner
BEFORE UPDATE OF status ON evolution_proposal
WHEN NEW.status = 'PROMOTED'
BEGIN
  SELECT CASE
    WHEN OLD.status <> 'EVIDENCE_READY'
      THEN RAISE(ABORT, 'G12: promotion requires EVIDENCE_READY state')
    WHEN (SELECT COUNT(*) FROM owner_identity
          WHERE identity = NEW.decided_by AND role='OWNER' AND active=1) = 0
      THEN RAISE(ABORT, 'P10: promotion requires active owner identity')
  END;
END;

-- ---------- G11: CẤM TỰ NỚI CHUẨN ----------
-- Cơ chế: mọi thay đổi gate_definition phải khai chiều; chiều RELAX
-- đòi một promotion hợp lệ trỏ tới chính gate đó.

CREATE TABLE standard_change_log (
  id                   TEXT PRIMARY KEY,
  target_kind          TEXT NOT NULL CHECK (target_kind IN ('GATE','THRESHOLD','GUARDRAIL','STANDARD')),
  target_ref           TEXT NOT NULL,
  strictness_direction TEXT NOT NULL CHECK (strictness_direction IN ('TIGHTEN','RELAX','NEUTRAL')),
  promotion_id         TEXT REFERENCES promotion(id),
  before_json          TEXT NOT NULL,
  after_json           TEXT NOT NULL,
  actor_identity       TEXT NOT NULL,
  created_at           TEXT NOT NULL
);

-- RELAX bắt buộc có promotion owner-signed
CREATE TRIGGER trg_relax_requires_promotion
BEFORE INSERT ON standard_change_log
WHEN NEW.strictness_direction = 'RELAX'
BEGIN
  SELECT CASE WHEN NEW.promotion_id IS NULL
    OR (SELECT COUNT(*) FROM promotion WHERE id = NEW.promotion_id) = 0
    THEN RAISE(ABORT, 'G11: relaxing a standard requires an owner-signed promotion') END;
END;

-- Mọi UPDATE gate_definition phải để lại change log cùng transaction:
-- cưỡng chế bằng cách cấm hạ strictness_rank trực tiếp
CREATE TRIGGER trg_gate_no_silent_relax
BEFORE UPDATE OF strictness_rank, threshold_json, tier ON gate_definition
WHEN NEW.strictness_rank < OLD.strictness_rank
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM standard_change_log
    WHERE target_kind='GATE' AND target_ref = OLD.id
      AND strictness_direction='RELAX' AND promotion_id IS NOT NULL
      AND created_at >= datetime('now','-5 minutes')
  ) = 0 THEN RAISE(ABORT, 'G11: gate relaxation requires a promoted change_log entry') END;
END;

-- Vô hiệu hóa gate = nới. Cấm nếu không có promotion.
CREATE TRIGGER trg_gate_no_silent_disable
BEFORE UPDATE OF active ON gate_definition
WHEN NEW.active = 0 AND OLD.active = 1
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM standard_change_log
    WHERE target_kind='GATE' AND target_ref = OLD.id
      AND strictness_direction='RELAX' AND promotion_id IS NOT NULL
      AND created_at >= datetime('now','-5 minutes')
  ) = 0 THEN RAISE(ABORT, 'G11: disabling a gate requires a promoted change_log entry') END;
END;

-- ---------- G14: gold_sample append-only ----------
CREATE TRIGGER trg_gold_no_delete
BEFORE DELETE ON gold_sample
BEGIN SELECT RAISE(ABORT, 'G14: gold_sample is append-only; use RETIRE_GOLD_SAMPLE'); END;

CREATE TRIGGER trg_gold_label_immutable
BEFORE UPDATE ON gold_sample
WHEN NEW.defect_class <> OLD.defect_class
  OR NEW.severity <> OLD.severity
  OR NEW.ground_truth_json <> OLD.ground_truth_json
BEGIN SELECT RAISE(ABORT, 'G14: gold_sample labels are immutable'); END;

-- Retire chỉ qua owner
CREATE TRIGGER trg_gold_retire_owner
BEFORE UPDATE OF retired_at ON gold_sample
WHEN NEW.retired_at IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM owner_identity
    WHERE identity = NEW.retired_by AND role='OWNER' AND active=1
  ) = 0 THEN RAISE(ABORT, 'G14: retiring a gold sample requires owner identity') END;
END;

-- DOWN
-- DROP TRIGGER trg_gold_retire_owner; DROP TRIGGER trg_gold_label_immutable;
-- DROP TRIGGER trg_gold_no_delete; DROP TRIGGER trg_gate_no_silent_disable;
-- DROP TRIGGER trg_gate_no_silent_relax; DROP TRIGGER trg_relax_requires_promotion;
-- DROP TABLE standard_change_log; DROP TRIGGER trg_evolution_promote_owner;
-- DROP TRIGGER trg_evolution_evidence_required; DROP TABLE evolution_proposal;


-- =====================================================================
-- 0009_human.sql   —  HUMAN TOUCHPOINTS, EDITORIAL IMPRINT (P13)
-- =====================================================================
-- UP

CREATE TABLE human_actor (
  identity          TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('OWNER','OPERATOR','EDITOR')),
  is_service        INTEGER NOT NULL DEFAULT 0 CHECK (is_service = 0),  -- không bao giờ service
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE human_decision (
  id                 TEXT PRIMARY KEY,
  package_id         TEXT NOT NULL REFERENCES production_package(id),
  decision_type      TEXT NOT NULL CHECK (decision_type IN ('D1','D2','D3','D4','D5')),
  actor_identity     TEXT NOT NULL REFERENCES human_actor(identity),
  artifact_before_id TEXT REFERENCES artifact(id),
  artifact_after_id  TEXT REFERENCES artifact(id),
  diff_r2_key        TEXT,
  rationale_text     TEXT NOT NULL CHECK (length(rationale_text) >= 20),
  created_at         TEXT NOT NULL
);
CREATE INDEX idx_human_decision_package ON human_decision(package_id, decision_type);

-- Actor phải là người đang hoạt động
CREATE TRIGGER trg_human_decision_actor
BEFORE INSERT ON human_decision
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM human_actor
    WHERE identity = NEW.actor_identity AND active = 1
  ) = 0 THEN RAISE(ABORT, 'HP-02: decision actor must be an active human actor') END;
END;

CREATE TABLE attention_ledger (
  id                TEXT PRIMARY KEY,
  actor_identity    TEXT NOT NULL REFERENCES human_actor(identity),
  touchpoint        TEXT NOT NULL CHECK (touchpoint IN
                      ('HP01','HP02','HP03','HP04','HP05','HP06','HP07')),
  package_id        TEXT REFERENCES production_package(id),
  minutes_spent     REAL NOT NULL,
  week_start        TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_attention_week ON attention_ledger(week_start, actor_identity);

CREATE TABLE sampling_policy (
  channel_id            TEXT PRIMARY KEY REFERENCES channel(id),
  enabled               INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  clean_video_streak    INTEGER NOT NULL DEFAULT 0,
  last_incident_at      TEXT,
  last_escaped_p0_at    TEXT,
  enabled_by            TEXT,
  enabled_at            TEXT
);

-- Sampling chỉ bật được bởi owner và khi đủ điều kiện kép
CREATE TRIGGER trg_sampling_conditions
BEFORE UPDATE OF enabled ON sampling_policy
WHEN NEW.enabled = 1
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM owner_identity
          WHERE identity = NEW.enabled_by AND role='OWNER' AND active=1) = 0
      THEN RAISE(ABORT, 'HP: sampling requires owner identity')
    WHEN NEW.last_incident_at IS NOT NULL
     AND NEW.last_incident_at >= datetime('now','-90 days')
      THEN RAISE(ABORT, 'HP: sampling blocked — incident within 90 days')
    WHEN NEW.last_escaped_p0_at IS NOT NULL
     AND NEW.last_escaped_p0_at >= datetime('now','-90 days')
      THEN RAISE(ABORT, 'HP: sampling blocked — escaped P0 within 90 days')
  END;
END;

-- DOWN
-- DROP TRIGGER trg_sampling_conditions; DROP TABLE sampling_policy;
-- DROP TABLE attention_ledger; DROP TRIGGER trg_human_decision_actor;
-- DROP TABLE human_decision; DROP TABLE human_actor;


-- =====================================================================
-- 0010_policy.sql   —  POLICY DEFENSE (G15), DISCLOSURE, INCIDENT
-- =====================================================================
-- UP

CREATE TABLE disclosure_decision (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  synthetic_toggle  INTEGER NOT NULL DEFAULT 1 CHECK (synthetic_toggle IN (0,1)),
  rationale_text    TEXT,
  decided_by        TEXT NOT NULL REFERENCES human_actor(identity),
  decided_at        TEXT NOT NULL
);

-- Tắt disclosure đòi lý do ghi lại
CREATE TRIGGER trg_disclosure_off_requires_rationale
BEFORE INSERT ON disclosure_decision
WHEN NEW.synthetic_toggle = 0
 AND (NEW.rationale_text IS NULL OR length(NEW.rationale_text) < 20)
BEGIN SELECT RAISE(ABORT, 'PC-4: disabling disclosure requires written rationale'); END;

CREATE TABLE policy_check (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL REFERENCES production_package(id),
  check_code        TEXT NOT NULL CHECK (check_code IN
                      ('PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8')),
  state             TEXT NOT NULL CHECK (state IN ('PASS','FAIL','NOT_EVALUATED')),
  evidence_r2_key   TEXT,
  evaluated_at      TEXT,
  UNIQUE (package_id, check_code)
);

CREATE TRIGGER trg_policy_check_evidence
BEFORE INSERT ON policy_check
WHEN NEW.state = 'PASS' AND (NEW.evidence_r2_key IS NULL OR NEW.evidence_r2_key = '')
BEGIN SELECT RAISE(ABORT, 'G7/G15: policy check PASS requires evidence'); END;

-- ---------- G15: chặn publish khi checklist chưa đủ ----------
CREATE TABLE publish_record (
  id                TEXT PRIMARY KEY,
  package_id        TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  master_id         TEXT NOT NULL REFERENCES master(id),
  youtube_video_id  TEXT,
  authorized_by     TEXT NOT NULL,
  published_at      TEXT NOT NULL
);

CREATE TRIGGER trg_publish_requires_policy_checklist
BEFORE INSERT ON publish_record
BEGIN
  SELECT CASE
    -- 8 policy check phải PASS đủ
    WHEN (SELECT COUNT(*) FROM policy_check
          WHERE package_id = NEW.package_id AND state='PASS') < 8
      THEN RAISE(ABORT, 'G15: publish blocked — policy defense checklist incomplete')
    -- P9: phải có prediction đã seal
    WHEN (SELECT COUNT(*) FROM predicted_performance
          WHERE package_id = NEW.package_id) = 0
      THEN RAISE(ABORT, 'P9: publish blocked — no sealed prediction')
    -- HP-06: phải có quyết định disclosure
    WHEN (SELECT COUNT(*) FROM disclosure_decision
          WHERE package_id = NEW.package_id) = 0
      THEN RAISE(ABORT, 'PC-4: publish blocked — no disclosure decision')
    -- P10: người ủy quyền phải là owner
    WHEN (SELECT COUNT(*) FROM owner_identity
          WHERE identity = NEW.authorized_by AND role='OWNER' AND active=1) = 0
      THEN RAISE(ABORT, 'P10: publish requires active owner identity')
    -- kênh đang bị đóng băng thì không publish
    WHEN (SELECT COUNT(*) FROM channel_freeze cf
          JOIN production_package p ON p.channel_id = cf.channel_id
          WHERE p.id = NEW.package_id AND cf.unfrozen_at IS NULL) > 0
      THEN RAISE(ABORT, 'INCIDENT: channel is frozen — publish blocked')
  END;
END;

CREATE TABLE policy_incident (
  id                     TEXT PRIMARY KEY,
  channel_id             TEXT NOT NULL REFERENCES channel(id),
  package_id             TEXT REFERENCES production_package(id),
  level                  TEXT NOT NULL CHECK (level IN ('I1','I2','I3','I4')),
  platform_ref           TEXT,
  source                 TEXT NOT NULL CHECK (source IN ('PLATFORM_NOTICE','INTERNAL','VIEWER')),
  detected_at            TEXT NOT NULL,
  rca_r2_key             TEXT,
  appeal_state           TEXT CHECK (appeal_state IN ('NONE','PREPARING','SUBMITTED','ACCEPTED','REJECTED')),
  resolved_at            TEXT,
  learned_proposal_ids_json TEXT
);

CREATE TABLE channel_freeze (
  id                TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channel(id),
  incident_id       TEXT REFERENCES policy_incident(id),
  frozen_at         TEXT NOT NULL,
  frozen_by         TEXT NOT NULL,
  unfrozen_at       TEXT,
  unfrozen_by       TEXT
);
CREATE INDEX idx_freeze_open ON channel_freeze(channel_id, unfrozen_at);

-- Rã đông đòi owner VÀ ≥1 proposal đã promote từ incident
CREATE TRIGGER trg_unfreeze_requires_owner_and_learning
BEFORE UPDATE OF unfrozen_at ON channel_freeze
WHEN NEW.unfrozen_at IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM owner_identity
          WHERE identity = NEW.unfrozen_by AND role='OWNER' AND active=1) = 0
      THEN RAISE(ABORT, 'INCIDENT: unfreeze requires active owner identity')
    WHEN OLD.incident_id IS NOT NULL AND (
      SELECT COUNT(*) FROM evolution_proposal
      WHERE source='INCIDENT' AND status='PROMOTED'
        AND target_ref LIKE '%' || OLD.incident_id || '%') = 0
      THEN RAISE(ABORT, 'INCIDENT: unfreeze requires at least one promoted learning')
  END;
END;

CREATE TABLE policy_snapshot (
  id                TEXT PRIMARY KEY,
  source_url        TEXT NOT NULL,
  fetched_at        TEXT NOT NULL,
  snapshot_r2_key   TEXT NOT NULL,
  content_hash      TEXT NOT NULL CHECK (length(content_hash) = 64),
  diff_from_prev_r2_key TEXT
);
CREATE INDEX idx_policy_snapshot ON policy_snapshot(source_url, fetched_at);

-- DOWN
-- DROP TABLE policy_snapshot; DROP TRIGGER trg_unfreeze_requires_owner_and_learning;
-- DROP TABLE channel_freeze; DROP TABLE policy_incident;
-- DROP TRIGGER trg_publish_requires_policy_checklist; DROP TABLE publish_record;
-- DROP TRIGGER trg_policy_check_evidence; DROP TABLE policy_check;
-- DROP TRIGGER trg_disclosure_off_requires_rationale; DROP TABLE disclosure_decision;


-- =====================================================================
-- GHI CHÚ TRIỂN KHAI
-- =====================================================================
-- 1. D1 hỗ trợ trigger và CHECK; KHÔNG hỗ trợ stored procedure. Mọi
--    logic phức tạp hơn nằm ở tầng ứng dụng — nhưng bất biến an toàn
--    PHẢI ở đây, vì tầng ứng dụng do agent viết và có thể sai.
-- 2. Trigger dùng datetime('now') — mọi timestamp lưu dạng ISO-8601 UTC.
-- 3. json_array_length yêu cầu JSON1 (có sẵn trong D1).
-- 4. Test migration: chạy toàn bộ UP rồi toàn bộ DOWN trên D1 tạm,
--    lặp 2 lần — CI job `migration` trong 01-REPO-STRUCTURE §5.
-- 5. Mỗi trigger PHẢI có một test guardrail tương ứng chứng minh nó
--    ABORT đúng trường hợp (05-TEST-SPEC §2). Trigger không có test
--    coi như chưa tồn tại.

-- =====================================================================
-- EVOLVE_STAGE12_QA_REMEDIATION — migration 0023
-- =====================================================================
-- stage12_qa_diagnostic_job: một job scan idempotent cho đúng failed
-- attempt 3; READY bắt buộc có immutable receipt pointer/hash/image.
-- stage12_qa_evidence: typed measurements + failure list + R2 hashes;
-- UNIQUE(job_id, source), cấm UPDATE và DELETE.
-- command_log cho phép SCAN_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3 duy nhất
-- với FAILED → DIAGNOSTIC_PENDING. Xem drizzle/0023_stage12_qa_evidence.sql
-- để lấy DDL/trigger thực thi canonical.

-- =====================================================================
-- EVOLVE_STAGE12_DIAGNOSTIC_CALLBACK — migration 0024
-- =====================================================================
-- stage12_qa_diagnostic_job bổ sung diagnostic_ordinal 1..2,
-- retry_of_diagnostic_job_id, typed retry_reason_code và target_duration_sec.
-- UNIQUE(stage12_job_id, diagnostic_ordinal) giới hạn đúng một initial + một
-- callback-timeout retry; terminal READY/FAILED cấm UPDATE và DELETE.
-- Retry ordinal 2 chỉ được tham chiếu ordinal 1 FAILED với typed
-- STAGE12_CALLBACK_TIMEOUT hoặc legacy Production code 23; predecessor không
-- bị rewrite. Xem drizzle/0024_stage12_diagnostic_callback_retry.sql.

-- =====================================================================
-- EVOLVE_STAGE12_CORRECTED_PREMASTER — migration 0025
-- =====================================================================
-- stage12_corrected_pre_master_job liên kết immutable attempt 3 với
-- diagnostic ordinal 2 và QA evidence đã seal. Chỉ diagnostic READY/FAIL
-- mới được làm nguồn; corrected artifact/receipt mới được khóa hash và
-- terminal row cấm UPDATE/DELETE. Xem
-- drizzle/0025_stage12_corrected_pre_master.sql.

-- =====================================================================
-- EVOLVE_STAGE12_AUDIO_P0_CORRECTION — migration 0026
-- =====================================================================
-- stage12_audio_p0_correction_job là correction_ordinal=2 append-only,
-- nhận đúng corrected pre-master strategy v1 READY/FAIL làm predecessor.
-- Lineage khóa source pointer/hash/size/receipt; READY bắt buộc output mới,
-- typed measurements và immutable receipt. DB ép provider_call_count=0,
-- provider_dispatch=OFF, auto_publish=OFF; terminal UPDATE/DELETE bị chặn.
-- Xem drizzle/0026_stage12_audio_p0_correction.sql.

-- =====================================================================
-- EVOLVE_STAGE12_AUDIO_P0_COMMAND_CONTRACT — migration 0027
-- =====================================================================
-- command_log_validate_insert được thay thế theo kiểu append-only migration:
-- toàn bộ command/transition đã có trong 0023 được giữ nguyên, đồng thời bổ sung
-- duy nhất CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION với transition
-- TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL →
-- TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING. Mọi command, state hoặc idempotency
-- key ngoài hợp đồng tiếp tục fail-closed bằng COMMAND_CONTRACT_VIOLATION.
-- Xem drizzle/0027_stage12_audio_p0_command_contract.sql.

-- =====================================================================
-- EVOLVE_STAGE12_AUDIO_P0_CORRECTION_ORDINAL3 — migration 0028
-- =====================================================================
-- stage12_audio_p0_correction_retry_job là lineage append-only từ đúng
-- stage12_audio_p0_correction_job ordinal 2 READY/FAIL. Trigger khóa source
-- R2/SHA/byte length/receipt và exact encoded QA failure; ordinal/strategy đều
-- bằng 3, reason=STAGE12_AUDIO_P0_ENCODED_QA_FAIL. READY bắt buộc artifact,
-- frame-MD5, receipt, report, image digest và measurements; terminal row cấm
-- UPDATE/DELETE. command_log giữ mọi transition cũ và chỉ thêm AUDIO_P0_FAIL →
-- AUDIO_P0_PENDING cho cùng typed command. Xem
-- drizzle/0028_stage12_audio_p0_correction_ordinal_three.sql.

-- =====================================================================
-- EVOLVE_STAGE12_ENCODED_LOUDNESS_FAILURE_OBSERVABILITY — migration 0029
-- =====================================================================
-- stage12_audio_p0_correction_failure_evidence là bảng append-only tách khỏi
-- retry job ordinal 3 đã terminal. Mỗi correction job chỉ có tối đa một row,
-- liên kết exact stage12/source R2/SHA/byte length/receipt và chỉ nhận error
-- STAGE12_ENCODED_LOUDNESS_UNRESOLVED tại boundary hậu kiểm Opus cuối.
-- Row lưu mốc initial, post-pass 1, post-pass 2 và final/pass 3 trong JSON,
-- đồng thời lưu scalar final integrated LUFS, true peak, LRA, exact failed
-- predicates và immutable worker image digest để truy vấn trực tiếp.
-- Trigger kiểm các predicate cuối theo nguyên threshold -14 ±1 LUFS-I,
-- true peak <= -1 dBTP và LRA 4..8 LU; UPDATE/DELETE evidence bị cấm.
-- Migration không backfill, UPDATE hay suy diễn số đo cho ordinal 2/3 cũ.
-- Xem drizzle/0029_stage12_encoded_loudness_failure_observability.sql.

-- =====================================================================
-- EVOLVE_STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY — migration 0030
-- =====================================================================
-- stage12_encoded_loudness_diagnostic_replay_job là execution lineage riêng,
-- chỉ nhận exact source correction ordinal 2 READY/FAIL và exact historical
-- ordinal 3 FAILED:STAGE12_ENCODED_LOUDNESS_UNRESOLVED. Nó không phải correction
-- ordinal 4 hoặc Stage 12 attempt 4 và không thay đổi hai predecessor.
--
-- stage12_encoded_loudness_diagnostic_replay_evidence chỉ INSERT khi replay job
-- chuyển READY. Row khóa source R2/SHA/bytes/receipt, ordinal-3 failure identity,
-- raw/numeric LUFS, true peak, LRA, per-pass failed predicates và audio frame-MD5,
-- terminal correction pass, exact worker image pin, algorithm/threshold hashes,
-- FFmpeg build và libopus fingerprints. Trigger tự tính lại predicate từ threshold
-- -14 ±1 LUFS-I, true peak <= -1 dBTP và LRA 4..8 LU cho source, từng pass và final.
--
-- Job/evidence terminal cấm UPDATE/DELETE; PENDING không được mang result; READY
-- bắt buộc evidence nhất quán; FAILED không được giả lập evidence. Command contract
-- chỉ thêm transition typed LOUDNESS_REPLAY_PENDING. Không provider, calibration,
-- output upload, backfill, Finalize, release hoặc publish.
-- Xem drizzle/0030_stage12_encoded_loudness_diagnostic_replay.sql.

-- =====================================================================
-- EVOLVE_STAGE12_CODEC_SAFE_TRUE_PEAK_CONVERGENCE — migration 0031
-- =====================================================================
-- stage12_codec_safe_true_peak_shadow_job chỉ nhận exact ordinal 2 READY/FAIL,
-- ordinal 3 FAILED:STAGE12_ENCODED_LOUDNESS_UNRESOLVED và diagnostic replay
-- READY/FAIL chứa TRUE_PEAK_DBTP_ABOVE_MAX. Lineage khóa source R2/SHA/bytes/
-- receipt, replay evidence ID, threshold snapshot và expected worker image.
--
-- stage12_codec_safe_true_peak_shadow_evidence lưu canonical pcm_f32le reference,
-- lossless SHA/frame-MD5, candidate pass 0..3, controller parameters, exact
-- post-Opus LUFS/true peak/LRA/predicates và FFmpeg/libopus provenance. Mọi
-- candidate phải trỏ cùng lossless SHA; terminal job/evidence cấm UPDATE/DELETE.
--
-- Migration không backfill hoặc sửa ordinal 2/3/replay history. DB ép output,
-- provider, calibration, finalize, release, production activation và publish OFF.
-- Command contract chỉ thêm typed CODEC_SAFE_SHADOW_PENDING transition.
-- Xem drizzle/0031_stage12_codec_safe_true_peak_shadow.sql.

-- =====================================================================
-- EVOLVE_STAGE12_CODEC_SAFE_LRA_CONVERGENCE_GUARD — migration 0032
-- =====================================================================
-- stage12_codec_safe_lra_guard_shadow_job chỉ nhận exact parent shadow
-- READY/FAIL có candidate pass 1 true-peak-safe/LRA-low và candidate pass 3
-- LRA-high. Lineage khóa ordinal 2/3, diagnostic replay, parent job/evidence,
-- source R2/SHA/bytes/receipt, worker image, threshold, controller và render
-- runtime fingerprints. Mỗi parent evidence chỉ tạo tối đa một guard job.
--
-- stage12_codec_safe_lra_guard_shadow_evidence lưu anchor/high references,
-- controller policy, candidate trace tối đa 8 pass, exact LUFS/true peak/LRA,
-- predicates, rollback selection và parent/current runtime provenance. Trigger
-- khóa steps <= 0.25 LU, macro depth trong bracket, limiter bằng anchor và các
-- side effect luôn false/0/OFF. Terminal READY bắt buộc evidence tương ứng;
-- terminal job/evidence cấm UPDATE/DELETE.
--
-- Migration không backfill hay sửa ordinal 2/3, diagnostic replay hoặc parent
-- shadow. Command contract chỉ thêm typed CODEC_SAFE_LRA_GUARD_SHADOW_PENDING.
-- Xem drizzle/0032_stage12_codec_safe_lra_guard_shadow.sql.

-- =====================================================================
-- EVOLVE_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH — migration 0033
-- =====================================================================
-- stage12_codec_safe_lra_feasibility_search_job chỉ nhận exact immutable
-- correction ordinal 2, true-peak shadow evidence và LRA-guard shadow
-- READY/FAIL:BUDGET_EXHAUSTED có complete response trace pass 0..7, selected
-- candidate pass 5. Lineage khóa source R2/SHA/bytes/receipt, worker image,
-- lossless/frame-MD5, FFmpeg/libopus, algorithm/threshold/controller/render
-- fingerprints. Mỗi LRA-guard evidence chỉ tạo tối đa một feasibility job.
--
-- stage12_codec_safe_lra_feasibility_search_evidence lưu LRA map, seed ranking,
-- post-Opus true-peak containment, LUFS trim, stabilization, final same-artifact
-- verification, safe rollback và budget ledger. Trigger khóa macro domain
-- 10.9..14 dB, phase budgets 8/4/3/2/1/1, tổng candidate <=19, trim step
-- <=0.25 LU và exact control-variable isolation theo phase. READY/PASS chỉ hợp lệ
-- khi cùng candidate đạt đồng thời -15..-13 LUFS-I, <=-1 dBTP và 4..8 LU.
-- Terminal job/evidence cấm UPDATE/DELETE.
--
-- Migration không backfill/sửa ordinal 2/3, true-peak shadow hoặc LRA-guard
-- shadow. Side effects luôn false/0/OFF; không output pointer, correction ordinal
-- 4, Stage 12 attempt 4, provider, calibration, Finalize, activation, release hay
-- publish. Command contract chỉ thêm typed
-- CODEC_SAFE_LRA_FEASIBILITY_SEARCH_PENDING transition. Xem
-- drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql.
