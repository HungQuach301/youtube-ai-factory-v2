CREATE TABLE `stage12_qa_diagnostic_job` (
	`id` text PRIMARY KEY NOT NULL,
	`stage12_job_id` text NOT NULL,
	`idempotency_key` text NOT NULL CHECK (length(`idempotency_key`) = 64),
	`callback_token_hash` text NOT NULL CHECK (length(`callback_token_hash`) = 64),
	`state` text NOT NULL CHECK (`state` IN ('PENDING', 'READY', 'FAILED')),
	`receipt_r2_key` text,
	`receipt_sha256` text CHECK (`receipt_sha256` IS NULL OR length(`receipt_sha256`) = 64),
	`worker_image_digest` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`stage12_job_id`) REFERENCES `stage12_media_job`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_qa_diagnostic_job_source_unique`
	ON `stage12_qa_diagnostic_job` (`stage12_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_qa_diagnostic_job_key_unique`
	ON `stage12_qa_diagnostic_job` (`idempotency_key`);
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_diagnostic_attempt_three_only`
BEFORE INSERT ON `stage12_qa_diagnostic_job`
WHEN NOT EXISTS (
	SELECT 1 FROM `stage12_media_job` AS `source`
	WHERE `source`.`id` = NEW.`stage12_job_id`
		AND `source`.`attempt_ordinal` = 3
		AND `source`.`state` = 'FAILED'
		AND `source`.`error_code` LIKE 'S12QA:%'
)
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_DIAGNOSTIC_SOURCE_NOT_ELIGIBLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_diagnostic_ready_requires_receipt`
BEFORE UPDATE OF `state` ON `stage12_qa_diagnostic_job`
WHEN NEW.`state` = 'READY' AND (
	NEW.`receipt_r2_key` IS NULL OR NEW.`receipt_sha256` IS NULL OR NEW.`worker_image_digest` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_DIAGNOSTIC_RECEIPT_REQUIRED'); END;
--> statement-breakpoint
CREATE TABLE `stage12_qa_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`source` text NOT NULL CHECK (`source` IN ('CALLBACK', 'DIAGNOSTIC')),
	`outcome` text NOT NULL CHECK (`outcome` IN ('PASS', 'FAIL')),
	`pre_master_r2_key` text NOT NULL CHECK (`pre_master_r2_key` LIKE 'prod/%'),
	`pre_master_sha256` text NOT NULL CHECK (length(`pre_master_sha256`) = 64),
	`receipt_r2_key` text NOT NULL CHECK (`receipt_r2_key` LIKE 'prod/%'),
	`receipt_sha256` text NOT NULL CHECK (length(`receipt_sha256`) = 64),
	`worker_image_digest` text NOT NULL CHECK (`worker_image_digest` GLOB 'sha256:[0-9a-f]*' AND length(`worker_image_digest`) = 71),
	`report_sha256` text NOT NULL CHECK (length(`report_sha256`) = 64),
	`failures_json` text NOT NULL CHECK (json_valid(`failures_json`) AND json_type(`failures_json`) = 'array'),
	`measurements_json` text NOT NULL CHECK (json_valid(`measurements_json`) AND json_type(`measurements_json`) = 'object'),
	`render_authorized` integer NOT NULL CHECK (`render_authorized` IN (0, 1)),
	`provider_call_count` integer NOT NULL CHECK (`provider_call_count` = 0),
	`provider_dispatch` text NOT NULL CHECK (`provider_dispatch` = 'OFF'),
	`auto_publish` text NOT NULL CHECK (`auto_publish` = 'OFF'),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `stage12_media_job`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_qa_evidence_job_source_unique`
	ON `stage12_qa_evidence` (`job_id`,`source`);
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_evidence_immutable_update`
BEFORE UPDATE ON `stage12_qa_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_evidence_immutable_delete`
BEFORE DELETE ON `stage12_qa_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_EVIDENCE_IMMUTABLE'); END;
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
DROP TRIGGER `stage12_media_job_retry_insert`;
--> statement-breakpoint
CREATE TRIGGER `stage12_media_job_retry_insert`
BEFORE INSERT ON `stage12_media_job`
WHEN
  (`NEW`.`attempt_ordinal` = 1 AND `NEW`.`retry_of_job_id` IS NOT NULL)
  OR (`NEW`.`attempt_ordinal` > 1 AND NOT EXISTS (
    SELECT 1 FROM `stage12_media_job` AS `predecessor`
    WHERE `predecessor`.`id` = `NEW`.`retry_of_job_id`
      AND `predecessor`.`package_id` = `NEW`.`package_id`
      AND `predecessor`.`operation_run_id` = `NEW`.`operation_run_id`
      AND `predecessor`.`stage_instance_id` = `NEW`.`stage_instance_id`
      AND `predecessor`.`attempt_ordinal` = `NEW`.`attempt_ordinal` - 1
      AND `predecessor`.`state` = 'FAILED'
      AND `predecessor`.`error_code` IN (
        'MEDIA_TOOL_FAILED',
        'STAGE12_AUDIO_MIX_FAILED',
        'STAGE12_LOUDNESS_ANALYSIS_FAILED',
        'STAGE12_RENDER_FAILED',
        'STAGE12_PROBE_FAILED',
        'STAGE12_TIMELINE_SCAN_FAILED',
        'STAGE12_FINAL_LOUDNESS_FAILED',
        'STAGE12_FINAL_LOUDNESS_CORRECTION_FAILED',
        'STAGE12_FRAME_HASH_FAILED'
      )
  ))
BEGIN
  SELECT RAISE(ABORT, 'STAGE12_RETRY_CONTRACT_VIOLATION');
END;
