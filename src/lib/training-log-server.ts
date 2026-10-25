import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { players, teams } from "./db/schema";
import { looksLikeLogToken } from "./log-token";
import { publicName } from "./training-log";

/** The team a public log link belongs to, or null when the link is wrong or has been turned off. */
export async function getTeamByLogToken(token: string) {
  if (!looksLikeLogToken(token)) return null;
  const [team] = await db
    .select({ id: teams.id, name: teams.name, theme: teams.theme })
    .from(teams)
    .where(eq(teams.trainingLogToken, token))
    .limit(1);
  return team ?? null;
}

/** The team a public parent-approval link belongs to, or null when the link is wrong or turned off. */
export async function getTeamByParentToken(token: string) {
  if (!looksLikeLogToken(token)) return null;
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.parentApprovalToken, token))
    .limit(1);
  return team ?? null;
}

/** The names offered on the public page: the team's active core roster, shortened to "First L.".
 *  Guests and archived players are left out. */
export async function listActiveLogRoster(teamId: string) {
  const rows = await db
    .select({ id: players.id, name: players.name, archivedAt: players.archivedAt })
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.isGuest, false)))
    .orderBy(asc(players.name));
  return rows.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, label: publicName(p.name) }));
}
