"use server";

import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  games,
  gamePlayers,
  lineupSlots,
  players,
  AVAILABILITY_STATUSES,
  SLOTS,
  SIXES_SLOTS,
  SEVENS_SLOTS,
  GAME_FORMATS,
  type GameFormat,
} from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";

const STATUS_KEYS = AVAILABILITY_STATUSES as unknown as [string, ...string[]];
const FORMAT_KEYS = GAME_FORMATS as unknown as [string, ...string[]];
const SLOTS_BY_FORMAT: Record<GameFormat, typeof SLOTS | typeof SIXES_SLOTS | typeof SEVENS_SLOTS> = {
  field: SLOTS,
  sixes: SIXES_SLOTS,
  sevens: SEVENS_SLOTS,
};
const SLOT_KEYS_BY_FORMAT: Record<GameFormat, Set<string>> = {
  field: new Set(SLOTS.map((s) => s.key)),
  sixes: new Set(SIXES_SLOTS.map((s) => s.key)),
  sevens: new Set(SEVENS_SLOTS.map((s) => s.key)),
};

function slotsForFormat(format: string) {
  return SLOTS_BY_FORMAT[format as GameFormat] ?? SLOTS;
}

export async function listGames(teamId: string) {
  await requireTeamAccess(teamId);
  return db.select().from(games).where(eq(games.teamId, teamId)).orderBy(desc(games.date));
}

export async function getGame(teamId: string, gameId: string) {
  await requireTeamAccess(teamId);
  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.teamId, teamId)))
    .limit(1);
  return game ?? null;
}

const createGameSchema = z.object({
  teamId: z.string().uuid(),
  date: z.string().min(1),
  opponent: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
  // Empty string means "No season" - seasonId stays optional on every game.
  seasonId: z.union([z.string().uuid(), z.literal("")]),
  filmUrl: z.string().trim().max(500),
  format: z.enum(FORMAT_KEYS).default("field"),
});

export async function createGame(formData: FormData) {
  const parsed = createGameSchema.parse({
    teamId: formData.get("teamId"),
    date: formData.get("date"),
    opponent: formData.get("opponent") ?? "",
    notes: formData.get("notes") ?? "",
    seasonId: formData.get("seasonId") ?? "",
    filmUrl: formData.get("filmUrl") ?? "",
    format: formData.get("format") || "field",
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [game] = await db
    .insert(games)
    .values({
      teamId: parsed.teamId,
      date: parsed.date,
      opponent: parsed.opponent || null,
      notes: parsed.notes,
      seasonId: parsed.seasonId || null,
      filmUrl: parsed.filmUrl || null,
      format: parsed.format,
      createdBy: userId,
    })
    .returning();

  // Every active roster player starts each game as "No Response", same as the Sheets version.
  const roster = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.teamId, parsed.teamId)));
  if (roster.length > 0) {
    await db
      .insert(gamePlayers)
      .values(roster.map((p) => ({ gameId: game.id, playerId: p.id, status: "No Response" })));
  }

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "game_created",
    details: `${parsed.date}${parsed.opponent ? ` vs ${parsed.opponent}` : ""}`,
  });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
}

const updateGameSchema = createGameSchema.extend({ gameId: z.string().uuid() });

export async function updateGame(formData: FormData) {
  const parsed = updateGameSchema.parse({
    gameId: formData.get("gameId"),
    teamId: formData.get("teamId"),
    date: formData.get("date"),
    opponent: formData.get("opponent") ?? "",
    notes: formData.get("notes") ?? "",
    seasonId: formData.get("seasonId") ?? "",
    filmUrl: formData.get("filmUrl") ?? "",
    format: formData.get("format") || "field",
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db
    .update(games)
    .set({
      date: parsed.date,
      opponent: parsed.opponent || null,
      notes: parsed.notes,
      seasonId: parsed.seasonId || null,
      filmUrl: parsed.filmUrl || null,
      format: parsed.format,
    })
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)));

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "game_updated", details: parsed.date });
  await broadcastTeamUpdate(parsed.teamId, "games", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games`);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}

const deleteGameSchema = z.object({ teamId: z.string().uuid(), gameId: z.string().uuid() });

export async function deleteGame(formData: FormData) {
  const parsed = deleteGameSchema.parse({ teamId: formData.get("teamId"), gameId: formData.get("gameId") });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db.delete(games).where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)));

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "game_deleted", details: parsed.gameId });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
}

/** Full availability + lineup view for the game-day screen. `format` picks which fixed slot
 *  set (SLOTS or SIXES_SLOTS) the lineup board renders - pass the game's own `format` column
 *  (callers already have the game row loaded before calling this). */
export async function getGameDay(teamId: string, gameId: string, format: string = "field") {
  await requireTeamAccess(teamId);

  const roster = await db.select().from(players).where(eq(players.teamId, teamId)).orderBy(asc(players.name));
  const availability = await db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId));
  const lineup = await db.select().from(lineupSlots).where(eq(lineupSlots.gameId, gameId));

  const availabilityByPlayer = new Map(availability.map((a) => [a.playerId, a.status]));
  const lineupBySlot = new Map(lineup.map((l) => [l.slotKey, l.playerId]));

  return {
    roster: roster.map((p) => ({
      ...p,
      status: availabilityByPlayer.get(p.id) ?? "No Response",
    })),
    slots: slotsForFormat(format).map((s) => ({ ...s, playerId: lineupBySlot.get(s.key) ?? null })),
  };
}

const availabilitySchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
  status: z.enum(STATUS_KEYS),
});

/**
 * Setting a player's availability never touches their lineup slot or any stat values already
 * recorded - the stats screen computes the blackout live from this status, it never deletes
 * data. If they're penciled into a slot when their status changes to Not Available or No
 * Response, they stay in the slot rather than being silently pulled out - the lineup board
 * flags their name in red instead, so the coach notices and decides whether to swap them out.
 */
export async function setAvailability(formData: FormData) {
  const parsed = availabilitySchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    playerId: formData.get("playerId"),
    status: formData.get("status"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db
    .insert(gamePlayers)
    .values({ gameId: parsed.gameId, playerId: parsed.playerId, status: parsed.status })
    .onConflictDoUpdate({
      target: [gamePlayers.gameId, gamePlayers.playerId],
      set: { status: parsed.status },
    });

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "availability_set",
    details: `${parsed.playerId}: ${parsed.status}`,
  });
  await broadcastTeamUpdate(parsed.teamId, "availability", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}

const lineupSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  // Validated against the game's own format below rather than a single static enum, since a
  // valid slotKey differs between a "field" game (SLOTS) and a "sixes" game (SIXES_SLOTS).
  slotKey: z.string().min(1),
  playerId: z.string().uuid().optional(),
});

/** Assigns (or clears, when `playerId` is omitted) a lineup slot. A player can only hold one
 *  slot per game - the DB's `one_slot_per_player` partial unique index is the ultimate
 *  guarantee, but we also proactively clear any other slot they hold so assigning them
 *  somewhere new reads as a "move," not a rejected duplicate. */
export async function setLineupSlot(formData: FormData) {
  const parsed = lineupSchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    slotKey: formData.get("slotKey"),
    playerId: formData.get("playerId") || undefined,
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [game] = await db
    .select({ format: games.format })
    .from(games)
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)))
    .limit(1);
  if (!game) throw new Error("Game not found.");
  const validKeys = SLOT_KEYS_BY_FORMAT[game.format as GameFormat] ?? SLOT_KEYS_BY_FORMAT.field;
  if (!validKeys.has(parsed.slotKey)) throw new Error("Unrecognized lineup slot for this game's format.");

  await db.transaction(async (tx) => {
    if (parsed.playerId) {
      await tx
        .update(lineupSlots)
        .set({ playerId: null })
        .where(and(eq(lineupSlots.gameId, parsed.gameId), eq(lineupSlots.playerId, parsed.playerId)));
    }
    await tx
      .insert(lineupSlots)
      .values({ gameId: parsed.gameId, slotKey: parsed.slotKey, playerId: parsed.playerId ?? null })
      .onConflictDoUpdate({
        target: [lineupSlots.gameId, lineupSlots.slotKey],
        set: { playerId: parsed.playerId ?? null },
      });
  });

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "lineup_set",
    details: `${parsed.slotKey}: ${parsed.playerId ?? "empty"}`,
  });
  await broadcastTeamUpdate(parsed.teamId, "lineup", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}
