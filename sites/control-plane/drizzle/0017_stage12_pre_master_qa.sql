CREATE TABLE `stage12_media_job` (
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
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_run_id`) REFERENCES `operation_run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_package_unique` ON `stage12_media_job` (`package_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_key_unique` ON `stage12_media_job` (`idempotency_key`);
--> statement-breakpoint
CREATE TRIGGER `stage12_media_job_ready_requires_receipt`
BEFORE UPDATE OF `state` ON `stage12_media_job`
WHEN NEW.state = 'READY' AND (NEW.receipt_r2_key IS NULL
  OR NEW.receipt_sha256 IS NULL OR NEW.worker_image_digest IS NULL)
BEGIN SELECT RAISE(ABORT, 'STAGE_12_READY_RECEIPT_REQUIRED'); END;
--> statement-breakpoint
CREATE TABLE `stage12_pre_master_qa` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`job_id` text NOT NULL,
	`pre_master_r2_key` text NOT NULL,
	`pre_master_sha256` text NOT NULL CHECK (length(`pre_master_sha256`) = 64),
	`frame_md5_sha256` text NOT NULL CHECK (length(`frame_md5_sha256`) = 64),
	`report_r2_key` text NOT NULL,
	`report_sha256` text NOT NULL CHECK (length(`report_sha256`) = 64),
	`measurements_json` text NOT NULL CHECK (json_valid(`measurements_json`)),
	`render_authorized` integer NOT NULL CHECK (`render_authorized` IN (0, 1)),
	`provider_call_count` integer NOT NULL CHECK (`provider_call_count` = 0),
	`reserved_usd` real NOT NULL CHECK (`reserved_usd` = 0),
	`actual_usd` real NOT NULL CHECK (`actual_usd` = 0),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_instance_id`) REFERENCES `stage_instance`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `stage12_media_job`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_pre_master_qa_package_unique` ON `stage12_pre_master_qa` (`package_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_pre_master_qa_stage_unique` ON `stage12_pre_master_qa` (`stage_instance_id`);
--> statement-breakpoint
CREATE TRIGGER `stage12_pre_master_qa_validate_insert`
BEFORE INSERT ON `stage12_pre_master_qa`
WHEN NEW.render_authorized <> 1
  OR json_extract(NEW.measurements_json, '$.p0DefectCount') <> 0
  OR json_extract(NEW.measurements_json, '$.missingInputCount') <> 0
  OR json_extract(NEW.measurements_json, '$.unresolvedRightsCount') <> 0
BEGIN SELECT RAISE(ABORT, 'STAGE_12_QA_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `track_g_video_1_command_contract`;
--> statement-breakpoint
CREATE TRIGGER `track_g_video_1_command_contract`
BEFORE INSERT ON `command_log`
WHEN (
  NEW.command_type = 'START_TRACK_G_VIDEO_1_STAGE_10'
  OR NEW.command_type = 'FINALIZE_TRACK_G_VIDEO_1_STAGE_10'
  OR NEW.command_type = 'START_TRACK_G_VIDEO_1_STAGE_12'
  OR NEW.command_type = 'FINALIZE_TRACK_G_VIDEO_1_STAGE_12'
  OR NEW.command_type = 'ADVANCE_TRACK_G_VIDEO_1_STAGE'
) AND NOT (
  (NEW.command_type = 'START_TRACK_G_VIDEO_1_STAGE_10'
    AND NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_10_READY'
    AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_10_PENDING')
  OR (NEW.command_type = 'FINALIZE_TRACK_G_VIDEO_1_STAGE_10'
    AND NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_10_READY'
    AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_11_READY')
  OR (NEW.command_type = 'START_TRACK_G_VIDEO_1_STAGE_12'
    AND NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_READY'
    AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_12_PENDING')
  OR (NEW.command_type = 'FINALIZE_TRACK_G_VIDEO_1_STAGE_12'
    AND NEW.prev_state = 'TRACK_G_VIDEO_1_STAGE_12_READY'
    AND NEW.next_state = 'TRACK_G_VIDEO_1_STAGE_13_READY')
  OR (NEW.command_type = 'ADVANCE_TRACK_G_VIDEO_1_STAGE'
    AND (
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
