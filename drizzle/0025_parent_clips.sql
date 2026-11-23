CREATE TABLE IF NOT EXISTS "parent_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"game_id" uuid,
	"tournament_id" uuid,
	"uploader_name" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"object_key" text NOT NULL,
	"bytes" bigint NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_clips" ADD CONSTRAINT "parent_clips_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_clips" ADD CONSTRAINT "parent_clips_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_clips" ADD CONSTRAINT "parent_clips_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_clips_team_idx" ON "parent_clips" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_clips_expires_idx" ON "parent_clips" USING btree ("expires_at");
