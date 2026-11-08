"use server";

import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { games, seasons, teams, tournaments } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { generateLogToken } from "@/lib/log-token";
import { hashPin, isValidPin } from "@/lib/pin";
import { openFilmIndex } from "@/lib/film-index-server";
import { buildFilmIndex, type FilmIndexSeason } from "@/lib/film-index";

// unlockFilmIndex is PUBLIC: parents use it from /film/<token> without signing in. The team's
// secret link plus the PIN (checked on every call, locked after too many wrong guesses) are the
// credentials, and nothing about the games leaves the server until both check out. It is read-only
// and returns only date, opponent, score and the pasted video link.

export async function unlockFilmIndex(
  token: string,
  pin: string,
): Promise<{ ok: true; teamName: string; seasons: FilmIndexSeason[] } | { ok: false; error: string }> {
  const access = await openFilmIndex(token, pin);
  if (!access.ok) return access;
  const [rows, seasonRows, tournamentRows] = await Promise.all([
    db
      .select({
        id: games.id,
        date: games.date,
        opponent: games.opponent,
        filmUrl: games.filmUrl,
        ourScore: games.ourScore,
        opponentScore: games.opponentScore,
        isFriendly: games.isFriendly,
        seasonId: games.seasonId,
        tournamentId: games.tournamentId,
      })
      .from(games)
      .where(eq(games.teamId, access.team.id))
      .orderBy(desc(games.date)),
    db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.teamId, access.team.id)),
    db.select({ id: tournaments.id, name: tournaments.name }).from(tournaments).where(eq(tournaments.teamId, access.team.id)),
  ]);
  return {
    ok: true,
    teamName: access.team.name,
    seasons: buildFilmIndex(rows, new Map(seasonRows.map((s) => [s.id, s.name])), new Map(tournamentRows.map((t) => [t.id, t.name]))),
  };
}

type Failure = { ok: false; error: string };

/** Turns the parents' video link on with a PIN (keeps the link if one already exists). */
export async function enableFilmIndex(teamId: string, pin: string): Promise<{ ok: true } | Failure> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  if (!isValidPin(pin)) return { ok: false, error: "The PIN must be exactly 4 numbers." };
  await db
    .update(teams)
    .set({
      filmIndexToken: team.filmIndexToken ?? generateLogToken(),
      filmIndexPinHash: hashPin(pin),
      filmIndexFailedAttempts: 0,
      filmIndexLockedUntil: null,
    })
    .where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/games`);
  return { ok: true };
}

/** Sets a new PIN and clears any lockout. */
export async function changeFilmIndexPin(teamId: string, pin: string): Promise<{ ok: true } | Failure> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  if (!team.filmIndexToken) return { ok: false, error: "Turn the parents' video link on first." };
  if (!isValidPin(pin)) return { ok: false, error: "The PIN must be exactly 4 numbers." };
  await db
    .update(teams)
    .set({ filmIndexPinHash: hashPin(pin), filmIndexFailedAttempts: 0, filmIndexLockedUntil: null })
    .where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/games`);
  return { ok: true };
}

/** A new link: the old one stops working. */
export async function regenerateFilmIndexLink(teamId: string): Promise<void> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  if (!team.filmIndexToken) return;
  await db.update(teams).set({ filmIndexToken: generateLogToken() }).where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/games`);
}

/** Turns the link and PIN off. */
export async function disableFilmIndex(teamId: string): Promise<void> {
  const { team } = await requireTeamAccess(z.string().uuid().parse(teamId));
  await db
    .update(teams)
    .set({ filmIndexToken: null, filmIndexPinHash: null, filmIndexFailedAttempts: 0, filmIndexLockedUntil: null })
    .where(eq(teams.id, team.id));
  revalidatePath(`/teams/${team.id}/games`);
}
