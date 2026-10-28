ALTER TABLE "game_events" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_token" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_pin_hash" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_locked_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_stat_keeper_token_unique" UNIQUE("stat_keeper_token");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
