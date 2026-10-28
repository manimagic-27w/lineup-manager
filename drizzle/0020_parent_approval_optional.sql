ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "require_parent_approval" boolean DEFAULT true NOT NULL;
