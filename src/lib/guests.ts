/**
 * Small pure helpers for the guest roster (players.isGuest). Kept free of DB code so the
 * name-matching and ordering rules are covered by plain unit tests.
 */

export type GuestLike = { id: string; name: string; isGuest: boolean; archivedAt?: Date | null };

/** Lowercase, collapse whitespace - so "  jordan   REYES " matches "Jordan Reyes". */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Splits a roster into core players (first) and guests, each in the order given. */
export function splitGuests<T extends { isGuest: boolean }>(players: T[]): { core: T[]; guests: T[] } {
  return {
    core: players.filter((p) => !p.isGuest),
    guests: players.filter((p) => p.isGuest),
  };
}

/** Core players first, then guests - the order History and the availability list use. */
export function coreThenGuests<T extends { isGuest: boolean }>(players: T[]): T[] {
  const { core, guests } = splitGuests(players);
  return [...core, ...guests];
}

/**
 * When a coach types a new guest's name, reuse the guest we already have rather than creating a
 * duplicate (guests are meant to be reused across games). Returns the matching guest, if any.
 */
export function findGuestByName<T extends GuestLike>(players: T[], name: string): T | undefined {
  const target = normalizeName(name);
  return players.find((p) => p.isGuest && normalizeName(p.name) === target);
}

/** True when the name belongs to someone on the core roster (not a guest). */
export function matchesCorePlayer<T extends GuestLike>(players: T[], name: string): boolean {
  const target = normalizeName(name);
  return players.some((p) => !p.isGuest && !p.archivedAt && normalizeName(p.name) === target);
}

/** Guests that can still be picked for a game: not archived and not already on it. */
export function guestsAvailableForGame<T extends GuestLike>(allGuests: T[], onGameIds: Set<string>): T[] {
  return allGuests.filter((g) => g.isGuest && !g.archivedAt && !onGameIds.has(g.id));
}
