CREATE TABLE IF NOT EXISTS "club_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"gender" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
