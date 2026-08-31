CREATE TABLE `script_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`title` text NOT NULL,
	`hook` text NOT NULL,
	`sections_json` text NOT NULL,
	`word_count` integer NOT NULL,
	`estimated_duration_sec` integer NOT NULL,
	`number_trace_json` text NOT NULL,
	`advice_lint_state` text NOT NULL,
	`script_lint_state` text NOT NULL,
	`number_trace_state` text NOT NULL,
	`r2_key` text NOT NULL,
	`canonical_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_instance_id`) REFERENCES `stage_instance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `script_draft_package_unique` ON `script_draft` (`package_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `script_draft_stage_unique` ON `script_draft` (`stage_instance_id`);
--> statement-breakpoint
CREATE TRIGGER script_draft_contract
BEFORE INSERT ON script_draft
WHEN length(trim(NEW.title)) < 20
  OR length(trim(NEW.hook)) < 30
  OR NEW.word_count < 700
  OR NEW.word_count > 1300
  OR NEW.estimated_duration_sec < 420
  OR NEW.estimated_duration_sec > 600
  OR json_valid(NEW.sections_json) <> 1
  OR json_type(NEW.sections_json) <> 'array'
  OR json_array_length(NEW.sections_json) <> 6
  OR json_valid(NEW.number_trace_json) <> 1
  OR json_type(NEW.number_trace_json) <> 'array'
  OR json_array_length(NEW.number_trace_json) < 2
  OR NEW.advice_lint_state <> 'PASS'
  OR NEW.script_lint_state <> 'PASS'
  OR NEW.number_trace_state <> 'PASS'
  OR length(NEW.canonical_hash) <> 64
BEGIN SELECT RAISE(ABORT, 'SCRIPT_DRAFT_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER script_draft_append_only_update BEFORE UPDATE ON script_draft
BEGIN SELECT RAISE(ABORT, 'SCRIPT_DRAFT_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER script_draft_append_only_delete BEFORE DELETE ON script_draft
BEGIN SELECT RAISE(ABORT, 'SCRIPT_DRAFT_APPEND_ONLY'); END;
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
    AND
    (NEW.command_type <> 'START_STAGE' OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_00_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_01_READY')
    AND
    (NEW.command_type <> 'PREPARE_TRACK_G_VIDEO_1_STAGE_04_TOURNAMENT'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_04_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION')
    AND
    (NEW.command_type <> 'SELECT_TRACK_G_VIDEO_1_STAGE_04_CHAMPION'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_04_AWAITING_CHAMPION'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_05_READY')
    AND
    (NEW.command_type <> 'PREPARE_TRACK_G_VIDEO_1_STAGE_06_SCRIPT'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_06_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL')
    AND
    (NEW.command_type <> 'APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL'
      OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_06_AWAITING_EDITORIAL'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_07A_READY')
    AND
    (NEW.command_type <> 'ADVANCE_TRACK_G_VIDEO_1_STAGE' OR NOT (
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
