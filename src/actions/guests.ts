"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { gamePlayers, games, lineupSlots, players, POSITIONS } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";
import { findGuestByName, matchesCorePlayer } from "@/lib/guests";

const POSITION_KEYS = POSITIONS as unknown as [string, ...string[]];

export type GuestResult = { ok: true; reused: boolean } | { ok: false; error: string };

/**
 * Guests are players flagged `isGuest`. They sit on a separate guest roster (not the Roster
 * tab), are not added to games automatically, and can be reused across any number of games.
 * A guest is "on" a game only while it has a game_players row, so adding or removing a guest
 * from a game is just creating or deleting that row - everything else (availability, lineup,
 * History) keeps working off the same tables as core players.
 */

async function requireGame(teamId: string, gameId: string) {
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.teamId, teamId)))
    .limit(1);
  if (!game) throw new Error("Game not found.");
}

async function attachToGame(gameId: string, playerId: string) {
  // A coach adding a guest to a game expects them to be playing, so start as Available.
  await db
    .insert(gamePlayers)
    .values({ gameId, playerId, status: "Available" })
    .onConflictDoNothing({ target: [gamePlayers.gameId, gamePlayers.playerId] });
}

async function finish(teamId: string, gameId: string) {
  await broadcastTeamUpdate(teamId, "availability", gameId);
  await broadcastTeamUpdate(teamId, "roster");
  revalidatePath(`/teams/${teamId}/games/${gameId}`);
  revalidatePath(`/teams/${teamId}/roster`);
  revalidatePath(`/teams/${teamId}/history`);
}

const existingSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
});

/** Adds a guest who is already on the guest roster to this game. */
export async function addGuestToGame(formData: FormData): Promise<GuestResult> {
  const parsed = existingSchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    playerId: formData.get("playerId"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);
  await requireGame(parsed.teamId, parsed.gameId);

  const [guest] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId), eq(players.isGuest, true)))
    .limit(1);
  if (!guest) return { ok: false, error: "That guest wasn't found." };
  if (guest.archivedAt) return { ok: false, error: "That guest is archived. Restore them on the Roster page first." };

  await attachToGame(parsed.gameId, guest.id);
  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "guest_added",
    details: JSON.stringify({ playerId: guest.id, gameId: parsed.gameId }),
  });
  await finish(parsed.teamId, parsed.gameId);
  return { ok: true, reused: true };
}

const newGuestSchema = z.object({
  teamId: z.string().uuid(),
  gameId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(120),
  number: z.string().trim().max(10),
  grade: z.string().trim().max(20),
  experience: z.string().trim().max(40),
  position: z.union([z.enum(POSITION_KEYS), z.literal("")]),
});

/**
 * Creates a brand-new guest and puts them on this game in one step. If a guest with the same
 * name already exists the existing one is reused (restored if archived) instead of creating a
 * duplicate, so typing the same guest twice never splits their History in two. A name that
 * matches a core roster player is refused - that player should just be marked Available.
 */
export async function createGuestForGame(formData: FormData): Promise<GuestResult> {
  const parsed = newGuestSchema.safeParse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    name: formData.get("name"),
    number: formData.get("number") ?? "",
    grade: formData.get("grade") ?? "",
    experience: formData.get("experience") ?? "",
    position: formData.get("position") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the guest's details." };
  const input = parsed.data;
  const { userId } = await requireTeamAccess(input.teamId);
  await requireGame(input.teamId, input.gameId);

  const everyone = await db.select().from(players).where(eq(players.teamId, input.teamId));
  if (matchesCorePlayer(everyone, input.name)) {
    return { ok: false, error: `${input.name} is already on your roster - set their availability instead.` };
  }

  let playerId: string;
  let reused = false;
  const existing = findGuestByName(everyone, input.name);
  if (existing) {
    reused = true;
    playerId = existing.id;
    if (existing.archivedAt) {
      await db.update(players).set({ archivedAt: null }).where(eq(players.id, existing.id));
    }
  } else {
    const [created] = await db
      .insert(players)
      .values({
        teamId: input.teamId,
        name: input.name,
        number: input.number || null,
        grade: input.grade || null,
        experience: input.experience || null,
        position: input.position || null,
        isGuest: true,
      })
      .returning({ id: players.id });
    playerId = created.id;
  }

  await attachToGame(input.gameId, playerId);
  await logActivity({
    teamId: input.teamId,
    actorUserId: userId,
    action: "guest_added",
    details: JSON.stringify({ playerId, gameId: input.gameId }),
  });
  await finish(input.teamId, input.gameId);
  return { ok: true, reused };
}

/**
 * Takes a guest off one game. Their lineup spot on that game (if any) is cleared and their
 * availability row removed; the guest stays on the guest roster for other games and keeps their
 * History from games they did play.
 */
export async function removeGuestFromGame(formData: FormData) {
  const parsed = existingSchema.parse({
    teamId: formData.get("teamId"),
    gameId: formData.get("gameId"),
    playerId: formData.get("playerId"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);
  await requireGame(parsed.teamId, parsed.gameId);

  const [guest] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId), eq(players.isGuest, true)))
    .limit(1);
  if (!guest) return;

  await db.transaction(async (tx) => {
    await tx
      .update(lineupSlots)
      .set({ playerId: null })
      .where(and(eq(lineupSlots.gameId, parsed.gameId), eq(lineupSlots.playerId, guest.id)));
    await tx
      .delete(gamePlayers)
      .where(and(eq(gamePlayers.gameId, parsed.gameId), eq(gamePlayers.playerId, guest.id)));
  });

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "guest_removed",
    details: JSON.stringify({ playerId: guest.id, gameId: parsed.gameId }),
  });
  await finish(parsed.teamId, parsed.gameId);
}
