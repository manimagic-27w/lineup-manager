"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { gameEvents, gamePlayers, games, players, statCategories, statValues, teams } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { generateLogToken } from "@/lib/log-token";
import { hashPin, isValidPin } from "@/lib/pin";
import { openKeeper } from "@/lib/stat-keeper-server";
import { addMissingCategories, categoryIdsByKey } from "@/lib/stat-categories";
import { broadcastTeamUpdate } from "@/lib/pusher-server";
import { KEEPER_ACTION_KEYS, KEEPER_STAT_KEYS, MAX_EVENTS_PER_GAME, keeperActionByKey, keeperActionByKind, tallyEvents } from "@/lib/stat-keeper";

// The first group of actions is PUBLIC: a stat keeper uses them from /keep/<token> without signing
// in. The team's secret link plus the keeper PIN (checked on every call, locked after too many
// wrong guesses) are the credentials. Every action re-checks both, then that the game and player
// belong to that team, before it touches anything.

type Failure = { ok: false; error: string };
const KEEPER_USER = "stat-keeper";

export type KeeperGameOption = { id: string; date: string; opponent: string | null };
export type KeeperEvent = { id: string; seq: number; kind: string; label: string; playerName: string; source: string };
export type KeeperPlayer = { id: string; name: string; number: string | null };

/** Step 1: the PIN. Returns the team's games (newest first) and the one nearest to today. */
export async function unlockKeeper(
  token: string,
  pin: string,
): Promise<{ ok: true; teamName: string; games: KeeperGameOption[]; suggestedGameId: string | null } | Failure> {
  const access = await openKeeper(token, pin);
  if (!access.ok) return access;
  const rows = await db
    .select({ id: games.id, date: games.date, opponent: games.opponent })
    .from(games)
    .where(eq(games.teamId, access.team.id))
    .orderBy(desc(games.date))
    .limit(40);
  const now = Date.now();
  let suggestedGameId: string | null = null;
  let best = 4 * 86_400_000; // only suggest a game within 4 days of today
  for (const g of rows) {
    const diff = Math.abs(new Date(`${g.date}T12:00:00Z`).getTime() - now);
    if (diff < best) {
      best = diff;
      suggestedGameId = g.id;
    }
  }
  return { ok: true, teamName: access.team.name, games: rows, suggestedGameId };
}

async function loadEvents(gameId: string) {
  return db
    .select({ id: gameEvents.id, seq: gameEvents.seq, kind: gameEvents.kind, label: gameEvents.label, playerName: gameEvents.playerName, source: gameEvents.source })
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId));
}

/** Step 2: open one game. Returns who can be picked (everyone not marked Not Available), the most
 *  recent plays, and the score so far. */
export async function getKeeperGame(
  token: string,
  pin: string,
  gameId: string,
): Promise<{ ok: true; label: string; players: KeeperPlayer[]; events: KeeperEvent[]; tally: { goals: number; allowed: number } } | Failure> {
  const id = z.string().uuid().safeParse(gameId);
  if (!id.success) return { ok: false, error: "Pick a game." };
  const access = await openKeeper(token, pin);
  if (!access.ok) return access;
  const teamId = access.team.id;

  const [game] = await db.select().from(games).where(and(eq(games.id, id.data), eq(games.teamId, teamId))).limit(1);
  if (!game) return { ok: false, error: "That game wasn't found." };

  const categories = await db.select().from(statCategories).where(eq(statCategories.teamId, teamId));
  if (categories.length === 0) return { ok: false, error: "Stats aren't turned on for this team yet. Ask your coach to turn them on first." };
  await addMissingCategories(teamId, KEEPER_STAT_KEYS, categories);

  const roster = await db
    .select({ id: players.id, name: players.name, number: players.number, archivedAt: players.archivedAt, isGuest: players.isGuest })
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(asc(players.name));
  const statuses = await db.select({ playerId: gamePlayers.playerId, status: gamePlayers.status }).from(gamePlayers).where(eq(gamePlayers.gameId, game.id));
  const unavailable = new Set(statuses.filter((s) => s.status === "Not Available").map((s) => s.playerId));
  const list: KeeperPlayer[] = roster
    .filter((p) => !p.archivedAt && !p.isGuest && !unavailable.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, number: p.number }))
    .sort((a, b) => {
      const na = Number.parseInt(a.number ?? "", 10);
      const nb = Number.parseInt(b.number ?? "", 10);
      if (Number.isNaN(na) !== Number.isNaN(nb)) return Number.isNaN(na) ? 1 : -1;
      return na - nb || a.name.localeCompare(b.name);
    });

  const all = await loadEvents(game.id);
  const recent = [...all].sort((a, b) => b.seq - a.seq).slice(0, 12);
  return {
    ok: true,
    label: `${game.opponent ? `vs ${game.opponent}` : "Game"} - ${game.date}`,
    players: list,
    events: recent,
    tally: tallyEvents(all),
  };
}

const recordSchema = z.object({
  token: z.string(),
  pin: z.string(),
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
  action: z.enum(KEEPER_ACTION_KEYS),
  id: z.string().uuid(), // made on the keeper's phone, so a retried tap is never counted twice
});

/** Step 3, "Commit": saves one play and adds it to the player's stats for the game. */
export async function recordKeeperAction(input: z.input<typeof recordSchema>): Promise<{ ok: true } | Failure> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That tap wasn't valid. Pick a player and an action." };
  const v = parsed.data;
  const access = await openKeeper(v.token, v.pin);
  if (!access.ok) return access;
  const teamId = access.team.id;
  const action = keeperActionByKey(v.action)!;

  const [game] = await db.select({ id: games.id }).from(games).where(and(eq(games.id, v.gameId), eq(games.teamId, teamId))).limit(1);
  if (!game) return { ok: false, error: "That game wasn't found." };
  const [player] = await db
    .select({ id: players.id, name: players.name, archivedAt: players.archivedAt, isGuest: players.isGuest })
    .from(players)
    .where(and(eq(players.id, v.playerId), eq(players.teamId, teamId)))
    .limit(1);
  if (!player || player.archivedAt || player.isGuest) return { ok: false, error: "That player isn't on the active roster." };
  const [status] = await db
    .select({ status: gamePlayers.status })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, game.id), eq(gamePlayers.playerId, player.id)))
    .limit(1);
  if (status?.status === "Not Available") return { ok: false, error: `${player.name} is marked Not Available for this game.` };

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(gameEvents).where(eq(gameEvents.gameId, game.id));
  if (n >= MAX_EVENTS_PER_GAME) return { ok: false, error: "This game's log is full. Ask your coach to check it." };

  const existing = await db.select().from(statCategories).where(eq(statCategories.teamId, teamId));
  if (existing.length === 0) return { ok: false, error: "Stats aren't turned on for this team yet." };
  const ids = categoryIdsByKey(await addMissingCategories(teamId, [...action.stats], existing));
  const categoryIds = action.stats.map((k) => ids.get(k)).filter((x): x is string => !!x);

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(gameEvents)
      .values({
        id: v.id,
        gameId: game.id,
        seq: sql`(select coalesce(max(${gameEvents.seq}), 0) + 1 from ${gameEvents} where ${gameEvents.gameId} = ${game.id})`,
        period: 1,
        periodLabel: "Live",
        remainingSec: null,
        elapsedSec: null,
        paused: false,
        kind: action.kind,
        label: action.label,
        playerId: player.id,
        playerName: player.name,
        source: "keeper",
      })
      .onConflictDoNothing()
      .returning({ id: gameEvents.id });
    if (inserted.length === 0) return; // this tap was already saved - don't count it twice
    for (const categoryId of categoryIds) {
      await tx
        .insert(statValues)
        .values({ gameId: game.id, playerId: player.id, categoryId, value: "1", updatedBy: KEEPER_USER })
        .onConflictDoUpdate({
          target: [statValues.gameId, statValues.playerId, statValues.categoryId],
          set: { value: sql`${statValues.value} + 1`, updatedBy: KEEPER_USER, updatedAt: new Date() },
        });
    }
  });

  await broadcastTeamUpdate(teamId, "stats", game.id);
  revalidatePath(`/teams/${teamId}/stats`, "layout");
  return { ok: true };
}

const undoSchema = z.object({ token: z.string(), pin: z.string(), gameId: z.string().uuid(), eventId: z.string().uuid() });

/** Takes back a play made on this screen: removes it from the log and subtracts it from the stats. */
export async function undoKeeperAction(input: z.input<typeof undoSchema>): Promise<{ ok: true } | Failure> {
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That play wasn't found." };
  const v = parsed.data;
  const access = await openKeeper(v.token, v.pin);
  if (!access.ok) return access;
  const teamId = access.team.id;

  const [game] = await db.select({ id: games.id }).from(games).where(and(eq(games.id, v.gameId), eq(games.teamId, teamId))).limit(1);
  if (!game) return { ok: false, error: "That game wasn't found." };

  const categories = await db.select().from(statCategories).where(eq(statCategories.teamId, teamId));
  const ids = categoryIdsByKey(categories);

  await db.transaction(async (tx) => {
    // Only plays made on this screen can be taken back here (not an imported play-by-play).
    const removed = await tx
      .delete(gameEvents)
      .where(and(eq(gameEvents.id, v.eventId), eq(gameEvents.gameId, game.id), eq(gameEvents.source, "keeper")))
      .returning({ kind: gameEvents.kind, playerId: gameEvents.playerId });
    const ev = removed[0];
    if (!ev?.playerId) return;
    const action = keeperActionByKind(ev.kind);
    if (!action) return;
    const categoryIds = action.stats.map((k) => ids.get(k)).filter((x): x is string => !!x);
    if (categoryIds.length === 0) return;
    await tx
      .update(statValues)
      .set({ value: sql`greatest(${statValues.value} - 1, 0)`, updatedBy: KEEPER_USER, updatedAt: new Date() })
      .where(and(eq(statValues.gameId, game.id), eq(statValues.playerId, ev.playerId), inArray(statValues.categoryId, categoryIds)));
  });

  await broadcastTeamUpdate(teamId, "stats", game.id);
  revalidatePath(`/teams/${teamId}/stats`, "layout");
  return { ok: true };
}

// ---- Coach side (signed in, any coach on the team or a club admin) ----

/** Turns the stat keeper link on with a keeper PIN (keeps the link if one already exists). */
export async function enableStatKeeper(teamId: string, pin: string): Promise<{ ok: true } | Failure> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  if (!isValidPin(pin)) return { ok: false, error: "The keeper PIN must be exactly 4 numbers." };
  await db
    .update(teams)
    .set({
      statKeeperToken: team.statKeeperToken ?? generateLogToken(),
      statKeeperPinHash: hashPin(pin),
      statKeeperFailedAttempts: 0,
      statKeeperLockedUntil: null,
    })
    .where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/stats/keeper`);
  return { ok: true };
}

/** Sets a new keeper PIN and clears any lockout. */
export async function changeStatKeeperPin(teamId: string, pin: string): Promise<{ ok: true } | Failure> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  if (!team.statKeeperToken) return { ok: false, error: "Turn the stat keeper link on first." };
  if (!isValidPin(pin)) return { ok: false, error: "The keeper PIN must be exactly 4 numbers." };
  await db
    .update(teams)
    .set({ statKeeperPinHash: hashPin(pin), statKeeperFailedAttempts: 0, statKeeperLockedUntil: null })
    .where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/stats/keeper`);
  return { ok: true };
}

/** A new link: the old one stops working. */
export async function regenerateStatKeeperLink(teamId: string): Promise<void> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  if (!team.statKeeperToken) return;
  await db.update(teams).set({ statKeeperToken: generateLogToken() }).where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/stats/keeper`);
}

/** Turns the link and PIN off. */
export async function disableStatKeeper(teamId: string): Promise<void> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  await db
    .update(teams)
    .set({ statKeeperToken: null, statKeeperPinHash: null, statKeeperFailedAttempts: 0, statKeeperLockedUntil: null })
    .where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/stats/keeper`);
}
