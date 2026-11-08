ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_token" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_pin_hash" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_locked_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_film_index_token_unique" UNIQUE("film_index_token");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
