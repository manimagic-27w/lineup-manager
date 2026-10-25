"use server";

import { z } from "zod";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { players, trainingLogs, trainingProfiles } from "@/lib/db/schema";
import { MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES } from "@/lib/pin";
import { addDays, LOG_WINDOW_DAYS, normalizePhone, publicName, weekdayName } from "@/lib/training-log";
import { getTeamByParentToken } from "@/lib/training-log-server";

// PUBLIC: parents use these from /parents/<token> without signing in. Two things protect a child's
// log: the team's secret parent link, and the parent's own mobile number (it has to match the
// number the child entered). Wrong numbers are counted and locked for a while, like the PIN.

type Failure = { ok: false; error: string };
const BAD_LINK = "This link isn't working any more. Ask your coach for the current parent link.";

type Verified = { ok: true; teamId: string; playerId: string; playerLabel: string } | Failure;

async function verifyParent(token: string, playerId: string, phoneInput: string): Promise<Verified> {
  const id = z.string().uuid().safeParse(playerId);
  if (!id.success) return { ok: false, error: BAD_LINK };
  const team = await getTeamByParentToken(token);
  if (!team) return { ok: false, error: BAD_LINK };
  const [player] = await db
    .select({ id: players.id, name: players.name, archivedAt: players.archivedAt, isGuest: players.isGuest })
    .from(players)
    .where(and(eq(players.id, id.data), eq(players.teamId, team.id)))
    .limit(1);
  if (!player || player.archivedAt || player.isGuest) return { ok: false, error: BAD_LINK };

  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter your 10-digit mobile number." };

  const [profile] = await db.select().from(trainingProfiles).where(eq(trainingProfiles.playerId, player.id)).limit(1);
  if (!profile?.parentPhone) {
    return { ok: false, error: "This player hasn't finished setting up their log yet, so there's nothing to approve. Ask them to open the player link first." };
  }
  if (profile.parentLockedUntil && profile.parentLockedUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((profile.parentLockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, error: `Too many tries. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }
  if (profile.parentPhone !== phone) {
    const attempts = profile.parentFailedAttempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await db
        .update(trainingProfiles)
        .set({ parentFailedAttempts: 0, parentLockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) })
        .where(eq(trainingProfiles.playerId, player.id));
      return { ok: false, error: `Too many tries. Please try again in ${PIN_LOCK_MINUTES} minutes.` };
    }
    await db.update(trainingProfiles).set({ parentFailedAttempts: attempts }).where(eq(trainingProfiles.playerId, player.id));
    return { ok: false, error: "That number doesn't match the parent number on file for this player. Ask your child which number they entered." };
  }
  if (profile.parentFailedAttempts > 0 || profile.parentLockedUntil) {
    await db.update(trainingProfiles).set({ parentFailedAttempts: 0, parentLockedUntil: null }).where(eq(trainingProfiles.playerId, player.id));
  }
  return { ok: true, teamId: team.id, playerId: player.id, playerLabel: publicName(player.name) };
}

function windowStart() {
  return addDays(new Date().toISOString().slice(0, 10), -LOG_WINDOW_DAYS);
}

export type WaitingDay = {
  date: string;
  weekday: string;
  entries: { id: string; kind: string; minutes: number; note: string }[];
};

/** What is waiting for this parent to approve: their child's unapproved entries, grouped by day. */
export async function getWaitingTime(
  token: string,
  playerId: string,
  phone: string,
): Promise<{ ok: true; playerLabel: string; days: WaitingDay[]; totalMinutes: number } | Failure> {
  const v = await verifyParent(token, playerId, phone);
  if (!v.ok) return v;
  const rows = await db
    .select()
    .from(trainingLogs)
    .where(and(eq(trainingLogs.playerId, v.playerId), isNull(trainingLogs.approvedAt), gte(trainingLogs.logDate, windowStart())))
    .orderBy(asc(trainingLogs.logDate), asc(trainingLogs.createdAt));
  const byDay = new Map<string, WaitingDay>();
  for (const r of rows) {
    const day = byDay.get(r.logDate) ?? { date: r.logDate, weekday: weekdayName(r.logDate), entries: [] };
    day.entries.push({ id: r.id, kind: r.kind, minutes: r.minutes, note: r.note });
    byDay.set(r.logDate, day);
  }
  return { ok: true, playerLabel: v.playerLabel, days: [...byDay.values()], totalMinutes: rows.reduce((sum, r) => sum + r.minutes, 0) };
}

/** Approves everything of this child's that is currently waiting. */
export async function approveWaitingTime(token: string, playerId: string, phone: string): Promise<{ ok: true; count: number } | Failure> {
  const v = await verifyParent(token, playerId, phone);
  if (!v.ok) return v;
  const updated = await db
    .update(trainingLogs)
    .set({ approvedAt: new Date() })
    .where(and(eq(trainingLogs.playerId, v.playerId), isNull(trainingLogs.approvedAt), gte(trainingLogs.logDate, windowStart())))
    .returning({ id: trainingLogs.id });
  revalidatePath(`/teams/${v.teamId}/training`);
  return { ok: true, count: updated.length };
}
