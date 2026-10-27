import "server-only";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { clubFeatures, teamFeatures, type ClubFeatureKey, type TeamFeatureKey } from "./db/schema";
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

/** Whether a platform admin has switched this premium feature on for this one team. */
export async function teamHasFeature(teamId: string, feature: TeamFeatureKey): Promise<boolean> {
  const [row] = await db
    .select({ feature: teamFeatures.feature })
    .from(teamFeatures)
    .where(and(eq(teamFeatures.teamId, teamId), eq(teamFeatures.feature, feature)))
    .limit(1);
  return !!row;
}

/**
 * requireTeamAccess plus a per-team premium check (game film). A team that hasn't been given the
 * feature is sent back to its roster, so a typed-in URL or a stale page can never use it.
 */
export async function requireTeamAddOn(teamId: string, feature: TeamFeatureKey) {
  const access = await requireTeamAccess(teamId);
  if (!(await teamHasFeature(teamId, feature))) redirect(`/teams/${teamId}/roster`);
  return access;
}
