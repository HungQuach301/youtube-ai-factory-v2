CREATE TABLE `oauth_refresh_token` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`client_id` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`owner_identity` text NOT NULL,
	`expires_at` integer NOT NULL,
	`rotated_at` integer,
	`revoked_at` integer,
	`replaced_by_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_refresh_token_family_idx` ON `oauth_refresh_token` (`family_id`);
