DROP TABLE IF EXISTS "training_approvals" CASCADE;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "parent_approval_token" text;--> statement-breakpoint
ALTER TABLE "training_profiles" ADD COLUMN IF NOT EXISTS "parent_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_profiles" ADD COLUMN IF NOT EXISTS "parent_locked_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_approval_token_unique" UNIQUE("parent_approval_token");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
