ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "is_guest" boolean DEFAULT false NOT NULL;
