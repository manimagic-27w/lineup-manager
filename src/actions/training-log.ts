"use server";

import { z } from "zod";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { players, teams, trainingLogs } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { generateLogToken } from "@/lib/log-token";
import { getTeamByLogToken } from "@/lib/training-log-server";
import {
  addDays,
  isLoggableDate,
  isTrainingKind,
  LOG_WINDOW_DAYS,
  MAX_ENTRIES_PER_PLAYER_PER_DAY,
  MAX_MINUTES_PER_ENTRY,
  weekdayName,
} from "@/lib/training-log";

// The first group of actions is PUBLIC: players use them from /log/<token> without signing in.
// The team's secret token is the only credential, so every one of them re-checks the token and
// that the player belongs to that team before touching anything.

export type LogEntryDTO = { id: string; logDate: string; weekday: string; minutes: number; kind: string; note: string };

type Failure = { ok: false; error: string };

function serverToday() {
  return new Date().toISOString().slice(0, 10);
}

async function findLogPlayer(token: string, playerId: string) {
  const team = await getTeamByLogToken(token);
  if (!team) return null;
  const [player] = await db
    .select({ id: players.id, archivedAt: players.archivedAt, isGuest: players.isGuest })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.teamId, team.id)))
    .limit(1);
  if (!player || player.archivedAt || player.isGuest) return null;
  return { team, playerId: player.id };
}

const BAD_LINK = "This link isn't working any more. Ask your coach for a new one.";

export async function listMyEntries(
  token: string,
  playerId: string,
): Promise<{ ok: true; entries: LogEntryDTO[] } | Failure> {
  const id = z.string().uuid().safeParse(playerId);
  const found = id.success ? await findLogPlayer(token, id.data) : null;
  if (!found) return { ok: false, error: BAD_LINK };
  const since = addDays(serverToday(), -LOG_WINDOW_DAYS);
  const rows = await db
    .select()
    .from(trainingLogs)
    .where(and(eq(trainingLogs.playerId, found.playerId), gte(trainingLogs.logDate, since)))
    .orderBy(desc(trainingLogs.logDate), desc(trainingLogs.createdAt));
  return {
    ok: true,
    entries: rows.map((r) => ({
      id: r.id,
      logDate: r.logDate,
      weekday: weekdayName(r.logDate),
      minutes: r.minutes,
      kind: r.kind,
      note: r.note,
    })),
  };
}

const saveSchema = z.object({
  token: z.string(),
  playerId: z.string().uuid(),
  entryId: z.string().uuid().optional(),
  date: z.string(),
  minutes: z.number().int().min(1).max(MAX_MINUTES_PER_ENTRY),
  kind: z.string(),
  note: z.string().trim().max(140).default(""),
});

/** Adds a session, or changes an existing one when `entryId` is given. */
export async function saveLogEntry(input: {
  token: string;
  playerId: string;
  entryId?: string;
  date: string;
  minutes: number;
  kind: string;
  note?: string;
}): Promise<{ ok: true } | Failure> {
  const parsed = saveSchema.safeParse({ ...input, note: input.note ?? "" });
  if (!parsed.success) return { ok: false, error: `Enter minutes between 1 and ${MAX_MINUTES_PER_ENTRY}.` };
  const v = parsed.data;
  if (!isTrainingKind(v.kind)) return { ok: false, error: "Pick the type of work." };
  const today = serverToday();
  if (!isLoggableDate(v.date, today)) return { ok: false, error: `Pick a day in the last ${LOG_WINDOW_DAYS} days.` };

  const found = await findLogPlayer(v.token, v.playerId);
  if (!found) return { ok: false, error: BAD_LINK };

  // Cap sessions per player per day so the page can't be used to flood the log.
  const sameDay = and(eq(trainingLogs.playerId, found.playerId), eq(trainingLogs.logDate, v.date));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trainingLogs)
    .where(v.entryId ? and(sameDay, ne(trainingLogs.id, v.entryId)) : sameDay);
  if (count >= MAX_ENTRIES_PER_PLAYER_PER_DAY) return { ok: false, error: "That's a lot of entries for one day. Edit an existing one instead." };

  if (v.entryId) {
    const [existing] = await db
      .select({ id: trainingLogs.id, logDate: trainingLogs.logDate })
      .from(trainingLogs)
      .where(and(eq(trainingLogs.id, v.entryId), eq(trainingLogs.playerId, found.playerId), eq(trainingLogs.teamId, found.team.id)))
      .limit(1);
    if (!existing || existing.logDate < addDays(today, -LOG_WINDOW_DAYS)) return { ok: false, error: "That entry can't be changed any more." };
    await db
      .update(trainingLogs)
      .set({ logDate: v.date, minutes: v.minutes, kind: v.kind, note: v.note, updatedAt: new Date() })
      .where(eq(trainingLogs.id, v.entryId));
  } else {
    await db.insert(trainingLogs).values({
      teamId: found.team.id,
      playerId: found.playerId,
      logDate: v.date,
      minutes: v.minutes,
      kind: v.kind,
      note: v.note,
    });
  }
  revalidatePath(`/teams/${found.team.id}/training`);
  return { ok: true };
}

export async function deleteLogEntry(token: string, playerId: string, entryId: string): Promise<{ ok: true } | Failure> {
  const ids = z.object({ playerId: z.string().uuid(), entryId: z.string().uuid() }).safeParse({ playerId, entryId });
  if (!ids.success) return { ok: false, error: "Couldn't find that entry." };
  const found = await findLogPlayer(token, ids.data.playerId);
  if (!found) return { ok: false, error: BAD_LINK };
  await db
    .delete(trainingLogs)
    .where(and(eq(trainingLogs.id, ids.data.entryId), eq(trainingLogs.playerId, found.playerId), eq(trainingLogs.teamId, found.team.id)));
  revalidatePath(`/teams/${found.team.id}/training`);
  return { ok: true };
}

// ---- Coach side (signed in, any coach on the team or a club admin) ----

export type LogLinkMode = "enable" | "regenerate" | "disable";

export async function setTrainingLogLink(teamId: string, mode: LogLinkMode) {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  const token = mode === "disable" ? null : generateLogToken();
  // "enable" on a team that already has a link keeps the link people already have.
  if (mode === "enable" && team.trainingLogToken) return;
  await db.update(teams).set({ trainingLogToken: token }).where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/training`);
}

/** Every logged session for a team from `since` on (all of them when null), for the Training tab. */
export async function listTeamLog(teamId: string, since: string | null) {
  await requireTeamAccess(teamId);
  const conds = [eq(trainingLogs.teamId, teamId)];
  if (since) conds.push(gte(trainingLogs.logDate, since));
  return db
    .select()
    .from(trainingLogs)
    .where(and(...conds))
    .orderBy(desc(trainingLogs.logDate), desc(trainingLogs.createdAt));
}

