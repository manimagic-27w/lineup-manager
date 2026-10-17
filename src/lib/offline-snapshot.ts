import { AVAILABILITY_STATUSES } from "./db/schema";
import { coreThenGuests } from "./guests";
import { fieldFormatLabel, type SlotDef } from "./lineup-slots";

/**
 * A plain-JSON copy of one team's game-day info (schedule, lineups, bench, availability), saved
 * into the coach's phone so the app can show it with no signal (see /offline.html, which reads
 * this exact shape from localStorage - keep the two in step). Names are already resolved: the
 * offline page has no database and no player ids to look anything up with.
 */
export type OfflineGame = {
  id: string;
  date: string; // YYYY-MM-DD
  opponent: string | null;
  notes: string;
  formatLabel: string;
  tournament: string | null;
  units: { unit: string; slots: { label: string; player: string | null; warn: boolean }[] }[];
  bench: string[];
  availability: { status: string; players: string[] }[];
};

export type OfflineTeamSnapshot = {
  teamId: string;
  teamName: string;
  color: string;
  savedAt: string; // ISO timestamp
  games: OfflineGame[];
};

export type OfflineStore = {
  version: 1;
  userId: string;
  teams: Record<string, OfflineTeamSnapshot>;
};

export const OFFLINE_STORAGE_KEY = "lm-offline-v1";

export function gameFormatLabel(format: string, gender: string): string {
  if (format === "sixes") return "Sixes (6 a side)";
  if (format === "sevens") return "Sevens (8 a side)";
  return fieldFormatLabel(gender);
}

type RosterRow = {
  id: string;
  name: string;
  number: string | null;
  isGuest: boolean;
  archivedAt: Date | string | null;
};

export function buildOfflineGame(input: {
  game: { id: string; date: string; opponent: string | null; notes: string };
  formatLabel: string;
  tournament: string | null;
  roster: RosterRow[];
  availability: { playerId: string; status: string }[];
  lineup: { slotKey: string; playerId: string | null }[];
  slots: readonly SlotDef[];
}): OfflineGame {
  const statusByPlayer = new Map(input.availability.map((a) => [a.playerId, a.status]));
  const slotPlayer = new Map(input.lineup.map((l) => [l.slotKey, l.playerId]));

  // Same rule as the live game screen: guests only count on a game they were added to.
  const onGame = coreThenGuests(
    input.roster.filter((p) => !p.archivedAt && (!p.isGuest || statusByPlayer.has(p.id))),
  );
  const label = (p: RosterRow) => `${p.name}${p.number ? ` #${p.number}` : ""}${p.isGuest ? " (guest)" : ""}`;
  const byId = new Map(input.roster.map((p) => [p.id, p]));
  const statusOf = (id: string) => statusByPlayer.get(id) ?? "No Response";

  const unitOrder: string[] = [];
  for (const s of input.slots) if (!unitOrder.includes(s.unit)) unitOrder.push(s.unit);

  const assigned = new Set<string>();
  const units = unitOrder.map((unit) => ({
    unit,
    slots: input.slots
      .filter((s) => s.unit === unit)
      .map((s) => {
        const id = slotPlayer.get(s.key) ?? null;
        const p = id ? byId.get(id) : undefined;
        if (id && p) assigned.add(id);
        const status = id ? statusOf(id) : "";
        return {
          label: s.label,
          player: p ? label(p) : null,
          // Penciled in but no longer available - the live board flags these in red too.
          warn: !!p && status !== "Available" && status !== "Maybe",
        };
      }),
  }));

  const bench = onGame
    .filter((p) => !assigned.has(p.id) && (statusOf(p.id) === "Available" || statusOf(p.id) === "Maybe"))
    .map(label);

  const availability = AVAILABILITY_STATUSES.map((status) => ({
    status,
    players: onGame.filter((p) => statusOf(p.id) === status).map(label),
  }));

  return {
    id: input.game.id,
    date: input.game.date,
    opponent: input.game.opponent,
    notes: input.game.notes,
    formatLabel: input.formatLabel,
    tournament: input.tournament,
    units,
    bench,
    availability,
  };
}
