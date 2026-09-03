CREATE TABLE `stage12_encoded_loudness_diagnostic_replay_job` (
	`id` text PRIMARY KEY NOT NULL,
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`source_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`historical_failure_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`idempotency_key` text NOT NULL CHECK (length(`idempotency_key`) = 64),
	`callback_token_hash` text NOT NULL CHECK (length(`callback_token_hash`) = 64),
	`actor_identity` text NOT NULL,
	`owner_approval_text` text NOT NULL CHECK (
		`owner_approval_text` = 'RUN STAGE 12 ENCODED LOUDNESS DIAGNOSTIC REPLAY'
	),
	`state` text NOT NULL CHECK (`state` IN ('PENDING','READY','FAILED')),
	`evidence_semantics` text NOT NULL CHECK (
		`evidence_semantics` = 'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL'
	),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL CHECK (length(`source_pre_master_sha256`) = 64),
	`source_pre_master_byte_length` integer NOT NULL CHECK (`source_pre_master_byte_length` > 0),
	`source_receipt_sha256` text NOT NULL CHECK (length(`source_receipt_sha256`) = 64),
	`correction_strategy_version` integer NOT NULL CHECK (`correction_strategy_version` = 3),
	`correction_pass_limit` integer NOT NULL CHECK (`correction_pass_limit` = 3),
	`expected_worker_image_digest` text NOT NULL CHECK (
		length(`expected_worker_image_digest`) = 71
		AND substr(`expected_worker_image_digest`, 1, 7) = 'sha256:'
	),
	`worker_image_digest` text,
	`algorithm_fingerprint` text NOT NULL CHECK (length(`algorithm_fingerprint`) = 64),
	`threshold_snapshot_sha256` text NOT NULL CHECK (length(`threshold_snapshot_sha256`) = 64),
	`replay_outcome` text CHECK (`replay_outcome` IN ('PASS','FAIL')),
	`terminal_correction_pass` integer CHECK (`terminal_correction_pass` BETWEEN 0 AND 3),
	`corrected_output_uploaded` integer NOT NULL DEFAULT 0 CHECK (`corrected_output_uploaded` = 0),
	`historical_backfill` integer NOT NULL DEFAULT 0 CHECK (`historical_backfill` = 0),
	`provider_call_count` integer NOT NULL DEFAULT 0 CHECK (`provider_call_count` = 0),
	`provider_dispatch` text NOT NULL DEFAULT 'OFF' CHECK (`provider_dispatch` = 'OFF'),
	`calibration_executed` integer NOT NULL DEFAULT 0 CHECK (`calibration_executed` = 0),
	`finalize_executed` integer NOT NULL DEFAULT 0 CHECK (`finalize_executed` = 0),
	`release_eligible` integer NOT NULL DEFAULT 0 CHECK (`release_eligible` = 0),
	`auto_publish` text NOT NULL DEFAULT 'OFF' CHECK (`auto_publish` = 'OFF'),
	`error_code` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_encoded_loudness_diagnostic_replay_key_unique`
	ON `stage12_encoded_loudness_diagnostic_replay_job` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_encoded_loudness_diagnostic_replay_failure_unique`
	ON `stage12_encoded_loudness_diagnostic_replay_job` (`historical_failure_job_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_lineage_insert`
BEFORE INSERT ON `stage12_encoded_loudness_diagnostic_replay_job`
WHEN length(NEW.`actor_identity`) < 3
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_audio_p0_correction_job` AS `source`
		WHERE `source`.`id` = NEW.`source_correction_job_id`
			AND `source`.`stage12_job_id` = NEW.`stage12_job_id`
			AND `source`.`correction_ordinal` = 2
			AND `source`.`state` = 'READY' AND `source`.`outcome` = 'FAIL'
			AND `source`.`corrected_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
			AND `source`.`corrected_pre_master_sha256` = NEW.`source_pre_master_sha256`
			AND `source`.`corrected_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
			AND `source`.`receipt_sha256` = NEW.`source_receipt_sha256`
			AND `source`.`provider_call_count` = 0
			AND `source`.`provider_dispatch` = 'OFF'
			AND `source`.`auto_publish` = 'OFF'
	)
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_audio_p0_correction_retry_job` AS `failure`
		WHERE `failure`.`id` = NEW.`historical_failure_job_id`
			AND `failure`.`predecessor_correction_job_id` = NEW.`source_correction_job_id`
			AND `failure`.`stage12_job_id` = NEW.`stage12_job_id`
			AND `failure`.`correction_ordinal` = 3
			AND `failure`.`correction_strategy_version` = 3
			AND `failure`.`state` = 'FAILED'
			AND `failure`.`error_code` = 'STAGE12_ENCODED_LOUDNESS_UNRESOLVED'
			AND `failure`.`source_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
			AND `failure`.`source_pre_master_sha256` = NEW.`source_pre_master_sha256`
			AND `failure`.`source_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
			AND `failure`.`source_receipt_sha256` = NEW.`source_receipt_sha256`
			AND `failure`.`corrected_pre_master_r2_key` IS NULL
			AND `failure`.`corrected_pre_master_sha256` IS NULL
			AND `failure`.`receipt_sha256` IS NULL
			AND `failure`.`outcome` IS NULL
			AND `failure`.`provider_call_count` = 0
			AND `failure`.`provider_dispatch` = 'OFF'
			AND `failure`.`auto_publish` = 'OFF'
	)
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_LINEAGE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_identity_update`
BEFORE UPDATE ON `stage12_encoded_loudness_diagnostic_replay_job`
WHEN OLD.`stage12_job_id` IS NOT NEW.`stage12_job_id`
	OR OLD.`source_correction_job_id` IS NOT NEW.`source_correction_job_id`
	OR OLD.`historical_failure_job_id` IS NOT NEW.`historical_failure_job_id`
	OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
	OR OLD.`callback_token_hash` IS NOT NEW.`callback_token_hash`
	OR OLD.`actor_identity` IS NOT NEW.`actor_identity`
	OR OLD.`owner_approval_text` IS NOT NEW.`owner_approval_text`
	OR OLD.`evidence_semantics` IS NOT NEW.`evidence_semantics`
	OR OLD.`source_pre_master_r2_key` IS NOT NEW.`source_pre_master_r2_key`
	OR OLD.`source_pre_master_sha256` IS NOT NEW.`source_pre_master_sha256`
	OR OLD.`source_pre_master_byte_length` IS NOT NEW.`source_pre_master_byte_length`
	OR OLD.`source_receipt_sha256` IS NOT NEW.`source_receipt_sha256`
	OR OLD.`correction_strategy_version` IS NOT NEW.`correction_strategy_version`
	OR OLD.`correction_pass_limit` IS NOT NEW.`correction_pass_limit`
	OR OLD.`expected_worker_image_digest` IS NOT NEW.`expected_worker_image_digest`
	OR OLD.`algorithm_fingerprint` IS NOT NEW.`algorithm_fingerprint`
	OR OLD.`threshold_snapshot_sha256` IS NOT NEW.`threshold_snapshot_sha256`
	OR OLD.`corrected_output_uploaded` IS NOT NEW.`corrected_output_uploaded`
	OR OLD.`historical_backfill` IS NOT NEW.`historical_backfill`
	OR OLD.`provider_call_count` IS NOT NEW.`provider_call_count`
	OR OLD.`provider_dispatch` IS NOT NEW.`provider_dispatch`
	OR OLD.`calibration_executed` IS NOT NEW.`calibration_executed`
	OR OLD.`finalize_executed` IS NOT NEW.`finalize_executed`
	OR OLD.`release_eligible` IS NOT NEW.`release_eligible`
	OR OLD.`auto_publish` IS NOT NEW.`auto_publish`
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_terminal_shape_update`
BEFORE UPDATE ON `stage12_encoded_loudness_diagnostic_replay_job`
WHEN (NEW.`state` = 'READY' AND (
	NEW.`worker_image_digest` IS NULL
	OR NEW.`worker_image_digest` <> NEW.`expected_worker_image_digest`
	OR NEW.`replay_outcome` IS NULL OR NEW.`terminal_correction_pass` IS NULL
	OR NEW.`error_code` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_encoded_loudness_diagnostic_replay_evidence` AS `evidence`
		WHERE `evidence`.`replay_job_id` = NEW.`id`
			AND `evidence`.`replay_outcome` = NEW.`replay_outcome`
			AND `evidence`.`terminal_correction_pass` = NEW.`terminal_correction_pass`
			AND `evidence`.`worker_image_digest` = NEW.`worker_image_digest`
	)
)) OR (NEW.`state` = 'FAILED' AND (
	NEW.`error_code` IS NULL OR NEW.`worker_image_digest` IS NOT NULL
	OR NEW.`replay_outcome` IS NOT NULL OR NEW.`terminal_correction_pass` IS NOT NULL
	OR EXISTS (SELECT 1 FROM `stage12_encoded_loudness_diagnostic_replay_evidence`
		WHERE `replay_job_id` = NEW.`id`)
)) OR (NEW.`state` = 'PENDING' AND (
	NEW.`error_code` IS NOT NULL OR NEW.`worker_image_digest` IS NOT NULL
	OR NEW.`replay_outcome` IS NOT NULL OR NEW.`terminal_correction_pass` IS NOT NULL
))
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_TERMINAL_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_terminal_immutable_update`
BEFORE UPDATE ON `stage12_encoded_loudness_diagnostic_replay_job`
WHEN OLD.`state` IN ('READY','FAILED')
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_immutable_delete`
BEFORE DELETE ON `stage12_encoded_loudness_diagnostic_replay_job`
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TABLE `stage12_encoded_loudness_diagnostic_replay_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`replay_job_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_job`(`id`),
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`source_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`historical_failure_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`evidence_semantics` text NOT NULL CHECK (
		`evidence_semantics` = 'NEW_REPRODUCTION_NOT_HISTORICAL_BACKFILL'
	),
	`source_baseline_json` text NOT NULL CHECK (json_valid(`source_baseline_json`)),
	`measurements_by_pass_json` text NOT NULL CHECK (json_valid(`measurements_by_pass_json`)),
	`terminal_correction_pass` integer NOT NULL CHECK (`terminal_correction_pass` BETWEEN 0 AND 3),
	`final_integrated_lufs` real NOT NULL,
	`final_integrated_lufs_exact` text NOT NULL,
	`final_true_peak_dbtp` real NOT NULL,
	`final_true_peak_dbtp_exact` text NOT NULL,
	`final_loudness_range_lu` real NOT NULL,
	`final_loudness_range_lu_exact` text NOT NULL,
	`failed_predicates_json` text NOT NULL CHECK (json_valid(`failed_predicates_json`)),
	`replay_outcome` text NOT NULL CHECK (`replay_outcome` IN ('PASS','FAIL')),
	`expected_worker_image_digest` text NOT NULL,
	`worker_image_digest` text NOT NULL,
	`algorithm_fingerprint` text NOT NULL CHECK (length(`algorithm_fingerprint`) = 64),
	`threshold_snapshot_sha256` text NOT NULL CHECK (length(`threshold_snapshot_sha256`) = 64),
	`ffmpeg_version` text NOT NULL,
	`ffmpeg_build_fingerprint` text NOT NULL CHECK (length(`ffmpeg_build_fingerprint`) = 64),
	`libopus_encoder_fingerprint` text NOT NULL CHECK (length(`libopus_encoder_fingerprint`) = 64),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL CHECK (length(`source_pre_master_sha256`) = 64),
	`source_pre_master_byte_length` integer NOT NULL CHECK (`source_pre_master_byte_length` > 0),
	`source_receipt_sha256` text NOT NULL CHECK (length(`source_receipt_sha256`) = 64),
	`corrected_output_uploaded` integer NOT NULL DEFAULT 0 CHECK (`corrected_output_uploaded` = 0),
	`historical_backfill` integer NOT NULL DEFAULT 0 CHECK (`historical_backfill` = 0),
	`provider_call_count` integer NOT NULL DEFAULT 0 CHECK (`provider_call_count` = 0),
	`provider_dispatch` text NOT NULL DEFAULT 'OFF' CHECK (`provider_dispatch` = 'OFF'),
	`calibration_executed` integer NOT NULL DEFAULT 0 CHECK (`calibration_executed` = 0),
	`finalize_executed` integer NOT NULL DEFAULT 0 CHECK (`finalize_executed` = 0),
	`release_eligible` integer NOT NULL DEFAULT 0 CHECK (`release_eligible` = 0),
	`auto_publish` text NOT NULL DEFAULT 'OFF' CHECK (`auto_publish` = 'OFF'),
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_encoded_loudness_diagnostic_replay_evidence_job_unique`
	ON `stage12_encoded_loudness_diagnostic_replay_evidence` (`replay_job_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_evidence_insert`
BEFORE INSERT ON `stage12_encoded_loudness_diagnostic_replay_evidence`
WHEN NOT EXISTS (
	SELECT 1 FROM `stage12_encoded_loudness_diagnostic_replay_job` AS `job`
	WHERE `job`.`id` = NEW.`replay_job_id` AND `job`.`state` = 'PENDING'
		AND `job`.`stage12_job_id` = NEW.`stage12_job_id`
		AND `job`.`source_correction_job_id` = NEW.`source_correction_job_id`
		AND `job`.`historical_failure_job_id` = NEW.`historical_failure_job_id`
		AND `job`.`evidence_semantics` = NEW.`evidence_semantics`
		AND `job`.`source_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
		AND `job`.`source_pre_master_sha256` = NEW.`source_pre_master_sha256`
		AND `job`.`source_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
		AND `job`.`source_receipt_sha256` = NEW.`source_receipt_sha256`
		AND `job`.`expected_worker_image_digest` = NEW.`expected_worker_image_digest`
		AND `job`.`algorithm_fingerprint` = NEW.`algorithm_fingerprint`
		AND `job`.`threshold_snapshot_sha256` = NEW.`threshold_snapshot_sha256`
)
	OR NEW.`worker_image_digest` <> NEW.`expected_worker_image_digest`
	OR length(NEW.`worker_image_digest`) <> 71
	OR substr(NEW.`worker_image_digest`, 1, 7) <> 'sha256:'
	OR length(NEW.`ffmpeg_version`) < 8
	OR json_type(NEW.`source_baseline_json`) <> 'object'
	OR json_extract(NEW.`source_baseline_json`, '$.phase') IS NOT 'SOURCE_ORDINAL2_BASELINE'
	OR COALESCE(json_type(NEW.`source_baseline_json`, '$.integratedLufs'), '') NOT IN ('integer','real')
	OR COALESCE(json_type(NEW.`source_baseline_json`, '$.truePeakDbtp'), '') NOT IN ('integer','real')
	OR COALESCE(json_type(NEW.`source_baseline_json`, '$.loudnessRangeLu'), '') NOT IN ('integer','real')
	OR json_type(NEW.`source_baseline_json`, '$.integratedLufsExact') <> 'text'
	OR json_type(NEW.`source_baseline_json`, '$.truePeakDbtpExact') <> 'text'
	OR json_type(NEW.`source_baseline_json`, '$.loudnessRangeLuExact') <> 'text'
	OR CAST(json_extract(NEW.`source_baseline_json`, '$.integratedLufsExact') AS REAL)
		<> json_extract(NEW.`source_baseline_json`, '$.integratedLufs')
	OR CAST(json_extract(NEW.`source_baseline_json`, '$.truePeakDbtpExact') AS REAL)
		<> json_extract(NEW.`source_baseline_json`, '$.truePeakDbtp')
	OR CAST(json_extract(NEW.`source_baseline_json`, '$.loudnessRangeLuExact') AS REAL)
		<> json_extract(NEW.`source_baseline_json`, '$.loudnessRangeLu')
	OR length(json_extract(NEW.`source_baseline_json`, '$.audioFrameMd5Sha256')) <> 64
	OR json_type(NEW.`source_baseline_json`, '$.failedPredicates') <> 'array'
	OR EXISTS (
		SELECT 1 FROM json_each(json_extract(NEW.`source_baseline_json`, '$.failedPredicates'))
		WHERE `type` <> 'text' OR `value` NOT IN (
			'INTEGRATED_LUFS_BELOW_MIN','INTEGRATED_LUFS_ABOVE_MAX',
			'TRUE_PEAK_DBTP_ABOVE_MAX','LOUDNESS_RANGE_LU_BELOW_MIN',
			'LOUDNESS_RANGE_LU_ABOVE_MAX')
	)
	OR ((json_extract(NEW.`source_baseline_json`, '$.integratedLufs') < -15) <> EXISTS (
		SELECT 1 FROM json_each(json_extract(NEW.`source_baseline_json`, '$.failedPredicates'))
		WHERE `value` = 'INTEGRATED_LUFS_BELOW_MIN'))
	OR ((json_extract(NEW.`source_baseline_json`, '$.integratedLufs') > -13) <> EXISTS (
		SELECT 1 FROM json_each(json_extract(NEW.`source_baseline_json`, '$.failedPredicates'))
		WHERE `value` = 'INTEGRATED_LUFS_ABOVE_MAX'))
	OR ((json_extract(NEW.`source_baseline_json`, '$.truePeakDbtp') > -1) <> EXISTS (
		SELECT 1 FROM json_each(json_extract(NEW.`source_baseline_json`, '$.failedPredicates'))
		WHERE `value` = 'TRUE_PEAK_DBTP_ABOVE_MAX'))
	OR ((json_extract(NEW.`source_baseline_json`, '$.loudnessRangeLu') < 4) <> EXISTS (
		SELECT 1 FROM json_each(json_extract(NEW.`source_baseline_json`, '$.failedPredicates'))
		WHERE `value` = 'LOUDNESS_RANGE_LU_BELOW_MIN'))
	OR ((json_extract(NEW.`source_baseline_json`, '$.loudnessRangeLu') > 8) <> EXISTS (
		SELECT 1 FROM json_each(json_extract(NEW.`source_baseline_json`, '$.failedPredicates'))
		WHERE `value` = 'LOUDNESS_RANGE_LU_ABOVE_MAX'))
	OR json_type(NEW.`measurements_by_pass_json`) <> 'array'
	OR json_array_length(NEW.`measurements_by_pass_json`) <> NEW.`terminal_correction_pass` + 1
	OR EXISTS (
		SELECT 1 FROM json_each(NEW.`measurements_by_pass_json`) AS `measurement`
		WHERE json_extract(`measurement`.`value`, '$.correctionPass') <> `measurement`.`key`
			OR json_extract(`measurement`.`value`, '$.phase') <> CASE
				WHEN `measurement`.`key` = 0 THEN 'INITIAL_ENCODED_MEASUREMENT'
				WHEN `measurement`.`key` = 3 THEN 'FINAL_POST_ENCODE_VERIFICATION'
				ELSE 'POST_CORRECTION_PASS' END
			OR COALESCE(json_type(`measurement`.`value`, '$.integratedLufs'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`measurement`.`value`, '$.truePeakDbtp'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`measurement`.`value`, '$.loudnessRangeLu'), '') NOT IN ('integer','real')
			OR json_type(`measurement`.`value`, '$.integratedLufsExact') <> 'text'
			OR json_type(`measurement`.`value`, '$.truePeakDbtpExact') <> 'text'
			OR json_type(`measurement`.`value`, '$.loudnessRangeLuExact') <> 'text'
			OR CAST(json_extract(`measurement`.`value`, '$.integratedLufsExact') AS REAL)
				<> json_extract(`measurement`.`value`, '$.integratedLufs')
			OR CAST(json_extract(`measurement`.`value`, '$.truePeakDbtpExact') AS REAL)
				<> json_extract(`measurement`.`value`, '$.truePeakDbtp')
			OR CAST(json_extract(`measurement`.`value`, '$.loudnessRangeLuExact') AS REAL)
				<> json_extract(`measurement`.`value`, '$.loudnessRangeLu')
			OR length(json_extract(`measurement`.`value`, '$.audioFrameMd5Sha256')) <> 64
			OR json_type(`measurement`.`value`, '$.failedPredicates') <> 'array'
			OR EXISTS (SELECT 1 FROM json_each(json_extract(`measurement`.`value`, '$.failedPredicates'))
				WHERE `type` <> 'text' OR `value` NOT IN (
					'INTEGRATED_LUFS_BELOW_MIN','INTEGRATED_LUFS_ABOVE_MAX',
					'TRUE_PEAK_DBTP_ABOVE_MAX','LOUDNESS_RANGE_LU_BELOW_MIN',
					'LOUDNESS_RANGE_LU_ABOVE_MAX'))
			OR ((json_extract(`measurement`.`value`, '$.integratedLufs') < -15) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`measurement`.`value`, '$.failedPredicates'))
				WHERE `value` = 'INTEGRATED_LUFS_BELOW_MIN'))
			OR ((json_extract(`measurement`.`value`, '$.integratedLufs') > -13) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`measurement`.`value`, '$.failedPredicates'))
				WHERE `value` = 'INTEGRATED_LUFS_ABOVE_MAX'))
			OR ((json_extract(`measurement`.`value`, '$.truePeakDbtp') > -1) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`measurement`.`value`, '$.failedPredicates'))
				WHERE `value` = 'TRUE_PEAK_DBTP_ABOVE_MAX'))
			OR ((json_extract(`measurement`.`value`, '$.loudnessRangeLu') < 4) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`measurement`.`value`, '$.failedPredicates'))
				WHERE `value` = 'LOUDNESS_RANGE_LU_BELOW_MIN'))
			OR ((json_extract(`measurement`.`value`, '$.loudnessRangeLu') > 8) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`measurement`.`value`, '$.failedPredicates'))
				WHERE `value` = 'LOUDNESS_RANGE_LU_ABOVE_MAX'))
	)
	OR NEW.`final_integrated_lufs` <>
		json_extract(NEW.`measurements_by_pass_json`, '$[' || NEW.`terminal_correction_pass` || '].integratedLufs')
	OR NEW.`final_integrated_lufs_exact` IS NOT
		json_extract(NEW.`measurements_by_pass_json`, '$[' || NEW.`terminal_correction_pass` || '].integratedLufsExact')
	OR NEW.`final_true_peak_dbtp` <>
		json_extract(NEW.`measurements_by_pass_json`, '$[' || NEW.`terminal_correction_pass` || '].truePeakDbtp')
	OR NEW.`final_true_peak_dbtp_exact` IS NOT
		json_extract(NEW.`measurements_by_pass_json`, '$[' || NEW.`terminal_correction_pass` || '].truePeakDbtpExact')
	OR NEW.`final_loudness_range_lu` <>
		json_extract(NEW.`measurements_by_pass_json`, '$[' || NEW.`terminal_correction_pass` || '].loudnessRangeLu')
	OR NEW.`final_loudness_range_lu_exact` IS NOT
		json_extract(NEW.`measurements_by_pass_json`, '$[' || NEW.`terminal_correction_pass` || '].loudnessRangeLuExact')
	OR json_type(NEW.`failed_predicates_json`) <> 'array'
	OR json_array_length(NEW.`failed_predicates_json`) <>
		json_array_length(json_extract(NEW.`measurements_by_pass_json`,
		'$[' || NEW.`terminal_correction_pass` || '].failedPredicates'))
	OR EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`) AS `predicate`
		WHERE `predicate`.`value` NOT IN (
			SELECT `value` FROM json_each(json_extract(NEW.`measurements_by_pass_json`,
			'$[' || NEW.`terminal_correction_pass` || '].failedPredicates'))
		)
	)
	OR ((NEW.`final_integrated_lufs` < -15) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`) WHERE `value` = 'INTEGRATED_LUFS_BELOW_MIN'))
	OR ((NEW.`final_integrated_lufs` > -13) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`) WHERE `value` = 'INTEGRATED_LUFS_ABOVE_MAX'))
	OR ((NEW.`final_true_peak_dbtp` > -1) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`) WHERE `value` = 'TRUE_PEAK_DBTP_ABOVE_MAX'))
	OR ((NEW.`final_loudness_range_lu` < 4) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`) WHERE `value` = 'LOUDNESS_RANGE_LU_BELOW_MIN'))
	OR ((NEW.`final_loudness_range_lu` > 8) <> EXISTS (
		SELECT 1 FROM json_each(NEW.`failed_predicates_json`) WHERE `value` = 'LOUDNESS_RANGE_LU_ABOVE_MAX'))
	OR (NEW.`replay_outcome` = 'PASS' AND json_array_length(NEW.`failed_predicates_json`) <> 0)
	OR (NEW.`replay_outcome` = 'FAIL' AND (
		json_array_length(NEW.`failed_predicates_json`) = 0 OR NEW.`terminal_correction_pass` <> 3))
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_evidence_immutable_update`
BEFORE UPDATE ON `stage12_encoded_loudness_diagnostic_replay_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_encoded_loudness_diagnostic_replay_evidence_immutable_delete`
BEFORE DELETE ON `stage12_encoded_loudness_diagnostic_replay_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY_EVIDENCE_IMMUTABLE'); END;
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
