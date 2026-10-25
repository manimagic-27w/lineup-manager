import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { gameEvents, games } from "@/lib/db/schema";

/** How many logged plays each of this team's games has (games with no log are left out). */
export async function countEventsByGame(teamId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ gameId: gameEvents.gameId, n: sql<number>`count(*)::int` })
    .from(gameEvents)
    .innerJoin(games, eq(games.id, gameEvents.gameId))
    .where(eq(games.teamId, teamId))
    .groupBy(gameEvents.gameId);
  return new Map(rows.map((r) => [r.gameId, r.n]));
}

export async function getGameForTeam(teamId: string, gameId: string) {
  const [game] = await db.select().from(games).where(and(eq(games.id, gameId), eq(games.teamId, teamId))).limit(1);
  return game ?? null;
}
