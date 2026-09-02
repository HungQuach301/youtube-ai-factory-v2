ALTER TABLE `stage12_qa_diagnostic_job`
	ADD COLUMN `diagnostic_ordinal` integer NOT NULL DEFAULT 1
	CHECK (`diagnostic_ordinal` BETWEEN 1 AND 2);
--> statement-breakpoint
ALTER TABLE `stage12_qa_diagnostic_job`
	ADD COLUMN `retry_of_diagnostic_job_id` text
	REFERENCES `stage12_qa_diagnostic_job`(`id`) ON UPDATE no action ON DELETE no action;
--> statement-breakpoint
ALTER TABLE `stage12_qa_diagnostic_job`
	ADD COLUMN `retry_reason_code` text;
--> statement-breakpoint
ALTER TABLE `stage12_qa_diagnostic_job`
	ADD COLUMN `target_duration_sec` real;
--> statement-breakpoint
DROP INDEX `stage12_qa_diagnostic_job_source_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_qa_diagnostic_job_source_ordinal_unique`
	ON `stage12_qa_diagnostic_job` (`stage12_job_id`,`diagnostic_ordinal`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_qa_diagnostic_job_retry_of_unique`
	ON `stage12_qa_diagnostic_job` (`retry_of_diagnostic_job_id`)
	WHERE `retry_of_diagnostic_job_id` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_diagnostic_duration_required`
BEFORE INSERT ON `stage12_qa_diagnostic_job`
WHEN NEW.`target_duration_sec` IS NULL OR NEW.`target_duration_sec` <= 0
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_DIAGNOSTIC_DURATION_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_diagnostic_retry_insert`
BEFORE INSERT ON `stage12_qa_diagnostic_job`
WHEN
	(NEW.`diagnostic_ordinal` = 1 AND (
		NEW.`retry_of_diagnostic_job_id` IS NOT NULL OR NEW.`retry_reason_code` IS NOT NULL
	))
	OR (NEW.`diagnostic_ordinal` = 2 AND NOT EXISTS (
		SELECT 1 FROM `stage12_qa_diagnostic_job` AS `predecessor`
		WHERE `predecessor`.`id` = NEW.`retry_of_diagnostic_job_id`
			AND `predecessor`.`stage12_job_id` = NEW.`stage12_job_id`
			AND `predecessor`.`diagnostic_ordinal` = 1
			AND `predecessor`.`state` = 'FAILED'
			AND `predecessor`.`error_code` IN ('23', 'STAGE12_CALLBACK_TIMEOUT')
			AND NEW.`retry_reason_code` = 'STAGE12_DIAGNOSTIC_CALLBACK_TIMEOUT'
	))
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_DIAGNOSTIC_RETRY_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_diagnostic_terminal_immutable_update`
BEFORE UPDATE ON `stage12_qa_diagnostic_job`
WHEN OLD.`state` IN ('READY', 'FAILED')
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_DIAGNOSTIC_TERMINAL_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `stage12_qa_diagnostic_terminal_immutable_delete`
BEFORE DELETE ON `stage12_qa_diagnostic_job`
BEGIN SELECT RAISE(ABORT, 'STAGE12_QA_DIAGNOSTIC_TERMINAL_IMMUTABLE'); END;
