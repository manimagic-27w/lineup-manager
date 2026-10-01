import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { players, games, gamePlayers, lineupSlots, statCategories, statValues, seasons, SLOTS, SIXES_SLOTS, SEVENS_SLOTS } from "./db/schema";

export { toCsv } from "./csv";

/** Pulls everything about a team into a flat, export-friendly shape. Shared by both the
 *  CSV and XLSX export routes so they can't drift out of sync with each other. */
export async function loadTeamExport(teamId: string) {
  const roster = await db.select().from(players).where(eq(players.teamId, teamId)).orderBy(asc(players.name));
  const teamGames = await db.select().from(games).where(eq(games.teamId, teamId)).orderBy(asc(games.date));
  const teamSeasons = await db.select().from(seasons).where(eq(seasons.teamId, teamId));
  const seasonById = new Map(teamSeasons.map((s) => [s.id, s]));
  const gameIds = teamGames.map((g) => g.id);

  const [availability, lineup, categories, values] = gameIds.length
    ? await Promise.all([
        db.select().from(gamePlayers).where(inArray(gamePlayers.gameId, gameIds)),
        db.select().from(lineupSlots).where(inArray(lineupSlots.gameId, gameIds)),
        db.select().from(statCategories).where(eq(statCategories.teamId, teamId)).orderBy(asc(statCategories.sortOrder)),
        db.select().from(statValues).where(inArray(statValues.gameId, gameIds)),
      ])
    : [[], [], await db.select().from(statCategories).where(eq(statCategories.teamId, teamId)), []];

  const playerById = new Map(roster.map((p) => [p.id, p]));
  const gameById = new Map(teamGames.map((g) => [g.id, g]));
  // Covers a field game's 12 slots, a sixes game's 6, and a sevens game's 8, so an exported
  // lineup row never falls back to showing a raw slot key like "SF1" or "7A1".
  const slotLabel = new Map<string, string>(
    [...SLOTS, ...SIXES_SLOTS, ...SEVENS_SLOTS].map((s) => [s.key, s.label])
  );

  return {
    roster,
    games: teamGames.map((g) => ({ ...g, seasonName: g.seasonId ? (seasonById.get(g.seasonId)?.name ?? null) : null })),
    availability: availability.map((a) => ({
      game: gameById.get(a.gameId),
      player: playerById.get(a.playerId),
      status: a.status,
    })),
    lineup: lineup
      .filter((l) => l.playerId)
      .map((l) => ({
        game: gameById.get(l.gameId),
        slot: slotLabel.get(l.slotKey) ?? l.slotKey,
        player: playerById.get(l.playerId!),
      })),
    categories,
    stats: values.map((v) => ({
      game: gameById.get(v.gameId),
      player: playerById.get(v.playerId),
      category: categories.find((c) => c.id === v.categoryId),
      value: v.value,
    })),
  };
}
