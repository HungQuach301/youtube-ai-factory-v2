CREATE TABLE `stage10_media_job` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`operation_run_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`provider_idempotency_key` text NOT NULL,
	`callback_token_hash` text NOT NULL,
	`state` text NOT NULL CHECK (`state` IN ('PENDING', 'READY', 'FAILED')),
	`receipt_r2_key` text,
	`receipt_sha256` text,
	`worker_image_digest` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_run_id`) REFERENCES `operation_run`(`id`) ON UPDATE no action ON DELETE no action,
	CHECK ((`state` = 'READY' AND `receipt_r2_key` IS NOT NULL AND `receipt_sha256` IS NOT NULL AND `worker_image_digest` IS NOT NULL AND `error_code` IS NULL)
		OR (`state` = 'FAILED' AND `receipt_r2_key` IS NULL AND `receipt_sha256` IS NULL AND `error_code` IS NOT NULL)
		OR (`state` = 'PENDING' AND `receipt_r2_key` IS NULL AND `receipt_sha256` IS NULL AND `error_code` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage10_media_job_package_unique` ON `stage10_media_job` (`package_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage10_media_job_provider_key_unique` ON `stage10_media_job` (`provider_idempotency_key`);
