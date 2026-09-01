PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `stage12_media_job_retry_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `stage12_media_job_ready_requires_receipt`;
--> statement-breakpoint
CREATE TABLE `__new_stage12_media_job` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`operation_run_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`idempotency_key` text NOT NULL CHECK (length(`idempotency_key`) = 64),
	`callback_token_hash` text NOT NULL CHECK (length(`callback_token_hash`) = 64),
	`state` text NOT NULL CHECK (`state` IN ('PENDING', 'READY', 'FAILED')),
	`receipt_r2_key` text,
	`receipt_sha256` text CHECK (`receipt_sha256` IS NULL OR length(`receipt_sha256`) = 64),
	`worker_image_digest` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`attempt_ordinal` integer DEFAULT 1 NOT NULL CHECK (`attempt_ordinal` BETWEEN 1 AND 3),
	`retry_of_job_id` text,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_run_id`) REFERENCES `operation_run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stage12_media_job` (`id`, `package_id`, `operation_run_id`,
  `stage_instance_id`, `idempotency_key`, `callback_token_hash`, `state`,
  `receipt_r2_key`, `receipt_sha256`, `worker_image_digest`, `error_code`,
  `created_at`, `updated_at`, `attempt_ordinal`, `retry_of_job_id`)
SELECT `id`, `package_id`, `operation_run_id`, `stage_instance_id`, `idempotency_key`,
  `callback_token_hash`, `state`, `receipt_r2_key`, `receipt_sha256`,
  `worker_image_digest`, `error_code`, `created_at`, `updated_at`,
  `attempt_ordinal`, `retry_of_job_id` FROM `stage12_media_job`;
--> statement-breakpoint
DROP TABLE `stage12_media_job`;
--> statement-breakpoint
ALTER TABLE `__new_stage12_media_job` RENAME TO `stage12_media_job`;
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_package_attempt_unique`
  ON `stage12_media_job` (`package_id`,`attempt_ordinal`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_retry_of_unique`
  ON `stage12_media_job` (`retry_of_job_id`) WHERE `retry_of_job_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_key_unique`
  ON `stage12_media_job` (`idempotency_key`);
--> statement-breakpoint
CREATE TRIGGER `stage12_media_job_ready_requires_receipt`
BEFORE UPDATE OF `state` ON `stage12_media_job`
WHEN NEW.state = 'READY' AND (NEW.receipt_r2_key IS NULL
  OR NEW.receipt_sha256 IS NULL OR NEW.worker_image_digest IS NULL)
BEGIN SELECT RAISE(ABORT, 'STAGE_12_READY_RECEIPT_REQUIRED'); END;
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
        'STAGE12_FRAME_HASH_FAILED'
      )
  ))
BEGIN
  SELECT RAISE(ABORT, 'STAGE12_RETRY_CONTRACT_VIOLATION');
END;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
