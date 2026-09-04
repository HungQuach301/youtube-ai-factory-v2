PRAGMA foreign_keys = ON;
--> statement-breakpoint

CREATE TABLE stage12_codec_safe_lra_feasibility_job (
  id TEXT PRIMARY KEY,
  source_correction_ordinal INTEGER NOT NULL CHECK (source_correction_ordinal = 2),
  historical_failure_correction_ordinal INTEGER NOT NULL CHECK (historical_failure_correction_ordinal = 3),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 = '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'),
  parent_evidence_id TEXT NOT NULL CHECK (parent_evidence_id = '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'),
  lra_guard_evidence_id TEXT NOT NULL CHECK (lra_guard_evidence_id = '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'),
  status TEXT NOT NULL CHECK (status IN ('PENDING','READY','FAILED')),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  upload_corrected_output INTEGER NOT NULL DEFAULT 0 CHECK (upload_corrected_output = 0),
  provider_call_count INTEGER NOT NULL DEFAULT 0 CHECK (provider_call_count = 0),
  calibration INTEGER NOT NULL DEFAULT 0 CHECK (calibration = 0),
  finalize INTEGER NOT NULL DEFAULT 0 CHECK (finalize = 0),
  production_activation INTEGER NOT NULL DEFAULT 0 CHECK (production_activation = 0),
  release INTEGER NOT NULL DEFAULT 0 CHECK (release = 0),
  auto_publish INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish = 0),
  created_at TEXT NOT NULL
);
--> statement-breakpoint

CREATE TABLE stage12_codec_safe_lra_feasibility_evidence (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES stage12_codec_safe_lra_feasibility_job(id),
  algorithm_fingerprint TEXT NOT NULL CHECK (length(algorithm_fingerprint) = 64),
  threshold_snapshot_sha256 TEXT NOT NULL CHECK (length(threshold_snapshot_sha256) = 64),
  phase_budget_json TEXT NOT NULL CHECK (json_valid(phase_budget_json)),
  candidate_trace_json TEXT NOT NULL CHECK (json_valid(candidate_trace_json)),
  selected_candidate_sha256 TEXT CHECK (selected_candidate_sha256 IS NULL OR length(selected_candidate_sha256) = 64),
  terminal_reason TEXT NOT NULL CHECK (terminal_reason IN ('PASS','FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED','ENCODE_FAILED','MEASUREMENT_FAILED','LINEAGE_DRIFT')),
  evidence_semantics TEXT NOT NULL CHECK (evidence_semantics = 'CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION'),
  created_at TEXT NOT NULL
);
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_job_no_update BEFORE UPDATE ON stage12_codec_safe_lra_feasibility_job
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER trg_stage12_lra_feasibility_job_no_delete BEFORE DELETE ON stage12_codec_safe_lra_feasibility_job
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER trg_stage12_lra_feasibility_evidence_no_update BEFORE UPDATE ON stage12_codec_safe_lra_feasibility_evidence
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER trg_stage12_lra_feasibility_evidence_no_delete BEFORE DELETE ON stage12_codec_safe_lra_feasibility_evidence
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_EVIDENCE_IMMUTABLE'); END;
