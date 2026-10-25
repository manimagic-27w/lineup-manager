"use server";

import { z } from "zod";
import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { players, teams, trainingApprovals, trainingLogs, trainingProfiles } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { generateLogToken } from "@/lib/log-token";
import { hashPin, isValidPin, MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES, verifyPin } from "@/lib/pin";
import { getTeamByLogToken } from "@/lib/training-log-server";
import {
  addDays,
  isLoggableDate,
  isTrainingKind,
  LOG_WINDOW_DAYS,
  MAX_ENTRIES_PER_PLAYER_PER_DAY,
  MAX_MINUTES_PER_ENTRY,
  normalizePhone,
  weekdayName,
} from "@/lib/training-log";

// The first group of actions is PUBLIC: players use them from /log/<token> without signing in.
// Two things protect a player's log: the team's secret link, and the player's own 4-digit PIN
// (checked on every call, and locked for a while after too many wrong guesses). Every action
// re-checks the token, that the player belongs to that team, and the PIN before touching anything.

export type LogEntryDTO = {
  id: string;
  logDate: string;
  weekday: string;
  minutes: number;
  kind: string;
  note: string;
  approved: boolean;
};

type Failure = { ok: false; error: string };

function serverToday() {
  return new Date().toISOString().slice(0, 10);
}

async function findLogPlayer(token: string, playerId: string) {
  const id = z.string().uuid().safeParse(playerId);
  if (!id.success) return null;
  const team = await getTeamByLogToken(token);
  if (!team) return null;
  const [player] = await db
    .select({ id: players.id, archivedAt: players.archivedAt, isGuest: players.isGuest })
    .from(players)
    .where(and(eq(players.id, id.data), eq(players.teamId, team.id)))
    .limit(1);
  if (!player || player.archivedAt || player.isGuest) return null;
  return { team, playerId: player.id };
}

const BAD_LINK = "This link isn't working any more. Ask your coach for a new one.";

type PinCheck = { ok: true; parentPhone: string | null } | Failure;

/** Checks a player's PIN, counting wrong guesses and locking after too many. */
async function checkPin(playerId: string, pin: string): Promise<PinCheck> {
  const [profile] = await db.select().from(trainingProfiles).where(eq(trainingProfiles.playerId, playerId)).limit(1);
  if (!profile?.pinHash) return { ok: false, error: "Set up your PIN first." };
  if (profile.lockedUntil && profile.lockedUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((profile.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, error: `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask your coach to reset your PIN.` };
  }
  if (verifyPin(pin, profile.pinHash)) {
    if (profile.failedAttempts > 0 || profile.lockedUntil) {
      await db.update(trainingProfiles).set({ failedAttempts: 0, lockedUntil: null }).where(eq(trainingProfiles.playerId, playerId));
    }
    return { ok: true, parentPhone: profile.parentPhone };
  }
  const attempts = profile.failedAttempts + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    await db
      .update(trainingProfiles)
      .set({ failedAttempts: 0, lockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) })
      .where(eq(trainingProfiles.playerId, playerId));
    return { ok: false, error: `Too many wrong tries. Try again in ${PIN_LOCK_MINUTES} minutes, or ask your coach to reset your PIN.` };
  }
  await db.update(trainingProfiles).set({ failedAttempts: attempts }).where(eq(trainingProfiles.playerId, playerId));
  const left = MAX_PIN_ATTEMPTS - attempts;
  return { ok: false, error: `That PIN isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` };
}

/** After a player picks their name: do they still need to set a PIN (and parent number)? */
export async function getPlayerAccess(
  token: string,
  playerId: string,
): Promise<{ ok: true; hasPin: boolean; hasPhone: boolean } | Failure> {
  const found = await findLogPlayer(token, playerId);
  if (!found) return { ok: false, error: BAD_LINK };
  const [profile] = await db.select().from(trainingProfiles).where(eq(trainingProfiles.playerId, found.playerId)).limit(1);
  return { ok: true, hasPin: !!profile?.pinHash, hasPhone: !!profile?.parentPhone };
}

/** First-time setup: a 4-digit PIN, plus a parent's mobile number if none is on file yet. */
export async function setupPlayerPin(input: {
  token: string;
  playerId: string;
  pin: string;
  parentPhone?: string;
}): Promise<{ ok: true } | Failure> {
  if (!isValidPin(input.pin)) return { ok: false, error: "Your PIN must be exactly 4 numbers." };
  const found = await findLogPlayer(input.token, input.playerId);
  if (!found) return { ok: false, error: BAD_LINK };

  const [existing] = await db.select().from(trainingProfiles).where(eq(trainingProfiles.playerId, found.playerId)).limit(1);
  if (existing?.pinHash) return { ok: false, error: "A PIN is already set for this player. Ask your coach to reset it if you forgot it." };

  let phone = existing?.parentPhone ?? null;
  if (input.parentPhone?.trim()) {
    phone = normalizePhone(input.parentPhone);
    if (!phone) return { ok: false, error: "Enter a 10-digit mobile number for your parent." };
  }
  if (!phone) return { ok: false, error: "Enter a mobile number for the parent who will approve your time." };

  const saved = await db
    .insert(trainingProfiles)
    .values({ playerId: found.playerId, pinHash: hashPin(input.pin), parentPhone: phone })
    .onConflictDoUpdate({
      target: trainingProfiles.playerId,
      set: { pinHash: hashPin(input.pin), parentPhone: phone, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() },
      setWhere: isNull(trainingProfiles.pinHash), // never overwrite a PIN somebody just set
    })
    .returning({ playerId: trainingProfiles.playerId });
  if (saved.length === 0) return { ok: false, error: "A PIN is already set for this player. Ask your coach to reset it if you forgot it." };
  revalidatePath(`/teams/${found.team.id}/training`);
  return { ok: true };
}

export async function updateParentPhone(
  token: string,
  playerId: string,
  pin: string,
  parentPhone: string,
): Promise<{ ok: true; parentPhone: string } | Failure> {
  const found = await findLogPlayer(token, playerId);
  if (!found) return { ok: false, error: BAD_LINK };
  const check = await checkPin(found.playerId, pin);
  if (!check.ok) return check;
  const phone = normalizePhone(parentPhone);
  if (!phone) return { ok: false, error: "Enter a 10-digit mobile number for your parent." };
  await db.update(trainingProfiles).set({ parentPhone: phone, updatedAt: new Date() }).where(eq(trainingProfiles.playerId, found.playerId));
  revalidatePath(`/teams/${found.team.id}/training`);
  return { ok: true, parentPhone: phone };
}

/** Unlocks a player's log: checks the PIN and returns their last 30 days plus, for each day that
 *  still has time waiting on a parent, the approval link to text. */
export async function listMyEntries(
  token: string,
  playerId: string,
  pin: string,
): Promise<{ ok: true; entries: LogEntryDTO[]; approvalTokens: Record<string, string>; parentPhone: string | null } | Failure> {
  const found = await findLogPlayer(token, playerId);
  if (!found) return { ok: false, error: BAD_LINK };
  const check = await checkPin(found.playerId, pin);
  if (!check.ok) return check;

  const since = addDays(serverToday(), -LOG_WINDOW_DAYS);
  const rows = await db
    .select()
    .from(trainingLogs)
    .where(and(eq(trainingLogs.playerId, found.playerId), gte(trainingLogs.logDate, since)))
    .orderBy(desc(trainingLogs.logDate), desc(trainingLogs.createdAt));

  // One approval link per day that still has unapproved time (created the first time it's needed).
  const pendingDates = [...new Set(rows.filter((r) => !r.approvedAt).map((r) => r.logDate))];
  const approvalTokens: Record<string, string> = {};
  for (const date of pendingDates) {
    await db
      .insert(trainingApprovals)
      .values({ token: generateLogToken(), teamId: found.team.id, playerId: found.playerId, logDate: date })
      .onConflictDoNothing();
  }
  if (pendingDates.length > 0) {
    const links = await db
      .select({ logDate: trainingApprovals.logDate, token: trainingApprovals.token })
      .from(trainingApprovals)
      .where(and(eq(trainingApprovals.playerId, found.playerId), gte(trainingApprovals.logDate, since)));
    for (const l of links) approvalTokens[l.logDate] = l.token;
  }

  return {
    ok: true,
    entries: rows.map((r) => ({
      id: r.id,
      logDate: r.logDate,
      weekday: weekdayName(r.logDate),
      minutes: r.minutes,
      kind: r.kind,
      note: r.note,
      approved: !!r.approvedAt,
    })),
    approvalTokens,
    parentPhone: check.parentPhone,
  };
}

const saveSchema = z.object({
  token: z.string(),
  playerId: z.string().uuid(),
  pin: z.string(),
  entryId: z.string().uuid().optional(),
  date: z.string(),
  minutes: z.number().int().min(1).max(MAX_MINUTES_PER_ENTRY),
  kind: z.string(),
  note: z.string().trim().max(140).default(""),
});

/** Adds a session, or changes an existing one when `entryId` is given. A changed entry goes back
 *  to waiting for a parent's approval. */
export async function saveLogEntry(input: {
  token: string;
  playerId: string;
  pin: string;
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
  const check = await checkPin(found.playerId, v.pin);
  if (!check.ok) return check;

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
      .set({ logDate: v.date, minutes: v.minutes, kind: v.kind, note: v.note, approvedAt: null, updatedAt: new Date() })
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

export async function deleteLogEntry(token: string, playerId: string, pin: string, entryId: string): Promise<{ ok: true } | Failure> {
  const id = z.string().uuid().safeParse(entryId);
  if (!id.success) return { ok: false, error: "Couldn't find that entry." };
  const found = await findLogPlayer(token, playerId);
  if (!found) return { ok: false, error: BAD_LINK };
  const check = await checkPin(found.playerId, pin);
  if (!check.ok) return check;
  await db
    .delete(trainingLogs)
    .where(and(eq(trainingLogs.id, id.data), eq(trainingLogs.playerId, found.playerId), eq(trainingLogs.teamId, found.team.id)));
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

/** Who has a PIN and a parent number on file (the number only as its last four digits). */
export async function listTeamProfiles(teamId: string) {
  await requireTeamAccess(teamId);
  const rows = await db
    .select({
      playerId: trainingProfiles.playerId,
      hasPin: sql<boolean>`${trainingProfiles.pinHash} is not null`,
      parentPhone: trainingProfiles.parentPhone,
    })
    .from(trainingProfiles)
    .innerJoin(players, eq(players.id, trainingProfiles.playerId))
    .where(eq(players.teamId, teamId));
  return rows;
}

/** Clears a player's PIN so they can set a new one the next time they open the log page. */
export async function resetPlayerPin(teamId: string, playerId: string) {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  const [player] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.id, z.string().uuid().parse(playerId)), eq(players.teamId, team.id)))
    .limit(1);
  if (!player) throw new Error("Player not found.");
  await db
    .update(trainingProfiles)
    .set({ pinHash: null, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(trainingProfiles.playerId, player.id));
  revalidatePath(`/teams/${team.id}/training`);
}
