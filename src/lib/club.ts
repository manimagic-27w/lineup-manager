import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { clubSettings, teams, type TeamGender } from "./db/schema";

/**
 * The club's gender ("girls" or "boys"), or null if the club has not been set up yet.
 *
 * A club with no club_settings row but with existing teams is an existing club from before the
 * setting moved to the club level: its row is created here from its teams (boys if any team was
 * marked boys, otherwise girls - every team before the setting existed is a girls team). A club
 * with no row and no teams is brand new and returns null, which sends an admin to /club-setup.
 */
export async function getClubGender(orgId: string): Promise<TeamGender | null> {
  const [row] = await db
    .select({ gender: clubSettings.gender })
    .from(clubSettings)
    .where(eq(clubSettings.orgId, orgId))
    .limit(1);
  if (row) return row.gender === "boys" ? "boys" : "girls";

  const existing = await db.select({ gender: teams.gender }).from(teams).where(eq(teams.orgId, orgId));
  if (existing.length === 0) return null;

  const gender: TeamGender = existing.some((t) => t.gender === "boys") ? "boys" : "girls";
  await db.insert(clubSettings).values({ orgId, gender }).onConflictDoNothing();
  return gender;
}
