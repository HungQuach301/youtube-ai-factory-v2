CREATE TABLE `stage12_audio_p0_correction_retry_job` (
	`id` text PRIMARY KEY NOT NULL,
	`predecessor_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`correction_ordinal` integer NOT NULL CHECK (`correction_ordinal` = 3),
	`correction_strategy_version` integer NOT NULL CHECK (`correction_strategy_version` = 3),
	`retry_reason_code` text NOT NULL CHECK (`retry_reason_code` = 'STAGE12_AUDIO_P0_ENCODED_QA_FAIL'),
	`idempotency_key` text NOT NULL,
	`callback_token_hash` text NOT NULL,
	`actor_identity` text NOT NULL,
	`owner_approval_text` text NOT NULL CHECK (`owner_approval_text` = 'CREATE STAGE 12 AUDIO P0 CORRECTION'),
	`state` text NOT NULL CHECK (`state` IN ('PENDING','READY','FAILED')),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL,
	`source_pre_master_byte_length` integer NOT NULL CHECK (`source_pre_master_byte_length` > 0),
	`source_receipt_sha256` text NOT NULL,
	`corrected_pre_master_r2_key` text,
	`corrected_pre_master_sha256` text,
	`corrected_pre_master_byte_length` integer,
	`corrected_frame_md5_sha256` text,
	`receipt_r2_key` text,
	`receipt_sha256` text,
	`worker_image_digest` text,
	`report_sha256` text,
	`outcome` text CHECK (`outcome` IN ('PASS','FAIL')),
	`failures_json` text,
	`measurements_json` text,
	`provider_call_count` integer NOT NULL DEFAULT 0 CHECK (`provider_call_count` = 0),
	`provider_dispatch` text NOT NULL DEFAULT 'OFF' CHECK (`provider_dispatch` = 'OFF'),
	`auto_publish` text NOT NULL DEFAULT 'OFF' CHECK (`auto_publish` = 'OFF'),
	`error_code` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_audio_p0_correction_retry_predecessor_unique`
	ON `stage12_audio_p0_correction_retry_job` (`predecessor_correction_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_audio_p0_correction_retry_key_unique`
	ON `stage12_audio_p0_correction_retry_job` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_audio_p0_correction_retry_output_hash_unique`
	ON `stage12_audio_p0_correction_retry_job` (`corrected_pre_master_sha256`)
	WHERE `corrected_pre_master_sha256` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_ordinal3_lineage_insert`
BEFORE INSERT ON `stage12_audio_p0_correction_retry_job`
WHEN NEW.`correction_ordinal` <> 3 OR NEW.`correction_strategy_version` <> 3
	OR NEW.`retry_reason_code` <> 'STAGE12_AUDIO_P0_ENCODED_QA_FAIL'
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_audio_p0_correction_job` AS `predecessor`
		WHERE `predecessor`.`id` = NEW.`predecessor_correction_job_id`
			AND `predecessor`.`stage12_job_id` = NEW.`stage12_job_id`
			AND `predecessor`.`correction_ordinal` = 2
			AND `predecessor`.`state` = 'READY'
			AND `predecessor`.`outcome` = 'FAIL'
			AND `predecessor`.`provider_call_count` = 0
			AND `predecessor`.`provider_dispatch` = 'OFF'
			AND `predecessor`.`auto_publish` = 'OFF'
			AND `predecessor`.`corrected_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
			AND `predecessor`.`corrected_pre_master_sha256` = NEW.`source_pre_master_sha256`
			AND `predecessor`.`corrected_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
			AND `predecessor`.`receipt_sha256` = NEW.`source_receipt_sha256`
			AND instr(`predecessor`.`failures_json`, '"TECHNICAL_DEFECT"') > 0
			AND instr(`predecessor`.`failures_json`, '"LOUDNESS"') > 0
			AND instr(`predecessor`.`failures_json`, '"M0_INPUT_RIGHTS_P0"') > 0
			AND json_extract(`predecessor`.`measurements_json`, '$.clippingSampleCount') > 0
			AND json_extract(`predecessor`.`measurements_json`, '$.truePeakDbtp') > -1
			AND json_extract(`predecessor`.`measurements_json`, '$.loudnessRangeLu') < 4
			AND json_extract(`predecessor`.`measurements_json`, '$.p0DefectCount') > 0
			AND length(NEW.`actor_identity`) > 2
	)
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_LINEAGE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_ordinal3_terminal_shape_update`
BEFORE UPDATE ON `stage12_audio_p0_correction_retry_job`
WHEN NEW.`state` = 'READY' AND (
	NEW.`corrected_pre_master_r2_key` IS NULL
	OR NEW.`corrected_pre_master_sha256` IS NULL
	OR NEW.`corrected_pre_master_byte_length` IS NULL
	OR NEW.`corrected_pre_master_byte_length` <= 0
	OR NEW.`corrected_frame_md5_sha256` IS NULL
	OR NEW.`receipt_r2_key` IS NULL OR NEW.`receipt_sha256` IS NULL
	OR NEW.`worker_image_digest` IS NULL OR NEW.`report_sha256` IS NULL
	OR NEW.`outcome` IS NULL OR NEW.`failures_json` IS NULL
	OR NEW.`measurements_json` IS NULL OR NEW.`error_code` IS NOT NULL
	OR NEW.`corrected_pre_master_sha256` = NEW.`source_pre_master_sha256`
	OR NEW.`corrected_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
)
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_READY_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_ordinal3_terminal_immutable_update`
BEFORE UPDATE ON `stage12_audio_p0_correction_retry_job`
WHEN OLD.`state` IN ('READY','FAILED')
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_TERMINAL_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_ordinal3_immutable_delete`
BEFORE DELETE ON `stage12_audio_p0_correction_retry_job`
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_ORDINAL3_IMMUTABLE'); END;
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
