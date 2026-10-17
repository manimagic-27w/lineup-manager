"use server";

import { z } from "zod";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, gamePlayers, lineupSlots, players, tournaments } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { slotsFor } from "@/lib/lineup-slots";
import { buildOfflineGame, gameFormatLabel, type OfflineTeamSnapshot } from "@/lib/offline-snapshot";
import { themeSwatch } from "@/lib/utils";

// Upcoming games (plus the last couple of days, so a game that is under way is still there) are
// all a coach needs at a field; older ones are in History.
const MAX_GAMES = 15;
const LOOK_BACK_DAYS = 2;

/**
 * Everything the offline view needs for one team, in three bulk queries (not one per game):
 * the next games with their lineup, bench and availability, names already resolved.
 */
export async function getOfflineSnapshot(teamId: string): Promise<OfflineTeamSnapshot> {
  const id = z.string().uuid().parse(teamId);
  const { team } = await requireTeamAccess(id);

  const since = new Date(Date.now() - LOOK_BACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const upcoming = await db
    .select()
    .from(games)
    .where(and(eq(games.teamId, id), gte(games.date, since)))
    .orderBy(asc(games.date))
    .limit(MAX_GAMES);

  const gameIds = upcoming.map((g) => g.id);
  const [roster, availability, lineup, tournamentRows] = await Promise.all([
    db.select().from(players).where(eq(players.teamId, id)).orderBy(asc(players.name)),
    gameIds.length ? db.select().from(gamePlayers).where(inArray(gamePlayers.gameId, gameIds)) : [],
    gameIds.length ? db.select().from(lineupSlots).where(inArray(lineupSlots.gameId, gameIds)) : [],
    db.select({ id: tournaments.id, name: tournaments.name }).from(tournaments).where(eq(tournaments.teamId, id)),
  ]);
  const tournamentName = new Map(tournamentRows.map((t) => [t.id, t.name]));

  return {
    teamId: id,
    teamName: team.name,
    color: themeSwatch(team.theme),
    savedAt: new Date().toISOString(),
    games: upcoming.map((g) =>
      buildOfflineGame({
        game: { id: g.id, date: g.date, opponent: g.opponent, notes: g.notes },
        formatLabel: gameFormatLabel(g.format, team.gender),
        tournament: g.tournamentId ? (tournamentName.get(g.tournamentId) ?? null) : null,
        roster,
        availability: availability.filter((a) => a.gameId === g.id),
        lineup: lineup.filter((l) => l.gameId === g.id),
        slots: slotsFor(g.format, team.gender),
      }),
    ),
  };
}
