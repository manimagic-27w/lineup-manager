"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, lineupSlots, SLOTS, type Position } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { listRoster } from "@/actions/players";

const SLOT_POSITION = Object.fromEntries(SLOTS.map((s) => [s.key, s.pos])) as Record<
  string,
  Position
>;
const SLOT_LABEL = Object.fromEntries(SLOTS.map((s) => [s.key, s.label])) as Record<
  string,
  string
>;

export type StartRecord = {
  gameId: string;
  date: string;
  opponent: string | null;
  position: Position;
  slotLabel: string;
};

export type PlayerStartHistory = {
  playerId: string;
  name: string;
  number: string | null;
  archived: boolean;
  totalStarts: number;
  countsByPosition: Record<Position, number>;
  /** Most recent game first. */
  starts: StartRecord[];
};

/**
 * Every player's history of starts by position - "started" here means they held a lineup slot
 * for that game (see lineupSlots; a player holds at most one slot per game, enforced by the DB's
 * one_slot_per_player index). Grouped into the same broad position buckets as the roster page's
 * Position field (Attack/Mid/Def/Goalie) rather than the individual slot (Low Attack 1 vs High
 * Attack 2) - the point is spotting where a player has actually played over a season, not
 * re-deriving the lineup board. Includes archived players, since this is history, not a roster.
 */
export async function getStartHistory(teamId: string): Promise<PlayerStartHistory[]> {
  await requireTeamAccess(teamId);

  const roster = await listRoster(teamId, { includeArchived: true });
  if (roster.length === 0) return [];

  const teamGames = await db.select().from(games).where(eq(games.teamId, teamId)).orderBy(desc(games.date));
  const gameById = new Map(teamGames.map((g) => [g.id, g]));

  const slots =
    teamGames.length > 0
      ? await db
          .select()
          .from(lineupSlots)
          .where(inArray(lineupSlots.gameId, teamGames.map((g) => g.id)))
      : [];

  const startsByPlayer = new Map<string, StartRecord[]>();
  for (const slot of slots) {
    if (!slot.playerId) continue;
    const game = gameById.get(slot.gameId);
    const position = SLOT_POSITION[slot.slotKey];
    if (!game || !position) continue;

    const record: StartRecord = {
      gameId: game.id,
      date: game.date,
      opponent: game.opponent,
      position,
      slotLabel: SLOT_LABEL[slot.slotKey] ?? slot.slotKey,
    };
    const existing = startsByPlayer.get(slot.playerId);
    if (existing) {
      existing.push(record);
    } else {
      startsByPlayer.set(slot.playerId, [record]);
    }
  }

  // teamGames is already newest-first, but slot rows aren't guaranteed to come back in that
  // order, so each player's list is sorted independently.
  return roster.map((p) => {
    const starts = (startsByPlayer.get(p.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : -1));
    const countsByPosition: Record<Position, number> = { Attack: 0, Mid: 0, Def: 0, Goalie: 0 };
    for (const s of starts) countsByPosition[s.position]++;

    return {
      playerId: p.id,
      name: p.name,
      number: p.number,
      archived: !!p.archivedAt,
      totalStarts: starts.length,
      countsByPosition,
      starts,
    };
  });
}
