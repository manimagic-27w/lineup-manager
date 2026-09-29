/**
 * A per-game "last known good" snapshot of the game-day screen, kept in localStorage purely so
 * there's something to show if a later load of the same game fails on a bad sideline
 * connection (see GameDayCacheWriter, which writes it, and the game-day route's error.tsx,
 * which reads it). This is deliberately not a general offline-editing cache - it's read-only,
 * one game at a time, and only ever helps if this browser already loaded that game successfully
 * at some point before the connection dropped.
 */

export type GameDaySnapshotPlayer = {
  id: string;
  name: string;
  number: string | null;
  grade: string | null;
  experience: string | null;
  position: string | null;
  status: string;
};

export type GameDaySnapshotSlot = {
  key: string;
  label: string;
  unit: string;
  pos: string;
  playerId: string | null;
};

export type GameDaySnapshot = {
  gameId: string;
  teamId: string;
  date: string;
  opponent: string | null;
  seasonName: string | null;
  roster: GameDaySnapshotPlayer[];
  slots: GameDaySnapshotSlot[];
  savedAt: number;
};

function storageKey(gameId: string) {
  return `lineup-manager:game-day:${gameId}`;
}

/** Never throws - a private-browsing tab or storage quota error should never break the page
 *  that's just trying to render normally. */
export function saveGameDaySnapshot(snapshot: Omit<GameDaySnapshot, "savedAt">) {
  try {
    const full: GameDaySnapshot = { ...snapshot, savedAt: Date.now() };
    localStorage.setItem(storageKey(snapshot.gameId), JSON.stringify(full));
  } catch {
    // Storage disabled/full/private mode - the live page still works fine without this.
  }
}

/** Never throws. Returns null for "nothing cached," "storage unavailable," and "cached JSON
 *  didn't parse" alike - every one of those just means the caller has no fallback to show. */
export function readGameDaySnapshot(gameId: string): GameDaySnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (!raw) return null;
    return JSON.parse(raw) as GameDaySnapshot;
  } catch {
    return null;
  }
}
