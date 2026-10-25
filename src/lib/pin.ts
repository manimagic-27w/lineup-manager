import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** A player's 4-digit PIN, stored only as "salt:hash" (scrypt). */
export function isValidPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored || !isValidPin(pin)) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Wrong guesses allowed before a PIN locks, and for how long. With only 10,000 possible PINs the
 *  lockout is what stops someone from guessing their way in. */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;
