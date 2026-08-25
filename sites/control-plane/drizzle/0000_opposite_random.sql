CREATE TABLE `channel_identity_contract` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`version` integer NOT NULL,
	`payload_json` text NOT NULL,
	`canonical_hash` text NOT NULL,
	`approval_state` text DEFAULT 'APPROVED_SOURCE' NOT NULL,
	`sealed_at` text,
	FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `channel` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`niche_key` text NOT NULL,
	`market` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'PREPARED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_niche_key_unique` ON `channel` (`niche_key`);--> statement-breakpoint
CREATE TABLE `command_log` (
	`id` text PRIMARY KEY NOT NULL,
	`command_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_identity` text NOT NULL,
	`prev_state` text,
	`next_state` text,
	`trace_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_identity`) REFERENCES `owner_identity`(`identity`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `command_idempotency_key_unique` ON `command_log` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `episode` (
	`id` text PRIMARY KEY NOT NULL,
	`pillar_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillar`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hp_decision` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_key` text NOT NULL,
	`actor_identity` text NOT NULL,
	`payload_json` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_identity`) REFERENCES `owner_identity`(`identity`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hp_decision_key_unique` ON `hp_decision` (`decision_key`);--> statement-breakpoint
CREATE TABLE `operation_event` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `operation_run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operation_event_run_ordinal_unique` ON `operation_event` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `operation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`command_id` text NOT NULL,
	`channel_id` text,
	`status` text NOT NULL,
	`objective` text NOT NULL,
	`current_step` text NOT NULL,
	`blocker_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`command_id`) REFERENCES `command_log`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `owner_identity` (
	`identity` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pillar` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER `command_log_validate_insert`
BEFORE INSERT ON `command_log`
WHEN NEW.command_type <> 'PREPARE_CHANNEL'
  OR length(NEW.idempotency_key) <> 64
  OR NEW.next_state <> 'CHANNEL_PREPARED'
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION');
END;
--> statement-breakpoint
CREATE TRIGGER `command_log_append_only_update`
BEFORE UPDATE ON `command_log`
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_LOG_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER `command_log_append_only_delete`
BEFORE DELETE ON `command_log`
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_LOG_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER `hp_decision_append_only_update`
BEFORE UPDATE ON `hp_decision`
BEGIN
  SELECT RAISE(ABORT, 'HP_DECISION_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER `hp_decision_append_only_delete`
BEFORE DELETE ON `hp_decision`
BEGIN
  SELECT RAISE(ABORT, 'HP_DECISION_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER `operation_event_append_only_update`
BEFORE UPDATE ON `operation_event`
BEGIN
  SELECT RAISE(ABORT, 'OPERATION_EVENT_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER `operation_event_append_only_delete`
BEFORE DELETE ON `operation_event`
BEGIN
  SELECT RAISE(ABORT, 'OPERATION_EVENT_APPEND_ONLY');
END;
