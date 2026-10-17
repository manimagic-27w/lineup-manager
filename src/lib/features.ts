import "server-only";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { clubFeatures, type ClubFeatureKey } from "./db/schema";
import { requireTeamAccess } from "./auth";

/** Whether a platform admin has switched this premium feature on for the club. */
export async function clubHasFeature(orgId: string, feature: ClubFeatureKey): Promise<boolean> {
  const [row] = await db
    .select({ feature: clubFeatures.feature })
    .from(clubFeatures)
    .where(and(eq(clubFeatures.orgId, orgId), eq(clubFeatures.feature, feature)))
    .limit(1);
  return !!row;
}

/**
 * requireTeamAccess plus a premium-feature check. A team whose club doesn't have the feature is
 * sent back to its roster, so a typed-in URL or an old bookmark never opens a feature the club
 * hasn't been given (and never lets one be written to).
 */
export async function requireTeamFeature(teamId: string, feature: ClubFeatureKey) {
  const access = await requireTeamAccess(teamId);
  if (!(await clubHasFeature(access.orgId, feature))) redirect(`/teams/${teamId}/roster`);
  return access;
}
