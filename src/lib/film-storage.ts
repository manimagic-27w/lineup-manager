import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { asc } from "drizzle-orm";
import { gameFilmParts, gameFilms } from "@/lib/db/schema";
import { FILM_LIFETIME_HOURS } from "@/lib/film-plan";
import { deleteObjects, filmStorageConfigured } from "@/lib/r2";

export function filmObjectKey(teamId: string, gameId: string, filmId: string, partNo: number) {
  return `films/${teamId}/${gameId}/${filmId}/part-${String(partNo).padStart(3, "0")}.mp4`;
}

/** Erases a film: its stored clips first, then its rows. */
export async function eraseFilms(filmIds: string[]) {
  if (filmIds.length === 0) return;
  const parts = await db.select({ key: gameFilmParts.objectKey }).from(gameFilmParts).where(inArray(gameFilmParts.filmId, filmIds));
  if (filmStorageConfigured() && parts.length > 0) await deleteObjects(parts.map((p) => p.key));
  await db.delete(gameFilms).where(inArray(gameFilms.id, filmIds));
}

/** Erases every film past its 24 hours, and uploads that were abandoned (never finished) for that long.
 *  `teamId` limits it to one team (used when a page loads); the daily cron runs it for everyone. */
export async function purgeExpiredFilms(teamId?: string): Promise<number> {
  const now = new Date();
  const abandonedBefore = new Date(now.getTime() - FILM_LIFETIME_HOURS * 3600_000);
  const stale = or(and(isNotNull(gameFilms.expiresAt), lt(gameFilms.expiresAt, now)), and(isNull(gameFilms.expiresAt), lt(gameFilms.createdAt, abandonedBefore)));
  const rows = await db
    .select({ id: gameFilms.id })
    .from(gameFilms)
    .where(teamId ? and(eq(gameFilms.teamId, teamId), stale) : stale);
  await eraseFilms(rows.map((r) => r.id));
  return rows.length;
}

/** The film on a game, as the game page shows it (erasing it first if its 24 hours are up). */
export async function getGameFilmView(teamId: string, gameId: string) {
  await purgeExpiredFilms(teamId);
  const [film] = await db.select().from(gameFilms).where(and(eq(gameFilms.teamId, teamId), eq(gameFilms.gameId, gameId))).limit(1);
  if (!film) return null;
  const parts = await db
    .select({ partNo: gameFilmParts.partNo, bytes: gameFilmParts.bytes })
    .from(gameFilmParts)
    .where(eq(gameFilmParts.filmId, film.id))
    .orderBy(asc(gameFilmParts.partNo));
  return {
    id: film.id,
    filename: film.filename,
    status: film.status as "uploading" | "ready",
    partCount: film.partCount,
    originalBytes: film.originalBytes,
    expiresAtMs: film.expiresAt ? film.expiresAt.getTime() : null,
    parts,
  };
}
