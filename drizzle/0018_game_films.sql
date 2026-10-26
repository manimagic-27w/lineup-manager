CREATE TABLE "game_film_parts" (
	"film_id" uuid NOT NULL,
	"part_no" integer NOT NULL,
	"object_key" text NOT NULL,
	"bytes" bigint NOT NULL,
	CONSTRAINT "game_film_parts_film_id_part_no_pk" PRIMARY KEY("film_id","part_no")
);
--> statement-breakpoint
CREATE TABLE "game_films" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"original_bytes" bigint NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"part_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "game_film_parts" ADD CONSTRAINT "game_film_parts_film_id_game_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."game_films"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_films" ADD CONSTRAINT "game_films_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_films" ADD CONSTRAINT "game_films_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;