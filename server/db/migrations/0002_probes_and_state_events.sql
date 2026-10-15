CREATE TABLE `service_probes` (
  `id` text PRIMARY KEY NOT NULL,
  `service_id` text NOT NULL REFERENCES `services`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `target` text NOT NULL,
  `config_json` text NOT NULL CHECK (json_valid(`config_json`)),
  `interval_seconds` integer NOT NULL CHECK (`interval_seconds` > 0),
  `region` text,
  `position` integer NOT NULL DEFAULT 0 CHECK (`position` >= 0),
  `enabled` integer NOT NULL DEFAULT 1 CHECK (`enabled` IN (0, 1)),
  `last_checked_at` integer,
  `last_status` text CHECK (`last_status` IS NULL OR `last_status` IN ('up', 'down', 'maintenance', 'degraded')),
  `last_latency_ms` integer CHECK (`last_latency_ms` IS NULL OR `last_latency_ms` >= 0),
  `consecutive_failures` integer NOT NULL DEFAULT 0 CHECK (`consecutive_failures` >= 0),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_probes_service_name_unique` ON `service_probes` (`service_id`, `name`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `service_probes_service_idx` ON `service_probes` (`service_id`, `position`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `service_probes_due_idx` ON `service_probes` (`enabled`, `deleted_at`);
--> statement-breakpoint
ALTER TABLE `service_samples` ADD `probe_id` text REFERENCES `service_probes`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
CREATE TABLE `service_state_events` (
  `id` text PRIMARY KEY NOT NULL,
  `service_id` text NOT NULL REFERENCES `services`(`id`) ON DELETE CASCADE,
  `probe_id` text REFERENCES `service_probes`(`id`) ON DELETE CASCADE,
  `at` integer NOT NULL,
  `from_status` text NOT NULL CHECK (`from_status` IN ('up', 'down', 'maintenance', 'degraded')),
  `to_status` text NOT NULL CHECK (`to_status` IN ('up', 'down', 'maintenance', 'degraded')),
  `reason` text,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `service_state_events_service_idx` ON `service_state_events` (`service_id`, `at`, `deleted_at`);
