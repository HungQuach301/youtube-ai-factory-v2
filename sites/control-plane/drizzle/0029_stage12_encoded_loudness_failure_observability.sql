CREATE TABLE `stage12_audio_p0_correction_failure_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`correction_ordinal` integer NOT NULL CHECK (`correction_ordinal` = 3),
	`correction_strategy_version` integer NOT NULL CHECK (`correction_strategy_version` = 3),
	`error_code` text NOT NULL CHECK (`error_code` = 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'),
	`failure_boundary` text NOT NULL CHECK (`failure_boundary` = 'FINAL_POST_ENCODE_LOUDNESS_VERIFICATION'),
	`correction_pass` integer NOT NULL CHECK (`correction_pass` = 3),
	`correction_pass_limit` integer NOT NULL CHECK (`correction_pass_limit` = 3),
	`measurements_by_pass_json` text NOT NULL CHECK (json_valid(`measurements_by_pass_json`)),
	`final_integrated_lufs` real NOT NULL,
	`final_true_peak_dbtp` real NOT NULL,
	`final_loudness_range_lu` real NOT NULL,
	`failed_predicates_json` text NOT NULL CHECK (json_valid(`failed_predicates_json`)),
	`worker_image_digest` text NOT NULL CHECK (
		length(`worker_image_digest`) = 71 AND substr(`worker_image_digest`, 1, 7) = 'sha256:'
	),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL CHECK (length(`source_pre_master_sha256`) = 64),
	`source_pre_master_byte_length` integer NOT NULL CHECK (`source_pre_master_byte_length` > 0),
	`source_receipt_sha256` text NOT NULL CHECK (length(`source_receipt_sha256`) = 64),
	`provider_call_count` integer NOT NULL DEFAULT 0 CHECK (`provider_call_count` = 0),
	`provider_dispatch` text NOT NULL DEFAULT 'OFF' CHECK (`provider_dispatch` = 'OFF'),
	`auto_publish` text NOT NULL DEFAULT 'OFF' CHECK (`auto_publish` = 'OFF'),
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_audio_p0_correction_failure_job_unique`
	ON `stage12_audio_p0_correction_failure_evidence` (`correction_job_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_failure_evidence_insert`
BEFORE INSERT ON `stage12_audio_p0_correction_failure_evidence`
WHEN NOT EXISTS (
	SELECT 1 FROM `stage12_audio_p0_correction_retry_job` AS `correction`
	WHERE `correction`.`id` = NEW.`correction_job_id`
		AND `correction`.`stage12_job_id` = NEW.`stage12_job_id`
		AND `correction`.`correction_ordinal` = NEW.`correction_ordinal`
		AND `correction`.`correction_strategy_version` = NEW.`correction_strategy_version`
		AND `correction`.`state` = 'FAILED'
		AND `correction`.`error_code` = NEW.`error_code`
		AND `correction`.`source_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
		AND `correction`.`source_pre_master_sha256` = NEW.`source_pre_master_sha256`
		AND `correction`.`source_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
		AND `correction`.`source_receipt_sha256` = NEW.`source_receipt_sha256`
		AND `correction`.`corrected_pre_master_r2_key` IS NULL
		AND `correction`.`corrected_pre_master_sha256` IS NULL
		AND `correction`.`receipt_sha256` IS NULL
		AND `correction`.`outcome` IS NULL
		AND `correction`.`measurements_json` IS NULL
		AND `correction`.`provider_call_count` = 0
		AND `correction`.`provider_dispatch` = 'OFF'
		AND `correction`.`auto_publish` = 'OFF'
)
	OR json_type(NEW.`measurements_by_pass_json`) <> 'array'
	OR json_array_length(NEW.`measurements_by_pass_json`) <> 4
	OR json_extract(NEW.`measurements_by_pass_json`, '$[0].correctionPass') IS NOT 0
	OR json_extract(NEW.`measurements_by_pass_json`, '$[1].correctionPass') IS NOT 1
	OR json_extract(NEW.`measurements_by_pass_json`, '$[2].correctionPass') IS NOT 2
	OR json_extract(NEW.`measurements_by_pass_json`, '$[3].correctionPass') IS NOT 3
	OR json_extract(NEW.`measurements_by_pass_json`, '$[0].phase') IS NOT 'INITIAL_ENCODED_MEASUREMENT'
	OR json_extract(NEW.`measurements_by_pass_json`, '$[1].phase') IS NOT 'POST_CORRECTION_PASS'
	OR json_extract(NEW.`measurements_by_pass_json`, '$[2].phase') IS NOT 'POST_CORRECTION_PASS'
	OR json_extract(NEW.`measurements_by_pass_json`, '$[3].phase') IS NOT 'FINAL_POST_ENCODE_VERIFICATION'
	OR COALESCE(json_type(NEW.`measurements_by_pass_json`, '$[3].integratedLufs'), '') NOT IN ('integer','real')
	OR COALESCE(json_type(NEW.`measurements_by_pass_json`, '$[3].truePeakDbtp'), '') NOT IN ('integer','real')
	OR COALESCE(json_type(NEW.`measurements_by_pass_json`, '$[3].loudnessRangeLu'), '') NOT IN ('integer','real')
	OR json_extract(NEW.`measurements_by_pass_json`, '$[3].integratedLufs') <> NEW.`final_integrated_lufs`
	OR json_extract(NEW.`measurements_by_pass_json`, '$[3].truePeakDbtp') <> NEW.`final_true_peak_dbtp`
	OR json_extract(NEW.`measurements_by_pass_json`, '$[3].loudnessRangeLu') <> NEW.`final_loudness_range_lu`
	OR json_type(NEW.`failed_predicates_json`) <> 'array'
	OR json_array_length(NEW.`failed_predicates_json`) < 1
	OR EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`)
		WHERE `type` <> 'text' OR `value` NOT IN (
			'INTEGRATED_LUFS_BELOW_MIN', 'INTEGRATED_LUFS_ABOVE_MAX',
			'TRUE_PEAK_DBTP_ABOVE_MAX', 'LOUDNESS_RANGE_LU_BELOW_MIN',
			'LOUDNESS_RANGE_LU_ABOVE_MAX'
		)
	)
	OR ((NEW.`final_integrated_lufs` < -15) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`)
		WHERE `value` = 'INTEGRATED_LUFS_BELOW_MIN'
	))
	OR ((NEW.`final_integrated_lufs` > -13) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`)
		WHERE `value` = 'INTEGRATED_LUFS_ABOVE_MAX'
	))
	OR ((NEW.`final_true_peak_dbtp` > -1) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`)
		WHERE `value` = 'TRUE_PEAK_DBTP_ABOVE_MAX'
	))
	OR ((NEW.`final_loudness_range_lu` < 4) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`)
		WHERE `value` = 'LOUDNESS_RANGE_LU_BELOW_MIN'
	))
	OR ((NEW.`final_loudness_range_lu` > 8) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`)
		WHERE `value` = 'LOUDNESS_RANGE_LU_ABOVE_MAX'
	))
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_FAILURE_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_failure_evidence_immutable_update`
BEFORE UPDATE ON `stage12_audio_p0_correction_failure_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_FAILURE_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_audio_p0_correction_failure_evidence_immutable_delete`
BEFORE DELETE ON `stage12_audio_p0_correction_failure_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_FAILURE_EVIDENCE_IMMUTABLE'); END;
