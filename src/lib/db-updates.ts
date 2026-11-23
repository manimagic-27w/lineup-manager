/**
 * Idempotent copies of the most recent schema migrations (0019-0025), so a platform admin can
 * bring the live database up to date from the /platform page without a local `db:push`.
 * Every statement is safe to run more than once. Keep in sync with the drizzle/*.sql files
 * when adding a migration that the live site needs right away.
 */
export const DATABASE_UPDATES: readonly { name: string; statements: readonly string[] }[] = [
  {
    name: "0019 team features",
    statements: [
      `CREATE TABLE IF NOT EXISTS "team_features" (
        "team_id" uuid NOT NULL,
        "feature" text NOT NULL,
        "enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
        "enabled_by" text NOT NULL,
        CONSTRAINT "team_features_team_id_feature_pk" PRIMARY KEY("team_id","feature")
      )`,
      `DO $$ BEGIN
        ALTER TABLE "team_features" ADD CONSTRAINT "team_features_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$`,
    ],
  },
  {
    name: "0020 optional parent approval",
    statements: [`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "require_parent_approval" boolean DEFAULT true NOT NULL`],
  },
  {
    name: "0021 stat keeper",
    statements: [
      `ALTER TABLE "game_events" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'import' NOT NULL`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_token" text`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_pin_hash" text`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_failed_attempts" integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "stat_keeper_locked_until" timestamp with time zone`,
      `DO $$ BEGIN
        ALTER TABLE "teams" ADD CONSTRAINT "teams_stat_keeper_token_unique" UNIQUE("stat_keeper_token");
      EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
      END $$`,
    ],
  },
  {
    name: "0022 extra midfield lines",
    statements: [`ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "extra_mids" integer DEFAULT 0 NOT NULL`],
  },
  {
    name: "0023 parents' game video index",
    statements: [
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_token" text`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_pin_hash" text`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_failed_attempts" integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "film_index_locked_until" timestamp with time zone`,
      `DO $$ BEGIN
        ALTER TABLE "teams" ADD CONSTRAINT "teams_film_index_token_unique" UNIQUE("film_index_token");
      EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
      END $$`,
    ],
  },
  {
    name: "0024 second game film link",
    statements: [`ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "film_url_2" text`],
  },
  {
    name: "0025 parent clips",
    statements: [
      `CREATE TABLE IF NOT EXISTS "parent_clips" (
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
)`,
      `DO $$ BEGIN
 ALTER TABLE "parent_clips" ADD CONSTRAINT "parent_clips_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
      `DO $$ BEGIN
 ALTER TABLE "parent_clips" ADD CONSTRAINT "parent_clips_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
      `DO $$ BEGIN
 ALTER TABLE "parent_clips" ADD CONSTRAINT "parent_clips_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
      `CREATE INDEX IF NOT EXISTS "parent_clips_team_idx" ON "parent_clips" USING btree ("team_id")`,
      `CREATE INDEX IF NOT EXISTS "parent_clips_expires_idx" ON "parent_clips" USING btree ("expires_at")`,
    ],
  },
];
