"use server";

import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { statCategories, statValues, games, gamePlayers, players } from "@/lib/db/schema";
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
  const activeRoster = roster.filter((p) => !p.archivedAt);

  if (teamGames.length === 0 || activeRoster.length === 0 || categories.length === 0) {
    return { categories, games: teamGames, roster: activeRoster, values: {}, blackouts: {} };
  }

  const gameIds = teamGames.map((g) => g.id);
  const availability = await db
    .select()
    .from(gamePlayers)
    .where(inArray(gamePlayers.gameId, gameIds));
  const values = await db.select().from(statValues).where(inArray(statValues.gameId, gameIds));

  const blackouts: Record<string, boolean> = {};
  for (const a of availability) {
    blackouts[`${a.gameId}:${a.playerId}`] = a.status === "Not Available";
  }

  const valueMap: Record<string, string> = {};
  for (const v of values) {
    valueMap[`${v.gameId}:${v.playerId}:${v.categoryId}`] = v.value;
  }

  return { categories, games: teamGames, roster: activeRoster, values: valueMap, blackouts };
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
  revalidatePath(`/teams/${parsed.teamId}/stats`);
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
  revalidatePath(`/teams/${parsed.teamId}/stats`);
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
  revalidatePath(`/teams/${parsed.teamId}/stats`);
}
