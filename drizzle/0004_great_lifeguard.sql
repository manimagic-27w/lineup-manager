ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "our_score" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "opponent_score" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "is_friendly" boolean DEFAULT false NOT NULL;