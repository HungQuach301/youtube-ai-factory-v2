CREATE TABLE `stage12_codec_safe_lra_guard_shadow_job` (
	`id` text PRIMARY KEY NOT NULL,
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`source_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`historical_failure_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`diagnostic_replay_job_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_job`(`id`),
	`diagnostic_replay_evidence_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_evidence`(`id`),
	`parent_shadow_job_id` text NOT NULL REFERENCES `stage12_codec_safe_true_peak_shadow_job`(`id`),
	`parent_shadow_evidence_id` text NOT NULL REFERENCES `stage12_codec_safe_true_peak_shadow_evidence`(`id`),
	`idempotency_key` text NOT NULL CHECK (length(`idempotency_key`) = 64),
	`callback_token_hash` text NOT NULL CHECK (length(`callback_token_hash`) = 64),
	`actor_identity` text NOT NULL,
	`owner_approval_text` text NOT NULL CHECK (
		`owner_approval_text` = 'RUN STAGE 12 CODEC SAFE LRA GUARD SHADOW REPLAY'
	),
	`state` text NOT NULL CHECK (`state` IN ('PENDING','READY','FAILED')),
	`evidence_semantics` text NOT NULL CHECK (
		`evidence_semantics` = 'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION'
	),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL CHECK (length(`source_pre_master_sha256`) = 64),
	`source_pre_master_byte_length` integer NOT NULL CHECK (`source_pre_master_byte_length` > 0),
	`source_receipt_sha256` text NOT NULL CHECK (length(`source_receipt_sha256`) = 64),
	`expected_worker_image_digest` text NOT NULL CHECK (
		length(`expected_worker_image_digest`) = 71
		AND substr(`expected_worker_image_digest`, 1, 7) = 'sha256:'
	),
	`parent_worker_image_digest` text NOT NULL CHECK (
		length(`parent_worker_image_digest`) = 71
		AND substr(`parent_worker_image_digest`, 1, 7) = 'sha256:'
	),
	`worker_image_digest` text,
	`algorithm_fingerprint` text NOT NULL CHECK (length(`algorithm_fingerprint`) = 64),
	`threshold_snapshot_sha256` text NOT NULL CHECK (length(`threshold_snapshot_sha256`) = 64),
	`controller_policy_sha256` text NOT NULL CHECK (length(`controller_policy_sha256`) = 64),
	`render_kernel_fingerprint` text NOT NULL CHECK (length(`render_kernel_fingerprint`) = 64),
	`parent_render_runtime_fingerprint` text NOT NULL CHECK (length(`parent_render_runtime_fingerprint`) = 64),
	`render_runtime_fingerprint` text,
	`shadow_outcome` text CHECK (`shadow_outcome` IN ('PASS','FAIL')),
	`terminal_reason` text CHECK (`terminal_reason` IN (
		'PASS','ANCHOR_REPRODUCTION_DRIFT','BUDGET_EXHAUSTED'
	)),
	`last_evaluated_candidate_pass` integer CHECK (`last_evaluated_candidate_pass` BETWEEN 0 AND 7),
	`best_safe_candidate_pass` integer CHECK (`best_safe_candidate_pass` BETWEEN 0 AND 7),
	`selected_candidate_pass` integer CHECK (`selected_candidate_pass` BETWEEN 0 AND 7),
	`corrected_output_uploaded` integer NOT NULL DEFAULT 0 CHECK (`corrected_output_uploaded` = 0),
	`historical_backfill` integer NOT NULL DEFAULT 0 CHECK (`historical_backfill` = 0),
	`provider_call_count` integer NOT NULL DEFAULT 0 CHECK (`provider_call_count` = 0),
	`provider_dispatch` text NOT NULL DEFAULT 'OFF' CHECK (`provider_dispatch` = 'OFF'),
	`calibration_executed` integer NOT NULL DEFAULT 0 CHECK (`calibration_executed` = 0),
	`finalize_executed` integer NOT NULL DEFAULT 0 CHECK (`finalize_executed` = 0),
	`release_eligible` integer NOT NULL DEFAULT 0 CHECK (`release_eligible` = 0),
	`production_activation_executed` integer NOT NULL DEFAULT 0
		CHECK (`production_activation_executed` = 0),
	`auto_publish` text NOT NULL DEFAULT 'OFF' CHECK (`auto_publish` = 'OFF'),
	`error_code` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_codec_safe_lra_guard_shadow_key_unique`
	ON `stage12_codec_safe_lra_guard_shadow_job` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_codec_safe_lra_guard_parent_evidence_unique`
	ON `stage12_codec_safe_lra_guard_shadow_job` (`parent_shadow_evidence_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_lineage_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_guard_shadow_job`
WHEN length(NEW.`actor_identity`) < 3
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_codec_safe_true_peak_shadow_job` AS `parent_job`
		JOIN `stage12_codec_safe_true_peak_shadow_evidence` AS `parent_evidence`
			ON `parent_evidence`.`shadow_job_id` = `parent_job`.`id`
		WHERE `parent_job`.`id` = NEW.`parent_shadow_job_id`
			AND `parent_evidence`.`id` = NEW.`parent_shadow_evidence_id`
			AND `parent_job`.`state` = 'READY' AND `parent_job`.`shadow_outcome` = 'FAIL'
			AND `parent_evidence`.`shadow_outcome` = 'FAIL'
			AND `parent_job`.`stage12_job_id` = NEW.`stage12_job_id`
			AND `parent_job`.`source_correction_job_id` = NEW.`source_correction_job_id`
			AND `parent_job`.`historical_failure_job_id` = NEW.`historical_failure_job_id`
			AND `parent_job`.`diagnostic_replay_job_id` = NEW.`diagnostic_replay_job_id`
			AND `parent_job`.`diagnostic_replay_evidence_id` = NEW.`diagnostic_replay_evidence_id`
			AND `parent_evidence`.`source_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
			AND `parent_evidence`.`source_pre_master_sha256` = NEW.`source_pre_master_sha256`
			AND `parent_evidence`.`source_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
			AND `parent_evidence`.`source_receipt_sha256` = NEW.`source_receipt_sha256`
			AND `parent_evidence`.`threshold_snapshot_sha256` = NEW.`threshold_snapshot_sha256`
			AND `parent_evidence`.`worker_image_digest` = NEW.`parent_worker_image_digest`
			AND `parent_evidence`.`worker_image_digest` = `parent_evidence`.`expected_worker_image_digest`
			AND `parent_evidence`.`corrected_output_uploaded` = 0
			AND `parent_evidence`.`historical_backfill` = 0
			AND `parent_evidence`.`provider_call_count` = 0
			AND `parent_evidence`.`provider_dispatch` = 'OFF'
			AND `parent_evidence`.`calibration_executed` = 0
			AND `parent_evidence`.`finalize_executed` = 0
			AND `parent_evidence`.`release_eligible` = 0
			AND `parent_evidence`.`production_activation_executed` = 0
			AND `parent_evidence`.`auto_publish` = 'OFF'
			AND json_array_length(`parent_evidence`.`candidates_json`) = 4
			AND json_extract(`parent_evidence`.`candidates_json`, '$[1].candidatePass') = 1
			AND json_extract(`parent_evidence`.`candidates_json`, '$[1].truePeakDbtp') <= -1
			AND json_extract(`parent_evidence`.`candidates_json`, '$[1].loudnessRangeLu') < 4
			AND json_extract(`parent_evidence`.`candidates_json`, '$[3].candidatePass') = 3
			AND json_extract(`parent_evidence`.`candidates_json`, '$[3].loudnessRangeLu') > 8
			AND json_extract(`parent_evidence`.`candidates_json`, '$[3].macroDepthDb')
				> json_extract(`parent_evidence`.`candidates_json`, '$[1].macroDepthDb')
	)
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_LINEAGE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_identity_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_guard_shadow_job`
WHEN OLD.`stage12_job_id` IS NOT NEW.`stage12_job_id`
	OR OLD.`source_correction_job_id` IS NOT NEW.`source_correction_job_id`
	OR OLD.`historical_failure_job_id` IS NOT NEW.`historical_failure_job_id`
	OR OLD.`diagnostic_replay_job_id` IS NOT NEW.`diagnostic_replay_job_id`
	OR OLD.`diagnostic_replay_evidence_id` IS NOT NEW.`diagnostic_replay_evidence_id`
	OR OLD.`parent_shadow_job_id` IS NOT NEW.`parent_shadow_job_id`
	OR OLD.`parent_shadow_evidence_id` IS NOT NEW.`parent_shadow_evidence_id`
	OR OLD.`idempotency_key` IS NOT NEW.`idempotency_key`
	OR OLD.`callback_token_hash` IS NOT NEW.`callback_token_hash`
	OR OLD.`actor_identity` IS NOT NEW.`actor_identity`
	OR OLD.`owner_approval_text` IS NOT NEW.`owner_approval_text`
	OR OLD.`evidence_semantics` IS NOT NEW.`evidence_semantics`
	OR OLD.`source_pre_master_r2_key` IS NOT NEW.`source_pre_master_r2_key`
	OR OLD.`source_pre_master_sha256` IS NOT NEW.`source_pre_master_sha256`
	OR OLD.`source_pre_master_byte_length` IS NOT NEW.`source_pre_master_byte_length`
	OR OLD.`source_receipt_sha256` IS NOT NEW.`source_receipt_sha256`
	OR OLD.`expected_worker_image_digest` IS NOT NEW.`expected_worker_image_digest`
	OR OLD.`parent_worker_image_digest` IS NOT NEW.`parent_worker_image_digest`
	OR OLD.`algorithm_fingerprint` IS NOT NEW.`algorithm_fingerprint`
	OR OLD.`threshold_snapshot_sha256` IS NOT NEW.`threshold_snapshot_sha256`
	OR OLD.`controller_policy_sha256` IS NOT NEW.`controller_policy_sha256`
	OR OLD.`render_kernel_fingerprint` IS NOT NEW.`render_kernel_fingerprint`
	OR OLD.`parent_render_runtime_fingerprint` IS NOT NEW.`parent_render_runtime_fingerprint`
	OR OLD.`corrected_output_uploaded` IS NOT NEW.`corrected_output_uploaded`
	OR OLD.`historical_backfill` IS NOT NEW.`historical_backfill`
	OR OLD.`provider_call_count` IS NOT NEW.`provider_call_count`
	OR OLD.`provider_dispatch` IS NOT NEW.`provider_dispatch`
	OR OLD.`calibration_executed` IS NOT NEW.`calibration_executed`
	OR OLD.`finalize_executed` IS NOT NEW.`finalize_executed`
	OR OLD.`release_eligible` IS NOT NEW.`release_eligible`
	OR OLD.`production_activation_executed` IS NOT NEW.`production_activation_executed`
	OR OLD.`auto_publish` IS NOT NEW.`auto_publish`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_terminal_shape_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_guard_shadow_job`
WHEN (NEW.`state` = 'READY' AND (
	NEW.`worker_image_digest` IS NULL
	OR NEW.`worker_image_digest` <> NEW.`expected_worker_image_digest`
	OR NEW.`render_runtime_fingerprint` <> NEW.`parent_render_runtime_fingerprint`
	OR NEW.`shadow_outcome` IS NULL OR NEW.`terminal_reason` IS NULL
	OR NEW.`last_evaluated_candidate_pass` IS NULL
	OR NEW.`selected_candidate_pass` IS NULL OR NEW.`error_code` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_codec_safe_lra_guard_shadow_evidence` AS `evidence`
		WHERE `evidence`.`shadow_job_id` = NEW.`id`
			AND `evidence`.`shadow_outcome` = NEW.`shadow_outcome`
			AND `evidence`.`terminal_reason` = NEW.`terminal_reason`
			AND `evidence`.`last_evaluated_candidate_pass` = NEW.`last_evaluated_candidate_pass`
			AND `evidence`.`best_safe_candidate_pass` IS NEW.`best_safe_candidate_pass`
			AND `evidence`.`selected_candidate_pass` = NEW.`selected_candidate_pass`
			AND `evidence`.`worker_image_digest` = NEW.`worker_image_digest`
			AND `evidence`.`render_runtime_fingerprint` = NEW.`render_runtime_fingerprint`
	)
)) OR (NEW.`state` = 'FAILED' AND (
	NEW.`error_code` IS NULL OR NEW.`worker_image_digest` IS NOT NULL
	OR NEW.`shadow_outcome` IS NOT NULL OR NEW.`terminal_reason` IS NOT NULL
	OR EXISTS (SELECT 1 FROM `stage12_codec_safe_lra_guard_shadow_evidence`
		WHERE `shadow_job_id` = NEW.`id`)
)) OR (NEW.`state` = 'PENDING' AND (
	NEW.`error_code` IS NOT NULL OR NEW.`worker_image_digest` IS NOT NULL
	OR NEW.`shadow_outcome` IS NOT NULL OR NEW.`terminal_reason` IS NOT NULL
))
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_TERMINAL_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_terminal_immutable_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_guard_shadow_job`
WHEN OLD.`state` IN ('READY','FAILED')
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_immutable_delete`
BEFORE DELETE ON `stage12_codec_safe_lra_guard_shadow_job`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TABLE `stage12_codec_safe_lra_guard_shadow_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`shadow_job_id` text NOT NULL REFERENCES `stage12_codec_safe_lra_guard_shadow_job`(`id`),
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`source_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`historical_failure_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`diagnostic_replay_job_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_job`(`id`),
	`diagnostic_replay_evidence_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_evidence`(`id`),
	`parent_shadow_job_id` text NOT NULL REFERENCES `stage12_codec_safe_true_peak_shadow_job`(`id`),
	`parent_shadow_evidence_id` text NOT NULL REFERENCES `stage12_codec_safe_true_peak_shadow_evidence`(`id`),
	`evidence_semantics` text NOT NULL CHECK (`evidence_semantics` = 'CODEC_SAFE_LRA_GUARD_SHADOW_NOT_CORRECTION'),
	`lossless_reference_sha256` text NOT NULL CHECK (length(`lossless_reference_sha256`) = 64),
	`lossless_reference_byte_length` integer NOT NULL CHECK (`lossless_reference_byte_length` > 0),
	`lossless_reference_frame_md5_sha256` text NOT NULL CHECK (length(`lossless_reference_frame_md5_sha256`) = 64),
	`lossless_reference_codec` text NOT NULL CHECK (`lossless_reference_codec` = 'pcm_f32le'),
	`lossless_reference_sample_rate_hz` integer NOT NULL CHECK (`lossless_reference_sample_rate_hz` = 48000),
	`anchor_reference_json` text NOT NULL CHECK (json_valid(`anchor_reference_json`)),
	`high_bracket_reference_json` text NOT NULL CHECK (json_valid(`high_bracket_reference_json`)),
	`controller_policy_json` text NOT NULL CHECK (json_valid(`controller_policy_json`)),
	`candidates_json` text NOT NULL CHECK (json_valid(`candidates_json`)),
	`last_evaluated_candidate_pass` integer NOT NULL CHECK (`last_evaluated_candidate_pass` BETWEEN 0 AND 7),
	`best_safe_candidate_pass` integer CHECK (`best_safe_candidate_pass` BETWEEN 0 AND 7),
	`selected_candidate_pass` integer NOT NULL CHECK (`selected_candidate_pass` BETWEEN 0 AND 7),
	`terminal_reason` text NOT NULL CHECK (`terminal_reason` IN (
		'PASS','ANCHOR_REPRODUCTION_DRIFT','BUDGET_EXHAUSTED'
	)),
	`final_integrated_lufs` real NOT NULL,
	`final_integrated_lufs_exact` text NOT NULL,
	`final_true_peak_dbtp` real NOT NULL,
	`final_true_peak_dbtp_exact` text NOT NULL,
	`final_loudness_range_lu` real NOT NULL,
	`final_loudness_range_lu_exact` text NOT NULL,
	`failed_predicates_json` text NOT NULL CHECK (json_valid(`failed_predicates_json`)),
	`shadow_outcome` text NOT NULL CHECK (`shadow_outcome` IN ('PASS','FAIL')),
	`expected_worker_image_digest` text NOT NULL,
	`parent_worker_image_digest` text NOT NULL,
	`worker_image_digest` text NOT NULL,
	`algorithm_fingerprint` text NOT NULL CHECK (length(`algorithm_fingerprint`) = 64),
	`threshold_snapshot_sha256` text NOT NULL CHECK (length(`threshold_snapshot_sha256`) = 64),
	`controller_policy_sha256` text NOT NULL CHECK (length(`controller_policy_sha256`) = 64),
	`render_kernel_fingerprint` text NOT NULL CHECK (length(`render_kernel_fingerprint`) = 64),
	`parent_render_runtime_fingerprint` text NOT NULL CHECK (length(`parent_render_runtime_fingerprint`) = 64),
	`render_runtime_fingerprint` text NOT NULL CHECK (length(`render_runtime_fingerprint`) = 64),
	`parent_runtime_provenance_json` text NOT NULL CHECK (json_valid(`parent_runtime_provenance_json`)),
	`runtime_provenance_json` text NOT NULL CHECK (json_valid(`runtime_provenance_json`)),
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
	`production_activation_executed` integer NOT NULL DEFAULT 0 CHECK (`production_activation_executed` = 0),
	`auto_publish` text NOT NULL DEFAULT 'OFF' CHECK (`auto_publish` = 'OFF'),
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_codec_safe_lra_guard_shadow_evidence_job_unique`
	ON `stage12_codec_safe_lra_guard_shadow_evidence` (`shadow_job_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_evidence_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_guard_shadow_evidence`
WHEN NOT EXISTS (
	SELECT 1 FROM `stage12_codec_safe_lra_guard_shadow_job` AS `job`
	WHERE `job`.`id` = NEW.`shadow_job_id` AND `job`.`state` = 'PENDING'
		AND `job`.`stage12_job_id` = NEW.`stage12_job_id`
		AND `job`.`source_correction_job_id` = NEW.`source_correction_job_id`
		AND `job`.`historical_failure_job_id` = NEW.`historical_failure_job_id`
		AND `job`.`diagnostic_replay_job_id` = NEW.`diagnostic_replay_job_id`
		AND `job`.`diagnostic_replay_evidence_id` = NEW.`diagnostic_replay_evidence_id`
		AND `job`.`parent_shadow_job_id` = NEW.`parent_shadow_job_id`
		AND `job`.`parent_shadow_evidence_id` = NEW.`parent_shadow_evidence_id`
		AND `job`.`evidence_semantics` = NEW.`evidence_semantics`
		AND `job`.`source_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
		AND `job`.`source_pre_master_sha256` = NEW.`source_pre_master_sha256`
		AND `job`.`source_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
		AND `job`.`source_receipt_sha256` = NEW.`source_receipt_sha256`
		AND `job`.`expected_worker_image_digest` = NEW.`expected_worker_image_digest`
		AND `job`.`parent_worker_image_digest` = NEW.`parent_worker_image_digest`
		AND `job`.`algorithm_fingerprint` = NEW.`algorithm_fingerprint`
		AND `job`.`threshold_snapshot_sha256` = NEW.`threshold_snapshot_sha256`
		AND `job`.`controller_policy_sha256` = NEW.`controller_policy_sha256`
		AND `job`.`render_kernel_fingerprint` = NEW.`render_kernel_fingerprint`
		AND `job`.`parent_render_runtime_fingerprint` = NEW.`parent_render_runtime_fingerprint`
)
	OR NEW.`worker_image_digest` <> NEW.`expected_worker_image_digest`
	OR NEW.`render_runtime_fingerprint` <> NEW.`parent_render_runtime_fingerprint`
	OR json(NEW.`parent_runtime_provenance_json`) <> json(NEW.`runtime_provenance_json`)
	OR json_type(NEW.`controller_policy_json`) <> 'object'
	OR json_extract(NEW.`controller_policy_json`, '$.maxCandidateCount') <> 8
	OR json_extract(NEW.`controller_policy_json`, '$.codecOvershootRegressionMaxDb') <> 0.25
	OR json_extract(NEW.`controller_policy_json`, '$.integratedBoundaryMarginLu') <> 0.05
	OR json_extract(NEW.`controller_policy_json`, '$.maxIntegratedTargetStepLu') <> 0.25
	OR json_extract(NEW.`anchor_reference_json`, '$.candidatePass') <> 1
	OR json_extract(NEW.`anchor_reference_json`, '$.losslessReferenceSha256') <> NEW.`lossless_reference_sha256`
	OR json_extract(NEW.`anchor_reference_json`, '$.truePeakDbtp') > -1
	OR json_extract(NEW.`anchor_reference_json`, '$.loudnessRangeLu') >= 4
	OR json_extract(NEW.`high_bracket_reference_json`, '$.candidatePass') <> 3
	OR json_extract(NEW.`high_bracket_reference_json`, '$.losslessReferenceSha256') <> NEW.`lossless_reference_sha256`
	OR json_extract(NEW.`high_bracket_reference_json`, '$.loudnessRangeLu') <= 8
	OR json_extract(NEW.`high_bracket_reference_json`, '$.macroDepthDb')
		<= json_extract(NEW.`anchor_reference_json`, '$.macroDepthDb')
	OR json_type(NEW.`candidates_json`) <> 'array'
	OR json_array_length(NEW.`candidates_json`) < 1
	OR json_array_length(NEW.`candidates_json`) > 8
	OR NEW.`last_evaluated_candidate_pass` <> json_array_length(NEW.`candidates_json`) - 1
	OR NEW.`selected_candidate_pass` > NEW.`last_evaluated_candidate_pass`
	OR NEW.`best_safe_candidate_pass` > NEW.`last_evaluated_candidate_pass`
	OR EXISTS (
		SELECT 1 FROM json_each(NEW.`candidates_json`) AS `candidate`
		WHERE json_extract(`candidate`.`value`, '$.done') <> 0
			OR json_extract(`candidate`.`value`, '$.candidatePass') <> `candidate`.`key`
			OR json_extract(`candidate`.`value`, '$.losslessReferenceSha256')
				<> NEW.`lossless_reference_sha256`
			OR json_extract(`candidate`.`value`, '$.macroDepthDb')
				< json_extract(NEW.`anchor_reference_json`, '$.macroDepthDb')
			OR json_extract(`candidate`.`value`, '$.macroDepthDb')
				> json_extract(NEW.`high_bracket_reference_json`, '$.macroDepthDb')
			OR json_extract(`candidate`.`value`, '$.limiterCeilingDbtp')
				<> json_extract(NEW.`anchor_reference_json`, '$.limiterCeilingDbtp')
			OR COALESCE(json_type(`candidate`.`value`, '$.integratedLufs'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.truePeakDbtp'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.loudnessRangeLu'), '') NOT IN ('integer','real')
			OR CAST(json_extract(`candidate`.`value`, '$.integratedLufsExact') AS REAL)
				<> json_extract(`candidate`.`value`, '$.integratedLufs')
			OR CAST(json_extract(`candidate`.`value`, '$.truePeakDbtpExact') AS REAL)
				<> json_extract(`candidate`.`value`, '$.truePeakDbtp')
			OR CAST(json_extract(`candidate`.`value`, '$.loudnessRangeLuExact') AS REAL)
				<> json_extract(`candidate`.`value`, '$.loudnessRangeLu')
			OR length(json_extract(`candidate`.`value`, '$.audioFrameMd5Sha256')) <> 64
			OR abs(json_extract(`candidate`.`value`, '$.targetStepLufs')) > 0.25
			OR json_type(`candidate`.`value`, '$.failedPredicates') <> 'array'
			OR EXISTS (SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `type` <> 'text' OR `value` NOT IN (
					'INTEGRATED_LUFS_BELOW_MIN','INTEGRATED_LUFS_ABOVE_MAX',
					'TRUE_PEAK_DBTP_ABOVE_MAX','LOUDNESS_RANGE_LU_BELOW_MIN',
					'LOUDNESS_RANGE_LU_ABOVE_MAX'))
			OR ((json_extract(`candidate`.`value`, '$.integratedLufs') < -15) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `value` = 'INTEGRATED_LUFS_BELOW_MIN'))
			OR ((json_extract(`candidate`.`value`, '$.integratedLufs') > -13) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `value` = 'INTEGRATED_LUFS_ABOVE_MAX'))
			OR ((json_extract(`candidate`.`value`, '$.truePeakDbtp') > -1) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `value` = 'TRUE_PEAK_DBTP_ABOVE_MAX'))
			OR ((json_extract(`candidate`.`value`, '$.loudnessRangeLu') < 4) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `value` = 'LOUDNESS_RANGE_LU_BELOW_MIN'))
			OR ((json_extract(`candidate`.`value`, '$.loudnessRangeLu') > 8) <> EXISTS (
				SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `value` = 'LOUDNESS_RANGE_LU_ABOVE_MAX'))
	)
	OR json_extract(NEW.`candidates_json`, '$[0].phase') <> 'ANCHOR_REPRODUCTION'
	OR json_extract(NEW.`candidates_json`, '$[0].decision') <> 'ANCHOR'
	OR json_extract(NEW.`candidates_json`, '$[0].integratedTargetLufs')
		<> json_extract(NEW.`anchor_reference_json`, '$.integratedTargetLufs')
	OR json_extract(NEW.`candidates_json`, '$[0].limiterCeilingDbtp')
		<> json_extract(NEW.`anchor_reference_json`, '$.limiterCeilingDbtp')
	OR json_extract(NEW.`candidates_json`, '$[0].macroDepthDb')
		<> json_extract(NEW.`anchor_reference_json`, '$.macroDepthDb')
	OR NEW.`final_integrated_lufs` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].integratedLufs')
	OR NEW.`final_true_peak_dbtp` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].truePeakDbtp')
	OR NEW.`final_loudness_range_lu` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].loudnessRangeLu')
	OR NEW.`final_integrated_lufs_exact` IS NOT
		json_extract(NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].integratedLufsExact')
	OR NEW.`final_true_peak_dbtp_exact` IS NOT
		json_extract(NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].truePeakDbtpExact')
	OR NEW.`final_loudness_range_lu_exact` IS NOT
		json_extract(NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].loudnessRangeLuExact')
	OR json(NEW.`failed_predicates_json`) <> json_extract(
		NEW.`candidates_json`, '$[' || NEW.`selected_candidate_pass` || '].failedPredicates')
	OR (NEW.`terminal_reason` = 'PASS' AND (
		NEW.`shadow_outcome` <> 'PASS' OR json_array_length(NEW.`failed_predicates_json`) <> 0
		OR NEW.`selected_candidate_pass` <> NEW.`last_evaluated_candidate_pass`))
	OR (NEW.`terminal_reason` = 'ANCHOR_REPRODUCTION_DRIFT' AND (
		NEW.`shadow_outcome` <> 'FAIL'
		OR json_extract(NEW.`candidates_json`, '$[0].disposition') <> 'ANCHOR_DRIFT'))
	OR (NEW.`terminal_reason` = 'BUDGET_EXHAUSTED' AND (
		NEW.`shadow_outcome` <> 'FAIL' OR json_array_length(NEW.`candidates_json`) <> 8
		OR NEW.`best_safe_candidate_pass` IS NULL
		OR NEW.`selected_candidate_pass` <> NEW.`best_safe_candidate_pass`))
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_evidence_immutable_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_guard_shadow_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_guard_shadow_evidence_immutable_delete`
BEFORE DELETE ON `stage12_codec_safe_lra_guard_shadow_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_GUARD_SHADOW_EVIDENCE_IMMUTABLE'); END;
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
