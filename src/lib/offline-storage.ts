import { OFFLINE_STORAGE_KEY, type OfflineStore, type OfflineTeamSnapshot } from "./offline-snapshot";

// Browser-only helpers around the offline copy in localStorage. Every access is wrapped: storage
// can be full, blocked or missing (private windows), and none of that may ever break the app.

export function readOfflineStore(): OfflineStore | null {
  try {
    const raw = window.localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineStore;
    return parsed?.version === 1 && parsed.teams ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves one team's snapshot. If the saved copy belongs to a different user, it is replaced. */
export function saveTeamSnapshot(userId: string, snapshot: OfflineTeamSnapshot): boolean {
  try {
    const existing = readOfflineStore();
    const store: OfflineStore =
      existing && existing.userId === userId ? existing : { version: 1, userId, teams: {} };
    store.teams[snapshot.teamId] = snapshot;
    window.localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function clearOfflineStore() {
  try {
    window.localStorage.removeItem(OFFLINE_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
