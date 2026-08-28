CREATE TABLE `voice_fingerprint_binding` (
	`evidence_id` text NOT NULL,
	`archetype` text NOT NULL,
	`qualification_run_id` text NOT NULL,
	`qualified_at` text NOT NULL,
	`evidence_r2_key` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	PRIMARY KEY(`evidence_id`, `archetype`),
	FOREIGN KEY (`evidence_id`) REFERENCES `voice_fingerprint_evidence`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_fingerprint_run_unique` ON `voice_fingerprint_binding` (`qualification_run_id`);--> statement-breakpoint
CREATE TABLE `voice_fingerprint_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`voice_id` text NOT NULL,
	`model` text NOT NULL,
	`settings_hash` text NOT NULL,
	`capability_id` text NOT NULL,
	`capability_version` text NOT NULL,
	`audio_r2_key` text NOT NULL,
	`audio_sha256` text NOT NULL,
	`audio_duration_sec` integer NOT NULL,
	`embedding_r2_key` text NOT NULL,
	`embedding_sha256` text NOT NULL,
	`evidence_r2_key` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`fingerprint_hash` text NOT NULL,
	`qualification_state` text NOT NULL,
	`owner_actor_identity` text NOT NULL,
	`owner_approval_text` text NOT NULL,
	`owner_approved_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_actor_identity`) REFERENCES `owner_identity`(`identity`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_fingerprint_channel_unique` ON `voice_fingerprint_evidence` (`channel_id`);
--> statement-breakpoint
CREATE TRIGGER voice_fingerprint_evidence_insert_guard
BEFORE INSERT ON voice_fingerprint_evidence
WHEN NEW.qualification_state <> 'QUALIFIED'
  OR NEW.owner_approval_text <> 'APPROVE VOICE'
  OR NEW.audio_duration_sec <> 30
  OR NEW.audio_r2_key NOT LIKE 'qual/%'
  OR NEW.embedding_r2_key NOT LIKE 'qual/%'
  OR NEW.evidence_r2_key NOT LIKE 'qual/%'
  OR length(NEW.audio_sha256) <> 64
  OR length(NEW.embedding_sha256) <> 64
  OR length(NEW.evidence_sha256) <> 64
  OR length(NEW.fingerprint_hash) <> 64
BEGIN
  SELECT RAISE(ABORT, 'VOICE_FINGERPRINT_EVIDENCE_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER voice_fingerprint_evidence_append_only_update
BEFORE UPDATE ON voice_fingerprint_evidence
BEGIN
  SELECT RAISE(ABORT, 'VOICE_FINGERPRINT_EVIDENCE_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER voice_fingerprint_evidence_append_only_delete
BEFORE DELETE ON voice_fingerprint_evidence
BEGIN
  SELECT RAISE(ABORT, 'VOICE_FINGERPRINT_EVIDENCE_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER voice_fingerprint_binding_insert_guard
BEFORE INSERT ON voice_fingerprint_binding
WHEN NEW.evidence_r2_key NOT LIKE 'qual/%'
  OR length(NEW.evidence_sha256) <> 64
  OR NEW.archetype NOT IN (
    'high_energy_hook',
    'number_heavy_narration',
    'dense_mechanism',
    'authorization_clearing_settlement',
    'long_section_continuity',
    'causal_sfx_ambience',
    'music_transition',
    'silence_consequence_payoff'
  )
BEGIN
  SELECT RAISE(ABORT, 'VOICE_FINGERPRINT_BINDING_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER voice_fingerprint_binding_append_only_update
BEFORE UPDATE ON voice_fingerprint_binding
BEGIN
  SELECT RAISE(ABORT, 'VOICE_FINGERPRINT_BINDING_APPEND_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER voice_fingerprint_binding_append_only_delete
BEFORE DELETE ON voice_fingerprint_binding
BEGIN
  SELECT RAISE(ABORT, 'VOICE_FINGERPRINT_BINDING_APPEND_ONLY');
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
  )
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_CONTRACT_VIOLATION');
END;
