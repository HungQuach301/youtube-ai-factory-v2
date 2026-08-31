CREATE TABLE `stage11_audio_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`stage_instance_id` text NOT NULL,
	`mode` text NOT NULL CHECK (`mode` = 'ambience_only'),
	`narration_sha256` text NOT NULL CHECK (length(`narration_sha256`) = 64),
	`cue_program_json` text NOT NULL CHECK (json_valid(`cue_program_json`)),
	`rights_evidence_sha256` text NOT NULL CHECK (length(`rights_evidence_sha256`) = 64),
	`loudnorm_plan_json` text NOT NULL CHECK (json_valid(`loudnorm_plan_json`)),
	`ducking_filter` text NOT NULL,
	`provider_call_count` integer NOT NULL CHECK (`provider_call_count` = 0),
	`reserved_usd` real NOT NULL CHECK (`reserved_usd` = 0),
	`actual_usd` real NOT NULL CHECK (`actual_usd` = 0),
	`evidence_r2_key` text NOT NULL,
	`evidence_sha256` text NOT NULL CHECK (length(`evidence_sha256`) = 64),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_instance_id`) REFERENCES `stage_instance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage11_audio_plan_package_unique` ON `stage11_audio_plan` (`package_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage11_audio_plan_stage_unique` ON `stage11_audio_plan` (`stage_instance_id`);
--> statement-breakpoint
CREATE TRIGGER `stage11_audio_plan_validate_insert`
BEFORE INSERT ON `stage11_audio_plan`
WHEN json_array_length(NEW.cue_program_json, '$.cues') < 1
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.cue_program_json, '$.cues') AS cue
    WHERE json_extract(cue.value, '$.kind') = 'MUSIC'
  )
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.cue_program_json, '$.cues') AS cue
    WHERE json_extract(cue.value, '$.kind') <> 'SILENCE'
      AND (json_extract(cue.value, '$.assetId') IS NULL
        OR json_extract(cue.value, '$.monetizationAllowed') <> 1
        OR length(json_extract(cue.value, '$.licenseEvidenceHash')) <> 64)
  )
  OR json_array_length(NEW.loudnorm_plan_json, '$.passes') <> 2
BEGIN SELECT RAISE(ABORT, 'STAGE_11_AUDIO_CONTRACT_VIOLATION'); END;
