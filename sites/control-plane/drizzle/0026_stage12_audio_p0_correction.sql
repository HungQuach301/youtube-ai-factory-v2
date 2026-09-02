CREATE TABLE `stage12_audio_p0_correction_job` (
	`id` text PRIMARY KEY NOT NULL,
	`predecessor_corrected_pre_master_job_id` text NOT NULL REFERENCES `stage12_corrected_pre_master_job`(`id`),
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`correction_ordinal` integer NOT NULL CHECK (`correction_ordinal` = 2),
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
CREATE UNIQUE INDEX `stage12_audio_p0_correction_predecessor_unique`
	ON `stage12_audio_p0_correction_job` (`predecessor_corrected_pre_master_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_audio_p0_correction_key_unique`
	ON `stage12_audio_p0_correction_job` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_audio_p0_correction_output_hash_unique`
	ON `stage12_audio_p0_correction_job` (`corrected_pre_master_sha256`)
	WHERE `corrected_pre_master_sha256` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_lineage_insert`
BEFORE INSERT ON `stage12_audio_p0_correction_job`
WHEN NEW.`correction_ordinal` <> 2 OR NOT EXISTS (
	SELECT 1 FROM `stage12_corrected_pre_master_job` AS `predecessor`
	WHERE `predecessor`.`id` = NEW.`predecessor_corrected_pre_master_job_id`
		AND `predecessor`.`stage12_job_id` = NEW.`stage12_job_id`
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
		AND length(NEW.`actor_identity`) > 2
)
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_LINEAGE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_terminal_shape_update`
BEFORE UPDATE ON `stage12_audio_p0_correction_job`
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
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_READY_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_terminal_immutable_update`
BEFORE UPDATE ON `stage12_audio_p0_correction_job`
WHEN OLD.`state` IN ('READY','FAILED')
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_TERMINAL_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_immutable_delete`
BEFORE DELETE ON `stage12_audio_p0_correction_job`
BEGIN SELECT RAISE(ABORT, 'STAGE12_AUDIO_P0_CORRECTION_IMMUTABLE'); END;
