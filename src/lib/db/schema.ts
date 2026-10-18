/**
 * Drizzle schema for the Lineup Manager Postgres backend (Neon).
 *
 * Mirrors the data model documented in the migration plan. Every team is scoped to `orgId`, a
 * Clerk Organization id — that's the one column that makes multi-club support "free": a club is
 * just an org, and every query is naturally filtered to the caller's active org.
 *
 * There is deliberately no local `users` or `admins` table — identity and org-level admin/member
 * role both live in Clerk. `teamCoaches` is the one piece of authorization Clerk doesn't know
 * about on its own: which teams, within an org, a given member can see.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  integer,
  boolean,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const AVAILABILITY_STATUSES = [
  "Available",
  "Not Available",
  "Maybe",
  "No Response",
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const POSITIONS = ["Attack", "Mid", "Def", "Goalie"] as const;
export type Position = (typeof POSITIONS)[number];

// The bucket a lineup slot counts toward on the start-history page and in data exports. Every
// field-lacrosse slot wants one of the four player POSITIONS above; sixes lineup slots (see
// SIXES_SLOTS below) add a fifth "Sixes" bucket for its 5 flexible field slots, since sixes
// deliberately has no Attack/Mid/Def distinction. A sixes game's Goalie slot still counts
// toward the ordinary "Goalie" bucket - a goalie start is a goalie start in either format.
export const SLOT_POSITIONS = [...POSITIONS, "Sixes"] as const;
export type SlotPosition = (typeof SLOT_POSITIONS)[number];

// Sixes lacrosse has no fixed offense/defense positions - every field player is expected to
// play both ways (see SIXES_SLOTS below). This maps a player's regular Attack/Mid/Def/Goalie
// position to an informal "leaning," shown on the sixes lineup board so a coach building a
// sixes roster can see the rough offense/defense mix of who's available at a glance. It's
// purely a display hint pulled from the same Position dropdown already on the roster page -
// never a separate field to maintain, and never enforced.
export const POSITION_LEANING: Record<string, string> = {
  Attack: "Offense-leaning",
  Mid: "Two-way",
  Def: "Defense-leaning",
  Goalie: "Goalie",
};

export function leaningForPosition(position: string | null | undefined): string | null {
  if (!position) return null;
  return POSITION_LEANING[position] ?? null;
}

// Experience/level options shown as a dropdown on the roster page. Existing players may still
// have older free-text values (imported via CSV, or entered before this list existed) - the
// column itself stays a plain text column so that history is never silently lost.
export const EXPERIENCE_LEVELS = ["New", "Rec", "Travel", "A", "B", "C"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// Whether a team is a rec team or a travel team - controls which subset of EXPERIENCE_LEVELS
// its roster's Experience dropdown offers (see EXPERIENCE_LEVELS_BY_TEAM_TYPE below). "Travel"
// is the default so existing teams (all travel clubs so far) keep their current A/B/C levels
// with no action needed.
export const TEAM_TYPES = [
  { key: "travel", label: "Travel" },
  { key: "rec", label: "Rec" },
] as const;
export type TeamType = (typeof TEAM_TYPES)[number]["key"];

// Girls and boys lacrosse field different numbers of starters, so the club's gender decides which
// slots a "field" game's lineup board offers (see GIRLS vs BOYS_SLOTS below and
// src/lib/lineup-slots.ts). A club (organization) is always all girls or all boys; the setting
// lives in club_settings below.
export const TEAM_GENDERS = [
  { key: "girls", label: "Girls" },
  { key: "boys", label: "Boys" },
] as const;
export type TeamGender = (typeof TEAM_GENDERS)[number]["key"];

// A rec team's roster is usually a mix of backgrounds - some kids have played travel ball,
// some have only played rec, some are brand new - so its Experience field tracks where a
// player is coming from. A travel team already knows everyone's background; its Experience
// field instead levels players A/B/C for squad placement. Falls back to the travel set for any
// unrecognized/legacy team_type value, same pattern as themeSwatch() in @/lib/utils.
export const EXPERIENCE_LEVELS_BY_TEAM_TYPE: Record<TeamType, readonly string[]> = {
  rec: ["Travel", "Rec", "New"],
  travel: ["A", "B", "C"],
};

// Starting lineup slots - identical set for every team, same as the Sheets version's SLOTS array.
export const SLOTS = [
  { key: "LA1", label: "Low Attack 1", unit: "Attack", pos: "Attack" },
  { key: "LA2", label: "Low Attack 2", unit: "Attack", pos: "Attack" },
  { key: "HA1", label: "High Attack 1", unit: "Attack", pos: "Attack" },
  { key: "HA2", label: "High Attack 2", unit: "Attack", pos: "Attack" },
  { key: "M1", label: "Middie 1", unit: "Midfield", pos: "Mid" },
  { key: "M2", label: "Middie 2", unit: "Midfield", pos: "Mid" },
  { key: "M3", label: "Middie 3", unit: "Midfield", pos: "Mid" },
  { key: "HD1", label: "High Defense 1", unit: "Defense", pos: "Def" },
  { key: "HD2", label: "High Defense 2", unit: "Defense", pos: "Def" },
  { key: "LD1", label: "Low Defense 1", unit: "Defense", pos: "Def" },
  { key: "LD2", label: "Low Defense 2", unit: "Defense", pos: "Def" },
  { key: "G1", label: "Goalie", unit: "Goalie", pos: "Goalie" },
] as const;

// A boys field game: 10 players - 3 attack, 3 midfield, 3 defense and 1 goalie. Same
// {key,label,unit,pos} shape and the same unit/pos values as SLOTS, so the board, printable
// sheet, start history and exports group it correctly with no boys-specific branching. Keys are
// their own ("B..." prefix) so a boys lineup never collides with a girls lineup's slot keys.
export const BOYS_SLOTS = [
  { key: "BA1", label: "Attack 1", unit: "Attack", pos: "Attack" },
  { key: "BA2", label: "Attack 2", unit: "Attack", pos: "Attack" },
  { key: "BA3", label: "Attack 3", unit: "Attack", pos: "Attack" },
  { key: "BM1", label: "Middie 1", unit: "Midfield", pos: "Mid" },
  { key: "BM2", label: "Middie 2", unit: "Midfield", pos: "Mid" },
  { key: "BM3", label: "Middie 3", unit: "Midfield", pos: "Mid" },
  { key: "BD1", label: "Defense 1", unit: "Defense", pos: "Def" },
  { key: "BD2", label: "Defense 2", unit: "Defense", pos: "Def" },
  { key: "BD3", label: "Defense 3", unit: "Defense", pos: "Def" },
  { key: "BG1", label: "Goalie", unit: "Goalie", pos: "Goalie" },
] as const;

// World Lacrosse's "Sixes" format (the Olympic/PLL-Sixes style game): 6 a side, 5 field
// players + 1 goalie, substituting on the fly, with no fixed offense/defense positions at all
// - see POSITION_LEANING above for why. Reuses the same {key,label,unit,pos} shape as SLOTS so
// every helper that already works on a lineup (the board, the printable sheet, start history,
// exports) needs only to pick which array to use, not a different data shape.
export const GAME_FORMATS = ["field", "sixes", "sevens"] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

export const SIXES_SLOTS = [
  { key: "SF1", label: "Field 1", unit: "Sixes", pos: "Sixes" },
  { key: "SF2", label: "Field 2", unit: "Sixes", pos: "Sixes" },
  { key: "SF3", label: "Field 3", unit: "Sixes", pos: "Sixes" },
  { key: "SF4", label: "Field 4", unit: "Sixes", pos: "Sixes" },
  { key: "SF5", label: "Field 5", unit: "Sixes", pos: "Sixes" },
  { key: "SG1", label: "Goalie", unit: "Goalie", pos: "Goalie" },
] as const;

// Optional substitutes for Field and Sevens games, switched on per game (games.subs): 2 attack,
// 3 midfield and 2 defense. They share the starters' unit/pos values so the board groups them
// under the right unit, but keys of their own ("X..."), and `sub: true` so History does not
// count them as starts. A game with subs off simply doesn't show them; picks are kept.
export const SUB_SLOTS = [
  { key: "XA1", label: "Attack Sub 1", unit: "Attack", pos: "Attack", sub: true },
  { key: "XA2", label: "Attack Sub 2", unit: "Attack", pos: "Attack", sub: true },
  { key: "XM1", label: "Middie Sub 1", unit: "Midfield", pos: "Mid", sub: true },
  { key: "XM2", label: "Middie Sub 2", unit: "Midfield", pos: "Mid", sub: true },
  { key: "XM3", label: "Middie Sub 3", unit: "Midfield", pos: "Mid", sub: true },
  { key: "XD1", label: "Defense Sub 1", unit: "Defense", pos: "Def", sub: true },
  { key: "XD2", label: "Defense Sub 2", unit: "Defense", pos: "Def", sub: true },
] as const;

// "7s" - unlike Sixes, this format keeps the normal Attack/Mid/Def/Goalie positions, just
// fewer of each (2/3/2/1 = 7 field players + 1 goalie). Its slots reuse the exact same
// unit/pos values as SLOTS (not a new "Sixes"-style bucket), so every helper that groups or
// labels by position - the board, the printable sheet, start history, exports - already
// handles a sevens game correctly with no sevens-specific branching.
export const SEVENS_SLOTS = [
  { key: "7A1", label: "Attack 1", unit: "Attack", pos: "Attack" },
  { key: "7A2", label: "Attack 2", unit: "Attack", pos: "Attack" },
  { key: "7M1", label: "Middie 1", unit: "Midfield", pos: "Mid" },
  { key: "7M2", label: "Middie 2", unit: "Midfield", pos: "Mid" },
  { key: "7M3", label: "Middie 3", unit: "Midfield", pos: "Mid" },
  { key: "7D1", label: "Defense 1", unit: "Defense", pos: "Def" },
  { key: "7D2", label: "Defense 2", unit: "Defense", pos: "Def" },
  { key: "7G1", label: "Goalie", unit: "Goalie", pos: "Goalie" },
] as const;

export const DEFAULT_STAT_CATEGORIES = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "gb", label: "Ground Balls" },
  { key: "saves", label: "Saves" },
  { key: "fto", label: "Forced Turnovers" },
] as const;

/* ------------------------------------------------------------------ */
/* Teams + coaches                                                     */
/* ------------------------------------------------------------------ */

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(), // Clerk organization id - the "club"
  name: text("name").notNull(),
  theme: text("theme").notNull().default("green"),
  // "travel" or "rec" (see TEAM_TYPES) - drives which Experience levels the roster page offers.
  teamType: text("team_type").notNull().default("travel"),
  // LEGACY: gender used to be set per team. It now lives on the club (club_settings.gender) and
  // this column is no longer read for lineups. It is only consulted once, to seed a club's
  // setting the first time an existing club (one that already has teams) is opened. Safe to
  // drop in a later cleanup migration.
  gender: text("gender").notNull().default("girls"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(), // Clerk user id
});

/** One row per club (Clerk organization) holding club-wide settings. A club has no row until it
 *  is set up: existing clubs are seeded from their teams the first time they are opened, and a
 *  brand-new club is asked to pick Girls or Boys before anything else (see /club-setup). */
export const clubSettings = pgTable("club_settings", {
  orgId: text("org_id").primaryKey(), // Clerk organization id - the "club"
  // "girls" or "boys" (see TEAM_GENDERS) - decides a field game's lineup slots for every team.
  gender: text("gender").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamCoaches = pgTable(
  "team_coaches",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // Clerk user id
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: text("added_by").notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })]
);

/**
 * A team assignment requested at invite time, before the person has accepted and become a
 * real club member. Clerk invitations only carry an email address - there's no user id to put
 * in `team_coaches` until the invite is accepted - so this holds the intent in the meantime.
 * `listOrgMembers` reconciles these against current club members on every admin page load
 * (matching by email) and turns matches into real `team_coaches` rows, then deletes the row
 * here. See `inviteOrgMember` in `src/actions/coaches.ts`.
 */
export const pendingCoachAssignments = pgTable("pending_coach_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  email: text("email").notNull(), // lowercased
  invitedBy: text("invited_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  number: text("number"),
  grade: text("grade"),
  experience: text("experience"),
  position: text("position"),
  archivedAt: timestamp("archived_at", { withTimezone: true }), // soft delete - keeps history on old games
  // Guests live on a separate "guest roster": they're not on the main Roster tab and are not
  // added to every game automatically - a coach adds them to individual games (a game_players
  // row is what puts a guest on a game). They are reusable across games and show up in History.
  isGuest: boolean("is_guest").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Seasons, games, availability, lineup                                */
/* ------------------------------------------------------------------ */

// A tournament groups several games played over one event (e.g. a weekend "Spring Classic").
// Like a season it's only a label coaches create and assign by hand. Unlike a season it also
// scopes availability: a coach can copy a player's availability from another game in the same
// tournament instead of re-entering it for every game.
export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

// A season is just a label a coach creates to group games under (e.g. "Fall 2026") - no dates of
// its own. Assigning a game to one is entirely manual (see games.seasonId below); nothing
// auto-assigns a game to a season based on its date.
export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  opponent: text("opponent"),
  notes: text("notes").notNull().default(""),
  // "field" (12 slots), "sixes" (6: see SIXES_SLOTS), or "sevens" (8: see SEVENS_SLOTS).
  // Defaults to "field" so every existing game keeps its current lineup board with no action
  // needed.
  format: text("format").notNull().default("field"),
  // Whether the lineup board also offers sub spots (SUB_SLOTS) - only Field and Sevens games use it.
  subs: boolean("subs").notNull().default(false),
  // Nullable and onDelete "set null" on purpose: deleting a season should never delete its games,
  // just unassign them back to "No season."
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
  // Same idea as seasonId: deleting a tournament only ungroups its games, never deletes them.
  tournamentId: uuid("tournament_id").references(() => tournaments.id, { onDelete: "set null" }),
  // A link to game film (Hudl, YouTube, a shared Google Drive folder, whatever the club uses) -
  // free text rather than a strict URL type so an already-pasted link never fails to save; the UI
  // is responsible for treating it as a link when rendering it.
  filmUrl: text("film_url"),
  // Final score, entered after the game. Both null until a result is recorded; they are always
  // set together (see setGameResult). ourScore is this team's goals, whichever side was "home".
  ourScore: integer("our_score"),
  opponentScore: integer("opponent_score"),
  // A friendly (scrimmage / exhibition) still gets a score but is left out of the team's
  // win-loss record. Defaults to false so every existing game keeps counting as it does today.
  isFriendly: boolean("is_friendly").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const gamePlayers = pgTable(
  "game_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    status: text("status").notNull().default("No Response"),
  },
  (t) => [uniqueIndex("game_players_game_player_uq").on(t.gameId, t.playerId)]
);

export const lineupSlots = pgTable(
  "lineup_slots",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    slotKey: text("slot_key").notNull(),
    playerId: uuid("player_id").references(() => players.id),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.slotKey] }),
    // Enforces "a player holds at most one starting slot and at most one sub slot per game" at
    // the DB level. Sub slot keys all start with "X" (see SUB_SLOTS) and no other slot key does,
    // so a player can start at attack and also be the first midfield sub, but never twice in
    // the same group.
    uniqueIndex("one_starting_slot_per_player")
      .on(t.gameId, t.playerId)
      .where(sql`${t.playerId} is not null and ${t.slotKey} not like 'X%'`),
    uniqueIndex("one_sub_slot_per_player")
      .on(t.gameId, t.playerId)
      .where(sql`${t.playerId} is not null and ${t.slotKey} like 'X%'`),
  ]
);

/* ------------------------------------------------------------------ */
/* Stats (optional per team, mirrors the Sheets "Stats" tab)           */
/* ------------------------------------------------------------------ */

export const statCategories = pgTable("stat_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statValues = pgTable(
  "stat_values",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => statCategories.id, { onDelete: "cascade" }),
    value: numeric("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId, t.categoryId] })]
);

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Relations (for Drizzle's relational query API)                      */
/* ------------------------------------------------------------------ */

export const teamsRelations = relations(teams, ({ many }) => ({
  coaches: many(teamCoaches),
  players: many(players),
  games: many(games),
  seasons: many(seasons),
  statCategories: many(statCategories),
  activity: many(activityLog),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  team: one(teams, { fields: [players.teamId], references: [teams.id] }),
  gameEntries: many(gamePlayers),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  team: one(teams, { fields: [seasons.teamId], references: [teams.id] }),
  games: many(games),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  team: one(teams, { fields: [games.teamId], references: [teams.id] }),
  season: one(seasons, { fields: [games.seasonId], references: [seasons.id] }),
  tournament: one(tournaments, { fields: [games.tournamentId], references: [tournaments.id] }),
  players: many(gamePlayers),
  lineup: many(lineupSlots),
  stats: many(statValues),
}));


/* ------------------------------------------------------------------ */
/* Premium features + practice plans                                   */
/* ------------------------------------------------------------------ */

// Paid add-ons a platform admin switches on per club (see /platform). A club without a row for a
// feature does not have it. Add new premium features here and to club_features rows as needed.
export const CLUB_FEATURES = [{ key: "practice_plans", label: "Practice plans" }] as const;
export type ClubFeatureKey = (typeof CLUB_FEATURES)[number]["key"];

export const clubFeatures = pgTable(
  "club_features",
  {
    orgId: text("org_id").notNull(), // Clerk organization id - the "club"
    feature: text("feature").notNull(), // a CLUB_FEATURES key
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
    enabledBy: text("enabled_by").notNull(), // Clerk user id of the platform admin
  },
  (t) => [primaryKey({ columns: [t.orgId, t.feature] })],
);

// A practice plan (or, with isTemplate, a reusable template that new plans are copied from).
// practiceDate/startTime are optional; startTime is "HH:MM" (24h) and only drives the clock times
// shown next to each drill. Tags are free-form short labels ("Ground balls", "Clears").
export const practicePlans = pgTable("practice_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  practiceDate: date("practice_date"),
  startTime: text("start_time"),
  goals: text("goals").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  isTemplate: boolean("is_template").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The ordered drills inside a plan. These are copies, not links: editing the drill library later
// never rewrites a plan that already used it.
export const practicePlanItems = pgTable("practice_plan_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => practicePlans.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  minutes: integer("minutes").notNull().default(10),
  notes: text("notes").notNull().default(""),
});

// A team's reusable drills, picked from when building a plan.
export const drills = pgTable(
  "drills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    minutes: integer("minutes").notNull().default(10),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("drills_team_name_unique").on(t.teamId, t.name)],
);
