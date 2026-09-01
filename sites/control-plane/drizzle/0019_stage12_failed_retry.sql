ALTER TABLE `stage12_media_job` ADD `attempt_ordinal` integer DEFAULT 1 NOT NULL CHECK (`attempt_ordinal` BETWEEN 1 AND 2);
--> statement-breakpoint
ALTER TABLE `stage12_media_job` ADD `retry_of_job_id` text;
--> statement-breakpoint
DROP INDEX `stage12_media_job_package_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_package_attempt_unique` ON `stage12_media_job` (`package_id`,`attempt_ordinal`);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage12_media_job_retry_of_unique` ON `stage12_media_job` (`retry_of_job_id`) WHERE `retry_of_job_id` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `stage12_media_job_retry_insert`
BEFORE INSERT ON `stage12_media_job`
WHEN
  (`NEW`.`attempt_ordinal` = 1 AND `NEW`.`retry_of_job_id` IS NOT NULL)
  OR (`NEW`.`attempt_ordinal` > 1 AND NOT EXISTS (
    SELECT 1 FROM `stage12_media_job` AS `predecessor`
    WHERE `predecessor`.`id` = `NEW`.`retry_of_job_id`
      AND `predecessor`.`package_id` = `NEW`.`package_id`
      AND `predecessor`.`operation_run_id` = `NEW`.`operation_run_id`
      AND `predecessor`.`stage_instance_id` = `NEW`.`stage_instance_id`
      AND `predecessor`.`attempt_ordinal` = `NEW`.`attempt_ordinal` - 1
      AND `predecessor`.`state` = 'FAILED'
      AND `predecessor`.`error_code` IN (
        'MEDIA_TOOL_FAILED',
        'STAGE12_AUDIO_MIX_FAILED',
        'STAGE12_LOUDNESS_ANALYSIS_FAILED',
        'STAGE12_RENDER_FAILED',
        'STAGE12_PROBE_FAILED',
        'STAGE12_TIMELINE_SCAN_FAILED',
        'STAGE12_FINAL_LOUDNESS_FAILED',
        'STAGE12_FRAME_HASH_FAILED'
      )
  ))
BEGIN
  SELECT RAISE(ABORT, 'STAGE12_RETRY_CONTRACT_VIOLATION');
END;
