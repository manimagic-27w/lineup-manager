import { randomBytes } from "node:crypto";

/** An unguessable secret for a team's player-log link (16 URL-safe characters). */
export function generateLogToken(): string {
  return randomBytes(12).toString("base64url");
}

export function looksLikeLogToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(value);
}
