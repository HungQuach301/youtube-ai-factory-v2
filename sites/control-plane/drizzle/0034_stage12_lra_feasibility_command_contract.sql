CREATE TABLE stage12_codec_safe_lra_feasibility_migration_guard (
  migration_id INTEGER PRIMARY KEY CHECK (migration_id = 34),
  preexisting_job_count INTEGER NOT NULL CHECK (preexisting_job_count = 0),
  preexisting_evidence_count INTEGER NOT NULL CHECK (preexisting_evidence_count = 0),
  checked_at TEXT NOT NULL
);
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_migration_guard_empty
BEFORE INSERT ON stage12_codec_safe_lra_feasibility_migration_guard
WHEN EXISTS (SELECT 1 FROM stage12_codec_safe_lra_feasibility_job)
  OR EXISTS (SELECT 1 FROM stage12_codec_safe_lra_feasibility_evidence)
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_PREEXISTING_STATE'); END;
--> statement-breakpoint

INSERT INTO stage12_codec_safe_lra_feasibility_migration_guard
  (migration_id,preexisting_job_count,preexisting_evidence_count,checked_at)
VALUES (34,0,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_migration_guard_no_update
BEFORE UPDATE ON stage12_codec_safe_lra_feasibility_migration_guard
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_MIGRATION_GUARD_IMMUTABLE'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_migration_guard_no_delete
BEFORE DELETE ON stage12_codec_safe_lra_feasibility_migration_guard
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_MIGRATION_GUARD_IMMUTABLE'); END;
--> statement-breakpoint

DROP TRIGGER command_log_validate_insert;
--> statement-breakpoint
CREATE TRIGGER command_log_validate_insert
BEFORE INSERT ON command_log
WHEN length(NEW.idempotency_key) <> 64
  OR (
    (NEW.command_type <> 'PREPARE_CHANNEL' OR NEW.next_state <> 'CHANNEL_PREPARED')
    AND (NEW.command_type <> 'REGISTER_QUALIFIED_VOICE' OR NEW.next_state <> 'VOICE_QUALIFIED')
    AND (NEW.command_type <> 'START_TRACK_G_VIDEO_1_QUALIFICATION'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_00_READY')
    AND (NEW.command_type <> 'START_STAGE'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_00_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_01_READY')
    AND (NEW.command_type <> 'PREPARE_TRACK_G_VIDEO_1_STAGE_04_TOURNAMENT'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_04_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION')
    AND (NEW.command_type <> 'SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_05_READY')
    AND (NEW.command_type <> 'PREPARE_TRACK_G_VIDEO_1_STAGE_06_SCRIPT'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_06_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL')
    AND (NEW.command_type <> 'APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_07A_READY')
    AND (NEW.command_type <> 'PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_07A_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE')
    AND (NEW.command_type <> 'SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_07B_READY')
    AND (NEW.command_type <> 'PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_09_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL')
    AND (NEW.command_type <> 'SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_10_READY')
    AND (NEW.command_type <> 'START_TRACK_G_VIDEO_1_STAGE_10'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_10_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_10_PENDING')
    AND (NEW.command_type <> 'FINALIZE_TRACK_G_VIDEO_1_STAGE_10'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_10_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_11_READY')
    AND (NEW.command_type <> 'START_TRACK_G_VIDEO_1_STAGE_12'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_PENDING')
    AND (NEW.command_type <> 'RECOVER_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_FAILED'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_PENDING')
    AND (NEW.command_type <> 'SCAN_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_FAILED'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_DIAGNOSTIC_PENDING')
    AND (NEW.command_type <> 'CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING'
      OR NEW.prev_state NOT IN (
        'TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL',
        'TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_FAIL'
      ))
    AND (NEW.command_type <> 'RUN_TRACK_G_VIDEO_1_STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_FAIL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_PENDING')
    AND (NEW.command_type <> 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_FAIL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_SHADOW_PENDING')
    AND (NEW.command_type <> 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_SHADOW_FAIL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_PENDING')
    AND (NEW.command_type <> 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING')
    AND (NEW.command_type <> 'FINALIZE_TRACK_G_VIDEO_1_STAGE_12'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_12_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_13_READY')
    AND (NEW.command_type <> 'ADVANCE_TRACK_G_VIDEO_1_STAGE' OR NOT (
      (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_01_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_02_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_02_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_03_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_03_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_04_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_04_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_05_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_05_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_06_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_06_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_07A_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_07A_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_07B_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_07B_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_08_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_08_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_09_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_09_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_10_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_10_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_11_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_11_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_13_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_13_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_14_READY')
      OR (NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_14_READY' AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_15_READY')
    ))
  )
BEGIN SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION'); END;
--> statement-breakpoint

CREATE TABLE stage12_codec_safe_lra_feasibility_dispatch_outbox (
  idempotency_key TEXT PRIMARY KEY
    CHECK (length(idempotency_key) = 64
      AND idempotency_key NOT GLOB '*[^0-9a-f]*'),
  command_id TEXT NOT NULL REFERENCES command_log(id),
  request_payload_json TEXT NOT NULL
    CHECK (json_valid(request_payload_json) AND json_type(request_payload_json) = 'object'),
  request_sha256 TEXT NOT NULL
    CHECK (length(request_sha256) = 64
      AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_attempt_ordinal INTEGER NOT NULL CHECK (source_attempt_ordinal = 3),
  source_correction_ordinal INTEGER NOT NULL CHECK (source_correction_ordinal = 2),
  source_sha256 TEXT NOT NULL
    CHECK (source_sha256 = '163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'),
  parent_evidence_id TEXT NOT NULL
    CHECK (parent_evidence_id = '41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'),
  lra_guard_evidence_id TEXT NOT NULL
    CHECK (lra_guard_evidence_id = '4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'),
  expected_worker_image_digest TEXT NOT NULL
    CHECK (length(expected_worker_image_digest) = 71
      AND substr(expected_worker_image_digest, 1, 7) = 'sha256:'
      AND substr(expected_worker_image_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  algorithm_fingerprint TEXT NOT NULL
    CHECK (length(algorithm_fingerprint) = 64
      AND algorithm_fingerprint NOT GLOB '*[^0-9a-f]*'),
  threshold_snapshot_sha256 TEXT NOT NULL
    CHECK (length(threshold_snapshot_sha256) = 64
      AND threshold_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_dispatch_outbox_command_unique
ON stage12_codec_safe_lra_feasibility_dispatch_outbox(command_id);
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_dispatch_outbox_lineage_unique
ON stage12_codec_safe_lra_feasibility_dispatch_outbox(
  source_sha256, parent_evidence_id, lra_guard_evidence_id
);
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_job_lineage_unique
ON stage12_codec_safe_lra_feasibility_job(
  source_sha256, parent_evidence_id, lra_guard_evidence_id
);
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_job_pending_rejected
BEFORE INSERT ON stage12_codec_safe_lra_feasibility_job
WHEN NEW.status = 'PENDING'
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_PENDING_MUST_USE_OUTBOX'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_outbox_command
BEFORE INSERT ON stage12_codec_safe_lra_feasibility_dispatch_outbox
WHEN NOT EXISTS (
  SELECT 1 FROM command_log
  WHERE id = NEW.command_id
    AND idempotency_key = NEW.idempotency_key
    AND command_type = 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH'
    AND prev_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL'
    AND next_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_PENDING'
)
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_OUTBOX_COMMAND_INVALID'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_outbox_no_update
BEFORE UPDATE ON stage12_codec_safe_lra_feasibility_dispatch_outbox
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_OUTBOX_IMMUTABLE'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_outbox_no_delete
BEFORE DELETE ON stage12_codec_safe_lra_feasibility_dispatch_outbox
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_OUTBOX_IMMUTABLE'); END;
--> statement-breakpoint

CREATE TABLE stage12_codec_safe_lra_feasibility_terminal_receipt (
  idempotency_key TEXT PRIMARY KEY
    REFERENCES stage12_codec_safe_lra_feasibility_dispatch_outbox(idempotency_key),
  request_sha256 TEXT NOT NULL
    CHECK (length(request_sha256) = 64
      AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
  lease_holder TEXT NOT NULL CHECK (length(lease_holder) BETWEEN 1 AND 160),
  terminal_receipt_sha256 TEXT NOT NULL
    CHECK (length(terminal_receipt_sha256) = 64
      AND terminal_receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
  result_sha256 TEXT NOT NULL
    CHECK (length(result_sha256) = 64
      AND result_sha256 NOT GLOB '*[^0-9a-f]*'),
  job_id TEXT NOT NULL UNIQUE
    REFERENCES stage12_codec_safe_lra_feasibility_job(id),
  evidence_id TEXT NOT NULL UNIQUE
    REFERENCES stage12_codec_safe_lra_feasibility_evidence(id),
  job_status TEXT NOT NULL CHECK (job_status IN ('READY', 'FAILED')),
  outcome TEXT NOT NULL CHECK (outcome IN ('PASS', 'FAIL')),
  terminal_reason TEXT NOT NULL CHECK (terminal_reason IN (
    'PASS',
    'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
    'ENCODE_FAILED',
    'MEASUREMENT_FAILED',
    'LINEAGE_DRIFT'
  )),
  selected_candidate_sha256 TEXT
    CHECK (selected_candidate_sha256 IS NULL
      OR (length(selected_candidate_sha256) = 64
        AND selected_candidate_sha256 NOT GLOB '*[^0-9a-f]*')),
  algorithm_fingerprint TEXT NOT NULL
    CHECK (length(algorithm_fingerprint) = 64
      AND algorithm_fingerprint NOT GLOB '*[^0-9a-f]*'),
  threshold_snapshot_sha256 TEXT NOT NULL
    CHECK (length(threshold_snapshot_sha256) = 64
      AND threshold_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  worker_image_digest TEXT NOT NULL
    CHECK (length(worker_image_digest) = 71
      AND substr(worker_image_digest, 1, 7) = 'sha256:'
      AND substr(worker_image_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  parent_runtime_provenance_sha256 TEXT NOT NULL
    CHECK (length(parent_runtime_provenance_sha256) = 64
      AND parent_runtime_provenance_sha256 NOT GLOB '*[^0-9a-f]*'),
  runtime_provenance_sha256 TEXT NOT NULL
    CHECK (length(runtime_provenance_sha256) = 64
      AND runtime_provenance_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  CHECK (
    (job_status = 'READY' AND terminal_reason IN (
      'PASS', 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED'
    ))
    OR (job_status = 'FAILED' AND terminal_reason IN (
      'ENCODE_FAILED', 'MEASUREMENT_FAILED', 'LINEAGE_DRIFT'
    ))
  ),
  CHECK (
    (outcome = 'PASS' AND terminal_reason = 'PASS')
    OR (outcome = 'FAIL' AND terminal_reason <> 'PASS')
  ),
  CHECK (
    (job_status = 'READY' AND selected_candidate_sha256 IS NOT NULL)
    OR (job_status = 'FAILED' AND selected_candidate_sha256 IS NULL)
  )
);
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_terminal_receipt_validate
BEFORE INSERT ON stage12_codec_safe_lra_feasibility_terminal_receipt
WHEN NOT EXISTS (
  SELECT 1
  FROM stage12_codec_safe_lra_feasibility_dispatch_outbox AS outbox
  JOIN stage12_codec_safe_lra_feasibility_job AS job
    ON job.id = NEW.job_id
    AND job.source_sha256 = outbox.source_sha256
    AND job.parent_evidence_id = outbox.parent_evidence_id
    AND job.lra_guard_evidence_id = outbox.lra_guard_evidence_id
    AND job.status = NEW.job_status
  JOIN stage12_codec_safe_lra_feasibility_evidence AS evidence
    ON evidence.id = NEW.evidence_id
    AND evidence.job_id = job.id
    AND evidence.algorithm_fingerprint = NEW.algorithm_fingerprint
    AND evidence.threshold_snapshot_sha256 = NEW.threshold_snapshot_sha256
    AND evidence.terminal_reason = NEW.terminal_reason
    AND evidence.selected_candidate_sha256 IS NEW.selected_candidate_sha256
    AND json_extract(evidence.candidate_trace_json, '$.outcome') = NEW.outcome
    AND json_extract(evidence.candidate_trace_json, '$.terminalReceiptSha256')
      = NEW.terminal_receipt_sha256
    AND json_extract(evidence.candidate_trace_json, '$.resultSha256')
      = NEW.result_sha256
    AND json_extract(evidence.candidate_trace_json, '$.parentRuntimeProvenanceSha256')
      = NEW.parent_runtime_provenance_sha256
    AND json_extract(evidence.candidate_trace_json, '$.runtimeProvenanceSha256')
      = NEW.runtime_provenance_sha256
  JOIN stage12_codec_safe_lra_feasibility_dispatch_event AS claim
    ON claim.idempotency_key = outbox.idempotency_key
    AND claim.event_type = 'CLAIMED'
    AND claim.fencing_token = NEW.fencing_token
    AND claim.lease_holder = NEW.lease_holder
  WHERE outbox.idempotency_key = NEW.idempotency_key
    AND outbox.request_sha256 = NEW.request_sha256
    AND outbox.algorithm_fingerprint = NEW.algorithm_fingerprint
    AND outbox.threshold_snapshot_sha256 = NEW.threshold_snapshot_sha256
    AND outbox.expected_worker_image_digest = NEW.worker_image_digest
    AND NEW.fencing_token = (
      SELECT MAX(current_claim.fencing_token)
      FROM stage12_codec_safe_lra_feasibility_dispatch_event AS current_claim
      WHERE current_claim.idempotency_key = NEW.idempotency_key
        AND current_claim.event_type = 'CLAIMED'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM stage12_codec_safe_lra_feasibility_dispatch_event AS terminal_fence
      WHERE terminal_fence.idempotency_key = NEW.idempotency_key
        AND terminal_fence.fencing_token = NEW.fencing_token
        AND terminal_fence.event_type IN (
          'RECONCILED_EXPIRED', 'DISPATCH_REJECTED'
        )
    )
    AND julianday('now') < (
      SELECT MAX(julianday(active_lease.lease_expires_at))
      FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
      WHERE active_lease.idempotency_key = NEW.idempotency_key
        AND active_lease.fencing_token = NEW.fencing_token
        AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
    )
)
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_TERMINAL_RECEIPT_INVALID'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_terminal_receipt_no_update
BEFORE UPDATE ON stage12_codec_safe_lra_feasibility_terminal_receipt
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_TERMINAL_RECEIPT_IMMUTABLE'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_terminal_receipt_no_delete
BEFORE DELETE ON stage12_codec_safe_lra_feasibility_terminal_receipt
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_TERMINAL_RECEIPT_IMMUTABLE'); END;
--> statement-breakpoint

CREATE TABLE stage12_codec_safe_lra_feasibility_dispatch_event (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL
    REFERENCES stage12_codec_safe_lra_feasibility_dispatch_outbox(idempotency_key),
  event_ordinal INTEGER NOT NULL CHECK (event_ordinal >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CLAIMED',
    'DISPATCH_ACCEPTED',
    'DISPATCH_AMBIGUOUS',
    'DISPATCH_REJECTED',
    'RECONCILED_PRESENT',
    'RECONCILED_EXPIRED',
    'LEASE_RENEWED',
    'CALLBACK_TERMINAL'
  )),
  fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
  lease_holder TEXT NOT NULL CHECK (length(lease_holder) BETWEEN 1 AND 160),
  lease_expires_at TEXT,
  payload_json TEXT NOT NULL
    CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  payload_sha256 TEXT NOT NULL
    CHECK (length(payload_sha256) = 64
      AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  CHECK (
    (event_type IN ('CLAIMED', 'LEASE_RENEWED')
      AND lease_expires_at IS NOT NULL
      AND julianday(created_at) IS NOT NULL
      AND julianday(lease_expires_at) IS NOT NULL
      AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
      AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_expires_at) = lease_expires_at
      AND round((julianday(lease_expires_at) - julianday(created_at)) * 86400000) = 90000)
    OR (event_type NOT IN ('CLAIMED', 'LEASE_RENEWED') AND lease_expires_at IS NULL)
  ),
  CHECK (julianday(created_at) IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at)
);
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_dispatch_event_ordinal_unique
ON stage12_codec_safe_lra_feasibility_dispatch_event(idempotency_key, event_ordinal);
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_dispatch_event_type_unique
ON stage12_codec_safe_lra_feasibility_dispatch_event(
  idempotency_key, fencing_token, event_type
)
WHERE event_type <> 'LEASE_RENEWED';
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_dispatch_heartbeat_unique
ON stage12_codec_safe_lra_feasibility_dispatch_event(
  idempotency_key, fencing_token, json_extract(payload_json, '$.heartbeatId')
)
WHERE event_type = 'LEASE_RENEWED';
--> statement-breakpoint

CREATE UNIQUE INDEX stage12_lra_feasibility_dispatch_event_terminal_unique
ON stage12_codec_safe_lra_feasibility_dispatch_event(idempotency_key)
WHERE event_type IN ('CALLBACK_TERMINAL', 'DISPATCH_REJECTED');
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_dispatch_event_transition
BEFORE INSERT ON stage12_codec_safe_lra_feasibility_dispatch_event
BEGIN
  SELECT CASE WHEN NEW.event_type IN ('CLAIMED', 'LEASE_RENEWED')
    AND julianday(NEW.lease_expires_at) <= julianday('now')
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_LEASE_ALREADY_EXPIRED') END;

  SELECT CASE WHEN abs((julianday(NEW.created_at) - julianday('now')) * 86400) > 30
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_EVENT_CLOCK_DRIFT') END;

  SELECT CASE WHEN NEW.event_ordinal <> COALESCE((
    SELECT MAX(event_ordinal) + 1
    FROM stage12_codec_safe_lra_feasibility_dispatch_event
    WHERE idempotency_key = NEW.idempotency_key
  ), 1)
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_EVENT_ORDINAL_INVALID') END;

  SELECT CASE WHEN julianday(NEW.created_at) < COALESCE((
    SELECT MAX(julianday(previous.created_at))
    FROM stage12_codec_safe_lra_feasibility_dispatch_event AS previous
    WHERE previous.idempotency_key = NEW.idempotency_key
  ), julianday(NEW.created_at))
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_EVENT_TIME_REGRESSION') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM stage12_codec_safe_lra_feasibility_dispatch_event AS rejected
    WHERE rejected.idempotency_key = NEW.idempotency_key
      AND rejected.event_type = 'DISPATCH_REJECTED'
  )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_REJECTED_TERMINAL') END;

  SELECT CASE WHEN NEW.event_type NOT IN ('CALLBACK_TERMINAL', 'DISPATCH_REJECTED')
    AND EXISTS (
      SELECT 1
      FROM stage12_codec_safe_lra_feasibility_dispatch_outbox AS outbox
      JOIN stage12_codec_safe_lra_feasibility_job AS job
        ON job.source_sha256 = outbox.source_sha256
        AND job.parent_evidence_id = outbox.parent_evidence_id
        AND job.lra_guard_evidence_id = outbox.lra_guard_evidence_id
      JOIN stage12_codec_safe_lra_feasibility_evidence AS evidence
        ON evidence.job_id = job.id
      WHERE outbox.idempotency_key = NEW.idempotency_key
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_ALREADY_TERMINAL') END;

  SELECT CASE WHEN NEW.event_type = 'CLAIMED'
    AND NOT EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key AND event_type = 'CLAIMED'
    )
    AND NEW.fencing_token <> 1
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_FENCE_INVALID') END;

  SELECT CASE WHEN NEW.event_type = 'CLAIMED'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key AND event_type = 'CLAIMED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event AS absent
      WHERE absent.idempotency_key = NEW.idempotency_key
        AND absent.event_type IN ('RECONCILED_EXPIRED')
        AND absent.fencing_token = (
          SELECT MAX(claim.fencing_token)
          FROM stage12_codec_safe_lra_feasibility_dispatch_event AS claim
          WHERE claim.idempotency_key = NEW.idempotency_key
            AND claim.event_type = 'CLAIMED'
        )
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_LEASE_HELD') END;

  SELECT CASE WHEN NEW.event_type = 'CLAIMED'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key AND event_type = 'CLAIMED'
    )
    AND NEW.fencing_token <> 1 + (
      SELECT MAX(fencing_token)
      FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key AND event_type = 'CLAIMED'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_FENCE_INVALID') END;

  SELECT CASE WHEN NEW.event_type <> 'CLAIMED'
    AND NEW.fencing_token <> COALESCE((
      SELECT MAX(fencing_token)
      FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key AND event_type = 'CLAIMED'
    ), 0)
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_STALE_FENCE') END;

  SELECT CASE WHEN NEW.event_type <> 'CLAIMED'
    AND NEW.lease_holder <> COALESCE((
      SELECT lease_holder
      FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND event_type = 'CLAIMED'
        AND fencing_token = NEW.fencing_token
      LIMIT 1
    ), '')
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_LEASE_HOLDER_MISMATCH') END;

  SELECT CASE WHEN NEW.event_type = 'LEASE_RENEWED'
    AND (
      (SELECT COUNT(*) FROM json_each(NEW.payload_json)) <> 3
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.payload_json)
        WHERE key NOT IN ('heartbeatId', 'heartbeatSequence', 'requestSha256')
      )
      OR json_type(NEW.payload_json, '$.heartbeatId') IS NOT 'text'
      OR length(json_extract(NEW.payload_json, '$.heartbeatId')) <> 64
      OR json_extract(NEW.payload_json, '$.heartbeatId') GLOB '*[^0-9a-f]*'
      OR json_type(NEW.payload_json, '$.heartbeatSequence') IS NOT 'integer'
      OR json_extract(NEW.payload_json, '$.heartbeatSequence') <> 1 + (
        SELECT COUNT(*)
        FROM stage12_codec_safe_lra_feasibility_dispatch_event AS heartbeat
        WHERE heartbeat.idempotency_key = NEW.idempotency_key
          AND heartbeat.fencing_token = NEW.fencing_token
          AND heartbeat.event_type = 'LEASE_RENEWED'
      )
      OR json_type(NEW.payload_json, '$.requestSha256') IS NOT 'text'
      OR json_extract(NEW.payload_json, '$.requestSha256') IS NOT (
        SELECT request_sha256
        FROM stage12_codec_safe_lra_feasibility_dispatch_outbox
        WHERE idempotency_key = NEW.idempotency_key
      )
      OR
      EXISTS (
        SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
        WHERE idempotency_key = NEW.idempotency_key
          AND fencing_token = NEW.fencing_token
          AND event_type IN (
            'RECONCILED_EXPIRED',
            'DISPATCH_REJECTED', 'CALLBACK_TERMINAL'
          )
      )
      OR julianday(NEW.created_at) >= COALESCE((
        SELECT MAX(julianday(active_lease.lease_expires_at))
        FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
        WHERE active_lease.idempotency_key = NEW.idempotency_key
          AND active_lease.fencing_token = NEW.fencing_token
          AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
      ), julianday('0001-01-01T00:00:00.000Z'))
      OR julianday('now') >= COALESCE((
        SELECT MAX(julianday(active_lease.lease_expires_at))
        FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
        WHERE active_lease.idempotency_key = NEW.idempotency_key
          AND active_lease.fencing_token = NEW.fencing_token
          AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
      ), julianday('0001-01-01T00:00:00.000Z'))
      OR julianday(NEW.lease_expires_at) <= COALESCE((
        SELECT MAX(julianday(active_lease.lease_expires_at))
        FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
        WHERE active_lease.idempotency_key = NEW.idempotency_key
          AND active_lease.fencing_token = NEW.fencing_token
          AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
      ), julianday('9999-12-31T23:59:59.999Z'))
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_LEASE_RENEWAL_INVALID') END;

  SELECT CASE WHEN NEW.event_type = 'RECONCILED_EXPIRED'
    AND (
      (SELECT COUNT(*) FROM json_each(NEW.payload_json)) <> 4
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.payload_json)
        WHERE key NOT IN (
          'observedAt', 'observedState', 'requestSha256', 'workerStatusSha256'
        )
      )
      OR json_extract(NEW.payload_json, '$.requestSha256') IS NOT (
        SELECT request_sha256
        FROM stage12_codec_safe_lra_feasibility_dispatch_outbox
        WHERE idempotency_key = NEW.idempotency_key
      )
      OR json_extract(NEW.payload_json, '$.observedAt') IS NOT NEW.created_at
      OR json_type(NEW.payload_json, '$.observedState') IS NOT 'text'
      OR json_extract(NEW.payload_json, '$.observedState') NOT IN (
        'NOT_FOUND', 'RUNNING', 'TERMINAL_PENDING_CALLBACK'
      )
      OR json_type(NEW.payload_json, '$.workerStatusSha256') IS NOT 'text'
      OR length(json_extract(NEW.payload_json, '$.workerStatusSha256')) <> 64
      OR json_extract(NEW.payload_json, '$.workerStatusSha256') GLOB '*[^0-9a-f]*'
      OR
      julianday(NEW.created_at) < COALESCE((
        SELECT MAX(julianday(active_lease.lease_expires_at))
        FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
        WHERE active_lease.idempotency_key = NEW.idempotency_key
          AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
          AND active_lease.fencing_token = NEW.fencing_token
      ), julianday('9999-12-31T23:59:59.999Z'))
      OR julianday('now') < COALESCE((
        SELECT MAX(julianday(active_lease.lease_expires_at))
        FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
        WHERE active_lease.idempotency_key = NEW.idempotency_key
          AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
          AND active_lease.fencing_token = NEW.fencing_token
      ), julianday('9999-12-31T23:59:59.999Z'))
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_LEASE_NOT_EXPIRED') END;

  SELECT CASE WHEN NEW.event_type = 'CALLBACK_TERMINAL'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type = 'RECONCILED_EXPIRED'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_LEASE_DEADLINE_TERMINAL') END;

  SELECT CASE WHEN NEW.event_type = 'CALLBACK_TERMINAL'
    AND julianday('now') >= COALESCE((
      SELECT MAX(julianday(active_lease.lease_expires_at))
      FROM stage12_codec_safe_lra_feasibility_dispatch_event AS active_lease
      WHERE active_lease.idempotency_key = NEW.idempotency_key
        AND active_lease.fencing_token = NEW.fencing_token
        AND active_lease.event_type IN ('CLAIMED', 'LEASE_RENEWED')
    ), julianday('0001-01-01T00:00:00.000Z'))
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_RECONCILED_EXPIRED_TERMINAL') END;

  SELECT CASE WHEN NEW.event_type IN (
      'RECONCILED_PRESENT', 'RECONCILED_EXPIRED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type IN ('CLAIMED', 'DISPATCH_AMBIGUOUS', 'DISPATCH_ACCEPTED')
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_RECONCILIATION_INVALID') END;

  SELECT CASE WHEN NEW.event_type = 'RECONCILED_PRESENT'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type = 'RECONCILED_EXPIRED'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_RECONCILIATION_CONFLICT') END;

  SELECT CASE WHEN NEW.event_type IN (
      'DISPATCH_ACCEPTED', 'DISPATCH_AMBIGUOUS', 'DISPATCH_REJECTED',
      'RECONCILED_PRESENT'
    )
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type = 'RECONCILED_EXPIRED'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_RECONCILIATION_CONFLICT') END;

  SELECT CASE WHEN NEW.event_type = 'DISPATCH_ACCEPTED'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type = 'DISPATCH_AMBIGUOUS'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_STATE_CONFLICT') END;

  SELECT CASE WHEN NEW.event_type = 'DISPATCH_AMBIGUOUS'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type = 'DISPATCH_ACCEPTED'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_STATE_CONFLICT') END;

  SELECT CASE WHEN NEW.event_type = 'DISPATCH_REJECTED'
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type IN (
          'DISPATCH_ACCEPTED', 'DISPATCH_AMBIGUOUS',
          'RECONCILED_PRESENT', 'RECONCILED_EXPIRED',
          'CALLBACK_TERMINAL'
        )
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_STATE_CONFLICT') END;

  SELECT CASE WHEN NEW.event_type IN ('DISPATCH_ACCEPTED', 'DISPATCH_AMBIGUOUS')
    AND EXISTS (
      SELECT 1 FROM stage12_codec_safe_lra_feasibility_dispatch_event
      WHERE idempotency_key = NEW.idempotency_key
        AND fencing_token = NEW.fencing_token
        AND event_type = 'DISPATCH_REJECTED'
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_STATE_CONFLICT') END;

  SELECT CASE WHEN NEW.event_type IN ('CALLBACK_TERMINAL', 'DISPATCH_REJECTED')
    AND NOT EXISTS (
      SELECT 1
      FROM stage12_codec_safe_lra_feasibility_terminal_receipt AS receipt
      WHERE receipt.idempotency_key = NEW.idempotency_key
        AND receipt.fencing_token = NEW.fencing_token
        AND receipt.lease_holder = NEW.lease_holder
        AND json_extract(NEW.payload_json, '$.requestSha256') = receipt.request_sha256
        AND json_extract(NEW.payload_json, '$.terminalReceiptSha256')
          = receipt.terminal_receipt_sha256
        AND json_extract(NEW.payload_json, '$.resultSha256') = receipt.result_sha256
        AND json_extract(NEW.payload_json, '$.jobId') = receipt.job_id
        AND json_extract(NEW.payload_json, '$.evidenceId') = receipt.evidence_id
        AND json_extract(NEW.payload_json, '$.jobStatus') = receipt.job_status
        AND json_extract(NEW.payload_json, '$.outcome') = receipt.outcome
        AND json_extract(NEW.payload_json, '$.terminalReason') = receipt.terminal_reason
        AND (
          (receipt.selected_candidate_sha256 IS NULL
            AND json_type(NEW.payload_json, '$.selectedCandidateSha256') = 'null')
          OR json_extract(NEW.payload_json, '$.selectedCandidateSha256')
            = receipt.selected_candidate_sha256
        )
        AND json_extract(NEW.payload_json, '$.algorithmFingerprint')
          = receipt.algorithm_fingerprint
        AND json_extract(NEW.payload_json, '$.thresholdSnapshotSha256')
          = receipt.threshold_snapshot_sha256
        AND json_extract(NEW.payload_json, '$.workerImageDigest')
          = receipt.worker_image_digest
        AND json_extract(NEW.payload_json, '$.parentRuntimeProvenanceSha256')
          = receipt.parent_runtime_provenance_sha256
        AND json_extract(NEW.payload_json, '$.runtimeProvenanceSha256')
          = receipt.runtime_provenance_sha256
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_TERMINAL_RECEIPT_MISSING') END;

  SELECT CASE WHEN NEW.event_type = 'DISPATCH_REJECTED'
    AND NOT EXISTS (
      SELECT 1
      FROM stage12_codec_safe_lra_feasibility_terminal_receipt AS receipt
      WHERE receipt.idempotency_key = NEW.idempotency_key
        AND receipt.fencing_token = NEW.fencing_token
        AND receipt.lease_holder = NEW.lease_holder
        AND receipt.job_status = 'FAILED'
        AND receipt.outcome = 'FAIL'
        AND receipt.terminal_reason = 'LINEAGE_DRIFT'
        AND receipt.selected_candidate_sha256 IS NULL
    )
  THEN RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_REJECTION_RECEIPT_INVALID') END;
END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_dispatch_event_no_update
BEFORE UPDATE ON stage12_codec_safe_lra_feasibility_dispatch_event
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_EVENT_IMMUTABLE'); END;
--> statement-breakpoint

CREATE TRIGGER trg_stage12_lra_feasibility_dispatch_event_no_delete
BEFORE DELETE ON stage12_codec_safe_lra_feasibility_dispatch_event
BEGIN SELECT RAISE(ABORT, 'STAGE12_LRA_FEASIBILITY_DISPATCH_EVENT_IMMUTABLE'); END;
