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
/* Games, availability, lineup                                         */
/* ------------------------------------------------------------------ */

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  opponent: text("opponent"),
  notes: text("notes").notNull().default(""),
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
  statCategories: many(statCategories),
  activity: many(activityLog),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  team: one(teams, { fields: [players.teamId], references: [teams.id] }),
  gameEntries: many(gamePlayers),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  team: one(teams, { fields: [games.teamId], references: [teams.id] }),
  players: many(gamePlayers),
  lineup: many(lineupSlots),
  stats: many(statValues),
}));
