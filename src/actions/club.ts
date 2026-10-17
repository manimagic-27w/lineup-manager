"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clubSettings, teams, TEAM_GENDERS } from "@/lib/db/schema";
import { requireOrgAdmin } from "@/lib/auth";
import { getClubGender } from "@/lib/club";
import { logActivity } from "@/lib/activity";

const GENDER_KEYS = TEAM_GENDERS.map((t) => t.key) as [string, ...string[]];
const schema = z.object({ gender: z.enum(GENDER_KEYS) });

// A club is all girls or all boys. The gender decides the slots on a regular (field) game's
// lineup board for every team in the club: girls 12 starters, boys 10 (3 attack, 3 midfield,
// 3 defense, 1 goalie). A new club picks it once on /club-setup; an admin can change it later
// from the Admin page. Changing never deletes anything - lineup picks are stored under slot
// keys that belong to one set or the other, so existing field-game lineups simply stop showing
// (and come back if the setting is switched back). Sixes and sevens lineups are the same for
// both and are unaffected.
export async function setClubGender(formData: FormData) {
  const session = await requireOrgAdmin();
  const parsed = schema.parse({ gender: formData.get("gender") });
  const wasSetUp = (await getClubGender(session.orgId)) !== null;

  await db
    .insert(clubSettings)
    .values({ orgId: session.orgId, gender: parsed.gender })
    .onConflictDoUpdate({
      target: clubSettings.orgId,
      set: { gender: parsed.gender, updatedAt: new Date() },
    });

  // The activity feed is per team, so record a change to an established club on each of its teams.
  if (wasSetUp) {
    const clubTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.orgId, session.orgId));
    await Promise.all(
      clubTeams.map((t) =>
        logActivity({
          teamId: t.id,
          actorUserId: session.userId,
          action: "club_gender_changed",
          details: parsed.gender,
        }),
      ),
    );
  }

  revalidatePath("/", "layout");
  redirect(wasSetUp ? "/admin" : "/");
}
