"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { players, POSITIONS } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";
import { parseRosterCsv, normalizePosition } from "@/lib/csv";

const POSITION_KEYS = POSITIONS as unknown as [string, ...string[]];

export async function listRoster(teamId: string, { includeArchived = false } = {}) {
  await requireTeamAccess(teamId);
  const rows = await db
    .select()
    .from(players)
    .where(
      includeArchived
        ? eq(players.teamId, teamId)
        : and(eq(players.teamId, teamId), isNull(players.archivedAt))
    );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const playerSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(120),
  number: z.string().trim().max(10),
  grade: z.string().trim().max(20),
  experience: z.string().trim().max(40),
  position: z.union([z.enum(POSITION_KEYS), z.literal("")]).optional(),
});

export async function addPlayer(formData: FormData) {
  const parsed = playerSchema.parse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    number: formData.get("number") ?? "",
    grade: formData.get("grade") ?? "",
    experience: formData.get("experience") ?? "",
    position: formData.get("position") || undefined,
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db.insert(players).values({
    teamId: parsed.teamId,
    name: parsed.name,
    number: parsed.number || null,
    grade: parsed.grade || null,
    experience: parsed.experience || null,
    position: parsed.position ?? null,
  });

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "player_added", details: parsed.name });
  await broadcastTeamUpdate(parsed.teamId, "roster");
  revalidatePath(`/teams/${parsed.teamId}/roster`);
}

const updateSchema = playerSchema.extend({ playerId: z.string().uuid() });

export async function updatePlayer(formData: FormData) {
  const parsed = updateSchema.parse({
    playerId: formData.get("playerId"),
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    number: formData.get("number") ?? "",
    grade: formData.get("grade") ?? "",
    experience: formData.get("experience") ?? "",
    position: formData.get("position") || undefined,
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db
    .update(players)
    .set({
      name: parsed.name,
      number: parsed.number || null,
      grade: parsed.grade || null,
      experience: parsed.experience || null,
      position: parsed.position ?? null,
    })
    .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId)));

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "player_updated", details: parsed.name });
  await broadcastTeamUpdate(parsed.teamId, "roster");
  revalidatePath(`/teams/${parsed.teamId}/roster`);
}

const archiveSchema = z.object({ teamId: z.string().uuid(), playerId: z.string().uuid() });

/** Soft delete - keeps the player's history on past games/lineups/stats intact, just hides
 *  them from new games and roster lists by default. Mirrors the old Sheets app's approach. */
export async function archivePlayer(formData: FormData) {
  const parsed = archiveSchema.parse({ teamId: formData.get("teamId"), playerId: formData.get("playerId") });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db
    .update(players)
    .set({ archivedAt: new Date() })
    .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId)));

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "player_archived", details: parsed.playerId });
  await broadcastTeamUpdate(parsed.teamId, "roster");
  revalidatePath(`/teams/${parsed.teamId}/roster`);
}

export async function unarchivePlayer(formData: FormData) {
  const parsed = archiveSchema.parse({ teamId: formData.get("teamId"), playerId: formData.get("playerId") });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db
    .update(players)
    .set({ archivedAt: null })
    .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId)));

  await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "player_restored", details: parsed.playerId });
  await broadcastTeamUpdate(parsed.teamId, "roster");
  revalidatePath(`/teams/${parsed.teamId}/roster`);
}

/**
 * Permanently removes a player. If they're referenced anywhere (availability, a lineup slot, a
 * stat value - which happens automatically for every roster player as soon as any game exists,
 * see `createGame`), the database's foreign keys refuse the delete so that history on past
 * games/stats never silently disappears; in that case this falls back to archiving instead,
 * which hides them the same way without breaking anything they're tied to.
 */
export async function deletePlayer(formData: FormData) {
  const parsed = archiveSchema.parse({ teamId: formData.get("teamId"), playerId: formData.get("playerId") });
  const { userId } = await requireTeamAccess(parsed.teamId);

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId)))
    .limit(1);
  if (!player) return;

  try {
    await db
      .delete(players)
      .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId)));
    await logActivity({ teamId: parsed.teamId, actorUserId: userId, action: "player_deleted", details: player.name });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "23503") throw err; // anything other than "referenced elsewhere" is unexpected
    await db
      .update(players)
      .set({ archivedAt: new Date() })
      .where(and(eq(players.id, parsed.playerId), eq(players.teamId, parsed.teamId)));
    await logActivity({
      teamId: parsed.teamId,
      actorUserId: userId,
      action: "player_archived",
      details: `${player.name} (has game history, archived instead of deleted)`,
    });
  }

  await broadcastTeamUpdate(parsed.teamId, "roster");
  revalidatePath(`/teams/${parsed.teamId}/roster`);
}

/**
 * Bulk import from pasted CSV text, header row required: name,number,position,grade,experience
 * (only `name` is required; extra/missing columns are tolerated). This is the manual-paste
 * counterpart to the Google Sheets import script (scripts/import-from-sheets.ts) for clubs
 * starting fresh rather than migrating. Parsing itself lives in `@/lib/csv` so it's covered by
 * plain unit tests without needing a database.
 */
export async function importRosterCsv(formData: FormData) {
  const teamId = z.string().uuid().parse(formData.get("teamId"));
  const csv = z.string().min(1).parse(formData.get("csv"));
  const { userId } = await requireTeamAccess(teamId);

  const rows = parseRosterCsv(csv);
  if (rows.length === 0) return;

  // Match against the existing roster by name (case/whitespace-insensitive) so re-importing an
  // updated file - e.g. the same roster with grade/experience filled in later - updates those
  // players in place instead of creating duplicates.
  const existing = await db.select().from(players).where(eq(players.teamId, teamId));
  const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));

  let updated = 0;
  let created = 0;
  const toInsert: (typeof players.$inferInsert)[] = [];

  for (const r of rows) {
    const match = existingByName.get(r.name.trim().toLowerCase());
    const position = normalizePosition(r.position);

    if (match) {
      // Only touch fields the row actually provided, so a partial re-import never blanks out
      // data (like grade/experience) that was already filled in on the existing player.
      const set: Partial<typeof players.$inferInsert> = {};
      if (r.number) set.number = r.number;
      if (position) set.position = position;
      if (r.grade) set.grade = r.grade;
      if (r.experience) set.experience = r.experience;
      if (Object.keys(set).length > 0) {
        await db.update(players).set(set).where(eq(players.id, match.id));
      }
      updated += 1;
    } else {
      toInsert.push({
        teamId,
        name: r.name,
        number: r.number || null,
        position,
        grade: r.grade || null,
        experience: r.experience || null,
      });
      created += 1;
    }
  }

  if (toInsert.length > 0) {
    await db.insert(players).values(toInsert);
  }

  await logActivity({
    teamId,
    actorUserId: userId,
    action: "roster_imported",
    details: `${created} added, ${updated} updated`,
  });
  await broadcastTeamUpdate(teamId, "roster");
  revalidatePath(`/teams/${teamId}/roster`);
}
