import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { parentClips } from "@/lib/db/schema";
import { ABANDONED_UPLOAD_HOURS } from "@/lib/clip-plan";
import { clipBucket, clipStorageConfigured, deleteObjects } from "@/lib/r2";

/** Erases clips: the stored files first, then the rows. */
export async function eraseClips(clipIds: string[]) {
  if (clipIds.length === 0) return;
  const rows = await db.select({ key: parentClips.objectKey }).from(parentClips).where(inArray(parentClips.id, clipIds));
  if (clipStorageConfigured() && rows.length > 0) await deleteObjects(rows.map((r) => r.key), clipBucket());
  await db.delete(parentClips).where(inArray(parentClips.id, clipIds));
}

/** Erases every clip on one game or tournament (used before the game or tournament is deleted). */
export async function eraseClipsFor(scope: { gameId?: string; tournamentId?: string }) {
  const where = scope.gameId ? eq(parentClips.gameId, scope.gameId) : scope.tournamentId ? eq(parentClips.tournamentId, scope.tournamentId) : null;
  if (!where) return;
  const rows = await db.select({ id: parentClips.id }).from(parentClips).where(where);
  await eraseClips(rows.map((r) => r.id));
}

/**
 * Erases every clip past its 60 days, and uploads that were abandoned (never finished) for a day.
 * `teamId` limits it to one team (run when the parents' page loads); the daily cron runs it for all.
 */
export async function purgeExpiredClips(teamId?: string): Promise<number> {
  const now = new Date();
  const abandonedBefore = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 3600_000);
  const stale = or(
    and(isNotNull(parentClips.expiresAt), lt(parentClips.expiresAt, now)),
    and(isNull(parentClips.expiresAt), lt(parentClips.createdAt, abandonedBefore)),
  );
  const rows = await db
    .select({ id: parentClips.id })
    .from(parentClips)
    .where(teamId ? and(eq(parentClips.teamId, teamId), stale) : stale);
  await eraseClips(rows.map((r) => r.id));
  return rows.length;
}
