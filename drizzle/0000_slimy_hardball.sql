CREATE TABLE `control` (
	`id` integer PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`lease` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`models` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
