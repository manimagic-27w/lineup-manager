import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { teamCoaches, teams } from "./db/schema";

/**
 * Authorization model (replaces the old Hub Sheet's Admins/Coaches tabs entirely):
 *  - A "club" is a Clerk Organization. `teams.orgId` scopes every team to one club.
 *  - `org:admin` (a Clerk built-in org role) can manage every team in the club - create teams,
 *    assign coaches, edit anything. This replaces the Hub "Admins" tab.
 *  - `team_coaches` is the one thing Clerk doesn't know about on its own: which teams, within
 *    a club, a given org member (coach) can see. This replaces the Hub "Coaches" tab.
 */

/** Requires a signed-in user with an active organization. Redirects otherwise. */
export async function requireOrgSession() {
  const session = await auth();
  if (!session.userId) {
    redirect("/sign-in");
  }
  if (!session.orgId) {
    redirect("/select-org");
  }
  return session as typeof session & { userId: string; orgId: string };
}

export async function isCurrentUserOrgAdmin() {
  const session = await auth();
  return session.has({ role: "org:admin" });
}

/** Requires a signed-in user who is an `org:admin` of their active club. */
export async function requireOrgAdmin() {
  const session = await requireOrgSession();
  if (!session.has({ role: "org:admin" })) {
    redirect("/");
  }
  return session;
}

/**
 * Loads a team scoped to the caller's active club and verifies the caller may see it:
 * org admins can access every team in the club; everyone else needs a `team_coaches` row.
 * Redirects to the dashboard if the team doesn't exist, belongs to a different club, or the
 * caller has no access.
 */
export async function requireTeamAccess(teamId: string) {
  const session = await requireOrgSession();
  const { userId, orgId } = session;

  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.orgId, orgId)))
    .limit(1);

  if (!team) {
    redirect("/");
  }

  const isAdmin = session.has({ role: "org:admin" });
  if (!isAdmin) {
    const [coach] = await db
      .select()
      .from(teamCoaches)
      .where(and(eq(teamCoaches.teamId, teamId), eq(teamCoaches.userId, userId)))
      .limit(1);
    if (!coach) {
      redirect("/");
    }
  }

  return { team, userId, orgId, isAdmin };
}
