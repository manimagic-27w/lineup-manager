CREATE TABLE IF NOT EXISTS "club_features" (
	"org_id" text NOT NULL,
	"feature" text NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled_by" text NOT NULL,
	CONSTRAINT "club_features_org_id_feature_pk" PRIMARY KEY("org_id","feature")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"minutes" integer DEFAULT 10 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"minutes" integer DEFAULT 10 NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"practice_date" date,
	"start_time" text,
	"goals" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_plan_items" ADD CONSTRAINT "practice_plan_items_plan_id_practice_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."practice_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drills_team_name_unique" ON "drills" USING btree ("team_id","name");