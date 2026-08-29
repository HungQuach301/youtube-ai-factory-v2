CREATE TABLE `track_g_run_contract` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_run_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`profile` text NOT NULL,
	`assurance_mode` text NOT NULL,
	`execution_namespace` text NOT NULL,
	`stage_plan_json` text NOT NULL,
	`stop_before_stage` text NOT NULL,
	`preserve_rejected_candidates` integer NOT NULL,
	`release_eligible` integer NOT NULL,
	`provider_dispatch` integer NOT NULL,
	`auto_publish` integer NOT NULL,
	`bootstrap_evidence_r2_key` text NOT NULL,
	`bootstrap_evidence_sha256` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`operation_run_id`) REFERENCES `operation_run`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_g_run_operation_unique` ON `track_g_run_contract` (`operation_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `track_g_run_episode_unique` ON `track_g_run_contract` (`episode_id`);
--> statement-breakpoint
CREATE TRIGGER track_g_run_contract_insert_guard
BEFORE INSERT ON track_g_run_contract
WHEN NEW.profile <> 'REDUCED'
  OR NEW.assurance_mode <> 'WARNING_ONLY'
  OR NEW.execution_namespace <> 'production'
  OR NEW.stage_plan_json <> '["00","01","02","03","04","05","06","07A","07B","08","09","10","11","12","13","14"]'
  OR NEW.stop_before_stage <> '15'
  OR NEW.preserve_rejected_candidates <> 1
  OR NEW.release_eligible <> 0
  OR NEW.provider_dispatch <> 0
  OR NEW.auto_publish <> 0
  OR NEW.bootstrap_evidence_r2_key NOT LIKE 'qual/g02i/video-1/%'
  OR length(NEW.bootstrap_evidence_sha256) <> 64
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_RUN_CONTRACT_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER track_g_run_contract_append_only_update
BEFORE UPDATE ON track_g_run_contract
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_RUN_CONTRACT_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER track_g_run_contract_append_only_delete
BEFORE DELETE ON track_g_run_contract
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_RUN_CONTRACT_APPEND_ONLY');
END;
--> statement-breakpoint
DROP TRIGGER command_log_validate_insert;
--> statement-breakpoint
CREATE TRIGGER command_log_validate_insert
BEFORE INSERT ON command_log
WHEN length(NEW.idempotency_key) <> 64
  OR (
    (NEW.command_type <> 'PREPARE_CHANNEL' OR NEW.next_state <> 'CHANNEL_PREPARED')
    AND
    (NEW.command_type <> 'REGISTER_QUALIFIED_VOICE' OR NEW.next_state <> 'VOICE_QUALIFIED')
    AND
    (NEW.command_type <> 'START_TRACK_G_VIDEO_1_QUALIFICATION' OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_00_READY')
  )
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION');
END;
