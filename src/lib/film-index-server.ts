import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { teams } from "./db/schema";
import { looksLikeLogToken } from "./log-token";
import { MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES, verifyPin } from "./pin";

/** The team a public game-video index link belongs to, or null when the link is wrong or turned off. */
export async function getTeamByFilmIndexToken(token: string) {
  if (!looksLikeLogToken(token)) return null;
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.filmIndexToken, token))
    .limit(1);
  return team ?? null;
}

export const FILM_INDEX_BAD_LINK = "This link isn't working any more. Ask your coach for the current game video link.";

export type FilmIndexAccess = { ok: true; team: { id: string; name: string } } | { ok: false; error: string };

/** Checks the secret link and the PIN, counting wrong guesses on the team and locking after too
 *  many (only 10,000 PINs exist, so the lockout is what stops guessing). */
export async function openFilmIndex(token: string, pin: string): Promise<FilmIndexAccess> {
  if (!looksLikeLogToken(token)) return { ok: false, error: FILM_INDEX_BAD_LINK };
  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      hash: teams.filmIndexPinHash,
      failed: teams.filmIndexFailedAttempts,
      lockedUntil: teams.filmIndexLockedUntil,
    })
    .from(teams)
    .where(eq(teams.filmIndexToken, token))
    .limit(1);
  if (!team || !team.hash) return { ok: false, error: FILM_INDEX_BAD_LINK };

  if (team.lockedUntil && team.lockedUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((team.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, error: `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask your coach for the PIN.` };
  }
  if (verifyPin(pin, team.hash)) {
    if (team.failed > 0 || team.lockedUntil) {
      await db.update(teams).set({ filmIndexFailedAttempts: 0, filmIndexLockedUntil: null }).where(eq(teams.id, team.id));
    }
    return { ok: true, team: { id: team.id, name: team.name } };
  }
  const attempts = team.failed + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    await db
      .update(teams)
      .set({ filmIndexFailedAttempts: 0, filmIndexLockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) })
      .where(eq(teams.id, team.id));
    return { ok: false, error: `Too many wrong tries. Try again in ${PIN_LOCK_MINUTES} minutes, or ask your coach for the PIN.` };
  }
  await db.update(teams).set({ filmIndexFailedAttempts: attempts }).where(eq(teams.id, team.id));
  const left = MAX_PIN_ATTEMPTS - attempts;
  return { ok: false, error: `That PIN isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` };
}
