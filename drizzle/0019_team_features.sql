CREATE TABLE IF NOT EXISTS "team_features" (
	"team_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled_by" text NOT NULL,
	CONSTRAINT "team_features_team_id_feature_pk" PRIMARY KEY("team_id","feature")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_features" ADD CONSTRAINT "team_features_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
