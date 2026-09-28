CREATE TABLE IF NOT EXISTS "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "season_id" uuid;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "film_url" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
