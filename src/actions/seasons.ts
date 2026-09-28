"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";

export async function listSeasons(teamId: string) {
  await requireTeamAccess(teamId);
  return db.select().from(seasons).where(eq(seasons.teamId, teamId)).orderBy(asc(seasons.createdAt));
}

const createSeasonSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(80),
});

export async function createSeason(formData: FormData) {
  const parsed = createSeasonSchema.parse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db.insert(seasons).values({ teamId: parsed.teamId, name: parsed.name, createdBy: userId });

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "season_created", details: parsed.name });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
}

const deleteSeasonSchema = z.object({ teamId: z.string().uuid(), seasonId: z.string().uuid() });

/**
 * Deleting a season never deletes its games - the `season_id` foreign key is `onDelete: "set
 * null"`, so every game that was in this season just falls back to "No season" instead.
 */
export async function deleteSeason(formData: FormData) {
  const parsed = deleteSeasonSchema.parse({
    teamId: formData.get("teamId"),
    seasonId: formData.get("seasonId"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [season] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.id, parsed.seasonId), eq(seasons.teamId, parsed.teamId)));
  if (!season) return;

  await db.delete(seasons).where(eq(seasons.id, parsed.seasonId));

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "season_deleted",
    details: season.name,
  });
  await broadcastTeamUpdate(parsed.teamId, "games");
  revalidatePath(`/teams/${parsed.teamId}/games`);
}
