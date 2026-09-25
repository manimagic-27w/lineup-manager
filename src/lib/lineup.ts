// Shared "who's on the bench" logic - used by the live lineup board (client) and the printable
// lineup sheet (server) so both agree on exactly who counts as bench: any Available or Maybe
// player who isn't currently sitting in a starting slot. Not Available / No Response players
// aren't shown anywhere on game day, starting or bench, same as the lineup dropdowns.
export type RosterPlayerForLineup = {
  id: string;
  status: string;
};

export function getBenchPlayers<T extends RosterPlayerForLineup>(
  roster: T[],
  slots: { playerId: string | null }[],
): T[] {
  const assigned = new Set(
    slots.map((s) => s.playerId).filter(Boolean) as string[],
  );
  return roster.filter((p) => {
    if (assigned.has(p.id)) return false;
    return p.status === "Available" || p.status === "Maybe";
  });
}
