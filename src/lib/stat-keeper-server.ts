import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { teams } from "./db/schema";
import { looksLikeLogToken } from "./log-token";
import { MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES, verifyPin } from "./pin";

/** The team a public stat keeper link belongs to, or null when the link is wrong or turned off. */
export async function getTeamByKeeperToken(token: string) {
  if (!looksLikeLogToken(token)) return null;
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.statKeeperToken, token))
    .limit(1);
  return team ?? null;
}

export const KEEPER_BAD_LINK = "This link isn't working any more. Ask your coach for the current stat keeper link.";

export type KeeperAccess = { ok: true; team: { id: string; name: string } } | { ok: false; error: string };

/** Checks the secret link and the keeper PIN, counting wrong guesses on the team and locking after
 *  too many. Every public stat keeper action runs this first. */
export async function openKeeper(token: string, pin: string): Promise<KeeperAccess> {
  if (!looksLikeLogToken(token)) return { ok: false, error: KEEPER_BAD_LINK };
  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      hash: teams.statKeeperPinHash,
      failed: teams.statKeeperFailedAttempts,
      lockedUntil: teams.statKeeperLockedUntil,
    })
    .from(teams)
    .where(eq(teams.statKeeperToken, token))
    .limit(1);
  if (!team || !team.hash) return { ok: false, error: KEEPER_BAD_LINK };

  if (team.lockedUntil && team.lockedUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((team.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, error: `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask your coach to set a new PIN.` };
  }
  if (verifyPin(pin, team.hash)) {
    if (team.failed > 0 || team.lockedUntil) {
      await db.update(teams).set({ statKeeperFailedAttempts: 0, statKeeperLockedUntil: null }).where(eq(teams.id, team.id));
    }
    return { ok: true, team: { id: team.id, name: team.name } };
  }
  const attempts = team.failed + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    await db
      .update(teams)
      .set({ statKeeperFailedAttempts: 0, statKeeperLockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) })
      .where(eq(teams.id, team.id));
    return { ok: false, error: `Too many wrong tries. Try again in ${PIN_LOCK_MINUTES} minutes, or ask your coach to set a new PIN.` };
  }
  await db.update(teams).set({ statKeeperFailedAttempts: attempts }).where(eq(teams.id, team.id));
  const left = MAX_PIN_ATTEMPTS - attempts;
  return { ok: false, error: `That PIN isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` };
}
