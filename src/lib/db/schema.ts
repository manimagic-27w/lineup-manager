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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(), // Clerk user id
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Seasons, games, availability, lineup                                */
/* ------------------------------------------------------------------ */

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
  // Nullable and onDelete "set null" on purpose: deleting a season should never delete its games,
  // just unassign them back to "No season."
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
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
    // Enforces "a player can only hold one slot per game" at the DB level.
    uniqueIndex("one_slot_per_player")
      .on(t.gameId, t.playerId)
      .where(sql`${t.playerId} is not null`),
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
  players: many(gamePlayers),
  lineup: many(lineupSlots),
  stats: many(statValues),
}));
