"use server";

import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  DEFAULT_STAT_CATEGORIES,
  STAT_SET_VERSION,
  STAT_V2_KEYS,
  statCategories,
  statValues,
  games,
  gameEvents,
  gamePlayers,
  players,
  teams,
} from "@/lib/db/schema";
import { STAT_CODES } from "@/lib/stat-import";
import { addMissingCategories } from "@/lib/stat-categories";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";

/**
 * The full stats sheet for a team: every game as a column, every active player as a row, one
 * cell per (game, category). A cell is "blacked out" - not editable, rendered dim - whenever
 * the player's availability for that game is "Not Available". This is computed live from
 * `game_players.status` every time the sheet loads; it is never stored as a flag, and setting
 * a player unavailable never deletes any stat value already recorded for them.
 */
export async function getStatSheet(teamId: string) {
  await requireTeamAccess(teamId);

  const categories = await db
    .select()
    .from(statCategories)
    .where(eq(statCategories.teamId, teamId))
    .orderBy(asc(statCategories.sortOrder));

  const teamGames = await db.select().from(games).where(eq(games.teamId, teamId)).orderBy(asc(games.date));
  const roster = await db
    .select()
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(asc(players.name));
  // Guests are not on the stats sheet (it is per core-roster player).
  const activeRoster = roster.filter((p) => !p.archivedAt && !p.isGuest);

  if (teamGames.length === 0 || activeRoster.length === 0 || categories.length === 0) {
    return { categories, games: teamGames, roster: activeRoster, values: {}, blackouts: {}, availability: {} as Record<string, string> };
  }

  const gameIds = teamGames.map((g) => g.id);
  const availability = await db
    .select()
    .from(gamePlayers)
    .where(inArray(gamePlayers.gameId, gameIds));
  const values = await db.select().from(statValues).where(inArray(statValues.gameId, gameIds));

  const blackouts: Record<string, boolean> = {};
  const statuses: Record<string, string> = {};
  for (const a of availability) {
    blackouts[`${a.gameId}:${a.playerId}`] = a.status === "Not Available";
    statuses[`${a.gameId}:${a.playerId}`] = a.status;
  }

  const valueMap: Record<string, string> = {};
  for (const v of values) {
    valueMap[`${v.gameId}:${v.playerId}:${v.categoryId}`] = v.value;
  }

  return { categories, games: teamGames, roster: activeRoster, values: valueMap, blackouts, availability: statuses };
}

const addCategorySchema = z.object({ teamId: z.string().uuid(), label: z.string().trim().min(1).max(60) });

export async function addStatCategory(formData: FormData) {
  const parsed = addCategorySchema.parse({ teamId: formData.get("teamId"), label: formData.get("label") });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const existing = await db
    .select({ sortOrder: statCategories.sortOrder })
    .from(statCategories)
    .where(eq(statCategories.teamId, parsed.teamId))
    .orderBy(asc(statCategories.sortOrder));
  const nextOrder = existing.length > 0 ? existing[existing.length - 1].sortOrder + 1 : 0;
  const key = parsed.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "stat";

  await db.insert(statCategories).values({ teamId: parsed.teamId, key, label: parsed.label, sortOrder: nextOrder });

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "stat_category_added", details: parsed.label });
  await broadcastTeamUpdate(parsed.teamId, "stats");
  revalidatePath(`/teams/${parsed.teamId}/stats`, "layout");
}

const removeCategorySchema = z.object({ teamId: z.string().uuid(), categoryId: z.string().uuid() });

export async function removeStatCategory(formData: FormData) {
  const parsed = removeCategorySchema.parse({
    teamId: formData.get("teamId"),
    categoryId: formData.get("categoryId"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [cat] = await db
    .select()
    .from(statCategories)
    .where(and(eq(statCategories.id, parsed.categoryId), eq(statCategories.teamId, parsed.teamId)));
  if (!cat) return;

  // Cascades to stat_values for this category (see schema's onDelete: "cascade").
  await db.delete(statCategories).where(eq(statCategories.id, parsed.categoryId));

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "stat_category_removed", details: cat.label });
  await broadcastTeamUpdate(parsed.teamId, "stats");
  revalidatePath(`/teams/${parsed.teamId}/stats`, "layout");
}

const setValueSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
  categoryId: z.string().uuid(),
  value: z.string(),
});

export async function setStatValue(formData: FormData) {
  const parsed = setValueSchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    playerId: formData.get("playerId"),
    categoryId: formData.get("categoryId"),
    value: formData.get("value"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [avail] = await db
    .select({ status: gamePlayers.status })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, parsed.gameId), eq(gamePlayers.playerId, parsed.playerId)));
  if (avail?.status === "Not Available") {
    throw new Error("This player is not available for this game - their column is blacked out.");
  }

  const numeric = parsed.value.trim() === "" ? "0" : parsed.value.trim();
  if (Number.isNaN(Number(numeric))) {
    throw new Error("Stat values must be numeric.");
  }

  await db
    .insert(statValues)
    .values({
      gameId: parsed.gameId,
      playerId: parsed.playerId,
      categoryId: parsed.categoryId,
      value: numeric,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: [statValues.gameId, statValues.playerId, statValues.categoryId],
      set: { value: numeric, updatedBy: userId, updatedAt: new Date() },
    });

  await broadcastTeamUpdate(parsed.teamId, "stats", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/stats`, "layout");
}

/** Adds any default categories a team's stats sheet is missing, once per team version: a team that
 *  turned stats on before Shots / Draw Controls / Caused Turnovers / Turnovers / Goals Allowed
 *  existed gets them on its next visit. Categories a coach removes afterwards stay removed. */
export async function upgradeStatCategories(teamId: string) {
  const { team } = await requireTeamAccess(teamId);
  if (team.statsVersion >= STAT_SET_VERSION) return;
  const existing = await db.select().from(statCategories).where(eq(statCategories.teamId, teamId)).orderBy(asc(statCategories.sortOrder));
  if (existing.length > 0) {
    await addMissingCategories(teamId, [...STAT_V2_KEYS], existing);
  }
  await db.update(teams).set({ statsVersion: STAT_SET_VERSION }).where(eq(teams.id, teamId));
}

const importSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  rows: z
    .array(z.object({ playerId: z.string().uuid(), stats: z.record(z.string(), z.number().int().min(0).max(999)) }))
    .min(1)
    .max(80),
  // The play-by-play, when the pasted text had one. It replaces any log already saved for the game.
  events: z
    .array(
      z.object({
        seq: z.number().int().min(1),
        period: z.number().int().min(1).max(9),
        periodLabel: z.string().max(40),
        remainingSec: z.number().int().min(0).max(10_000).nullable(),
        elapsedSec: z.number().int().min(0).max(10_000).nullable(),
        paused: z.boolean(),
        kind: z.string().max(30),
        label: z.string().max(60),
        playerId: z.string().uuid().nullable(),
        playerName: z.string().max(80),
      }),
    )
    .max(600)
    .optional(),
});

/** Writes a parsed box score into one game's stats. Creates any missing categories, replaces the
 *  numbers already entered for the imported stats, and skips players marked Not Available. */
export async function importGameStats(input: z.input<typeof importSchema>): Promise<
  { ok: true; imported: number; skippedUnavailable: string[]; categoriesAdded: string[]; events: number } | { ok: false; error: string }
> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That import wasn't valid. Check the preview and try again." };
  const { teamId, gameId, rows, events } = parsed.data;
  const { userId } = await requireTeamAccess(teamId);

  const [game] = await db.select({ id: games.id }).from(games).where(and(eq(games.id, gameId), eq(games.teamId, teamId))).limit(1);
  if (!game) return { ok: false, error: "That game wasn't found on this team." };

  const allowedKeys = new Set(Object.values(STAT_CODES));
  const usedKeys = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.stats)) {
      if (!allowedKeys.has(k)) return { ok: false, error: `Unknown stat "${k}".` };
      usedKeys.add(k);
    }
  }

  // If a player appears twice, add the lines together so each cell is written once.
  const merged = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const acc = merged.get(r.playerId) ?? {};
    for (const [k, v] of Object.entries(r.stats)) acc[k] = (acc[k] ?? 0) + v;
    merged.set(r.playerId, acc);
  }
  const mergedRows = [...merged].map(([playerId, stats]) => ({ playerId, stats }));

  const playerIds = [...new Set(rows.map((r) => r.playerId))];
  const roster = await db
    .select({ id: players.id, name: players.name, archivedAt: players.archivedAt, isGuest: players.isGuest })
    .from(players)
    .where(and(eq(players.teamId, teamId), inArray(players.id, playerIds)));
  const valid = new Map(roster.filter((p) => !p.archivedAt && !p.isGuest).map((p) => [p.id, p.name]));
  if (mergedRows.some((r) => !valid.has(r.playerId))) return { ok: false, error: "A player in this import isn't on the team's active roster." };

  const availability = await db
    .select({ playerId: gamePlayers.playerId, status: gamePlayers.status })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, gameId), inArray(gamePlayers.playerId, playerIds)));
  const unavailable = new Set(availability.filter((a) => a.status === "Not Available").map((a) => a.playerId));

  const before = await db.select().from(statCategories).where(eq(statCategories.teamId, teamId)).orderBy(asc(statCategories.sortOrder));
  const categories = await addMissingCategories(teamId, [...usedKeys], before);
  const categoriesAdded = categories.filter((c) => !before.some((b) => b.id === c.id)).map((c) => c.label);
  // A hand-made category with the same name counts as the default one.
  const byKey = new Map<string, string>();
  for (const def of DEFAULT_STAT_CATEGORIES) {
    const hit = categories.find((c) => c.key === def.key) ?? categories.find((c) => c.label.trim().toLowerCase() === def.label.toLowerCase());
    if (hit) byKey.set(def.key, hit.id);
  }

  const skippedUnavailable: string[] = [];
  const values: (typeof statValues.$inferInsert)[] = [];
  const done = new Set<string>();
  for (const r of mergedRows) {
    if (unavailable.has(r.playerId)) {
      skippedUnavailable.push(valid.get(r.playerId)!);
      continue;
    }
    done.add(r.playerId);
    for (const [key, n] of Object.entries(r.stats)) {
      const categoryId = byKey.get(key);
      if (!categoryId) continue;
      values.push({ gameId, playerId: r.playerId, categoryId, value: String(n), updatedBy: userId });
    }
  }
  if (values.length > 0) {
    await db
      .insert(statValues)
      .values(values)
      .onConflictDoUpdate({
        target: [statValues.gameId, statValues.playerId, statValues.categoryId],
        set: { value: sql`excluded.value`, updatedBy: userId, updatedAt: new Date() },
      });
  }

  if (events && events.length > 0) {
    const eventPlayerIds = [...new Set(events.flatMap((e) => (e.playerId ? [e.playerId] : [])))];
    const teamPlayers = new Set(
      eventPlayerIds.length === 0
        ? []
        : (await db.select({ id: players.id }).from(players).where(and(eq(players.teamId, teamId), inArray(players.id, eventPlayerIds)))).map((p) => p.id),
    );
    await db.delete(gameEvents).where(eq(gameEvents.gameId, gameId));
    await db.insert(gameEvents).values(
      events.map((e) => ({
        gameId,
        seq: e.seq,
        period: e.period,
        periodLabel: e.periodLabel,
        remainingSec: e.remainingSec,
        elapsedSec: e.elapsedSec,
        paused: e.paused,
        kind: e.kind,
        label: e.label,
        playerId: e.playerId && teamPlayers.has(e.playerId) ? e.playerId : null,
        playerName: e.playerName,
      })),
    );
  }

  await logActivity({ teamId, actorUserId: userId, action: "stats_imported", details: `${done.size} players${events && events.length > 0 ? `, ${events.length} plays` : ""}` });
  await broadcastTeamUpdate(teamId, "stats", gameId);
  revalidatePath(`/teams/${teamId}/stats`, "layout");
  return { ok: true, imported: done.size, skippedUnavailable, categoriesAdded, events: events?.length ?? 0 };
}
