import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { players, teams, trainingApprovals, trainingLogs } from "./db/schema";
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

export async function getApprovalByToken(token: string) {
  if (!looksLikeLogToken(token)) return null;
  const [row] = await db.select().from(trainingApprovals).where(eq(trainingApprovals.token, token)).limit(1);
  return row ?? null;
}

/** What a parent sees at /approve/<token>: the child's name (first name + last initial), the team,
 *  the day, and that day's entries with whether each is already approved. */
export async function getApprovalView(token: string) {
  const approval = await getApprovalByToken(token);
  if (!approval) return null;
  const [info] = await db
    .select({ playerName: players.name, teamName: teams.name })
    .from(players)
    .innerJoin(teams, eq(teams.id, players.teamId))
    .where(eq(players.id, approval.playerId))
    .limit(1);
  if (!info) return null;
  const entries = await db
    .select({ id: trainingLogs.id, kind: trainingLogs.kind, minutes: trainingLogs.minutes, note: trainingLogs.note, approvedAt: trainingLogs.approvedAt })
    .from(trainingLogs)
    .where(and(eq(trainingLogs.playerId, approval.playerId), eq(trainingLogs.logDate, approval.logDate)))
    .orderBy(asc(trainingLogs.createdAt));
  return {
    logDate: approval.logDate,
    teamName: info.teamName,
    playerLabel: publicName(info.playerName),
    entries: entries.map((e) => ({ id: e.id, kind: e.kind, minutes: e.minutes, note: e.note, approved: !!e.approvedAt })),
  };
}
