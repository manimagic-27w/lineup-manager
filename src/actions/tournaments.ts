"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";

export async function listTournaments(teamId: string) {
  await requireTeamAccess(teamId);
  return db.select().from(tournaments).where(eq(tournaments.teamId, teamId)).orderBy(asc(tournaments.createdAt));
}

const createTournamentSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(80),
});

export async function createTournament(formData: FormData) {
  const parsed = createTournamentSchema.parse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db.insert(tournaments).values({ teamId: parsed.teamId, name: parsed.name, createdBy: userId });

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "tournament_created", details: parsed.name });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
}

const deleteTournamentSchema = z.object({ teamId: z.string().uuid(), tournamentId: z.string().uuid() });

/**
 * Deleting a tournament never deletes its games - `games.tournament_id` is `onDelete: "set
 * null"`, so they simply become ungrouped.
 */
export async function deleteTournament(formData: FormData) {
  const parsed = deleteTournamentSchema.parse({
    teamId: formData.get("teamId"),
    tournamentId: formData.get("tournamentId"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, parsed.tournamentId), eq(tournaments.teamId, parsed.teamId)));
  if (!tournament) return;

  await db.delete(tournaments).where(eq(tournaments.id, parsed.tournamentId));

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "tournament_deleted",
    details: tournament.name,
  });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
}
