"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  games,
  gamePlayers,
  tournaments,
  lineupSlots,
  players,
  AVAILABILITY_STATUSES,
  GAME_FORMATS,
} from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";
import { coreThenGuests } from "@/lib/guests";
import { formatAllowsSubs, slotKeysFor, slotsFor } from "@/lib/lineup-slots";

const STATUS_KEYS = AVAILABILITY_STATUSES as unknown as [string, ...string[]];
const FORMAT_KEYS = GAME_FORMATS as unknown as [string, ...string[]];

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
  isFriendly: z.boolean().default(false),
  // Empty string means "No tournament".
  tournamentId: z.union([z.string().uuid(), z.literal("")]).default(""),
});

/** A game can only be grouped under one of its own team's tournaments. Returns the id to store
 *  (null for none) and rejects an id that belongs to a different team. */
async function resolveTournamentId(teamId: string, tournamentId: string) {
  if (!tournamentId) return null;
  const [t] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.teamId, teamId)))
    .limit(1);
  if (!t) throw new Error("Tournament not found.");
  return t.id;
}

export async function createGame(formData: FormData) {
  const parsed = createGameSchema.parse({
    teamId: formData.get("teamId"),
    date: formData.get("date"),
    opponent: formData.get("opponent") ?? "",
    notes: formData.get("notes") ?? "",
    seasonId: formData.get("seasonId") ?? "",
    filmUrl: formData.get("filmUrl") ?? "",
    format: formData.get("format") || "field",
    isFriendly: formData.get("isFriendly") === "on",
    tournamentId: formData.get("tournamentId") ?? "",
  });
  const { userId } = await requireTeamAccess(parsed.teamId);
  const tournamentId = await resolveTournamentId(parsed.teamId, parsed.tournamentId);

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
      isFriendly: parsed.isFriendly,
      tournamentId,
      createdBy: userId,
    })
    .returning();

  // Every active roster player starts each game as "No Response", same as the Sheets version.
  const roster = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.teamId, parsed.teamId), eq(players.isGuest, false)));
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

// updateGame (the details form) never touches the score or friendly flag - those are owned by
// setGameResult below - so omit isFriendly here to keep a details save from resetting it.
const updateGameSchema = createGameSchema.omit({ isFriendly: true }).extend({ gameId: z.string().uuid() });

const scoreField = z.union([z.literal(""), z.coerce.number().int().min(0).max(999)]);

const resultSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  ourScore: scoreField,
  opponentScore: scoreField,
  isFriendly: z.boolean(),
});

/** Records (or clears) a game's final score and whether it's a friendly. Both scores must be
 *  filled in together, or both left blank to clear the result. A friendly keeps its score but
 *  is excluded from the team record (see lib/game-record.ts). */
export async function setGameResult(formData: FormData) {
  const parsed = resultSchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    ourScore: formData.get("ourScore") ?? "",
    opponentScore: formData.get("opponentScore") ?? "",
    isFriendly: formData.get("isFriendly") === "on",
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const hasOur = parsed.ourScore !== "";
  const hasOpp = parsed.opponentScore !== "";
  if (hasOur !== hasOpp) throw new Error("Enter both scores, or leave both blank to clear the result.");
  const ourScore = hasOur ? Number(parsed.ourScore) : null;
  const opponentScore = hasOpp ? Number(parsed.opponentScore) : null;

  const updated = await db
    .update(games)
    .set({ ourScore, opponentScore, isFriendly: parsed.isFriendly })
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)))
    .returning({ id: games.id });
  if (updated.length === 0) throw new Error("Game not found.");

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "game_result_set",
    details: JSON.stringify({ gameId: parsed.gameId, ourScore, opponentScore, isFriendly: parsed.isFriendly }),
  });
  await broadcastTeamUpdate(parsed.teamId, "games", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games`);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}

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
    tournamentId: formData.get("tournamentId") ?? "",
  });
  const { userId } = await requireTeamAccess(parsed.teamId);
  const tournamentId = await resolveTournamentId(parsed.teamId, parsed.tournamentId);

  await db
    .update(games)
    .set({
      date: parsed.date,
      opponent: parsed.opponent || null,
      notes: parsed.notes,
      seasonId: parsed.seasonId || null,
      filmUrl: parsed.filmUrl || null,
      format: parsed.format,
      tournamentId,
    })
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)));

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "game_updated",
    details: `${parsed.date}${parsed.opponent ? ` vs ${parsed.opponent}` : ""}`,
  });
  await broadcastTeamUpdate(parsed.teamId, "games", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games`);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}

const deleteGameSchema = z.object({ teamId: z.string().uuid(), gameId: z.string().uuid() });

export async function deleteGame(formData: FormData) {
  const parsed = deleteGameSchema.parse({ teamId: formData.get("teamId"), gameId: formData.get("gameId") });
  const { userId } = await requireTeamAccess(parsed.teamId);

  // Read the game before it's gone so the log can say which one it was (date / opponent).
  const [existing] = await db
    .select({ date: games.date, opponent: games.opponent })
    .from(games)
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)))
    .limit(1);

  await db.delete(games).where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)));

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "game_deleted",
    details: existing ? `${existing.date}${existing.opponent ? ` vs ${existing.opponent}` : ""}` : undefined,
  });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
  // The only place this is called from is the deleted game's own page. Without a redirect,
  // Next re-renders that same URL after the action finishes, getGame() comes back null, and the
  // coach lands on a 404 even though the delete worked - so send them back to the schedule.
  redirect(`/teams/${parsed.teamId}/games`);
}

/** Full availability + lineup view for the game-day screen. `format` picks which fixed slot
 *  set (SLOTS or SIXES_SLOTS) the lineup board renders - pass the game's own `format` column
 *  (callers already have the game row loaded before calling this). */
export async function getGameDay(teamId: string, gameId: string, format: string = "field", subs: boolean = false) {
  const { team } = await requireTeamAccess(teamId);

  const roster = await db.select().from(players).where(eq(players.teamId, teamId)).orderBy(asc(players.name));
  const availability = await db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId));
  const lineup = await db.select().from(lineupSlots).where(eq(lineupSlots.gameId, gameId));

  const availabilityByPlayer = new Map(availability.map((a) => [a.playerId, a.status]));
  const lineupBySlot = new Map(lineup.map((l) => [l.slotKey, l.playerId]));

  // Guests only count for a game they've been added to (they have a game_players row); core
  // players are always on every game. Core players come first, then guests, each by name.
  const onThisGame = roster.filter((p) => !p.isGuest || availabilityByPlayer.has(p.id));

  return {
    roster: coreThenGuests(onThisGame).map((p) => ({
      ...p,
      status: availabilityByPlayer.get(p.id) ?? "No Response",
    })),
    slots: slotsFor(format, team.gender, subs).map((s) => ({ ...s, playerId: lineupBySlot.get(s.key) ?? null })),
  };
}

const setSubsSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  subs: z.enum(["true", "false"]),
});

/**
 * Turns the sub spots (2 attack, 3 midfield, 2 defense) on or off for one game. Turning them off
 * only hides them - picks already made stay saved and reappear if the switch is turned back on.
 * Only Field and Sevens games have subs; Sixes ignores the setting.
 */
export async function setGameSubs(teamId: string, gameId: string, subs: boolean) {
  const parsed = setSubsSchema.parse({ teamId, gameId, subs: String(subs) });
  const { userId } = await requireTeamAccess(parsed.teamId);
  const on = parsed.subs === "true";

  const [game] = await db
    .select({ date: games.date, opponent: games.opponent, format: games.format })
    .from(games)
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)))
    .limit(1);
  if (!game) throw new Error("Game not found.");
  if (!formatAllowsSubs(game.format)) throw new Error("Sixes games don't have subs.");

  await db
    .update(games)
    .set({ subs: on })
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)));

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "game_subs_changed",
    details: `${on ? "on" : "off"} ${game.date}${game.opponent ? ` vs ${game.opponent}` : ""}`,
  });
  await broadcastTeamUpdate(parsed.teamId, "lineup", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
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
    // JSON so the activity feed can show the player and game by name, not by id.
    details: JSON.stringify({ playerId: parsed.playerId, gameId: parsed.gameId, status: parsed.status }),
  });
  await broadcastTeamUpdate(parsed.teamId, "availability", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}

const importAvailabilitySchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  sourceGameId: z.string().uuid(),
});

/**
 * Copies availability from another game of the same team onto this one, e.g. a coach collects
 * availability once for a tournament weekend and reuses it for each game. It only fills in
 * players who are still "No Response" here, and only with a real answer from the source
 * (a "No Response" in the source carries nothing over), so anything the coach already entered
 * on this game is never overwritten and the import is safe to run again. Lineups are untouched.
 * Returns how many players were updated.
 */
export async function importAvailability(formData: FormData) {
  const parsed = importAvailabilitySchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    sourceGameId: formData.get("sourceGameId"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);
  if (parsed.gameId === parsed.sourceGameId) throw new Error("Pick a different game to import from.");

  // Both games must belong to this team, so one team can never read another team's availability.
  const own = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.teamId, parsed.teamId), inArray(games.id, [parsed.gameId, parsed.sourceGameId])));
  if (own.length !== 2) throw new Error("Game not found.");

  const imported = await db.transaction(async (tx) => {
    // Players that already have a row on this game but haven't answered yet.
    const updated = await tx.execute(sql`
      UPDATE game_players AS t
      SET status = s.status
      FROM game_players AS s
      WHERE t.game_id = ${parsed.gameId}::uuid
        AND s.game_id = ${parsed.sourceGameId}::uuid
        AND t.player_id = s.player_id
        AND t.status = 'No Response'
        AND s.status <> 'No Response'`);
    // Players with no row on this game yet (added to the roster after it was scheduled).
    const inserted = await tx.execute(sql`
      INSERT INTO game_players (game_id, player_id, status)
      SELECT ${parsed.gameId}::uuid, s.player_id, s.status
      FROM game_players AS s
      WHERE s.game_id = ${parsed.sourceGameId}::uuid
        AND s.status <> 'No Response'
        AND NOT EXISTS (
          SELECT 1 FROM game_players AS t WHERE t.game_id = ${parsed.gameId}::uuid AND t.player_id = s.player_id
        )`);
    return (updated.rowCount ?? 0) + (inserted.rowCount ?? 0);
  });

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "availability_imported",
    details: JSON.stringify({ gameId: parsed.gameId, sourceGameId: parsed.sourceGameId, count: imported }),
  });
  await broadcastTeamUpdate(parsed.teamId, "availability", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
  return { imported };
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
  const { userId, team } = await requireTeamAccess(parsed.teamId);

  const [game] = await db
    .select({ format: games.format, subs: games.subs })
    .from(games)
    .where(and(eq(games.id, parsed.gameId), eq(games.teamId, parsed.teamId)))
    .limit(1);
  if (!game) throw new Error("Game not found.");
  const validKeys = slotKeysFor(game.format, team.gender, game.subs);
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
    details: JSON.stringify({ gameId: parsed.gameId, slotKey: parsed.slotKey, playerId: parsed.playerId ?? null }),
  });
  await broadcastTeamUpdate(parsed.teamId, "lineup", parsed.gameId);
  revalidatePath(`/teams/${parsed.teamId}/games/${parsed.gameId}`);
}
