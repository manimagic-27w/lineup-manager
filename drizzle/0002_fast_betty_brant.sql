ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "team_type" text DEFAULT 'travel' NOT NULL;
