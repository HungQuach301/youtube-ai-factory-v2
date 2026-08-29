CREATE TABLE `truth_claim_source` (
	`claim_id` text NOT NULL,
	`source_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`claim_id`, `source_id`),
	FOREIGN KEY (`claim_id`) REFERENCES `truth_claim`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `truth_source`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `truth_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`claim_type` text NOT NULL,
	`text` text NOT NULL,
	`criticality` text NOT NULL,
	`numeric_json` text,
	`as_of_date` text,
	`jurisdiction` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `truth_source` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`publisher` text NOT NULL,
	`url` text NOT NULL,
	`tier` integer NOT NULL,
	`fetched_at` text NOT NULL,
	`snapshot_r2_key` text NOT NULL,
	`content_hash` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `truth_source_package_url_unique` ON `truth_source` (`package_id`,`url`);--> statement-breakpoint
CREATE TABLE `truth_terminology` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`term` text NOT NULL,
	`plain_meaning` text NOT NULL,
	`institutional_role` text NOT NULL,
	`ipa` text NOT NULL,
	`arpabet` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `truth_terminology_package_term_unique` ON `truth_terminology` (`package_id`,`term`);
--> statement-breakpoint
CREATE TRIGGER truth_critical_claim_primary_tier
BEFORE INSERT ON truth_claim_source
WHEN NEW.role = 'PRIMARY'
  AND (SELECT criticality FROM truth_claim WHERE id = NEW.claim_id) = 'CRITICAL'
  AND (SELECT tier FROM truth_source WHERE id = NEW.source_id) > 2
BEGIN
  SELECT RAISE(ABORT, 'TRUTH_CRITICAL_CLAIM_SOURCE_TIER_VIOLATION');
END;
--> statement-breakpoint
CREATE TRIGGER truth_source_append_only_update BEFORE UPDATE ON truth_source
BEGIN SELECT RAISE(ABORT, 'TRUTH_SOURCE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_source_append_only_delete BEFORE DELETE ON truth_source
BEGIN SELECT RAISE(ABORT, 'TRUTH_SOURCE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_claim_append_only_update BEFORE UPDATE ON truth_claim
BEGIN SELECT RAISE(ABORT, 'TRUTH_CLAIM_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_claim_append_only_delete BEFORE DELETE ON truth_claim
BEGIN SELECT RAISE(ABORT, 'TRUTH_CLAIM_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_claim_source_append_only_update BEFORE UPDATE ON truth_claim_source
BEGIN SELECT RAISE(ABORT, 'TRUTH_CLAIM_SOURCE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_claim_source_append_only_delete BEFORE DELETE ON truth_claim_source
BEGIN SELECT RAISE(ABORT, 'TRUTH_CLAIM_SOURCE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_terminology_append_only_update BEFORE UPDATE ON truth_terminology
BEGIN SELECT RAISE(ABORT, 'TRUTH_TERMINOLOGY_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER truth_terminology_append_only_delete BEFORE DELETE ON truth_terminology
BEGIN SELECT RAISE(ABORT, 'TRUTH_TERMINOLOGY_APPEND_ONLY'); END;
