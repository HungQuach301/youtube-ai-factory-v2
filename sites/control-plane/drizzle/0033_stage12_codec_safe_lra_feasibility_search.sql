CREATE TABLE `stage12_codec_safe_lra_feasibility_search_job` (
	`id` text PRIMARY KEY NOT NULL,
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`source_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`historical_failure_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`diagnostic_replay_job_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_job`(`id`),
	`diagnostic_replay_evidence_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_evidence`(`id`),
	`parent_true_peak_shadow_job_id` text NOT NULL REFERENCES `stage12_codec_safe_true_peak_shadow_job`(`id`),
	`parent_true_peak_shadow_evidence_id` text NOT NULL
		REFERENCES `stage12_codec_safe_true_peak_shadow_evidence`(`id`)
		CHECK (`parent_true_peak_shadow_evidence_id` =
			'41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'),
	`parent_lra_guard_shadow_job_id` text NOT NULL
		REFERENCES `stage12_codec_safe_lra_guard_shadow_job`(`id`),
	`parent_lra_guard_shadow_evidence_id` text NOT NULL
		REFERENCES `stage12_codec_safe_lra_guard_shadow_evidence`(`id`)
		CHECK (`parent_lra_guard_shadow_evidence_id` =
			'4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'),
	`idempotency_key` text NOT NULL CHECK (length(`idempotency_key`) = 64),
	`callback_token_hash` text NOT NULL CHECK (length(`callback_token_hash`) = 64),
	`actor_identity` text NOT NULL,
	`owner_approval_text` text NOT NULL CHECK (
		`owner_approval_text` = 'RUN STAGE 12 CODEC SAFE LRA FEASIBILITY SEARCH'
	),
	`state` text NOT NULL CHECK (`state` IN ('PENDING','READY','FAILED')),
	`evidence_semantics` text NOT NULL CHECK (
		`evidence_semantics` = 'CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION'
	),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL CHECK (
		`source_pre_master_sha256` =
			'163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'
	),
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
	`parent_render_kernel_fingerprint` text NOT NULL CHECK (length(`parent_render_kernel_fingerprint`) = 64),
	`parent_render_runtime_fingerprint` text NOT NULL CHECK (length(`parent_render_runtime_fingerprint`) = 64),
	`render_runtime_fingerprint` text,
	`shadow_outcome` text CHECK (`shadow_outcome` IN ('PASS','FAIL')),
	`terminal_reason` text CHECK (`terminal_reason` IN (
		'PASS','FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
		'FINAL_SAME_ARTIFACT_VERIFICATION_FAILED','SAFE_ROLLBACK_REPRODUCTION_DRIFT'
	)),
	`last_candidate_ordinal` integer CHECK (`last_candidate_ordinal` BETWEEN 0 AND 18),
	`selected_seed_ordinal` integer CHECK (`selected_seed_ordinal` BETWEEN 0 AND 1),
	`selected_candidate_ordinal` integer CHECK (`selected_candidate_ordinal` BETWEEN 0 AND 18),
	`verified_candidate_ordinal` integer CHECK (`verified_candidate_ordinal` BETWEEN 0 AND 18),
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
CREATE UNIQUE INDEX `stage12_codec_safe_lra_feasibility_search_key_unique`
	ON `stage12_codec_safe_lra_feasibility_search_job` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_codec_safe_lra_feasibility_search_parent_evidence_unique`
	ON `stage12_codec_safe_lra_feasibility_search_job` (`parent_lra_guard_shadow_evidence_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_lineage_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_job`
WHEN length(NEW.`actor_identity`) < 3
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_codec_safe_lra_guard_shadow_job` AS `guard_job`
		JOIN `stage12_codec_safe_lra_guard_shadow_evidence` AS `guard_evidence`
			ON `guard_evidence`.`shadow_job_id` = `guard_job`.`id`
		WHERE `guard_job`.`id` = NEW.`parent_lra_guard_shadow_job_id`
			AND `guard_evidence`.`id` = NEW.`parent_lra_guard_shadow_evidence_id`
			AND `guard_job`.`state` = 'READY' AND `guard_job`.`shadow_outcome` = 'FAIL'
			AND `guard_job`.`terminal_reason` = 'BUDGET_EXHAUSTED'
			AND `guard_job`.`last_evaluated_candidate_pass` = 7
			AND `guard_job`.`selected_candidate_pass` = 5
			AND `guard_evidence`.`shadow_outcome` = 'FAIL'
			AND `guard_evidence`.`terminal_reason` = 'BUDGET_EXHAUSTED'
			AND `guard_evidence`.`last_evaluated_candidate_pass` = 7
			AND `guard_evidence`.`selected_candidate_pass` = 5
			AND `guard_job`.`stage12_job_id` = NEW.`stage12_job_id`
			AND `guard_job`.`source_correction_job_id` = NEW.`source_correction_job_id`
			AND `guard_job`.`historical_failure_job_id` = NEW.`historical_failure_job_id`
			AND `guard_job`.`diagnostic_replay_job_id` = NEW.`diagnostic_replay_job_id`
			AND `guard_job`.`diagnostic_replay_evidence_id` = NEW.`diagnostic_replay_evidence_id`
			AND `guard_job`.`parent_shadow_job_id` = NEW.`parent_true_peak_shadow_job_id`
			AND `guard_job`.`parent_shadow_evidence_id` = NEW.`parent_true_peak_shadow_evidence_id`
			AND `guard_evidence`.`parent_shadow_job_id` = NEW.`parent_true_peak_shadow_job_id`
			AND `guard_evidence`.`parent_shadow_evidence_id` = NEW.`parent_true_peak_shadow_evidence_id`
			AND `guard_evidence`.`source_pre_master_r2_key` = NEW.`source_pre_master_r2_key`
			AND `guard_evidence`.`source_pre_master_sha256` = NEW.`source_pre_master_sha256`
			AND `guard_evidence`.`source_pre_master_byte_length` = NEW.`source_pre_master_byte_length`
			AND `guard_evidence`.`source_receipt_sha256` = NEW.`source_receipt_sha256`
			AND `guard_evidence`.`threshold_snapshot_sha256` = NEW.`threshold_snapshot_sha256`
			AND `guard_evidence`.`render_kernel_fingerprint`
				= NEW.`parent_render_kernel_fingerprint`
			AND NEW.`render_kernel_fingerprint` = NEW.`parent_render_kernel_fingerprint`
			AND `guard_evidence`.`worker_image_digest` = NEW.`parent_worker_image_digest`
			AND `guard_evidence`.`worker_image_digest` = `guard_evidence`.`expected_worker_image_digest`
			AND `guard_evidence`.`render_runtime_fingerprint`
				= NEW.`parent_render_runtime_fingerprint`
			AND `guard_evidence`.`corrected_output_uploaded` = 0
			AND `guard_evidence`.`historical_backfill` = 0
			AND `guard_evidence`.`provider_call_count` = 0
			AND `guard_evidence`.`provider_dispatch` = 'OFF'
			AND `guard_evidence`.`calibration_executed` = 0
			AND `guard_evidence`.`finalize_executed` = 0
			AND `guard_evidence`.`release_eligible` = 0
			AND `guard_evidence`.`production_activation_executed` = 0
			AND `guard_evidence`.`auto_publish` = 'OFF'
			AND json_array_length(`guard_evidence`.`candidates_json`) = 8
			AND json_extract(`guard_evidence`.`candidates_json`, '$[5].candidatePass') = 5
			AND json_extract(`guard_evidence`.`candidates_json`, '$[5].integratedLufs') = -15.25
			AND json_extract(`guard_evidence`.`candidates_json`, '$[5].truePeakDbtp') = -1.06
			AND json_extract(`guard_evidence`.`candidates_json`, '$[5].loudnessRangeLu') = 3.2
			AND json(`guard_evidence`.`failed_predicates_json`)
				= json('["INTEGRATED_LUFS_BELOW_MIN","LOUDNESS_RANGE_LU_BELOW_MIN"]')
	)
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_LINEAGE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_identity_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_feasibility_search_job`
WHEN OLD.`stage12_job_id` IS NOT NEW.`stage12_job_id`
	OR OLD.`source_correction_job_id` IS NOT NEW.`source_correction_job_id`
	OR OLD.`historical_failure_job_id` IS NOT NEW.`historical_failure_job_id`
	OR OLD.`diagnostic_replay_job_id` IS NOT NEW.`diagnostic_replay_job_id`
	OR OLD.`diagnostic_replay_evidence_id` IS NOT NEW.`diagnostic_replay_evidence_id`
	OR OLD.`parent_true_peak_shadow_job_id` IS NOT NEW.`parent_true_peak_shadow_job_id`
	OR OLD.`parent_true_peak_shadow_evidence_id` IS NOT NEW.`parent_true_peak_shadow_evidence_id`
	OR OLD.`parent_lra_guard_shadow_job_id` IS NOT NEW.`parent_lra_guard_shadow_job_id`
	OR OLD.`parent_lra_guard_shadow_evidence_id` IS NOT NEW.`parent_lra_guard_shadow_evidence_id`
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
	OR OLD.`parent_render_kernel_fingerprint` IS NOT NEW.`parent_render_kernel_fingerprint`
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
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_terminal_shape_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_feasibility_search_job`
WHEN (NEW.`state` = 'READY' AND (
	NEW.`worker_image_digest` IS NULL
	OR NEW.`worker_image_digest` <> NEW.`expected_worker_image_digest`
	OR NEW.`render_runtime_fingerprint` <> NEW.`parent_render_runtime_fingerprint`
	OR NEW.`shadow_outcome` IS NULL OR NEW.`terminal_reason` IS NULL
	OR NEW.`last_candidate_ordinal` IS NULL OR NEW.`selected_candidate_ordinal` IS NULL
	OR NEW.`error_code` IS NOT NULL
	OR NOT EXISTS (
		SELECT 1 FROM `stage12_codec_safe_lra_feasibility_search_evidence` AS `evidence`
		WHERE `evidence`.`search_job_id` = NEW.`id`
			AND `evidence`.`shadow_outcome` = NEW.`shadow_outcome`
			AND `evidence`.`terminal_reason` = NEW.`terminal_reason`
			AND `evidence`.`last_candidate_ordinal` = NEW.`last_candidate_ordinal`
			AND `evidence`.`selected_seed_ordinal` IS NEW.`selected_seed_ordinal`
			AND `evidence`.`selected_candidate_ordinal` = NEW.`selected_candidate_ordinal`
			AND `evidence`.`verified_candidate_ordinal` IS NEW.`verified_candidate_ordinal`
			AND `evidence`.`worker_image_digest` = NEW.`worker_image_digest`
			AND `evidence`.`render_runtime_fingerprint` = NEW.`render_runtime_fingerprint`
	)
)) OR (NEW.`state` = 'FAILED' AND (
	NEW.`error_code` IS NULL OR NEW.`worker_image_digest` IS NOT NULL
	OR NEW.`shadow_outcome` IS NOT NULL OR NEW.`terminal_reason` IS NOT NULL
	OR NEW.`render_runtime_fingerprint` IS NOT NULL OR NEW.`last_candidate_ordinal` IS NOT NULL
	OR NEW.`selected_seed_ordinal` IS NOT NULL OR NEW.`selected_candidate_ordinal` IS NOT NULL
	OR NEW.`verified_candidate_ordinal` IS NOT NULL
	OR EXISTS (SELECT 1 FROM `stage12_codec_safe_lra_feasibility_search_evidence`
		WHERE `search_job_id` = NEW.`id`)
)) OR (NEW.`state` = 'PENDING' AND (
	NEW.`error_code` IS NOT NULL OR NEW.`worker_image_digest` IS NOT NULL
	OR NEW.`shadow_outcome` IS NOT NULL OR NEW.`terminal_reason` IS NOT NULL
	OR NEW.`render_runtime_fingerprint` IS NOT NULL OR NEW.`last_candidate_ordinal` IS NOT NULL
	OR NEW.`selected_seed_ordinal` IS NOT NULL OR NEW.`selected_candidate_ordinal` IS NOT NULL
	OR NEW.`verified_candidate_ordinal` IS NOT NULL
))
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_TERMINAL_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_terminal_immutable_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_feasibility_search_job`
WHEN OLD.`state` IN ('READY','FAILED')
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_immutable_delete`
BEFORE DELETE ON `stage12_codec_safe_lra_feasibility_search_job`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_JOB_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TABLE `stage12_codec_safe_lra_feasibility_search_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`search_job_id` text NOT NULL REFERENCES `stage12_codec_safe_lra_feasibility_search_job`(`id`),
	`stage12_job_id` text NOT NULL REFERENCES `stage12_media_job`(`id`),
	`source_correction_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_job`(`id`),
	`historical_failure_job_id` text NOT NULL REFERENCES `stage12_audio_p0_correction_retry_job`(`id`),
	`diagnostic_replay_job_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_job`(`id`),
	`diagnostic_replay_evidence_id` text NOT NULL REFERENCES `stage12_encoded_loudness_diagnostic_replay_evidence`(`id`),
	`parent_true_peak_shadow_job_id` text NOT NULL REFERENCES `stage12_codec_safe_true_peak_shadow_job`(`id`),
	`parent_true_peak_shadow_evidence_id` text NOT NULL
		REFERENCES `stage12_codec_safe_true_peak_shadow_evidence`(`id`)
		CHECK (`parent_true_peak_shadow_evidence_id` =
			'41209f9c50604dd8e1963d83717eaf6734c1c6fdee1857c6647af483f89243eb'),
	`parent_lra_guard_shadow_job_id` text NOT NULL REFERENCES `stage12_codec_safe_lra_guard_shadow_job`(`id`),
	`parent_lra_guard_shadow_evidence_id` text NOT NULL
		REFERENCES `stage12_codec_safe_lra_guard_shadow_evidence`(`id`)
		CHECK (`parent_lra_guard_shadow_evidence_id` =
			'4ff67d50dbdd891b13014b476b9cb91eb0e7fcb610a98b87bc88a2524d94ccb9'),
	`evidence_semantics` text NOT NULL CHECK (
		`evidence_semantics` = 'CODEC_SAFE_LRA_FEASIBILITY_SHADOW_NOT_CORRECTION'
	),
	`lossless_reference_sha256` text NOT NULL CHECK (length(`lossless_reference_sha256`) = 64),
	`lossless_reference_byte_length` integer NOT NULL CHECK (`lossless_reference_byte_length` > 0),
	`lossless_reference_frame_md5_sha256` text NOT NULL CHECK (length(`lossless_reference_frame_md5_sha256`) = 64),
	`lossless_reference_codec` text NOT NULL CHECK (`lossless_reference_codec` = 'pcm_f32le'),
	`lossless_reference_sample_rate_hz` integer NOT NULL CHECK (`lossless_reference_sample_rate_hz` = 48000),
	`parent_guard_trace_json` text NOT NULL CHECK (json_valid(`parent_guard_trace_json`)),
	`controller_policy_json` text NOT NULL CHECK (json_valid(`controller_policy_json`)),
	`candidates_json` text NOT NULL CHECK (json_valid(`candidates_json`)),
	`budget_ledger_json` text NOT NULL CHECK (json_valid(`budget_ledger_json`)),
	`last_candidate_ordinal` integer NOT NULL CHECK (`last_candidate_ordinal` BETWEEN 0 AND 18),
	`selected_seed_ordinal` integer CHECK (`selected_seed_ordinal` BETWEEN 0 AND 1),
	`selected_candidate_ordinal` integer NOT NULL CHECK (`selected_candidate_ordinal` BETWEEN 0 AND 18),
	`verified_candidate_ordinal` integer CHECK (`verified_candidate_ordinal` BETWEEN 0 AND 18),
	`safe_rollback_json` text NOT NULL CHECK (json_valid(`safe_rollback_json`)),
	`terminal_reason` text NOT NULL CHECK (`terminal_reason` IN (
		'PASS','FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED',
		'FINAL_SAME_ARTIFACT_VERIFICATION_FAILED','SAFE_ROLLBACK_REPRODUCTION_DRIFT'
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
	`parent_render_kernel_fingerprint` text NOT NULL CHECK (length(`parent_render_kernel_fingerprint`) = 64),
	`parent_render_runtime_fingerprint` text NOT NULL CHECK (length(`parent_render_runtime_fingerprint`) = 64),
	`render_runtime_fingerprint` text NOT NULL CHECK (length(`render_runtime_fingerprint`) = 64),
	`parent_runtime_provenance_json` text NOT NULL CHECK (json_valid(`parent_runtime_provenance_json`)),
	`runtime_provenance_json` text NOT NULL CHECK (json_valid(`runtime_provenance_json`)),
	`source_pre_master_r2_key` text NOT NULL,
	`source_pre_master_sha256` text NOT NULL CHECK (`source_pre_master_sha256` =
		'163acb7a9d1b971afeb50b3ac935960cfe7197e9fcbe45416eebdaa8299506d2'),
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
CREATE UNIQUE INDEX `stage12_codec_safe_lra_feasibility_search_evidence_job_unique`
	ON `stage12_codec_safe_lra_feasibility_search_evidence` (`search_job_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN NOT EXISTS (
	SELECT 1 FROM `stage12_codec_safe_lra_feasibility_search_job` AS `job`
	JOIN `stage12_codec_safe_lra_guard_shadow_evidence` AS `parent`
		ON `parent`.`id` = `job`.`parent_lra_guard_shadow_evidence_id`
	WHERE `job`.`id` = NEW.`search_job_id` AND `job`.`state` = 'PENDING'
		AND `job`.`stage12_job_id` = NEW.`stage12_job_id`
		AND `job`.`source_correction_job_id` = NEW.`source_correction_job_id`
		AND `job`.`historical_failure_job_id` = NEW.`historical_failure_job_id`
		AND `job`.`diagnostic_replay_job_id` = NEW.`diagnostic_replay_job_id`
		AND `job`.`diagnostic_replay_evidence_id` = NEW.`diagnostic_replay_evidence_id`
		AND `job`.`parent_true_peak_shadow_job_id` = NEW.`parent_true_peak_shadow_job_id`
		AND `job`.`parent_true_peak_shadow_evidence_id` = NEW.`parent_true_peak_shadow_evidence_id`
		AND `job`.`parent_lra_guard_shadow_job_id` = NEW.`parent_lra_guard_shadow_job_id`
		AND `job`.`parent_lra_guard_shadow_evidence_id` = NEW.`parent_lra_guard_shadow_evidence_id`
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
		AND `job`.`parent_render_kernel_fingerprint` = NEW.`parent_render_kernel_fingerprint`
		AND NEW.`render_kernel_fingerprint` = NEW.`parent_render_kernel_fingerprint`
		AND `job`.`parent_render_runtime_fingerprint` = NEW.`parent_render_runtime_fingerprint`
		AND `parent`.`lossless_reference_sha256` = NEW.`lossless_reference_sha256`
		AND `parent`.`lossless_reference_byte_length` = NEW.`lossless_reference_byte_length`
		AND `parent`.`lossless_reference_frame_md5_sha256`
			= NEW.`lossless_reference_frame_md5_sha256`
		AND `parent`.`lossless_reference_codec` = NEW.`lossless_reference_codec`
		AND `parent`.`lossless_reference_sample_rate_hz`
			= NEW.`lossless_reference_sample_rate_hz`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.shadowOutcome') = `parent`.`shadow_outcome`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.terminalReason') = `parent`.`terminal_reason`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.lastEvaluatedCandidatePass')
			= `parent`.`last_evaluated_candidate_pass`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.bestSafeCandidatePass')
			IS `parent`.`best_safe_candidate_pass`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.selectedCandidatePass')
			= `parent`.`selected_candidate_pass`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.finalMeasurements.integratedLufs')
			= `parent`.`final_integrated_lufs`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.finalMeasurements.integratedLufsExact')
			= `parent`.`final_integrated_lufs_exact`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.finalMeasurements.truePeakDbtp')
			= `parent`.`final_true_peak_dbtp`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.finalMeasurements.truePeakDbtpExact')
			= `parent`.`final_true_peak_dbtp_exact`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.finalMeasurements.loudnessRangeLu')
			= `parent`.`final_loudness_range_lu`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.finalMeasurements.loudnessRangeLuExact')
			= `parent`.`final_loudness_range_lu_exact`
		AND json_extract(NEW.`parent_guard_trace_json`, '$.failedPredicates')
			= json(`parent`.`failed_predicates_json`)
		AND json_extract(NEW.`parent_guard_trace_json`, '$.candidates')
			= json(`parent`.`candidates_json`)
		AND json_extract(NEW.`safe_rollback_json`, '$.parentCandidatePass') = 5
		AND json_extract(NEW.`safe_rollback_json`, '$.losslessReferenceSha256')
			= json_extract(`parent`.`candidates_json`, '$[5].losslessReferenceSha256')
		AND json_extract(NEW.`safe_rollback_json`, '$.integratedTargetLufs')
			= json_extract(`parent`.`candidates_json`, '$[5].integratedTargetLufs')
		AND json_extract(NEW.`safe_rollback_json`, '$.limiterCeilingDbtp')
			= json_extract(`parent`.`candidates_json`, '$[5].limiterCeilingDbtp')
		AND json_extract(NEW.`safe_rollback_json`, '$.macroDepthDb')
			= json_extract(`parent`.`candidates_json`, '$[5].macroDepthDb')
		AND json_extract(NEW.`safe_rollback_json`, '$.integratedLufs')
			= json_extract(`parent`.`candidates_json`, '$[5].integratedLufs')
		AND json_extract(NEW.`safe_rollback_json`, '$.integratedLufsExact')
			= json_extract(`parent`.`candidates_json`, '$[5].integratedLufsExact')
		AND json_extract(NEW.`safe_rollback_json`, '$.truePeakDbtp')
			= json_extract(`parent`.`candidates_json`, '$[5].truePeakDbtp')
		AND json_extract(NEW.`safe_rollback_json`, '$.truePeakDbtpExact')
			= json_extract(`parent`.`candidates_json`, '$[5].truePeakDbtpExact')
		AND json_extract(NEW.`safe_rollback_json`, '$.loudnessRangeLu')
			= json_extract(`parent`.`candidates_json`, '$[5].loudnessRangeLu')
		AND json_extract(NEW.`safe_rollback_json`, '$.loudnessRangeLuExact')
			= json_extract(`parent`.`candidates_json`, '$[5].loudnessRangeLuExact')
		AND json_extract(NEW.`safe_rollback_json`, '$.audioFrameMd5Sha256')
			= json_extract(`parent`.`candidates_json`, '$[5].audioFrameMd5Sha256')
)
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_runtime_policy_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN NEW.`worker_image_digest` <> NEW.`expected_worker_image_digest`
	OR NEW.`render_runtime_fingerprint` <> NEW.`parent_render_runtime_fingerprint`
	OR json(NEW.`parent_runtime_provenance_json`) <> json(NEW.`runtime_provenance_json`)
	OR json_extract(NEW.`controller_policy_json`, '$.macroDepthMinDb') <> 10.9
	OR json_extract(NEW.`controller_policy_json`, '$.macroDepthMaxDb') <> 14
	OR json_extract(NEW.`controller_policy_json`, '$.lraMapBudget') <> 8
	OR json_extract(NEW.`controller_policy_json`, '$.truePeakContainmentBudget') <> 4
	OR json_extract(NEW.`controller_policy_json`, '$.lufsTrimBudget') <> 3
	OR json_extract(NEW.`controller_policy_json`, '$.postTrimStabilizationBudget') <> 2
	OR json_extract(NEW.`controller_policy_json`, '$.finalVerifyBudget') <> 1
	OR json_extract(NEW.`controller_policy_json`, '$.rollbackVerifyBudget') <> 1
	OR json_extract(NEW.`controller_policy_json`, '$.maxSeeds') <> 2
	OR json_extract(NEW.`controller_policy_json`, '$.truePeakInteriorMarginDb') <> 0.05
	OR json_extract(NEW.`controller_policy_json`, '$.integratedBoundaryMarginLu') <> 0.05
	OR json_extract(NEW.`controller_policy_json`, '$.maxIntegratedTargetStepLu') <> 0.25
	OR json_extract(NEW.`controller_policy_json`, '$.roundDecimals') <> 6
	OR json_type(NEW.`candidates_json`) <> 'array'
	OR json_array_length(NEW.`candidates_json`) < 9
	OR json_array_length(NEW.`candidates_json`) > 19
	OR NEW.`last_candidate_ordinal` <> json_array_length(NEW.`candidates_json`) - 1
	OR NEW.`selected_candidate_ordinal` > NEW.`last_candidate_ordinal`
	OR NEW.`verified_candidate_ordinal` > NEW.`last_candidate_ordinal`
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_candidate_shape_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN EXISTS (
		SELECT 1 FROM json_each(NEW.`candidates_json`) AS `candidate`
		WHERE json_extract(`candidate`.`value`, '$.candidateOrdinal') <> `candidate`.`key`
			OR json_extract(`candidate`.`value`, '$.phase') NOT IN (
				'LRA_MAP','TP_CONTAINMENT','LUFS_TRIM','POST_TRIM_STABILIZATION',
				'FINAL_VERIFY','ROLLBACK_VERIFY')
			OR json_extract(`candidate`.`value`, '$.disposition') NOT IN (
				'LRA_BELOW_MIN','LRA_FEASIBLE_TP_SAFE','LRA_FEASIBLE_TP_UNCONTAINED',
				'LRA_ABOVE_MAX','TP_CONTAINED','TP_IMPROVING',
				'SEED_REJECTED_NON_IMPROVING','SEED_REJECTED_LRA_REGRESSION',
				'LUFS_TRIM_ACCEPTED','LUFS_TRIM_COMPLETE','SEED_REJECTED_TRIM_REGRESSION',
				'STABILIZATION_CONFIRMED','TP_STABILIZING',
				'SEED_REJECTED_STABILIZATION_REGRESSION','FINAL_PASS','FINAL_FAIL',
				'ROLLBACK_SAFE','ROLLBACK_DRIFT')
			OR json_extract(`candidate`.`value`, '$.phaseSlot') <> (
				SELECT COUNT(*) FROM json_each(NEW.`candidates_json`) AS `prior`
				WHERE CAST(`prior`.`key` AS INTEGER) <= CAST(`candidate`.`key` AS INTEGER)
					AND json_extract(`prior`.`value`, '$.phase')
						= json_extract(`candidate`.`value`, '$.phase'))
			OR json_extract(`candidate`.`value`, '$.losslessReferenceSha256')
				<> NEW.`lossless_reference_sha256`
			OR COALESCE(length(json_extract(
				`candidate`.`value`, '$.encodedArtifactSha256')), 0) <> 64
			OR COALESCE(json_type(`candidate`.`value`, '$.integratedLufs'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.truePeakDbtp'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.loudnessRangeLu'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.integratedTargetLufs'), '')
				NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.limiterCeilingDbtp'), '')
				NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.macroDepthDb'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.targetStepLufs'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.ceilingStepDb'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.codecOvershootDb'), '') NOT IN ('integer','real')
			OR COALESCE(json_type(`candidate`.`value`, '$.integratedLufsExact'), '') <> 'text'
			OR COALESCE(json_type(`candidate`.`value`, '$.truePeakDbtpExact'), '') <> 'text'
			OR COALESCE(json_type(`candidate`.`value`, '$.loudnessRangeLuExact'), '') <> 'text'
			OR CAST(json_extract(`candidate`.`value`, '$.integratedLufsExact') AS REAL)
				<> json_extract(`candidate`.`value`, '$.integratedLufs')
			OR CAST(json_extract(`candidate`.`value`, '$.truePeakDbtpExact') AS REAL)
				<> json_extract(`candidate`.`value`, '$.truePeakDbtp')
			OR CAST(json_extract(`candidate`.`value`, '$.loudnessRangeLuExact') AS REAL)
				<> json_extract(`candidate`.`value`, '$.loudnessRangeLu')
			OR COALESCE(length(json_extract(
				`candidate`.`value`, '$.audioFrameMd5Sha256')), 0) <> 64
			OR abs(json_extract(`candidate`.`value`, '$.targetStepLufs')) > 0.25
			OR json_type(`candidate`.`value`, '$.failedPredicates') <> 'array'
			OR EXISTS (
				SELECT 1 FROM json_each(json_extract(`candidate`.`value`, '$.failedPredicates'))
				WHERE `value` NOT IN ('INTEGRATED_LUFS_BELOW_MIN','INTEGRATED_LUFS_ABOVE_MAX',
					'TRUE_PEAK_DBTP_ABOVE_MAX','LOUDNESS_RANGE_LU_BELOW_MIN',
					'LOUDNESS_RANGE_LU_ABOVE_MAX'))
			OR json_array_length(json_extract(`candidate`.`value`, '$.failedPredicates'))
				<> (SELECT COUNT(DISTINCT `value`) FROM json_each(
					json_extract(`candidate`.`value`, '$.failedPredicates')))
	)
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_candidate_phase_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN EXISTS (
		SELECT 1 FROM json_each(NEW.`candidates_json`) AS `candidate`
		WHERE (json_extract(`candidate`.`value`, '$.phase') <> 'ROLLBACK_VERIFY'
				AND json_extract(`candidate`.`value`, '$.macroDepthDb') NOT BETWEEN 10.9 AND 14)
			OR (json_extract(`candidate`.`value`, '$.phase') = 'ROLLBACK_VERIFY'
				AND json_extract(`candidate`.`value`, '$.macroDepthDb') <> 10.70625)
			OR (json_extract(`candidate`.`value`, '$.phase') = 'LRA_MAP' AND (
				json_type(`candidate`.`value`, '$.seedOrdinal') <> 'null'
				OR json_type(`candidate`.`value`, '$.seedMapCandidateOrdinal') <> 'null'
				OR json_type(`candidate`.`value`, '$.parentCandidateOrdinal') <> 'null'
				OR json_type(`candidate`.`value`, '$.rollbackToCandidateOrdinal') <> 'null'
				OR json_extract(`candidate`.`value`, '$.integratedTargetLufs') <> -14
				OR json_extract(`candidate`.`value`, '$.targetStepLufs') <> 0
				OR json_extract(`candidate`.`value`, '$.ceilingStepDb') <> 0))
			OR (json_extract(`candidate`.`value`, '$.phase') NOT IN ('LRA_MAP','ROLLBACK_VERIFY')
				AND (json_extract(`candidate`.`value`, '$.seedOrdinal') NOT IN (0,1)
					OR json_extract(`candidate`.`value`, '$.seedMapCandidateOrdinal') NOT BETWEEN 0 AND 7
					OR json_extract(`candidate`.`value`, '$.parentCandidateOrdinal') NOT BETWEEN 0
						AND CAST(`candidate`.`key` AS INTEGER) - 1
					OR json_type(`candidate`.`value`, '$.rollbackToCandidateOrdinal') <> 'null'))
			OR (json_extract(`candidate`.`value`, '$.phase') = 'ROLLBACK_VERIFY' AND (
				json_type(`candidate`.`value`, '$.seedOrdinal') <> 'null'
				OR json_type(`candidate`.`value`, '$.seedMapCandidateOrdinal') <> 'null'
				OR json_type(`candidate`.`value`, '$.parentCandidateOrdinal') <> 'null'
				OR json_type(`candidate`.`value`, '$.rollbackToCandidateOrdinal') <> 'null'
				OR json_extract(`candidate`.`value`, '$.integratedTargetLufs')
					<> json_extract(NEW.`parent_guard_trace_json`, '$.candidates[5].integratedTargetLufs')
				OR json_extract(`candidate`.`value`, '$.limiterCeilingDbtp')
					<> json_extract(NEW.`parent_guard_trace_json`, '$.candidates[5].limiterCeilingDbtp')
				OR json_extract(`candidate`.`value`, '$.targetStepLufs') <> 0
				OR json_extract(`candidate`.`value`, '$.ceilingStepDb') <> 0))
	)
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_candidate_threshold_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN EXISTS (
		SELECT 1 FROM json_each(NEW.`candidates_json`) AS `candidate`
		WHERE ((json_extract(`candidate`.`value`, '$.integratedLufs') < -15) <> EXISTS (
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
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_lattice_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN (SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'LRA_MAP') <> 8
	OR (SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE CAST(`key` AS INTEGER) BETWEEN 0 AND 7
			AND json_extract(`value`, '$.phase') = 'LRA_MAP') <> 8
	OR json_extract(NEW.`candidates_json`, '$[0].macroDepthDb') <> 14
	OR json_extract(NEW.`candidates_json`, '$[1].macroDepthDb') <> 12.45
	OR json_extract(NEW.`candidates_json`, '$[2].macroDepthDb') <> 11.675
	OR json_extract(NEW.`candidates_json`, '$[3].macroDepthDb') <> 13.225
	OR json_extract(NEW.`candidates_json`, '$[4].macroDepthDb') <> 11.2875
	OR json_extract(NEW.`candidates_json`, '$[5].macroDepthDb') <> 12.0625
	OR json_extract(NEW.`candidates_json`, '$[6].macroDepthDb') <> 12.8375
	OR json_extract(NEW.`candidates_json`, '$[7].macroDepthDb') <> 13.6125
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_budget_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN json_extract(NEW.`budget_ledger_json`, '$.LRA_MAP.limit') <> 8
	OR json_extract(NEW.`budget_ledger_json`, '$.TP_CONTAINMENT.limit') <> 4
	OR json_extract(NEW.`budget_ledger_json`, '$.LUFS_TRIM.limit') <> 3
	OR json_extract(NEW.`budget_ledger_json`, '$.POST_TRIM_STABILIZATION.limit') <> 2
	OR json_extract(NEW.`budget_ledger_json`, '$.FINAL_VERIFY.limit') <> 1
	OR json_extract(NEW.`budget_ledger_json`, '$.ROLLBACK_VERIFY.limit') <> 1
	OR json_extract(NEW.`budget_ledger_json`, '$.TOTAL.limit') <> 19
	OR json_extract(NEW.`budget_ledger_json`, '$.LRA_MAP.used') <> (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'LRA_MAP')
	OR json_extract(NEW.`budget_ledger_json`, '$.LRA_MAP.remaining') <> 8 - (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'LRA_MAP')
	OR json_extract(NEW.`budget_ledger_json`, '$.TP_CONTAINMENT.used') <> (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'TP_CONTAINMENT')
	OR json_extract(NEW.`budget_ledger_json`, '$.TP_CONTAINMENT.remaining') <> 4 - (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'TP_CONTAINMENT')
	OR json_extract(NEW.`budget_ledger_json`, '$.LUFS_TRIM.used') <> (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'LUFS_TRIM')
	OR json_extract(NEW.`budget_ledger_json`, '$.LUFS_TRIM.remaining') <> 3 - (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'LUFS_TRIM')
	OR json_extract(NEW.`budget_ledger_json`, '$.POST_TRIM_STABILIZATION.used') <> (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'POST_TRIM_STABILIZATION')
	OR json_extract(NEW.`budget_ledger_json`, '$.POST_TRIM_STABILIZATION.remaining') <> 2 - (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'POST_TRIM_STABILIZATION')
	OR json_extract(NEW.`budget_ledger_json`, '$.FINAL_VERIFY.used') <> (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'FINAL_VERIFY')
	OR json_extract(NEW.`budget_ledger_json`, '$.FINAL_VERIFY.remaining') <> 1 - (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'FINAL_VERIFY')
	OR json_extract(NEW.`budget_ledger_json`, '$.ROLLBACK_VERIFY.used') <> (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'ROLLBACK_VERIFY')
	OR json_extract(NEW.`budget_ledger_json`, '$.ROLLBACK_VERIFY.remaining') <> 1 - (
		SELECT COUNT(*) FROM json_each(NEW.`candidates_json`)
		WHERE json_extract(`value`, '$.phase') = 'ROLLBACK_VERIFY')
	OR json_extract(NEW.`budget_ledger_json`, '$.TOTAL.used')
		<> json_array_length(NEW.`candidates_json`)
	OR json_extract(NEW.`budget_ledger_json`, '$.TOTAL.remaining')
		<> 19 - json_array_length(NEW.`candidates_json`)
	OR json_extract(NEW.`budget_ledger_json`, '$.LRA_MAP.remaining') < 0
	OR json_extract(NEW.`budget_ledger_json`, '$.TP_CONTAINMENT.remaining') < 0
	OR json_extract(NEW.`budget_ledger_json`, '$.LUFS_TRIM.remaining') < 0
	OR json_extract(NEW.`budget_ledger_json`, '$.POST_TRIM_STABILIZATION.remaining') < 0
	OR json_extract(NEW.`budget_ledger_json`, '$.FINAL_VERIFY.remaining') < 0
	OR json_extract(NEW.`budget_ledger_json`, '$.ROLLBACK_VERIFY.remaining') < 0
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_rollback_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN json_extract(NEW.`safe_rollback_json`, '$.parentCandidatePass') <> 5
	OR json_extract(NEW.`safe_rollback_json`, '$.losslessReferenceSha256')
		<> NEW.`lossless_reference_sha256`
	OR json_extract(NEW.`safe_rollback_json`, '$.integratedLufs') <> -15.25
	OR json_extract(NEW.`safe_rollback_json`, '$.truePeakDbtp') <> -1.06
	OR json_extract(NEW.`safe_rollback_json`, '$.loudnessRangeLu') <> 3.2
	OR (json_extract(NEW.`candidates_json`,
		'$[' || NEW.`last_candidate_ordinal` || '].disposition') = 'ROLLBACK_SAFE' AND (
		json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].integratedTargetLufs')
			<> json_extract(NEW.`safe_rollback_json`, '$.integratedTargetLufs')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].limiterCeilingDbtp')
			<> json_extract(NEW.`safe_rollback_json`, '$.limiterCeilingDbtp')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].macroDepthDb')
			<> json_extract(NEW.`safe_rollback_json`, '$.macroDepthDb')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].integratedLufsExact')
			<> json_extract(NEW.`safe_rollback_json`, '$.integratedLufsExact')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].truePeakDbtpExact')
			<> json_extract(NEW.`safe_rollback_json`, '$.truePeakDbtpExact')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].loudnessRangeLuExact')
			<> json_extract(NEW.`safe_rollback_json`, '$.loudnessRangeLuExact')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].audioFrameMd5Sha256')
			<> json_extract(NEW.`safe_rollback_json`, '$.audioFrameMd5Sha256')))
	OR (json_extract(NEW.`candidates_json`,
		'$[' || NEW.`last_candidate_ordinal` || '].disposition') = 'ROLLBACK_DRIFT'
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].integratedTargetLufs')
			= json_extract(NEW.`safe_rollback_json`, '$.integratedTargetLufs')
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].limiterCeilingDbtp')
			= json_extract(NEW.`safe_rollback_json`, '$.limiterCeilingDbtp')
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].macroDepthDb')
			= json_extract(NEW.`safe_rollback_json`, '$.macroDepthDb')
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].integratedLufsExact')
			= json_extract(NEW.`safe_rollback_json`, '$.integratedLufsExact')
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].truePeakDbtpExact')
			= json_extract(NEW.`safe_rollback_json`, '$.truePeakDbtpExact')
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].loudnessRangeLuExact')
			= json_extract(NEW.`safe_rollback_json`, '$.loudnessRangeLuExact')
		AND json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].audioFrameMd5Sha256')
			= json_extract(NEW.`safe_rollback_json`, '$.audioFrameMd5Sha256'))
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_final_projection_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN NEW.`final_integrated_lufs` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].integratedLufs')
	OR NEW.`final_integrated_lufs_exact` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].integratedLufsExact')
	OR NEW.`final_true_peak_dbtp` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].truePeakDbtp')
	OR NEW.`final_true_peak_dbtp_exact` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].truePeakDbtpExact')
	OR NEW.`final_loudness_range_lu` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].loudnessRangeLu')
	OR NEW.`final_loudness_range_lu_exact` <>
		json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].loudnessRangeLuExact')
	OR json(NEW.`failed_predicates_json`) <> json_extract(
		NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].failedPredicates')
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_pass_terminal_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN (NEW.`terminal_reason` = 'PASS' AND (
		NEW.`shadow_outcome` <> 'PASS'
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].phase')
			<> 'FINAL_VERIFY'
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].disposition')
			<> 'FINAL_PASS'
		OR NEW.`verified_candidate_ordinal` IS NULL
		OR NEW.`selected_candidate_ordinal` <> NEW.`verified_candidate_ordinal`
		OR NEW.`selected_candidate_ordinal` <> json_extract(
			NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].parentCandidateOrdinal')
		OR NEW.`selected_seed_ordinal` IS NOT json_extract(
			NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].seedOrdinal')
		OR json_extract(NEW.`safe_rollback_json`, '$.verificationCandidateOrdinal') IS NOT NULL
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].encodedArtifactSha256')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].encodedArtifactSha256')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].integratedTargetLufs')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].integratedTargetLufs')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].limiterCeilingDbtp')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].limiterCeilingDbtp')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].macroDepthDb')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].macroDepthDb')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].integratedLufsExact')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].integratedLufsExact')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].truePeakDbtpExact')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].truePeakDbtpExact')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].loudnessRangeLuExact')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].loudnessRangeLuExact')
		OR json_extract(NEW.`candidates_json`,
			'$[' || NEW.`last_candidate_ordinal` || '].audioFrameMd5Sha256')
			<> json_extract(NEW.`candidates_json`,
				'$[' || NEW.`selected_candidate_ordinal` || '].audioFrameMd5Sha256')
		OR json_array_length(NEW.`failed_predicates_json`) <> 0))
	BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_fail_terminal_insert`
BEFORE INSERT ON `stage12_codec_safe_lra_feasibility_search_evidence`
WHEN (NEW.`terminal_reason` = 'FEASIBILITY_NOT_PROVEN_BUDGET_EXHAUSTED' AND (
		NEW.`shadow_outcome` <> 'FAIL'
		OR NEW.`selected_seed_ordinal` IS NOT NULL OR NEW.`verified_candidate_ordinal` IS NOT NULL
		OR NEW.`selected_candidate_ordinal` <> NEW.`last_candidate_ordinal`
		OR json_extract(NEW.`safe_rollback_json`, '$.verificationCandidateOrdinal')
			<> NEW.`last_candidate_ordinal`
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].phase')
			<> 'ROLLBACK_VERIFY'
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].disposition')
			<> 'ROLLBACK_SAFE'
		OR EXISTS (SELECT 1 FROM json_each(NEW.`candidates_json`)
			WHERE json_extract(`value`, '$.disposition') = 'FINAL_FAIL')))
	OR (NEW.`terminal_reason` = 'FINAL_SAME_ARTIFACT_VERIFICATION_FAILED' AND (
		NEW.`shadow_outcome` <> 'FAIL'
		OR NEW.`selected_seed_ordinal` IS NOT NULL OR NEW.`verified_candidate_ordinal` IS NOT NULL
		OR NEW.`selected_candidate_ordinal` <> NEW.`last_candidate_ordinal`
		OR json_extract(NEW.`safe_rollback_json`, '$.verificationCandidateOrdinal')
			<> NEW.`last_candidate_ordinal`
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].phase')
			<> 'ROLLBACK_VERIFY'
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].disposition')
			<> 'ROLLBACK_SAFE'
		OR NOT EXISTS (SELECT 1 FROM json_each(NEW.`candidates_json`)
			WHERE json_extract(`value`, '$.disposition') = 'FINAL_FAIL')))
	OR (NEW.`terminal_reason` = 'SAFE_ROLLBACK_REPRODUCTION_DRIFT' AND (
		NEW.`shadow_outcome` <> 'FAIL'
		OR NEW.`selected_seed_ordinal` IS NOT NULL OR NEW.`verified_candidate_ordinal` IS NOT NULL
		OR NEW.`selected_candidate_ordinal` <> NEW.`last_candidate_ordinal`
		OR json_extract(NEW.`safe_rollback_json`, '$.verificationCandidateOrdinal')
			<> NEW.`last_candidate_ordinal`
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].phase')
			<> 'ROLLBACK_VERIFY'
		OR json_extract(NEW.`candidates_json`, '$[' || NEW.`last_candidate_ordinal` || '].disposition')
			<> 'ROLLBACK_DRIFT'))
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_immutable_update`
BEFORE UPDATE ON `stage12_codec_safe_lra_feasibility_search_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_codec_safe_lra_feasibility_search_evidence_immutable_delete`
BEFORE DELETE ON `stage12_codec_safe_lra_feasibility_search_evidence`
BEGIN SELECT RAISE(ABORT, 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_EVIDENCE_IMMUTABLE'); END;
--> statement-breakpoint
DROP TRIGGER command_log_validate_insert;
--> statement-breakpoint
CREATE TRIGGER command_log_validate_insert
BEFORE INSERT ON command_log
WHEN length(NEW.idempotency_key) <> 64
  OR CASE NEW.command_type
    WHEN 'PREPARE_CHANNEL' THEN CASE
      WHEN NEW.next_state = 'CHANNEL_PREPARED' THEN 0 ELSE 1 END
    WHEN 'REGISTER_QUALIFIED_VOICE' THEN CASE
      WHEN NEW.next_state = 'VOICE_QUALIFIED' THEN 0 ELSE 1 END
    WHEN 'START_TRACK_G_VIDEO_1_QUALIFICATION' THEN CASE
      WHEN NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_00_READY' THEN 0 ELSE 1 END
    WHEN 'START_STAGE' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_00_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_01_READY' THEN 0 ELSE 1 END
    WHEN 'PREPARE_TRACK_G_VIDEO_1_STAGE_04_TOURNAMENT' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_04_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION' THEN 0 ELSE 1 END
    WHEN 'SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_05_READY' THEN 0 ELSE 1 END
    WHEN 'PREPARE_TRACK_G_VIDEO_1_STAGE_06_SCRIPT' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_06_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL' THEN 0 ELSE 1 END
    WHEN 'APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_07A_READY' THEN 0 ELSE 1 END
    WHEN 'PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_07A_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE' THEN 0 ELSE 1 END
    WHEN 'SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_07A_AWAITING_TONE'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_07B_READY' THEN 0 ELSE 1 END
    WHEN 'PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_09_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL' THEN 0 ELSE 1 END
    WHEN 'SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_09_AWAITING_THUMBNAIL'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_10_READY' THEN 0 ELSE 1 END
    WHEN 'START_TRACK_G_VIDEO_1_STAGE_10' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_10_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_10_PENDING' THEN 0 ELSE 1 END
    WHEN 'FINALIZE_TRACK_G_VIDEO_1_STAGE_10' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_10_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_11_READY' THEN 0 ELSE 1 END
    WHEN 'START_TRACK_G_VIDEO_1_STAGE_12' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_PENDING' THEN 0 ELSE 1 END
    WHEN 'RECOVER_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_FAILED'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_PENDING' THEN 0 ELSE 1 END
    WHEN 'SCAN_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_FAILED'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_DIAGNOSTIC_PENDING' THEN 0 ELSE 1 END
    WHEN 'CREATE_TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_CORRECTION' THEN CASE
      WHEN NEW.prev_state IN (
        'TRACK_G_VIDEO_1_STAGE_12_CORRECTED_FAIL',
        'TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_FAIL'
      ) AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_PENDING' THEN 0 ELSE 1 END
    WHEN 'RUN_TRACK_G_VIDEO_1_STAGE_12_ENCODED_LOUDNESS_DIAGNOSTIC_REPLAY' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_AUDIO_P0_FAIL'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_PENDING' THEN 0 ELSE 1 END
    WHEN 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_TRUE_PEAK_SHADOW_REPLAY' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_LOUDNESS_REPLAY_FAIL'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_SHADOW_PENDING' THEN 0 ELSE 1 END
    WHEN 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_REPLAY' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_SHADOW_FAIL'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_PENDING'
        THEN 0 ELSE 1 END
    WHEN 'RUN_TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_GUARD_SHADOW_FAIL'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH_PENDING'
        THEN 0 ELSE 1 END
    WHEN 'FINALIZE_TRACK_G_VIDEO_1_STAGE_12' THEN CASE
      WHEN NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_READY'
        AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_13_READY' THEN 0 ELSE 1 END
    WHEN 'ADVANCE_TRACK_G_VIDEO_1_STAGE' THEN CASE
      NEW.prev_state || '>' || NEW.next_state
      WHEN 'TRACK_G_VIDEO_1_STAGE_01_READY>TRACK_G_VIDEO_1_STAGE_02_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_02_READY>TRACK_G_VIDEO_1_STAGE_03_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_03_READY>TRACK_G_VIDEO_1_STAGE_04_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_04_READY>TRACK_G_VIDEO_1_STAGE_05_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_05_READY>TRACK_G_VIDEO_1_STAGE_06_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_06_READY>TRACK_G_VIDEO_1_STAGE_07A_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_07A_READY>TRACK_G_VIDEO_1_STAGE_07B_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_07B_READY>TRACK_G_VIDEO_1_STAGE_08_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_08_READY>TRACK_G_VIDEO_1_STAGE_09_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_09_READY>TRACK_G_VIDEO_1_STAGE_10_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_10_READY>TRACK_G_VIDEO_1_STAGE_11_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_11_READY>TRACK_G_VIDEO_1_STAGE_12_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_12_READY>TRACK_G_VIDEO_1_STAGE_13_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_13_READY>TRACK_G_VIDEO_1_STAGE_14_READY' THEN 0
      WHEN 'TRACK_G_VIDEO_1_STAGE_14_READY>TRACK_G_VIDEO_1_STAGE_15_READY' THEN 0
      ELSE 1
    END
    ELSE 1
  END
BEGIN SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION'); END;
