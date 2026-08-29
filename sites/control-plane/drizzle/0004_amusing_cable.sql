CREATE TABLE `content_brief` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`version` integer NOT NULL,
	`payload_json` text NOT NULL,
	`canonical_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_brief_episode_version_unique` ON `content_brief` (`episode_id`,`version`);--> statement-breakpoint
CREATE TABLE `production_package` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`namespace` text NOT NULL,
	`brief_hash` text NOT NULL,
	`identity_contract_id` text NOT NULL,
	`request_ceiling` integer NOT NULL,
	`spend_ceiling_usd` real NOT NULL,
	`auto_dispatch` integer DEFAULT 0 NOT NULL,
	`auto_publish` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`identity_contract_id`) REFERENCES `channel_identity_contract`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_package_episode_unique` ON `production_package` (`episode_id`);--> statement-breakpoint
CREATE TABLE `spend_ceiling` (
	`scope` text NOT NULL,
	`scope_ref` text NOT NULL,
	`ceiling_usd` real NOT NULL,
	`window_start` text,
	`window_end` text,
	PRIMARY KEY(`scope`, `scope_ref`)
);
--> statement-breakpoint
CREATE TABLE `stage_artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_instance_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`namespace` text NOT NULL,
	`r2_key` text NOT NULL,
	`canonical_hash` text NOT NULL,
	`immutability_state` text NOT NULL,
	`eligibility_state` text NOT NULL,
	`standard_version` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`stage_instance_id`) REFERENCES `stage_instance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage_artifact_stage_type_unique` ON `stage_artifact` (`stage_instance_id`,`artifact_type`);--> statement-breakpoint
CREATE TABLE `stage_instance` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`stage_code` text NOT NULL,
	`control_state` text NOT NULL,
	`standard_version` integer NOT NULL,
	`attempt_ordinal` integer DEFAULT 1 NOT NULL,
	`started_at` text,
	`frozen_at` text,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage_instance_package_stage_attempt_unique` ON `stage_instance` (`package_id`,`stage_code`,`attempt_ordinal`);
--> statement-breakpoint
CREATE TRIGGER content_brief_insert_guard
BEFORE INSERT ON content_brief
WHEN NEW.version <> 1
  OR length(NEW.canonical_hash) <> 64
  OR length(NEW.payload_json) < 2
BEGIN
  SELECT RAISE(ABORT, 'CONTENT_BRIEF_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER content_brief_append_only_update
BEFORE UPDATE ON content_brief
BEGIN
  SELECT RAISE(ABORT, 'CONTENT_BRIEF_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER content_brief_append_only_delete
BEFORE DELETE ON content_brief
BEGIN
  SELECT RAISE(ABORT, 'CONTENT_BRIEF_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER production_package_insert_guard
BEFORE INSERT ON production_package
WHEN NEW.namespace <> 'production'
  OR length(NEW.brief_hash) <> 64
  OR NEW.request_ceiling <> 0
  OR NEW.spend_ceiling_usd <> 30
  OR NEW.auto_dispatch <> 0
  OR NEW.auto_publish <> 0
  OR NEW.status <> 'RUNNING'
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_PRODUCTION_PACKAGE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER production_package_fail_closed_update
BEFORE UPDATE ON production_package
WHEN NEW.auto_dispatch <> 0
  OR NEW.auto_publish <> 0
  OR NEW.spend_ceiling_usd > OLD.spend_ceiling_usd
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_PRODUCTION_PACKAGE_FAIL_CLOSED');
END;
--> statement-breakpoint
CREATE TRIGGER production_package_no_delete
BEFORE DELETE ON production_package
BEGIN
  SELECT RAISE(ABORT, 'PRODUCTION_PACKAGE_NO_DELETE');
END;
--> statement-breakpoint
CREATE TRIGGER stage_00_instance_insert_guard
BEFORE INSERT ON stage_instance
WHEN NEW.stage_code = '00'
  AND (NEW.control_state <> 'FROZEN'
    OR NEW.standard_version <> 1
    OR NEW.attempt_ordinal <> 1
    OR NEW.started_at IS NULL
    OR NEW.frozen_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_STAGE_00_INSTANCE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER frozen_stage_instance_no_update
BEFORE UPDATE ON stage_instance
WHEN OLD.control_state = 'FROZEN'
BEGIN
  SELECT RAISE(ABORT, 'FROZEN_STAGE_INSTANCE_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER stage_instance_no_delete
BEFORE DELETE ON stage_instance
BEGIN
  SELECT RAISE(ABORT, 'STAGE_INSTANCE_NO_DELETE');
END;
--> statement-breakpoint
CREATE TRIGGER stage_artifact_insert_guard
BEFORE INSERT ON stage_artifact
WHEN NEW.namespace <> 'production'
  OR NEW.r2_key NOT LIKE 'prod/%'
  OR length(NEW.canonical_hash) <> 64
  OR NEW.immutability_state <> 'SEALED'
  OR NEW.eligibility_state <> 'ELIGIBLE_FOR_STAGE'
  OR NEW.standard_version <> 1
BEGIN
  SELECT RAISE(ABORT, 'TRACK_G_STAGE_ARTIFACT_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER stage_artifact_append_only_update
BEFORE UPDATE ON stage_artifact
BEGIN
  SELECT RAISE(ABORT, 'STAGE_ARTIFACT_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER stage_artifact_append_only_delete
BEFORE DELETE ON stage_artifact
BEGIN
  SELECT RAISE(ABORT, 'STAGE_ARTIFACT_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER spend_ceiling_insert_guard
BEFORE INSERT ON spend_ceiling
WHEN NEW.scope NOT IN ('PORTFOLIO','CHANNEL','PACKAGE','STAGE')
  OR NEW.ceiling_usd < 0
BEGIN
  SELECT RAISE(ABORT, 'SPEND_CEILING_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER spend_ceiling_only_tighten
BEFORE UPDATE ON spend_ceiling
WHEN NEW.ceiling_usd > OLD.ceiling_usd
BEGIN
  SELECT RAISE(ABORT, 'SPEND_CEILING_ONLY_TIGHTEN');
END;
--> statement-breakpoint
CREATE TRIGGER spend_ceiling_no_delete
BEFORE DELETE ON spend_ceiling
BEGIN
  SELECT RAISE(ABORT, 'SPEND_CEILING_NO_DELETE');
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
    AND
    (NEW.command_type <> 'START_STAGE' OR NEW.prev_state <> 'TRACK_G_VIDEO_1_STAGE_00_READY'
      OR NEW.next_state <> 'TRACK_G_VIDEO_1_STAGE_01_READY')
  )
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION');
END;
