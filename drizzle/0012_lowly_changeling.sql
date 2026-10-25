CREATE TABLE IF NOT EXISTS "training_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "training_log_token" text;--> statement-breakpoint
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_logs_player_date_idx" ON "training_logs" USING btree ("player_id","log_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_logs_team_date_idx" ON "training_logs" USING btree ("team_id","log_date");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_training_log_token_unique" UNIQUE("training_log_token");