CREATE TABLE `predicted_performance` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`model_version` text NOT NULL,
	`retention_curve_json` text NOT NULL,
	`ctr_estimate` real NOT NULL,
	`beat_risk_json` text NOT NULL,
	`canonical_hash` text NOT NULL,
	`sealed_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `production_package`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predicted_performance_package_unique` ON `predicted_performance` (`package_id`);
--> statement-breakpoint
CREATE TRIGGER predicted_performance_contract
BEFORE INSERT ON predicted_performance
WHEN NEW.model_version <> 'qualification-prior-v1-uncalibrated'
  OR NEW.ctr_estimate <= 0
  OR NEW.ctr_estimate >= 1
  OR length(NEW.canonical_hash) <> 64
  OR json_valid(NEW.retention_curve_json) <> 1
  OR json_type(NEW.retention_curve_json) <> 'array'
  OR json_array_length(NEW.retention_curve_json) < 4
  OR json_valid(NEW.beat_risk_json) <> 1
  OR json_type(NEW.beat_risk_json) <> 'array'
  OR json_array_length(NEW.beat_risk_json) < 1
BEGIN SELECT RAISE(ABORT, 'PREDICTED_PERFORMANCE_CONTRACT_VIOLATION'); END;
--> statement-breakpoint
CREATE TRIGGER predicted_performance_append_only_update BEFORE UPDATE ON predicted_performance
BEGIN SELECT RAISE(ABORT, 'PREDICTED_PERFORMANCE_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER predicted_performance_append_only_delete BEFORE DELETE ON predicted_performance
BEGIN SELECT RAISE(ABORT, 'PREDICTED_PERFORMANCE_APPEND_ONLY'); END;
