CREATE TABLE `stage10_audio_production` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider` text NOT NULL,
	`provider_call_count` integer NOT NULL,
	`total_characters` integer NOT NULL,
	`reserved_usd` real NOT NULL,
	`actual_usd` real NOT NULL,
	`calibration_evidence_sha256` text NOT NULL,
	`worker_image_digest` text NOT NULL,
	`narration_r2_key` text NOT NULL,
	`narration_sha256` text NOT NULL,
	`evidence_r2_key` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_instance_id`) REFERENCES `stage_instance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage10_audio_production_package_unique` ON `stage10_audio_production` (`package_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stage10_audio_production_stage_unique` ON `stage10_audio_production` (`stage_instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stage10_audio_production_idempotency_unique` ON `stage10_audio_production` (`idempotency_key`);
