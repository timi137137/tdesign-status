CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `display_name` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('administrator', 'publisher', 'viewer')),
  `is_active` integer NOT NULL DEFAULT 1 CHECK (`is_active` IN (0, 1)),
  `must_change_password` integer NOT NULL DEFAULT 1 CHECK (`must_change_password` IN (0, 1)),
  `failed_login_count` integer NOT NULL DEFAULT 0 CHECK (`failed_login_count` >= 0),
  `locked_until` integer,
  `last_login_at` integer,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE INDEX `users_role_active_idx` ON `users` (`role`, `is_active`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL,
  `expires_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `revoked_at` integer,
  `ip_address` text,
  `user_agent` text,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sessions_user_expiry_idx` ON `sessions` (`user_id`, `expires_at`, `revoked_at`);
--> statement-breakpoint
CREATE TABLE `site_configs` (
  `id` text PRIMARY KEY NOT NULL,
  `draft_json` text NOT NULL CHECK (json_valid(`draft_json`)),
  `published_json` text CHECK (`published_json` IS NULL OR json_valid(`published_json`)),
  `published_at` integer,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE TABLE `services` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `status` text NOT NULL DEFAULT 'up' CHECK (`status` IN ('up', 'down', 'maintenance', 'degraded')),
  `enabled` integer NOT NULL DEFAULT 1 CHECK (`enabled` IN (0, 1)),
  `position` integer NOT NULL DEFAULT 0,
  `uptime` real NOT NULL DEFAULT 100 CHECK (`uptime` >= 0 AND `uptime` <= 100),
  `latency_ms` integer NOT NULL DEFAULT 0 CHECK (`latency_ms` >= 0),
  `last_check_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_slug_unique` ON `services` (`slug`);
--> statement-breakpoint
CREATE INDEX `services_public_order_idx` ON `services` (`enabled`, `position`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `service_samples` (
  `id` text PRIMARY KEY NOT NULL,
  `service_id` text NOT NULL REFERENCES `services`(`id`) ON DELETE CASCADE,
  `observed_at` integer NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('up', 'down', 'maintenance', 'degraded')),
  `heartbeat_value` integer NOT NULL CHECK (`heartbeat_value` IN (0, 1, 2, 3)),
  `latency_ms` integer NOT NULL CHECK (`latency_ms` >= 0),
  `uptime` real NOT NULL CHECK (`uptime` >= 0 AND `uptime` <= 100),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `service_samples_service_time_idx` ON `service_samples` (`service_id`, `observed_at`);
--> statement-breakpoint
CREATE INDEX `service_samples_retention_idx` ON `service_samples` (`observed_at`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `incidents` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `impact` text NOT NULL DEFAULT 'none' CHECK (`impact` IN ('none', 'minor', 'major', 'critical')),
  `status` text NOT NULL DEFAULT 'investigating' CHECK (`status` IN ('investigating', 'identified', 'monitoring', 'resolved')),
  `started_at` integer NOT NULL,
  `resolved_at` integer,
  `publish_state` text NOT NULL DEFAULT 'draft' CHECK (`publish_state` IN ('draft', 'published')),
  `published_at` integer,
  `published_json` text CHECK (`published_json` IS NULL OR json_valid(`published_json`)),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `incidents_status_started_idx` ON `incidents` (`status`, `started_at`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `incidents_public_idx` ON `incidents` (`publish_state`, `published_at`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `incident_updates` (
  `id` text PRIMARY KEY NOT NULL,
  `incident_id` text NOT NULL REFERENCES `incidents`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL CHECK (`status` IN ('investigating', 'identified', 'monitoring', 'resolved')),
  `body` text NOT NULL,
  `occurred_at` integer NOT NULL,
  `publish_state` text NOT NULL DEFAULT 'draft' CHECK (`publish_state` IN ('draft', 'published')),
  `published_at` integer,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `incident_updates_parent_time_idx` ON `incident_updates` (`incident_id`, `occurred_at`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `maintenances` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text NOT NULL DEFAULT 'scheduled' CHECK (`status` IN ('scheduled', 'in_progress', 'completed')),
  `scheduled_start` integer NOT NULL,
  `scheduled_end` integer NOT NULL,
  `progress` integer NOT NULL DEFAULT 0 CHECK (`progress` >= 0 AND `progress` <= 100),
  `publish_state` text NOT NULL DEFAULT 'draft' CHECK (`publish_state` IN ('draft', 'published')),
  `published_at` integer,
  `published_json` text CHECK (`published_json` IS NULL OR json_valid(`published_json`)),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `maintenances_status_start_idx` ON `maintenances` (`status`, `scheduled_start`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `maintenances_public_idx` ON `maintenances` (`publish_state`, `published_at`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `maintenance_updates` (
  `id` text PRIMARY KEY NOT NULL,
  `maintenance_id` text NOT NULL REFERENCES `maintenances`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL CHECK (`status` IN ('scheduled', 'in_progress', 'completed')),
  `body` text NOT NULL,
  `progress` integer CHECK (`progress` IS NULL OR (`progress` >= 0 AND `progress` <= 100)),
  `occurred_at` integer NOT NULL,
  `publish_state` text NOT NULL DEFAULT 'draft' CHECK (`publish_state` IN ('draft', 'published')),
  `published_at` integer,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `maintenance_updates_parent_time_idx` ON `maintenance_updates` (`maintenance_id`, `occurred_at`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `entity_services` (
  `id` text PRIMARY KEY NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('incident', 'maintenance')),
  `entity_id` text NOT NULL,
  `service_id` text NOT NULL REFERENCES `services`(`id`) ON DELETE CASCADE,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_services_unique` ON `entity_services` (`entity_type`, `entity_id`, `service_id`);
--> statement-breakpoint
CREATE INDEX `entity_services_entity_idx` ON `entity_services` (`entity_type`, `entity_id`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `entity_services_service_idx` ON `entity_services` (`service_id`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `dashboard_layouts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL DEFAULT 'default',
  `layout_json` text NOT NULL CHECK (json_valid(`layout_json`)),
  `is_default` integer NOT NULL DEFAULT 1 CHECK (`is_default` IN (0, 1)),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_layouts_user_name_unique` ON `dashboard_layouts` (`user_id`, `name`);
--> statement-breakpoint
CREATE INDEX `dashboard_layouts_user_idx` ON `dashboard_layouts` (`user_id`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text,
  `request_id` text,
  `ip_address` text,
  `user_agent` text,
  `before_json` text CHECK (`before_json` IS NULL OR json_valid(`before_json`)),
  `after_json` text CHECK (`after_json` IS NULL OR json_valid(`after_json`)),
  `metadata_json` text CHECK (`metadata_json` IS NULL OR json_valid(`metadata_json`)),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`, `entity_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `public_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `payload_json` text NOT NULL CHECK (json_valid(`payload_json`)),
  `etag` text NOT NULL,
  `last_modified` integer NOT NULL,
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `created_by` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_by` text,
  `deleted_at` integer,
  `deleted_by` text
);
