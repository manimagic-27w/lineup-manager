"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { gameFilmParts, gameFilms, games } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { FILM_LIFETIME_HOURS, MAX_FILM_BYTES, MAX_PARTS, partFilename } from "@/lib/film-plan";
import { eraseFilms, filmObjectKey } from "@/lib/film-storage";
import { filmStorageConfigured, objectSize, presignDownload, presignUpload } from "@/lib/r2";

// Game film: a coach uploads a film (split into clips in the browser), any coach on the team can
// download the clips for 24 hours, then it is erased. Every action checks the signed-in user has
// access to the team and that the film belongs to that team.

type Failure = { ok: false; error: string };
const NOT_SETUP = "Film upload isn't set up yet. Ask your club admin to contact the Lineup Manager team.";

async function findFilm(teamId: string, filmId: string) {
  const id = z.string().uuid().safeParse(filmId);
  if (!id.success) return null;
  const [film] = await db.select().from(gameFilms).where(and(eq(gameFilms.id, id.data), eq(gameFilms.teamId, teamId))).limit(1);
  return film ?? null;
}

/** Begins an upload for a game. Any film already on the game is erased first (one film per game). */
export async function startFilmUpload(input: {
  teamId: string;
  gameId: string;
  filename: string;
  bytes: number;
}): Promise<{ ok: true; filmId: string } | Failure> {
  const parsed = z
    .object({
      teamId: z.string().uuid(),
      gameId: z.string().uuid(),
      filename: z.string().trim().min(1).max(200),
      bytes: z.number().int().min(1).max(MAX_FILM_BYTES),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file is too large or isn't valid. Films up to 4 GB are supported." };
  if (!filmStorageConfigured()) return { ok: false, error: NOT_SETUP };
  const v = parsed.data;
  const { userId } = await requireTeamAccess(v.teamId);

  const [game] = await db.select({ id: games.id }).from(games).where(and(eq(games.id, v.gameId), eq(games.teamId, v.teamId))).limit(1);
  if (!game) return { ok: false, error: "That game wasn't found on this team." };

  const existing = await db.select({ id: gameFilms.id }).from(gameFilms).where(eq(gameFilms.gameId, v.gameId));
  await eraseFilms(existing.map((f) => f.id));

  const [film] = await db
    .insert(gameFilms)
    .values({ gameId: v.gameId, teamId: v.teamId, filename: v.filename, originalBytes: v.bytes, createdBy: userId })
    .returning({ id: gameFilms.id });
  revalidatePath(`/teams/${v.teamId}/games/${v.gameId}`);
  return { ok: true, filmId: film.id };
}

/** A one-hour link the browser uses to send one clip straight to storage. */
export async function getPartUploadUrl(teamId: string, filmId: string, partNo: number): Promise<{ ok: true; url: string } | Failure> {
  const no = z.number().int().min(1).max(MAX_PARTS).safeParse(partNo);
  if (!no.success) return { ok: false, error: "Too many clips for one film." };
  await requireTeamAccess(teamId);
  const film = await findFilm(teamId, filmId);
  if (!film || film.status !== "uploading") return { ok: false, error: "This upload is no longer open. Start it again." };
  return { ok: true, url: await presignUpload(filmObjectKey(teamId, film.gameId, film.id, no.data)) };
}

/** The browser finished sending a clip: confirm it really is in storage and record its size. */
export async function completePart(teamId: string, filmId: string, partNo: number): Promise<{ ok: true; bytes: number } | Failure> {
  const no = z.number().int().min(1).max(MAX_PARTS).safeParse(partNo);
  if (!no.success) return { ok: false, error: "Too many clips for one film." };
  await requireTeamAccess(teamId);
  const film = await findFilm(teamId, filmId);
  if (!film || film.status !== "uploading") return { ok: false, error: "This upload is no longer open. Start it again." };
  const key = filmObjectKey(teamId, film.gameId, film.id, no.data);
  const bytes = await objectSize(key);
  if (!bytes) return { ok: false, error: "That clip didn't arrive in storage. Try again." };
  await db
    .insert(gameFilmParts)
    .values({ filmId: film.id, partNo: no.data, objectKey: key, bytes })
    .onConflictDoUpdate({ target: [gameFilmParts.filmId, gameFilmParts.partNo], set: { objectKey: key, bytes } });
  return { ok: true, bytes };
}

/** All clips are in: make the film downloadable and start its 24 hours. */
export async function finishFilm(teamId: string, filmId: string, partCount: number): Promise<{ ok: true } | Failure> {
  const { userId } = await requireTeamAccess(teamId);
  const film = await findFilm(teamId, filmId);
  if (!film || film.status !== "uploading") return { ok: false, error: "This upload is no longer open. Start it again." };
  const parts = await db.select({ partNo: gameFilmParts.partNo }).from(gameFilmParts).where(eq(gameFilmParts.filmId, film.id)).orderBy(asc(gameFilmParts.partNo));
  const complete = partCount >= 1 && parts.length === partCount && parts.every((p, i) => p.partNo === i + 1);
  if (!complete) return { ok: false, error: "Some clips are missing. Try the upload again." };
  await db
    .update(gameFilms)
    .set({ status: "ready", partCount, expiresAt: new Date(Date.now() + FILM_LIFETIME_HOURS * 3600_000) })
    .where(eq(gameFilms.id, film.id));
  await logActivity({ teamId, actorUserId: userId, action: "film_uploaded", details: film.filename });
  revalidatePath(`/teams/${teamId}/games/${film.gameId}`);
  return { ok: true };
}

/** A short-lived download link for one clip (never lasting past the film's 24 hours). */
export async function getFilmDownloadUrl(teamId: string, filmId: string, partNo: number): Promise<{ ok: true; url: string } | Failure> {
  await requireTeamAccess(teamId);
  const film = await findFilm(teamId, filmId);
  if (!film || film.status !== "ready" || !film.expiresAt || film.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "This film has expired and been erased." };
  }
  const [part] = await db
    .select()
    .from(gameFilmParts)
    .where(and(eq(gameFilmParts.filmId, film.id), eq(gameFilmParts.partNo, z.number().int().min(1).parse(partNo))))
    .limit(1);
  if (!part) return { ok: false, error: "That clip wasn't found." };
  const url = await presignDownload(part.objectKey, partFilename(film.filename, part.partNo, film.partCount), Math.floor((film.expiresAt.getTime() - Date.now()) / 1000));
  return { ok: true, url };
}

/** Erase a film now (or cancel an upload that didn't finish). */
export async function deleteFilm(teamId: string, filmId: string): Promise<{ ok: true } | Failure> {
  const { userId } = await requireTeamAccess(teamId);
  const film = await findFilm(teamId, filmId);
  if (!film) return { ok: true };
  await eraseFilms([film.id]);
  await logActivity({ teamId, actorUserId: userId, action: "film_deleted", details: film.filename });
  revalidatePath(`/teams/${teamId}/games/${film.gameId}`);
  return { ok: true };
}
