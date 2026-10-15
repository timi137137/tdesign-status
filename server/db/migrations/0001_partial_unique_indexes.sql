DROP INDEX `users_username_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`) WHERE `deleted_at` IS NULL;--> statement-breakpoint
DROP INDEX `services_slug_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `services_slug_unique` ON `services` (`slug`) WHERE `deleted_at` IS NULL;--> statement-breakpoint
DROP INDEX `dashboard_layouts_user_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_layouts_user_name_unique` ON `dashboard_layouts` (`user_id`, `name`) WHERE `deleted_at` IS NULL;
