/**
 * Idempotent copies of the most recent schema migrations (0019-0023), so a platform admin can
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
];
