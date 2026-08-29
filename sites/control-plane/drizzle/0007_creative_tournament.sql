CREATE TABLE `creative_route_candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`blind_label` text NOT NULL,
	`route_order` integer NOT NULL,
	`route_name` text NOT NULL,
	`hook_type` text NOT NULL,
	`narrative_device` text NOT NULL,
	`route_json` text NOT NULL,
	`packaging_json` text NOT NULL,
	`eligibility_state` text NOT NULL,
	`aggregate_score` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `creative_tournament`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creative_route_tournament_blind_label_unique` ON `creative_route_candidate` (`tournament_id`,`blind_label`);--> statement-breakpoint
CREATE UNIQUE INDEX `creative_route_tournament_order_unique` ON `creative_route_candidate` (`tournament_id`,`route_order`);--> statement-breakpoint
CREATE TABLE `creative_tournament_judgment` (
	`tournament_id` text NOT NULL,
	`critic_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`rubric_version` text NOT NULL,
	`score_json` text NOT NULL,
	`total_score` real NOT NULL,
	`blind_input_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tournament_id`, `critic_id`, `candidate_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `creative_tournament`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `creative_route_candidate`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `creative_tournament_selection` (
	`tournament_id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`human_decision_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `creative_tournament`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `creative_route_candidate`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`human_decision_id`) REFERENCES `human_decision`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creative_tournament_selection_decision_unique` ON `creative_tournament_selection` (`human_decision_id`);--> statement-breakpoint
CREATE TABLE `creative_tournament` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`candidate_set_r2_key` text NOT NULL,
	`candidate_set_hash` text NOT NULL,
	`route_count` integer NOT NULL,
	`critic_count` integer NOT NULL,
	`generator_provenance` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_instance_id`) REFERENCES `stage_instance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creative_tournament_package_stage_unique` ON `creative_tournament` (`package_id`,`stage_instance_id`);--> statement-breakpoint
CREATE TABLE `human_decision` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`decision_type` text NOT NULL,
	`actor_identity` text NOT NULL,
	`artifact_before_id` text NOT NULL,
	`artifact_after_id` text NOT NULL,
	`diff_r2_key` text NOT NULL,
	`rationale_text` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_identity`) REFERENCES `owner_identity`(`identity`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER creative_tournament_contract
BEFORE INSERT ON creative_tournament
WHEN NEW.route_count <> 2
  OR NEW.critic_count <> 3
  OR NEW.generator_provenance <> 'BUILD_VERIFIED_QUALIFICATION_CANDIDATES'
  OR length(NEW.candidate_set_hash) <> 64
BEGIN SELECT RAISE(ABORT, 'CREATIVE_TOURNAMENT_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER creative_candidate_contract
BEFORE INSERT ON creative_route_candidate
WHEN NEW.eligibility_state <> 'ELIGIBLE'
  OR NEW.aggregate_score < 92
  OR NEW.aggregate_score > 100
BEGIN SELECT RAISE(ABORT, 'CREATIVE_CANDIDATE_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER creative_judgment_contract
BEFORE INSERT ON creative_tournament_judgment
WHEN NEW.total_score < 0
  OR NEW.total_score > 100
  OR length(NEW.blind_input_hash) <> 64
BEGIN SELECT RAISE(ABORT, 'CREATIVE_JUDGMENT_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER human_decision_contract
BEFORE INSERT ON human_decision
WHEN NEW.decision_type NOT IN ('D1', 'D2', 'D3', 'D4', 'D5')
  OR length(trim(NEW.rationale_text)) < 20
  OR NOT EXISTS (
    SELECT 1 FROM owner_identity
    WHERE identity = NEW.actor_identity AND active = 1 AND role IN ('OWNER', 'OPERATOR')
  )
BEGIN SELECT RAISE(ABORT, 'HUMAN_DECISION_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER creative_tournament_append_only_update BEFORE UPDATE ON creative_tournament
BEGIN SELECT RAISE(ABORT, 'CREATIVE_TOURNAMENT_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_tournament_append_only_delete BEFORE DELETE ON creative_tournament
BEGIN SELECT RAISE(ABORT, 'CREATIVE_TOURNAMENT_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_candidate_append_only_update BEFORE UPDATE ON creative_route_candidate
BEGIN SELECT RAISE(ABORT, 'CREATIVE_CANDIDATE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_candidate_append_only_delete BEFORE DELETE ON creative_route_candidate
BEGIN SELECT RAISE(ABORT, 'CREATIVE_CANDIDATE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_judgment_append_only_update BEFORE UPDATE ON creative_tournament_judgment
BEGIN SELECT RAISE(ABORT, 'CREATIVE_JUDGMENT_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_judgment_append_only_delete BEFORE DELETE ON creative_tournament_judgment
BEGIN SELECT RAISE(ABORT, 'CREATIVE_JUDGMENT_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_selection_append_only_update BEFORE UPDATE ON creative_tournament_selection
BEGIN SELECT RAISE(ABORT, 'CREATIVE_SELECTION_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER creative_selection_append_only_delete BEFORE DELETE ON creative_tournament_selection
BEGIN SELECT RAISE(ABORT, 'CREATIVE_SELECTION_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER human_decision_append_only_update BEFORE UPDATE ON human_decision
BEGIN SELECT RAISE(ABORT, 'HUMAN_DECISION_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER human_decision_append_only_delete BEFORE DELETE ON human_decision
BEGIN SELECT RAISE(ABORT, 'HUMAN_DECISION_APPEND_ONLY'); END;
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
