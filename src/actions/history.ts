"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, lineupSlots, SLOTS, SIXES_SLOTS, SEVENS_SLOTS, type SlotPosition } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { listRoster } from "@/actions/players";

// Covers every format's slots so a sixes or sevens game's starts show up here just like a
// field game's - see SlotPosition in @/lib/db/schema for why sixes needs its own "Sixes"
// bucket alongside the four regular positions (its Goalie slot still rolls into the ordinary
// Goalie bucket, though). Sevens slots use the same Attack/Mid/Def/Goalie positions as field,
// so they need no bucket of their own.
const ALL_SLOTS = [...SLOTS, ...SIXES_SLOTS, ...SEVENS_SLOTS];
const SLOT_POSITION = Object.fromEntries(ALL_SLOTS.map((s) => [s.key, s.pos])) as Record<
  string,
  SlotPosition
>;
const SLOT_LABEL = Object.fromEntries(ALL_SLOTS.map((s) => [s.key, s.label])) as Record<
  string,
  string
>;

export type StartRecord = {
  gameId: string;
  date: string;
  opponent: string | null;
  position: SlotPosition;
  slotLabel: string;
};

export type PlayerStartHistory = {
  playerId: string;
  name: string;
  number: string | null;
  archived: boolean;
  totalStarts: number;
  countsByPosition: Record<SlotPosition, number>;
  /** Most recent game first. */
  starts: StartRecord[];
};

/**
 * Every player's history of starts by position - "started" here means they held a lineup slot
 * for that game (see lineupSlots; a player holds at most one slot per game, enforced by the DB's
 * one_slot_per_player index). Grouped into the same broad position buckets as the roster page's
 * Position field (Attack/Mid/Def/Goalie), plus a fifth "Sixes" bucket for sixes-format games'
 * 5 flexible field slots (see SlotPosition in @/lib/db/schema), rather than the individual slot
 * (Low Attack 1 vs High Attack 2) - the point is spotting where a player has actually played
 * over a season, not re-deriving the lineup board. Includes archived players, since this is
 * history, not a roster.
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
    const countsByPosition: Record<SlotPosition, number> = { Attack: 0, Mid: 0, Def: 0, Goalie: 0, Sixes: 0 };
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
